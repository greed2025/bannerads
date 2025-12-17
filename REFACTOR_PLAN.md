# バナーAIツール リファクタリング仕様書

## 1. 目的と前提
- 目的: ローカル運用前提でも、APIキー安全性・保守性・応答性を向上させる。LLM/画像生成の差し替えと機能追加を容易にする。
- 前提: Node.js/Express サーバー (`server/index.js` が現状単一ファイル構成)、フロントは静的 HTML/JS (`tools/**`, `index.html`) を iframe で読み込む。

## 2. 現状の主要課題（要修正順）
1. `.env.example` に実キーらしき `GEMINI_API_KEY` が残存 → ローテーションとプレースホルダー化必須。
2. フロントの API ベース URL が `http://localhost:8080/api` に固定（`tools/banner/banner.js`, `tools/mixboard/mixboard.js`）。サーバーデフォルトは 3000 のため 404 を誘発。
3. シナリオ画面が存在しない `POST /api/scenario/correct-batch` を毎回叩き 404 → 無駄な往復と遅延。バッチ API を実装するか、最初から個別呼び出しに統一。
4. 静的配信ルートがリポジトリ直下配信（`express.static('../')`）。`server/banners` や `uploads` までブラウザ公開され得る。
5. サーバーが 1 ファイル集中・同期 FS 多用・入力バリデーションなし → 保守性とスループットが低下。

## 3. 改修方針
### 3.1 サーバー構成分割
```
server/
  src/
    app.js                 # Express 初期化・ミドルウェア・静的配信設定
    config/index.js        # env 読み込み・PORT/モデル名/キー必須チェック
    routes/
      chat.js
      banner.js
      scenario.js
    controllers/           # HTTP ロジック（リクエスト→サービス呼び出し）
    services/              # LLM/画像生成/文字起こし/知識読み込みなど副作用処理
    repositories/          # ファイル I/O（banners/scenarios/knowledge/skills）
    middleware/
      errorHandler.js
      requestLogger.js
      validation.js        # zod 等で body/query を検証
```

### 3.2 セキュリティ・設定
- `.env.example` は全キーをプレースホルダーに統一し、実キーは即ローテーション。
- 静的配信を `tools/**` など必要パスに限定し、`uploads` や `server/*` は非公開（API 経由のみ）。
- CORS: 許可オリジンをローカルホストのみに限定（必要に応じて環境変数で追加）。
- リクエスト制限: `express.json` のボディ上限は 50MB → 必要最小限へ（例: 10MB）検討。

### 3.3 API/サービス
- `POST /api/scenario/correct-batch` を実装するか、フロントを個別 `/scenario/correct` 呼び出しに統一（404 を消す）。
- 画像生成/テキスト生成/文字起こしはサービス層に分離し、`withRetry` を共通利用。ログは INFO/ERROR を絞る。
- 知識・スタイル・スキル読み込みはファイルキャッシュ（初回のみ FS 読み込み、ウォームアップ時にプリロードも可）。
- バナー/シナリオ保存・読込は `fs.promises` に移行し、ファイル名サニタイズと存在チェックを徹底。

### 3.4 フロントエンド調整
- API ベース URL を相対指定 `const API_BASE_URL = \`\${window.location.origin}/api\`;` に統一（banner/mixboard/scenario で共通 util を作成）。
- シナリオのマーカー適用は存在する API のみに送信し、404 ログを撲滅。失敗時はユーザー向けトーストを簡潔に。
- 大容量 base64 を扱う画面では、枚数上限・解像度上限を UI 側でガード。

## 4. 実施ステップ（優先度付き）
1. セキュリティ・即時修正
   - `.env.example` プレースホルダー化、キー再発行。
   - 静的配信ルートを `tools` などホワイトリストに限定。
   - API ベース URL を相対化。
2. ルーティング分割と共通設定
   - `src/app.js` と `src/config/index.js` を作成し、CORS/JSON 上限/ログを集約。
   - 既存 `/api` エンドポイントを `routes` + `controllers` に移設。
3. サービス/リポジトリ層の切り出し
   - LLM/画像生成/文字起こしを `services` に移動、`fs.promises` で I/O 非同期化。
   - knowledge/skills/banners/scenarios を `repositories` として関数化。
4. API 整合とバリデーション
   - シナリオ修正 API（バッチ or 個別）を確定し、フロントと揃える。
   - 各リクエストにバリデーション（zod 等）を入れ、400/503/500 を明確化。
5. 回帰確認
   - バナー生成、シナリオ生成、文字起こし、好調バナー CRUD、ヘルスチェックをローカルで手動確認。

## 5. 残リスク/検討事項
- 画像・動画アップロードの容量が大きい場合、ローカルマシン性能とディスク占有がボトルネックになり得る。上限設定や事後削除タスクを検討。
- LLM/画像生成のレスポンス構造変化に備え、サービス層でレスポンススキーマをラップしておく。
- キャッシュ導入後、ファイル更新を検知する必要がある場合は簡易的に更新時刻を比較する仕組みを追加。

## 6. テスト方針（ローカル）
- 手動確認: `/api/health` → OK、バナー生成→画像返却、シナリオ生成→シナリオ抽出、文字起こし→テキスト返却、バナー/シナリオ CRUD→ファイル反映。
- 可能なら軽量な統合テストを追加（supertest など）。現状はローカル運用前提のため任意。

# バナー・LP・シナリオ作成ツール システム仕様書

## 1. システム概要
本システムは、広告クリエイティブ制作（バナー、LP、動画シナリオ）をAI（Claude, Gemini, OpenAI）を活用して効率化・自動化するためのWebアプリケーション群です。
ローカル環境で動作するNode.jsサーバーと、ブラウザ上で動作する3つの独立したフロントエンドツールで構成されています。

### 含まれるツール
1. **LP Builder**: ランディングページ（LP）の構成案作成、コード生成、修正を対話形式で行うツール。
2. **Mixboard**: バナー画像の生成、レイアウト調整、修正指示をチャットとキャンバス操作で行うツール。
3. **Scenario Tool**: 動画広告のシナリオ作成、管理、既存動画の文字起こしを行うツール。

---

## 2. 技術スタック

### バックエンド (Server)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Architecture**: Modular Monolith (MVCに近い構成)
- **AI Models**:
  - Anthropic Claude (Chat, Text Generation)
  - Google Gemini (Image Generation, Text Generation backup)
  - OpenAI Whisper (Video Transcription)
- **Libraries**:
  - `fluent-ffmpeg`: 音声処理・圧縮
  - `multer`: ファイルアップロード処理

### フロントエンド (Client)
- **Core**: HTML5, CSS3, Vanilla JavaScript (ES Module)
- **Libraries**:
  - `marked`: Markdownレンダリング
  - `highlight.js`: コードハイライト (LP Builder)
  - `jQuery`: LP Builderで生成されるコード内で使用

---

## 3. ディレクトリ構成

```text
/
├── server/                 # バックエンドサーバー
│   ├── src/                # ソースコード (Refactored)
│   │   ├── app.js          # エントリーポイント
│   │   ├── config/         # 設定関連
│   │   ├── routes/         # APIルート定義
│   │   ├── services/       # ビジネスロジック・外部API連携
│   │   ├── repositories/   # ファイル操作・データアクセス
│   │   └── middleware/     # エラーハンドリング等
│   ├── banners/            # バナーデータ保存先 (JSON)
│   ├── scenarios/          # シナリオ保存先 (Markdown)
│   └── uploads/            # 一時アップロードフォルダ
│
├── tools/                  # フロントエンドツール群
│   ├── lpbuilder/          # LP Builder
│   │   ├── lpbuilder.html
│   │   ├── lpbuilder.js
│   │   └── tabManager.js
│   ├── mixboard/           # Mixboard
│   │   ├── mixboard.html
│   │   └── mixboard.js
│   └── scenario/           # Scenario Tool
│       ├── scenario.html
│       └── scenario.js
│
└── css/, js/               # 共通リソース (現在はあまり使われていない可能性あり)
```

---

## 4. サーバーサイド詳細設計

### アーキテクチャ
`src/app.js` をエントリーポイントとし、機能ごとにモジュール分割されています。
以前の `index.js` (モノリス) から設計変更され、現在は `src/` 以下のモジュール構成が正となります。

### AIサービス (`src/services/llm.js`)
各AIプロバイダー（Anthropic, Google, OpenAI）のクライアントを初期化し、統一されたインターフェースで機能を提供します。
- `generateTextWithClaude`: Claudeを使用したテキスト生成
- `generateImageWithGemini`: Geminiを使用した画像生成
- `transcribeWithWhisper`: OpenAI Whisperを使用した文字起こし
- エラーハンドリングとリトライ処理内包

### APIエンドポイント一覧

#### 共通・Mixboard (`src/routes/chat.js` 等)
| Method | Path | Description |
| :--- | :--- | :--- |
| POST | `/api/chat` | Mixboard用チャット。Claudeと対話しながら画像生成ツールを呼び出す。 |
| POST | `/api/mixboard/generate` | Mixboard用画像生成（直接Gemini呼び出し）。 |
| GET | `/api/health` | サーバーとAI APIの稼働状況確認。 |

#### LP Builder (`src/routes/lp.js`)
LP制作に特化したプロンプトと処理を提供します。
| Method | Path | Description |
| :--- | :--- | :--- |
| POST | `/api/lp/chat` | LP制作のアドバイス等を行うチャット。 |
| POST | `/api/lp/generate` | LPのコード（HTML/CSS/JS）を生成または修正する。 |
| POST | `/api/lp/modify-element` | 特定のHTML要素のみをAIで修正する。 |
| POST | `/api/lp/modify-selection` | 選択されたコードブロック（CSS/JS等）を修正する。 |
| POST | `/api/lp/image` | LP用素材画像を生成する。 |

#### Scenario Tool (`src/routes/scenario.js`)
ファイルシステムベースのCMS機能を提供します。
| Method | Path | Description |
| :--- | :--- | :--- |
| GET | `/api/scenario/list` | 保存済みシナリオ一覧を取得。 |
| GET | `/api/scenario/detail` | シナリオの詳細内容を取得。 |
| POST | `/api/scenario/save` | 新規シナリオを保存。 |
| PUT | `/api/scenario/update` | シナリオを更新。 |
| DELETE| `/api/scenario/delete` | シナリオを削除。 |
| POST | `/api/scenario/chat` | シナリオ作成支援チャット。 |
| POST | `/api/scenario/correct` | 選択範囲の文章校正・修正。 |
| POST | `/api/scenario/transcribe`| 動画ファイルをアップロードして文字起こしを行う。 |

---

## 5. フロントエンドツール詳細

### 5.1 LP Builder
**目的**: 対話ベースでのLP構築とコーディングの自動化。
**主な機能**:
- **チャットUI**: 要件定義や修正指示を行う。
- **Live Preview**: 生成されたHTML/CSS/JSをリアルタイムでプレビュー表示。
- **コードエディタ**: 生成されたコードの閲覧と手動編集が可能。
- **部分修正**: プレビュー上で要素をクリック、またはコードを選択してAIに修正指示を出せる。
- **他ツール連携**: MixboardやScenarioツールへのタブ切り替え機能 (`tabManager.js`)。

### 5.2 Mixboard
**目的**: バナー画像のアイデア出しと生成、レイアウト調整。
**主な機能**:
- **Canvas UI**: 生成された画像を自由に配置・構成できるキャンバス。
- **参考画像分析**: 既存の好調バナー等を読み込み、Claudeに分析させた上でGeminiへプロンプトを渡すフロー。
- **画像生成**: チャット経由または直接プロンプト入力による画像生成。
- **保存**: プロジェクト状態（配置画像、チャット履歴）をローカルストレージ/IndexedDBに保存。

### 5.3 Scenario Tool
**目的**: 動画広告用シナリオのライティングと管理。
**主な機能**:
- **シナリオ管理**: 案件タイプ（projectType）ごとのフォルダ分け管理。
- **エディタ**: Markdown形式でのシナリオ編集。
- **AIアシスト**: チャットでのアイデア出し、選択範囲の校正・リライト。
- **文字起こし**: 動画ファイルからのテキスト抽出機能（ffmpegで音声抽出 → Whisper API）。

---

## 6. データ管理・永続化
- **ファイルシステム**:
  - シナリオデータ: `server/scenarios/[projectType]/*.md`
  - バナーメタデータ: `server/banners/[projectType]/*.json`
  - 一時ファイル: `server/uploads/`
- **ブラウザストレージ**:
  - LocalStorage / IndexedDB: 各ツールのUI状態（開いているタブ、入力中のテキスト、Mixboardのキャンバス状態など）の保存に使用。

## 7. 外部連携仕様
- **Anthropic Claude**: テキスト生成、論理推論、コード生成のメインエンジンとして使用。
- **Google Gemini**: 画像生成（Imagen 3モデル）、およびClaudeのバックアップ/安価なテキスト生成として使用。
- **OpenAI**: Whisperモデルのみ、動画の文字起こし機能で使用。

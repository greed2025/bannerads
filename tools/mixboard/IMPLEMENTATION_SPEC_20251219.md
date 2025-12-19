# Mixboard 実装仕様書

**作成日**: 2025-12-19  
**対象ファイル**: `mixboard.html`, `mixboard.css`, `mixboard.js`

---

## 1. プロジェクトタブ機能

### 概要
ブラウザのタブのように、複数のプロジェクトを同時に開いて切り替えられる機能を実装しました。

### UI変更
| 変更前 | 変更後 |
|--------|--------|
| Share / Transform ボタン | プロジェクトタブバー |

| 機能 | 操作方法 | 説明 |
|------|----------|------|
| タブ追加 | 「+」ボタンクリック | 新規プロジェクトを作成 |
| タブ切り替え | タブクリック | プロジェクトを切り替え |
| タブ名変更 | タブ名をダブルクリック | インライン編集モードに入る |
| タブ削除 | ×ボタンクリック | プロジェクト削除（最後の1つは削除不可） |
| 自動保存 | 自動 | 各プロジェクトの状態を localStorage に保存 |
| Undo/Redo | Ctrl+Z / Ctrl+Shift+Z | プロジェクト単位で履歴管理 |

### データ構造
```javascript
// プロジェクト配列
projects = [
  {
    id: 'proj_xxxxx',      // ユニークID
    name: 'Project 1',     // 表示名
    elements: [],          // キャンバス上の要素
    history: [],           // アンドゥ履歴
    historyIndex: -1       // 履歴インデックス
  }
];

// 現在のプロジェクトID
currentProjectId = 'proj_xxxxx';
```

### 主要関数
| 関数名 | 役割 |
|--------|------|
| `setupProjectTabs()` | タブ機能の初期化 |
| `createProject(name)` | 新規プロジェクト作成 |
| `switchProject(projectId)` | プロジェクト切り替え |
| `deleteProject(projectId)` | プロジェクト削除 |
| `renameProject(projectId, newName)` | プロジェクト名変更 |
| `renderTabs()` | タブUIの描画 |
| `saveProjects()` | プロジェクトデータ保存 |
| `loadProjects()` | プロジェクトデータ読み込み |

### CSSクラス
| クラス名 | 説明 |
|----------|------|
| `.project-tabs` | タブバーコンテナ |
| `.tabs-container` | タブ群のラッパー |
| `.project-tab` | 個別タブ |
| `.project-tab.active` | アクティブタブ |
| `.tab-name` | タブ名（input要素） |
| `.tab-close` | 閉じるボタン |
| `.add-tab-btn` | 新規タブ追加ボタン |

---

## 2. 複数枚同時生成機能

### 概要
画像生成時に1〜4枚を同時に生成できる機能を実装しました。

### UI変更
設定パネル（歯車アイコン）に「生成枚数」セクションを追加。

### 機能詳細
| 項目 | 内容 |
|------|------|
| 選択可能枚数 | 1枚 / 2枚 / 3枚 / 4枚 |
| 生成方式 | 並列リクエスト（Promise.all） |
| 配置方式 | 2列グリッド配置 |
| プレースホルダー | 各画像ごとに番号付きで表示 |

### データフロー
```
ユーザー入力 → generatorCount 設定
     ↓
sendGeneratorMessage() 呼び出し
     ↓
generatorCount 分のプレースホルダー表示
     ↓
generatorCount 分の並列APIリクエスト
     ↓
各画像をグリッド配置でキャンバスに追加
```

### 配置計算
```javascript
const col = addedCount % 2;           // 列（0 or 1）
const row = Math.floor(addedCount / 2); // 行
const x = 100 + col * 350;            // X座標
const y = 100 + row * 350;            // Y座標
```

---

## 3. 修正モード改善

### 3.1 修正ラベルの省略解除
| 変更前 | 変更後 |
|--------|--------|
| 20文字で省略 + `...` | 全文表示 |

### 3.2 修正ラベルと枠の重なり防止
| 項目 | 変更内容 |
|------|----------|
| CSS | `top: -28px` → `bottom: calc(100% + 4px)` |
| Canvas描画 | `y - labelHeight` → `y - labelHeight - labelMargin` |

### 3.3 修正画像のマージン追加
AI送信用画像にマージンを追加し、画像端のラベルが見切れないように改善。

```javascript
const margin = 50; // 上下左右に50px
canvas.width = img.naturalWidth + margin * 2;
canvas.height = img.naturalHeight + margin * 2;

// 背景色
ctx.fillStyle = '#f5f5f5';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// 画像をオフセット配置
ctx.drawImage(img, margin, margin);
```

### 3.4 元画像の同時送信
| 変更前 | 変更後 |
|--------|--------|
| 修正指示画像のみ送信 | 修正指示画像 + 元画像の2枚送信 |

```javascript
// 変更前
images: [annotatedImage]

// 変更後
images: [annotatedImage, data.src]
```

---

## 4. 変更ファイル一覧

### mixboard.html
- ヘッダー構造変更（Share/Transform削除、タブバー追加）
- 設定パネルに枚数選択UI追加

### mixboard.css
- プロジェクトタブ関連スタイル追加（約100行）
- 枚数選択ボタンスタイル追加
- 修正ラベルの配置調整

### mixboard.js
- プロジェクト管理変数追加
- タブ管理関数群追加（約200行）
- 複数枚生成ロジック実装
- 修正モード改善

---

## 5. テスト項目

### プロジェクトタブ
- [ ] 新規タブ追加でプロジェクトが作成される
- [ ] タブクリックでプロジェクトが切り替わる
- [ ] タブ名を編集して保存される
- [ ] タブ削除でプロジェクトが削除される
- [ ] 最後のタブは削除できない
- [ ] ページリロード後もタブが復元される

### 複数枚生成
- [ ] 枚数ボタンで枚数が切り替わる
- [ ] 設定枚数分のプレースホルダーが表示される
- [ ] 設定枚数分の画像が生成される
- [ ] 画像がグリッド配置される

### 修正モード
- [ ] 長文ラベルが省略されず表示される
- [ ] ラベルが枠と重ならない
- [ ] AI送信画像にマージンがある
- [ ] 元画像と修正指示画像が両方送信される

---

## 6. 既知の制限事項

1. **localStorage容量制限**: プロジェクトデータはlocalStorageに保存されるため、大量の画像を含むプロジェクトが多いと容量不足になる可能性あり
2. **タブ数上限なし**: 現状タブ数に制限がないため、大量作成時のパフォーマンスは未検証
3. **移行処理**: 既存の単一プロジェクトデータから新形式への自動移行は未実装

---

## 7. 今後の課題

- [ ] IndexedDBへのプロジェクトデータ移行
- [ ] タブのドラッグ並び替え
- [ ] プロジェクトのエクスポート/インポート
- [ ] タブ数上限の設定

---

## 8. レビュー対応バグ修正

**修正日**: 2025-12-19

### 8.1 重大: キャンバスクリア問題
| 問題 | 修正 |
|------|------|
| `.element`セレクタで要素が削除されない | `.canvas-element`に修正 |

### 8.2 重大: loadState()競合問題
| 問題 | 修正 |
|------|------|
| IndexedDB読み込みがlocalStorageと競合 | `loadState()`を廃止、`setupProjectTabs()`に一本化 |

### 8.3 高: Undo/Redo履歴混入問題
| 問題 | 修正 |
|------|------|
| グローバル履歴が別プロジェクトに混入 | `switchProject()`で履歴の保存・復元を追加 |

```javascript
// 保存
currentProject.history = [...historyStack];
currentProject.historyIndex = historyIndex;

// 復元
historyStack = project.history?.length > 0 
    ? [...project.history] 
    : [JSON.stringify(elements)];
historyIndex = project.historyIndex ?? 0;
```

### 8.4 中: タブ名編集問題
| 問題 | 修正 |
|------|------|
| シングルクリックでタブ切り替えが先に発動 | ダブルクリックで編集モードに変更 |

```javascript
nameInput.readOnly = true; // デフォルト読み取り専用

nameInput.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    nameInput.readOnly = false;
    nameInput.select();
});
```

# LP Builder 機能追加実装レポート
**作成日**: 2025年12月20日  
**レビュー依頼者**: 開発担当  

---

## 概要

LP Builderツールに対して、UI/UXの改善と新機能を実装しました。本ドキュメントでは実装内容、技術的詳細、および今後の課題について説明します。

---

## 実装内容一覧

| No | 機能 | 状態 | 優先度 |
|---|---|---|---|
| 1 | タブ名ダブルクリック編集 | ✅ 完了 | 高 |
| 2 | PC/スマホプレビュー切替 | ✅ 完了 | 高 |
| 3 | コードエディタ開閉機能 | ✅ 完了 | 中 |
| 4 | プレビュー内ツールバー | ✅ 完了 | 高 |
| 5 | プレビュー要素選択修正 | ✅ UI完了 | 高 |
| 6 | 画像生成機能 | ✅ UI完了 | 中 |

---

## 1. タブ名ダブルクリック編集

### 仕様
- **操作**: タブ名をダブルクリック → インライン編集モードに移行
- **確定**: Enter キー または フォーカス外れ
- **キャンセル**: Escape キー

### 技術実装
```javascript
// ダブルクリックでcontentEditable有効化
nameEl.addEventListener('dblclick', (e) => {
    nameEl.contentEditable = 'true';
    nameEl.focus();
    // テキスト全選択
});

// blur時に保存
nameEl.addEventListener('blur', async () => {
    nameEl.contentEditable = 'false';
    await saveTabName(tabId, nameEl.textContent.trim());
});
```

### 変更ファイル
- `lpbuilder.js`: `renderProjectTabs()`, `saveTabName()` 関数

---

## 2. PC/スマホプレビュー切替

### 仕様
- プレビューヘッダーにスマホアイコン/PCアイコンのトグルボタン
- **スマホモード**: iPhone風フレーム内にプレビュー表示
- **PCモード**: フル幅でプレビュー表示（比率維持）

### 技術実装
```javascript
function setPreviewMode(mode) {
    // ボタン状態更新
    document.querySelectorAll('.js-preview-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // data-mode属性でCSS制御
    const wrapper = document.querySelector('.js-preview-wrapper');
    wrapper.dataset.mode = mode;
    
    updatePreview();
}
```

### CSSによる表示制御
```css
.preview-wrapper[data-mode="desktop"] .smartphone-frame {
    display: none;
}
.preview-wrapper[data-mode="desktop"] .desktop-frame {
    display: block !important;
}
```

### 変更ファイル
- `lpbuilder.html`: プレビューモードボタン追加
- `lpbuilder.css`: デスクトップフレームスタイル
- `lpbuilder.js`: `setPreviewMode()` 関数

---

## 3. コードエディタ開閉機能

### 仕様
- エディタエリア右端にトグルボタン（➤）配置
- クリックでエディタエリアを完全に閉じる（width: 0）
- 再クリックで展開

### 技術実装
```css
.editors-area.collapsed {
    width: 0;
    overflow: hidden;
    border-right: none;
}
```

```javascript
document.querySelector('.js-editors-toggle')?.addEventListener('click', () => {
    editorsArea?.classList.toggle('collapsed');
    // 展開後にCodeMirrorをリフレッシュ
    setTimeout(() => {
        state.editors.html?.refresh();
        state.editors.css?.refresh();
        state.editors.js?.refresh();
    }, 300);
});
```

### 変更ファイル
- `lpbuilder.html`: トグルボタン追加
- `lpbuilder.css`: collapsed状態のスタイル
- `lpbuilder.js`: トグルイベントリスナー

---

## 4. プレビュー内ツールバー

### 仕様
- プレビューエリア下部にツールバー配置
- 「選択修正」「画像生成」ボタン

### HTML構造
```html
<div class="preview-toolbar">
    <button class="preview-tool-btn js-preview-select-btn">
        <svg>...</svg>
        <span>選択修正</span>
    </button>
    <button class="preview-tool-btn js-preview-image-btn">
        <svg>...</svg>
        <span>画像生成</span>
    </button>
</div>
```

### 変更ファイル
- `lpbuilder.html`: ツールバーHTML追加
- `lpbuilder.css`: ツールバースタイル

---

## 5. プレビュー要素選択修正

### 仕様
1. 「選択修正」ボタンクリック → 選択モードON（ボタン青色）
2. プレビュー（iframe）内の要素にホバー → 青枠でハイライト
3. クリックで要素選択 → 編集パネル表示
4. 修正指示入力 → 「修正を適用」ボタン

### 技術実装

#### iframe内イベント登録
```javascript
function enablePreviewSelection() {
    [mobileIframe, desktopIframe].forEach(iframe => {
        const iframeDoc = iframe.contentDocument;
        iframeDoc.body.style.cursor = 'crosshair';
        iframeDoc.body.addEventListener('click', handlePreviewClick);
        iframeDoc.body.addEventListener('mouseover', handlePreviewMouseOver);
    });
}
```

#### ホバーハイライト
```javascript
function handlePreviewMouseOver(e) {
    if (!isPreviewSelectMode) return;
    e.target.style.outline = '2px solid #667eea';
}
```

### 変更ファイル
- `lpbuilder.html`: 編集パネルHTML追加
- `lpbuilder.css`: 編集パネルスタイル
- `lpbuilder.js`: 選択モード関連関数群

---

## 6. 画像生成機能

### 仕様
- 「画像生成」ボタンクリック → プロンプト入力ダイアログ
- API呼び出し → 生成画像をHTMLエディタに挿入

### 技術実装
```javascript
async function generatePreviewImage(prompt) {
    const response = await fetch(`${API_BASE_URL}/image/generate`, {
        method: 'POST',
        body: JSON.stringify({ prompt, size: '1024x1024' })
    });
    
    if (response.ok && data.image) {
        const imgTag = `<img src="data:image/png;base64,${data.image}" ...>`;
        htmlEditor.replaceSelection(imgTag);
    }
}
```

---

## 未実装・要対応事項

### サーバーサイドAPI

以下のAPIエンドポイントがフロントエンドから呼び出されますが、サーバー側の実装が必要です：

| エンドポイント | 用途 | ステータス |
|---|---|---|
| `POST /lp/modify-element` | 要素選択修正 | ⚠️ 未実装 |
| `POST /lp/modify-selection` | コード選択修正 | ⚠️ 未実装 |
| `POST /image/generate` | 画像生成 | 要確認 |

### APIリクエスト仕様

#### `/lp/modify-element`
```json
// Request
{
    "elementHtml": "<h1>見出しテキスト</h1>",
    "instruction": "色を青に変更",
    "fullHtml": "<!DOCTYPE html>..."
}

// Response
{
    "modifiedHtml": "<!DOCTYPE html>... (修正後の全体HTML)"
}
```

---

## テスト結果

### 動作確認済み
- [x] タブ名ダブルクリック編集
- [x] PC/スマホプレビュー切替
- [x] エディタ開閉
- [x] プレビューツールバー表示
- [x] 選択モードON/OFF
- [x] 要素ホバーハイライト

### 未テスト（API未実装のため）
- [ ] 要素修正の実際の適用
- [ ] 画像生成・挿入

---

## コミット履歴

```
aac4b9d feat: LP Builder プレビュー内ツールバー実装
ab95abe fix: LP Builder UI改善（エディタ完全開閉・選択モードボタン）
f083728 fix: タブ名ダブルクリックで編集可能に変更
9ad5719 feat: LP Builder UI改善（タブ名・プレビュー切替・履歴削除）
bc49274 feat: LP Builder 追加機能
51ac32a feat: LP Builder タブ名編集・プロジェクト履歴機能
```

---

## レビューポイント

1. **iframe内イベント処理**: セキュリティ（same-origin）とイベント伝播の妥当性
2. **状態管理**: 選択モードのグローバル変数 `isPreviewSelectMode` の設計
3. **API設計**: `/lp/modify-element` のリクエスト/レスポンス仕様
4. **UX**: 選択モードの操作フローが直感的か

---

## スクリーンショット

### 選択モード有効時
プレビューツールバーの「選択修正」ボタンが青色でアクティブ状態。
トースト通知で操作ガイドを表示。

### PCプレビューモード  
デスクトップアイコンをクリックするとフル幅でプレビュー表示。
スマホフレームなしでコンテンツを確認可能。

/**
 * LP Builder - ランディングページ作成ツール
 * バイブコーディング風のAI対話型LP作成ツール
 */

// 定数
const API_BASE_URL = '/api';
const DB_NAME = 'LPBuilderDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_TEMPLATES = 'templates';
const MAX_PROJECT_SIZE_MB = 100;
const WARNING_SIZE_MB = 80;
const MAX_HISTORY_COUNT = 50;
const MAX_CHAT_HISTORY = 100;

// jQueryバンドル（プレビュー用）
const JQUERY_BUNDLE = 'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js';

// グローバル状態
const state = {
    db: null,
    currentProject: null,
    editors: {
        html: null,
        css: null,
        js: null
    },
    activeTab: 'preview',
    viewport: 'desktop',
    chatHistory: [],
    undoHistory: { html: [], css: [], js: [] },
    redoHistory: { html: [], css: [], js: [] },
    isSaving: false,
    saveTimeout: null
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    try {
        // IndexedDB初期化
        await initDatabase();
        
        // CodeMirrorエディタ初期化
        initEditors();
        
        // イベントリスナー設定
        initEventListeners();
        
        // プロジェクトモーダル表示
        showProjectModal();
        
        console.log('LP Builder initialized');
    } catch (error) {
        console.error('Initialization failed:', error);
        showToast('初期化に失敗しました', 'error');
    }
}

// ========================================
// IndexedDB管理
// ========================================

function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            state.db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // プロジェクトストア
            if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
                const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
                projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            
            // テンプレートストア
            if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
                const templateStore = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id' });
                templateStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

async function saveProject(project) {
    // サイズチェック
    const size = calculateProjectSize(project);
    if (size > MAX_PROJECT_SIZE_MB * 1024 * 1024) {
        showToast('容量上限（100MB）です。画像を削除してください', 'error');
        return false;
    }
    if (size > WARNING_SIZE_MB * 1024 * 1024) {
        showToast('容量が限界に近づいています', 'warning');
    }
    
    project.updatedAt = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_PROJECTS], 'readwrite');
        const store = transaction.objectStore(STORE_PROJECTS);
        const request = store.put(project);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function loadProject(id) {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_PROJECTS], 'readonly');
        const store = transaction.objectStore(STORE_PROJECTS);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getProjectList() {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_PROJECTS], 'readonly');
        const store = transaction.objectStore(STORE_PROJECTS);
        const index = store.index('updatedAt');
        const request = index.openCursor(null, 'prev');
        
        const projects = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                projects.push({
                    id: cursor.value.id,
                    name: cursor.value.name,
                    updatedAt: cursor.value.updatedAt
                });
                cursor.continue();
            } else {
                resolve(projects);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteProject(id) {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_PROJECTS], 'readwrite');
        const store = transaction.objectStore(STORE_PROJECTS);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

function calculateProjectSize(project) {
    let size = 0;
    
    // コードサイズ
    if (project.files) {
        size += new Blob([project.files.html || '']).size;
        size += new Blob([project.files.css || '']).size;
        size += new Blob([project.files.js || '']).size;
    }
    
    // 画像サイズ
    if (project.images) {
        project.images.forEach(img => {
            size += img.size || 0;
        });
    }
    
    return size;
}

// ========================================
// CodeMirrorエディタ
// ========================================

function initEditors() {
    // HTMLエディタ
    const htmlTextarea = document.querySelector('.js-editor-html');
    if (htmlTextarea) {
        state.editors.html = CodeMirror.fromTextArea(htmlTextarea, {
            mode: 'htmlmixed',
            theme: 'dracula',
            lineNumbers: true,
            lineWrapping: true,
            tabSize: 2,
            indentWithTabs: false
        });
        state.editors.html.on('change', () => handleEditorChange('html'));
    }
    
    // CSSエディタ
    const cssTextarea = document.querySelector('.js-editor-css');
    if (cssTextarea) {
        state.editors.css = CodeMirror.fromTextArea(cssTextarea, {
            mode: 'css',
            theme: 'dracula',
            lineNumbers: true,
            lineWrapping: true,
            tabSize: 2,
            indentWithTabs: false
        });
        state.editors.css.on('change', () => handleEditorChange('css'));
    }
    
    // JSエディタ
    const jsTextarea = document.querySelector('.js-editor-js');
    if (jsTextarea) {
        state.editors.js = CodeMirror.fromTextArea(jsTextarea, {
            mode: 'javascript',
            theme: 'dracula',
            lineNumbers: true,
            lineWrapping: true,
            tabSize: 2,
            indentWithTabs: false
        });
        state.editors.js.on('change', () => handleEditorChange('js'));
    }
}

function handleEditorChange(type) {
    // アンドゥ履歴に追加（デバウンス）
    if (state.saveTimeout) {
        clearTimeout(state.saveTimeout);
    }
    
    state.saveTimeout = setTimeout(() => {
        saveCurrentState();
    }, 500);
}

// ========================================
// イベントリスナー
// ========================================

function initEventListeners() {
    // 戻るボタン
    document.querySelector('.js-back-btn')?.addEventListener('click', () => {
        showProjectModal();
    });
    
    // プロジェクト名変更
    document.querySelector('.js-project-name')?.addEventListener('change', (e) => {
        if (state.currentProject) {
            state.currentProject.name = e.target.value;
            saveCurrentState();
        }
    });
    
    // ビューポート切替
    document.querySelectorAll('.js-viewport-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const viewport = btn.dataset.viewport;
            setViewport(viewport);
        });
    });
    
    // タブ切替
    document.querySelectorAll('.js-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            setActiveTab(tab);
        });
    });
    
    // プレビュー更新
    document.querySelector('.js-refresh-btn')?.addEventListener('click', () => {
        updatePreview();
    });
    
    // フルスクリーン
    document.querySelector('.js-fullscreen-btn')?.addEventListener('click', () => {
        toggleFullscreen();
    });
    
    // 右パネル開閉
    document.querySelector('.js-right-panel-toggle')?.addEventListener('click', () => {
        document.querySelector('.js-right-panel')?.classList.toggle('collapsed');
    });
    
    // チャット送信
    document.querySelector('.js-chat-send')?.addEventListener('click', () => {
        sendChatMessage();
    });
    
    document.querySelector('.js-chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    // チャットクリア
    document.querySelector('.js-clear-chat')?.addEventListener('click', () => {
        clearChat();
    });
    
    // AI修正指示送信
    document.querySelector('.js-send-instruction-btn')?.addEventListener('click', () => {
        sendModifyInstruction();
    });
    
    document.querySelector('.js-instruction-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendModifyInstruction();
        }
    });
    
    // ZIP出力
    document.querySelector('.js-export-btn')?.addEventListener('click', () => {
        exportToZip();
    });
    
    // 保存
    document.querySelector('.js-save-btn')?.addEventListener('click', () => {
        saveCurrentState();
        showToast('保存しました', 'success');
    });
    
    // モーダル閉じる
    document.querySelector('.js-modal-close')?.addEventListener('click', () => {
        hideProjectModal();
    });
    
    // 新規プロジェクト
    document.querySelector('.js-new-project')?.addEventListener('click', () => {
        createNewProject();
    });
    
    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        // Ctrl+S: 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveCurrentState();
            showToast('保存しました', 'success');
        }
        
        // Ctrl+Z: アンドゥ
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        
        // Ctrl+Shift+Z: リドゥ
        if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
            e.preventDefault();
            redo();
        }
    });
}

// ========================================
// タブ・ビューポート管理
// ========================================

function setActiveTab(tab) {
    state.activeTab = tab;
    
    // タブボタン更新
    document.querySelectorAll('.js-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // タブパネル更新
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    
    // プレビュータブの場合は更新
    if (tab === 'preview') {
        updatePreview();
    }
    
    // エディタのリフレッシュ
    if (state.editors[tab]) {
        setTimeout(() => {
            state.editors[tab].refresh();
        }, 100);
    }
}

function setViewport(viewport) {
    state.viewport = viewport;
    
    // ボタン更新
    document.querySelectorAll('.js-viewport-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.viewport === viewport);
    });
    
    // プレビューフレーム更新
    const frame = document.querySelector('.js-preview-frame');
    if (frame) {
        frame.dataset.viewport = viewport;
    }
}

// ========================================
// プレビュー管理
// ========================================

function updatePreview() {
    const iframe = document.querySelector('.js-preview-iframe');
    if (!iframe || !state.currentProject) return;
    
    // プレビュー用HTMLを組み立て（CSS/JSをインライン化）
    const previewHtml = buildPreviewHtml();
    
    // srcdocで注入
    iframe.srcdoc = previewHtml;
}

function buildPreviewHtml() {
    const project = state.currentProject;
    if (!project) return '';
    
    let html = project.files?.html || getDefaultHtml();
    const css = project.files?.css || '';
    const js = project.files?.js || '';
    
    // 画像をBase64データURLに変換
    if (project.images) {
        project.images.forEach(img => {
            if (img.dataUrl) {
                // 相対パスをデータURLに置換
                const regex = new RegExp(`(src=["'])(?:img/)?${img.name}(["'])`, 'gi');
                html = html.replace(regex, `$1${img.dataUrl}$2`);
            }
        });
    }
    
    // CSSをインライン化（style.cssのlinkタグを置換）
    html = html.replace(
        /<link[^>]*href=["'][^"']*style\.css["'][^>]*>/gi,
        `<style>${css}</style>`
    );
    
    // jQuery CDNをローカルバンドルに置換（プレビュー用）
    // 注: 実際にはjQueryのソースを埋め込む必要があるが、
    // プレビューでは外部読み込みを許可するためsandbox属性を調整
    
    // JSをインライン化（script.jsのscriptタグを置換）
    html = html.replace(
        /<script[^>]*src=["'][^"']*script\.js["'][^>]*><\/script>/gi,
        `<script>${js}</script>`
    );
    
    return html;
}

function getDefaultHtml() {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>新規LP</title>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header class="header">
        <h1>ランディングページ</h1>
    </header>
    <main class="main">
        <section class="hero">
            <h2>キャッチコピーをここに</h2>
            <p>サブテキストをここに入力</p>
            <a href="<?= $url ?>" class="cta-btn js-cta">お問い合わせはこちら</a>
        </section>
    </main>
    <footer class="footer">
        <a href="../../company.html">運営者情報</a>
        <a href="../../privacy_policy.html">プライバシーポリシー</a>
    </footer>
    <script src="js/script.js"></script>
</body>
</html>`;
}

function getDefaultCss() {
    return `/* ベーススタイル */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif;
    line-height: 1.6;
    color: #333;
}

/* ヘッダー */
.header {
    background: #333;
    color: #fff;
    padding: 20px;
    text-align: center;
}

/* メインコンテンツ */
.main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 20px;
}

/* ヒーローセクション */
.hero {
    text-align: center;
    padding: 60px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    border-radius: 8px;
}

.hero h2 {
    font-size: 2.5rem;
    margin-bottom: 20px;
}

.hero p {
    font-size: 1.2rem;
    margin-bottom: 30px;
}

/* CTAボタン */
.cta-btn {
    display: inline-block;
    padding: 16px 40px;
    background: #ff6b6b;
    color: #fff;
    text-decoration: none;
    border-radius: 50px;
    font-size: 1.1rem;
    font-weight: bold;
    transition: transform 0.3s, box-shadow 0.3s;
}

.cta-btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}

/* フッター */
.footer {
    background: #f5f5f5;
    padding: 20px;
    text-align: center;
}

.footer a {
    color: #666;
    margin: 0 10px;
    text-decoration: none;
}

.footer a:hover {
    text-decoration: underline;
}`;
}

function getDefaultJs() {
    return `$(function() {
    // 初期化
    initializeLP();
    
    // LP初期化
    function initializeLP() {
        // スムーススクロール
        initSmoothScroll();
    }
    
    // スムーススクロール
    function initSmoothScroll() {
        $('a[href^="#"]').on('click', function(e) {
            e.preventDefault();
            var target = $(this.hash);
            if (target.length) {
                $('html, body').animate({
                    scrollTop: target.offset().top
                }, 500);
            }
        });
    }
});`;
}

// ========================================
// プロジェクト管理
// ========================================

function showProjectModal() {
    const modal = document.querySelector('.js-project-modal');
    if (modal) {
        modal.style.display = 'flex';
        loadProjectList();
    }
}

function hideProjectModal() {
    const modal = document.querySelector('.js-project-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function loadProjectList() {
    const listContainer = document.querySelector('.js-project-list');
    if (!listContainer) return;
    
    try {
        const projects = await getProjectList();
        
        if (projects.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: #999;">プロジェクトがありません</p>';
            return;
        }
        
        listContainer.innerHTML = projects.map(p => `
            <div class="project-item" data-id="${p.id}">
                <div class="project-info">
                    <span class="project-name">${escapeHtml(p.name)}</span>
                    <span class="project-date">${formatDate(p.updatedAt)}</span>
                </div>
                <button class="project-delete-btn js-delete-project" data-id="${p.id}" title="削除">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');
        
        // プロジェクト選択イベント
        listContainer.querySelectorAll('.project-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.js-delete-project')) {
                    openProject(item.dataset.id);
                }
            });
        });
        
        // 削除ボタンイベント
        listContainer.querySelectorAll('.js-delete-project').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('このプロジェクトを削除しますか？')) {
                    await deleteProject(btn.dataset.id);
                    loadProjectList();
                    showToast('プロジェクトを削除しました', 'success');
                }
            });
        });
    } catch (error) {
        console.error('Failed to load projects:', error);
        showToast('プロジェクト一覧の読み込みに失敗しました', 'error');
    }
}

async function createNewProject() {
    const name = prompt('プロジェクト名を入力してください:', '新規LP');
    if (!name) return;
    
    const project = {
        id: generateUUID(),
        name: name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: {
            html: getDefaultHtml(),
            css: getDefaultCss(),
            js: getDefaultJs()
        },
        images: [],
        history: { html: [], css: [], js: [] },
        chatHistory: []
    };
    
    try {
        await saveProject(project);
        await openProject(project.id);
        showToast('新規プロジェクトを作成しました', 'success');
    } catch (error) {
        console.error('Failed to create project:', error);
        showToast('プロジェクトの作成に失敗しました', 'error');
    }
}

async function openProject(id) {
    try {
        const project = await loadProject(id);
        if (!project) {
            showToast('プロジェクトが見つかりません', 'error');
            return;
        }
        
        state.currentProject = project;
        state.chatHistory = project.chatHistory || [];
        state.undoHistory = project.history || { html: [], css: [], js: [] };
        state.redoHistory = { html: [], css: [], js: [] };
        
        // UIに反映
        document.querySelector('.js-project-name').value = project.name;
        
        // エディタに反映
        if (state.editors.html) state.editors.html.setValue(project.files.html || '');
        if (state.editors.css) state.editors.css.setValue(project.files.css || '');
        if (state.editors.js) state.editors.js.setValue(project.files.js || '');
        
        // チャット履歴を反映
        renderChatHistory();
        
        // プレビュー更新
        updatePreview();
        
        // モーダル閉じる
        hideProjectModal();
        
    } catch (error) {
        console.error('Failed to open project:', error);
        showToast('プロジェクトの読み込みに失敗しました', 'error');
    }
}

async function saveCurrentState() {
    if (!state.currentProject || state.isSaving) return;
    
    state.isSaving = true;
    
    try {
        // 現在のエディタ内容を取得
        if (state.editors.html) {
            state.currentProject.files.html = state.editors.html.getValue();
        }
        if (state.editors.css) {
            state.currentProject.files.css = state.editors.css.getValue();
        }
        if (state.editors.js) {
            state.currentProject.files.js = state.editors.js.getValue();
        }
        
        state.currentProject.chatHistory = state.chatHistory;
        state.currentProject.history = state.undoHistory;
        
        await saveProject(state.currentProject);
    } catch (error) {
        console.error('Failed to save:', error);
        showToast('保存に失敗しました', 'error');
    } finally {
        state.isSaving = false;
    }
}

// ========================================
// アンドゥ/リドゥ
// ========================================

function pushToUndoHistory(type, content) {
    if (!state.undoHistory[type]) {
        state.undoHistory[type] = [];
    }
    
    // 差分形式で保存（簡易実装: 全体を保存）
    state.undoHistory[type].push(content);
    
    // 履歴数制限
    if (state.undoHistory[type].length > MAX_HISTORY_COUNT) {
        state.undoHistory[type].shift();
    }
    
    // リドゥ履歴をクリア
    state.redoHistory[type] = [];
}

function undo() {
    const type = state.activeTab;
    if (type === 'preview' || !state.editors[type]) return;
    
    const history = state.undoHistory[type];
    if (!history || history.length === 0) {
        showToast('これ以上戻れません', 'warning');
        return;
    }
    
    // 現在の状態をリドゥ履歴に保存
    const current = state.editors[type].getValue();
    state.redoHistory[type].push(current);
    
    // アンドゥ履歴から復元
    const previous = history.pop();
    state.editors[type].setValue(previous);
    
    updatePreview();
}

function redo() {
    const type = state.activeTab;
    if (type === 'preview' || !state.editors[type]) return;
    
    const history = state.redoHistory[type];
    if (!history || history.length === 0) {
        showToast('これ以上進めません', 'warning');
        return;
    }
    
    // 現在の状態をアンドゥ履歴に保存
    const current = state.editors[type].getValue();
    state.undoHistory[type].push(current);
    
    // リドゥ履歴から復元
    const next = history.pop();
    state.editors[type].setValue(next);
    
    updatePreview();
}

// ========================================
// AIチャット
// ========================================

async function sendChatMessage() {
    const input = document.querySelector('.js-chat-input');
    const message = input?.value?.trim();
    if (!message) return;
    
    // ユーザーメッセージを追加
    addChatMessage('user', message);
    input.value = '';
    
    // チャット履歴を更新
    state.chatHistory.push({ role: 'user', content: message });
    trimChatHistory();
    
    try {
        // APIリクエスト
        const response = await fetch(`${API_BASE_URL}/lp/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                chatHistory: state.chatHistory.slice(-10), // 直近10件のみ送信
                projectContext: {
                    html: state.currentProject?.files?.html?.substring(0, 1000),
                    css: state.currentProject?.files?.css?.substring(0, 500)
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addChatMessage('assistant', data.message);
            state.chatHistory.push({ role: 'assistant', content: data.message });
            trimChatHistory();
            
            // コードが含まれている場合は適用を提案
            if (data.code) {
                // 差分適用のUIを表示
                showDiffModal(data.code, data.diff);
            }
        } else {
            addChatMessage('assistant', `エラー: ${data.error || '応答の取得に失敗しました'}`);
        }
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage('assistant', 'ネットワークエラーが発生しました。再度お試しください。');
    }
    
    saveCurrentState();
}

async function sendModifyInstruction() {
    const input = document.querySelector('.js-instruction-input');
    const instruction = input?.value?.trim();
    if (!instruction) return;
    
    input.value = '';
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/lp/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'modify',
                prompt: instruction,
                currentCode: {
                    html: state.currentProject?.files?.html,
                    css: state.currentProject?.files?.css,
                    js: state.currentProject?.files?.js
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showDiffModal(data.code, data.diff);
            addChatMessage('assistant', data.message || '修正案を生成しました。差分を確認してください。');
        } else {
            showToast(`エラー: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Modify error:', error);
        showToast('修正に失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

function addChatMessage(role, content) {
    const container = document.querySelector('.js-chat-messages');
    if (!container) return;
    
    const avatarIcon = role === 'assistant' 
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
           </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
           </svg>`;
    
    const messageHtml = `
        <div class="chat-message ${role}">
            <div class="message-avatar">${avatarIcon}</div>
            <div class="message-content">
                ${parseMarkdown(content)}
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', messageHtml);
    container.scrollTop = container.scrollHeight;
}

function renderChatHistory() {
    const container = document.querySelector('.js-chat-messages');
    if (!container) return;
    
    // 初期メッセージ以外をクリア
    container.innerHTML = `
        <div class="chat-message assistant">
            <div class="message-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                    <path d="M12 16v-4"/>
                    <path d="M12 8h.01"/>
                </svg>
            </div>
            <div class="message-content">
                <p>こんにちは！LP作成をサポートします。何でも聞いてください。</p>
            </div>
        </div>
    `;
    
    // 履歴を描画
    state.chatHistory.forEach(msg => {
        addChatMessage(msg.role, msg.content);
    });
}

function clearChat() {
    if (confirm('チャット履歴をクリアしますか？')) {
        state.chatHistory = [];
        renderChatHistory();
        saveCurrentState();
        showToast('チャット履歴をクリアしました', 'success');
    }
}

function trimChatHistory() {
    if (state.chatHistory.length > MAX_CHAT_HISTORY) {
        state.chatHistory = state.chatHistory.slice(-MAX_CHAT_HISTORY);
    }
}

// ========================================
// 差分モーダル（簡易実装）
// ========================================

function showDiffModal(newCode, diff) {
    // TODO: 差分表示モーダルの実装
    // 現時点では確認ダイアログで代替
    
    const message = '新しいコードが生成されました。適用しますか？\n\n' +
        '【適用】: 現在のコードを新しいコードに置き換えます\n' +
        '【キャンセル】: 変更を破棄します';
    
    if (confirm(message)) {
        applyNewCode(newCode);
    }
}

function applyNewCode(newCode) {
    if (!newCode) return;
    
    // アンドゥ履歴に現在の状態を保存
    if (newCode.html && state.editors.html) {
        pushToUndoHistory('html', state.editors.html.getValue());
        state.editors.html.setValue(newCode.html);
    }
    if (newCode.css && state.editors.css) {
        pushToUndoHistory('css', state.editors.css.getValue());
        state.editors.css.setValue(newCode.css);
    }
    if (newCode.js && state.editors.js) {
        pushToUndoHistory('js', state.editors.js.getValue());
        state.editors.js.setValue(newCode.js);
    }
    
    updatePreview();
    saveCurrentState();
    showToast('コードを適用しました', 'success');
}

// ========================================
// ZIP出力
// ========================================

async function exportToZip() {
    if (!state.currentProject) {
        showToast('プロジェクトを開いてください', 'warning');
        return;
    }
    
    // 規約準拠チェック
    const issues = checkCodeCompliance();
    if (issues.length > 0) {
        const proceed = confirm(
            '以下の規約違反が検出されました:\n\n' +
            issues.join('\n') +
            '\n\n自動修正して出力しますか？'
        );
        if (!proceed) return;
    }
    
    try {
        const zip = new JSZip();
        const projectName = state.currentProject.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const folder = zip.folder(projectName);
        
        // HTML
        let html = state.currentProject.files.html || getDefaultHtml();
        
        // jQuery CDNが含まれていない場合は追加
        if (!html.includes('jquery')) {
            html = html.replace(
                '</head>',
                `    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>\n</head>`
            );
        }
        
        folder.file('index.html', html);
        
        // CSS
        const cssFolder = folder.folder('css');
        cssFolder.file('style.css', state.currentProject.files.css || getDefaultCss());
        
        // JS
        const jsFolder = folder.folder('js');
        jsFolder.file('script.js', state.currentProject.files.js || getDefaultJs());
        
        // img
        const imgFolder = folder.folder('img');
        if (state.currentProject.images) {
            for (const img of state.currentProject.images) {
                if (img.blob) {
                    imgFolder.file(img.name, img.blob);
                }
            }
        }
        
        // ZIPファイル生成
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${projectName}.zip`);
        
        showToast('ZIPファイルを出力しました', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('ZIP出力に失敗しました', 'error');
    }
}

function checkCodeCompliance() {
    const issues = [];
    const html = state.currentProject?.files?.html || '';
    const css = state.currentProject?.files?.css || '';
    const js = state.currentProject?.files?.js || '';
    
    // styleタグチェック
    if (/<style[^>]*>/i.test(html)) {
        issues.push('[CSS] styleタグが使用されています');
    }
    
    // インラインstyleチェック
    if (/style=["']/i.test(html)) {
        issues.push('[CSS] インラインstyleが使用されています');
    }
    
    // インラインscriptチェック
    if (/<script[^>]*>[^<]+<\/script>/i.test(html.replace(/<script[^>]*src=/gi, ''))) {
        issues.push('[JS] インラインスクリプトが使用されています');
    }
    
    // onclickなどのイベント属性チェック
    if (/\son(click|change|submit|load|focus|blur)=/i.test(html)) {
        issues.push('[JS] onclickなどのイベント属性が使用されています');
    }
    
    return issues;
}

// ========================================
// ユーティリティ
// ========================================

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseMarkdown(text) {
    // 簡易Markdownパーサー
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info') {
    const container = document.querySelector('.js-toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    document.getElementById('loadingOverlay')?.remove();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

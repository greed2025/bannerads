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

// 前回の値を保持（変更検知用）
const previousValues = { html: '', css: '', js: '' };

function handleEditorChange(type) {
    // 現在の値取得
    const currentValue = state.editors[type]?.getValue() || '';
    
    // 値が実際に変わった場合のみ履歴に追加
    if (previousValues[type] && previousValues[type] !== currentValue) {
        pushToUndoHistory(type, previousValues[type]);
    }
    previousValues[type] = currentValue;
    
    // 自動保存（デバウンス）
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
    
    // コードをAIに送信ボタン
    document.querySelector('.js-apply-code-btn')?.addEventListener('click', () => {
        sendCurrentCodeToAI();
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
        
        // 変更検知用の前回値を初期化
        previousValues.html = project.files.html || '';
        previousValues.css = project.files.css || '';
        previousValues.js = project.files.js || '';
        
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

async function sendCurrentCodeToAI() {
    if (!state.currentProject) {
        showToast('プロジェクトを開いてください', 'warning');
        return;
    }
    
    const html = state.editors.html?.getValue() || '';
    const css = state.editors.css?.getValue() || '';
    const js = state.editors.js?.getValue() || '';
    
    // チャットにメッセージを追加
    addChatMessage('user', '現在のコードを確認してください');
    state.chatHistory.push({ 
        role: 'user', 
        content: '現在のコードを確認してください' 
    });
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/lp/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `現在のコードを確認して、改善点があれば教えてください。

HTML:
\`\`\`html
${html.substring(0, 2000)}
\`\`\`

CSS:
\`\`\`css
${css.substring(0, 1000)}
\`\`\`

JS:
\`\`\`javascript
${js.substring(0, 500)}
\`\`\``,
                chatHistory: state.chatHistory.slice(-5)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addChatMessage('assistant', data.message);
            state.chatHistory.push({ role: 'assistant', content: data.message });
            trimChatHistory();
        } else {
            addChatMessage('assistant', `エラー: ${data.error || '応答の取得に失敗しました'}`);
        }
    } catch (error) {
        console.error('Send code error:', error);
        addChatMessage('assistant', 'コード送信に失敗しました。再度お試しください。');
    } finally {
        hideLoading();
    }
    
    saveCurrentState();
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

// 古い差分モーダル関数は下部で再定義されているため削除済み

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
        
        // img（dataUrlからBlobに変換して出力）
        const imgFolder = folder.folder('img');
        if (state.currentProject.images) {
            for (const img of state.currentProject.images) {
                if (img.blob) {
                    imgFolder.file(img.name, img.blob);
                } else if (img.dataUrl) {
                    // dataUrlをBlobに変換
                    const blob = dataUrlToBlob(img.dataUrl);
                    if (blob) {
                        imgFolder.file(img.name, blob);
                    }
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

function dataUrlToBlob(dataUrl) {
    try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    } catch (error) {
        console.error('dataUrlToBlob error:', error);
        return null;
    }
}

/**
 * 画像をWebP形式に変換
 * @param {string} dataUrl - 元画像のdataUrl
 * @param {number} quality - 画質 (0-1, デフォルト0.85)
 * @returns {Promise<{dataUrl: string, blob: Blob}>}
 */
async function convertToWebP(dataUrl, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // WebPに変換
            canvas.toBlob((blob) => {
                if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve({
                            dataUrl: reader.result,
                            blob: blob,
                            size: blob.size
                        });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    // WebP非対応ブラウザはPNGで返す
                    canvas.toBlob((pngBlob) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            resolve({
                                dataUrl: reader.result,
                                blob: pngBlob,
                                size: pngBlob.size
                            });
                        };
                        reader.readAsDataURL(pngBlob);
                    }, 'image/png');
                }
            }, 'image/webp', quality);
        };
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        img.src = dataUrl;
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

// ========================================
// 差分表示モーダル
// ========================================

// 一時保存用の新コード
let pendingCode = null;
let activeDiffTab = 'html';

function showDiffModal(newCode, diff) {
    pendingCode = newCode;
    
    const modal = document.querySelector('.js-diff-modal');
    if (!modal) {
        // モーダルがない場合は従来のconfirmで代替
        if (confirm('新しいコードが生成されました。適用しますか？')) {
            applyNewCode(newCode);
        }
        return;
    }
    
    modal.style.display = 'flex';
    activeDiffTab = 'html';
    
    // タブ更新
    modal.querySelectorAll('.diff-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diffTab === 'html');
    });
    
    // 差分表示
    renderDiffContent();
    
    // メッセージ
    const messageEl = modal.querySelector('.js-diff-message');
    if (messageEl) {
        messageEl.textContent = 'AIが生成したコードの変更を確認してください。適用すると現在のコードが置き換わります。';
    }
    
    // イベントリスナー設定
    initDiffModalEvents();
}

function initDiffModalEvents() {
    const modal = document.querySelector('.js-diff-modal');
    if (!modal) return;
    
    // タブ切替
    modal.querySelectorAll('.diff-tab-btn').forEach(btn => {
        btn.onclick = () => {
            activeDiffTab = btn.dataset.diffTab;
            modal.querySelectorAll('.diff-tab-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.diffTab === activeDiffTab);
            });
            renderDiffContent();
        };
    });
    
    // キャンセル
    modal.querySelector('.js-diff-cancel').onclick = () => {
        hideDiffModal();
    };
    modal.querySelector('.js-diff-modal-close').onclick = () => {
        hideDiffModal();
    };
    
    // 適用
    modal.querySelector('.js-diff-apply').onclick = () => {
        applyNewCode(pendingCode);
        hideDiffModal();
    };
}

function renderDiffContent() {
    const container = document.querySelector('.js-diff-content');
    if (!container || !pendingCode) return;
    
    const currentCode = state.editors[activeDiffTab]?.getValue() || '';
    const newCode = pendingCode[activeDiffTab] || '';
    
    // 簡易差分表示（行単位で比較）
    const currentLines = currentCode.split('\n');
    const newLines = newCode.split('\n');
    
    let diffHtml = '';
    const maxLines = Math.max(currentLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
        const oldLine = currentLines[i] || '';
        const newLine = newLines[i] || '';
        
        if (oldLine === newLine) {
            diffHtml += `<div style="color: #f8f8f2;">${escapeHtml(newLine) || '&nbsp;'}</div>`;
        } else if (!oldLine && newLine) {
            diffHtml += `<div style="color: #50fa7b; background: rgba(80, 250, 123, 0.1);">+ ${escapeHtml(newLine)}</div>`;
        } else if (oldLine && !newLine) {
            diffHtml += `<div style="color: #ff5555; background: rgba(255, 85, 85, 0.1);">- ${escapeHtml(oldLine)}</div>`;
        } else {
            diffHtml += `<div style="color: #ff5555; background: rgba(255, 85, 85, 0.1);">- ${escapeHtml(oldLine)}</div>`;
            diffHtml += `<div style="color: #50fa7b; background: rgba(80, 250, 123, 0.1);">+ ${escapeHtml(newLine)}</div>`;
        }
    }
    
    container.innerHTML = diffHtml || '<div style="color: #999;">変更なし</div>';
}

function hideDiffModal() {
    const modal = document.querySelector('.js-diff-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingCode = null;
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
// 画像生成モーダル
// ========================================

let generatedImageData = null;

function showImageModal() {
    const modal = document.querySelector('.js-image-modal');
    if (!modal) {
        showToast('画像生成モーダルが見つかりません', 'error');
        return;
    }
    
    modal.style.display = 'flex';
    generatedImageData = null;
    
    // プレビュー非表示
    const preview = modal.querySelector('.js-image-preview');
    if (preview) {
        preview.style.display = 'none';
    }
    
    // ボタン状態リセット
    modal.querySelector('.js-image-generate').style.display = 'inline-flex';
    modal.querySelector('.js-image-insert').style.display = 'none';
    
    // イベントリスナー設定
    initImageModalEvents();
}

function initImageModalEvents() {
    const modal = document.querySelector('.js-image-modal');
    if (!modal) return;
    
    // 閉じる
    modal.querySelector('.js-image-modal-close').onclick = () => hideImageModal();
    modal.querySelector('.js-image-cancel').onclick = () => hideImageModal();
    
    // 生成
    modal.querySelector('.js-image-generate').onclick = async () => {
        const prompt = modal.querySelector('.js-image-prompt')?.value?.trim();
        if (!prompt) {
            showToast('プロンプトを入力してください', 'warning');
            return;
        }
        
        const width = parseInt(modal.querySelector('.js-image-width')?.value) || 1024;
        const height = parseInt(modal.querySelector('.js-image-height')?.value) || 768;
        
        showLoading();
        
        try {
            const response = await fetch(`${API_BASE_URL}/lp/image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, width, height })
            });
            
            const data = await response.json();
            
            if (data.success && data.image) {
                generatedImageData = data.image;
                
                // プレビュー表示
                const preview = modal.querySelector('.js-image-preview');
                const img = preview.querySelector('img');
                img.src = `data:image/png;base64,${data.image}`;
                preview.style.display = 'block';
                
                // ボタン切替
                modal.querySelector('.js-image-generate').style.display = 'none';
                modal.querySelector('.js-image-insert').style.display = 'inline-flex';
                
                showToast('画像を生成しました', 'success');
            } else {
                showToast(`画像生成に失敗: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Image generation error:', error);
            showToast('画像生成に失敗しました', 'error');
        } finally {
            hideLoading();
        }
    };
    
    // LPに挿入（WebP変換）
    modal.querySelector('.js-image-insert').onclick = async () => {
        if (!generatedImageData || !state.currentProject) return;
        
        showLoading();
        
        try {
            // ファイル名生成
            const timestamp = Date.now();
            const filename = `generated_${timestamp}.webp`;
            
            // WebP変換
            const originalDataUrl = `data:image/png;base64,${generatedImageData}`;
            const webpResult = await convertToWebP(originalDataUrl, 0.85);
            
            // 画像をプロジェクトに追加
            if (!state.currentProject.images) {
                state.currentProject.images = [];
            }
            
            state.currentProject.images.push({
                name: filename,
                dataUrl: webpResult.dataUrl,
                blob: webpResult.blob,
                size: webpResult.size
            });
            
            // HTMLに画像タグを挿入
            if (state.editors.html) {
                const currentHtml = state.editors.html.getValue();
                const imgTag = `<img src="img/${filename}" alt="生成画像" class="generated-image">`;
                
                // </body>の前に挿入
                const newHtml = currentHtml.replace(
                    /(<\/body>)/i,
                    `    ${imgTag}\n$1`
                );
                
                state.editors.html.setValue(newHtml);
            }
            
            saveCurrentState();
            updatePreview();
            hideImageModal();
            
            showToast('画像をWebPに変換してLPに挿入しました', 'success');
        } catch (error) {
            console.error('Image insert error:', error);
            showToast('画像の挿入に失敗しました', 'error');
        } finally {
            hideLoading();
        }
    };
}

function hideImageModal() {
    const modal = document.querySelector('.js-image-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    generatedImageData = null;
}

// ========================================
// テンプレート管理
// ========================================

async function showTemplateModal() {
    const modal = document.querySelector('.js-template-modal');
    if (!modal) {
        showToast('テンプレートモーダルが見つかりません', 'error');
        return;
    }
    
    modal.style.display = 'flex';
    
    // テンプレート一覧を読み込み
    await loadTemplateList();
    
    // イベントリスナー設定
    initTemplateModalEvents();
}

function initTemplateModalEvents() {
    const modal = document.querySelector('.js-template-modal');
    if (!modal) return;
    
    // 閉じる
    modal.querySelector('.js-template-modal-close').onclick = () => hideTemplateModal();
    
    // テンプレート保存
    modal.querySelector('.js-template-save').onclick = async () => {
        const nameInput = modal.querySelector('.js-template-name');
        const name = nameInput?.value?.trim();
        
        if (!name) {
            showToast('テンプレート名を入力してください', 'warning');
            return;
        }
        
        if (!state.currentProject) {
            showToast('プロジェクトを開いてください', 'warning');
            return;
        }
        
        const template = {
            id: generateUUID(),
            name: name,
            files: {
                html: state.currentProject.files.html,
                css: state.currentProject.files.css,
                js: state.currentProject.files.js
            },
            createdAt: new Date().toISOString()
        };
        
        try {
            await saveTemplate(template);
            nameInput.value = '';
            await loadTemplateList();
            showToast('テンプレートを保存しました', 'success');
        } catch (error) {
            console.error('Failed to save template:', error);
            showToast('テンプレートの保存に失敗しました', 'error');
        }
    };
}

async function loadTemplateList() {
    const listContainer = document.querySelector('.js-template-list');
    if (!listContainer) return;
    
    try {
        const templates = await getTemplateList();
        
        if (templates.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">保存されたテンプレートはありません</p>';
            return;
        }
        
        listContainer.innerHTML = templates.map(t => `
            <div class="template-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px;">
                <div>
                    <span style="font-weight: 500;">${escapeHtml(t.name)}</span>
                    <span style="color: var(--color-gray-500); font-size: 12px; margin-left: 8px;">${formatDate(t.createdAt)}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary js-template-use" data-id="${t.id}" style="padding: 6px 12px; font-size: 12px;">使用</button>
                    <button class="btn btn-secondary js-template-delete" data-id="${t.id}" style="padding: 6px 12px; font-size: 12px; color: var(--color-danger);">削除</button>
                </div>
            </div>
        `).join('');
        
        // 使用ボタン
        listContainer.querySelectorAll('.js-template-use').forEach(btn => {
            btn.onclick = async () => {
                const template = await getTemplate(btn.dataset.id);
                if (template) {
                    await createProjectFromTemplate(template);
                }
            };
        });
        
        // 削除ボタン
        listContainer.querySelectorAll('.js-template-delete').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('このテンプレートを削除しますか？')) {
                    await deleteTemplate(btn.dataset.id);
                    await loadTemplateList();
                    showToast('テンプレートを削除しました', 'success');
                }
            };
        });
    } catch (error) {
        console.error('Failed to load templates:', error);
        listContainer.innerHTML = '<p style="color: var(--color-danger);">読み込みに失敗しました</p>';
    }
}

async function createProjectFromTemplate(template) {
    const name = prompt('プロジェクト名を入力してください:', `${template.name}のコピー`);
    if (!name) return;
    
    const project = {
        id: generateUUID(),
        name: name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: {
            html: template.files.html,
            css: template.files.css,
            js: template.files.js
        },
        images: [],
        history: { html: [], css: [], js: [] },
        chatHistory: []
    };
    
    try {
        await saveProject(project);
        await openProject(project.id);
        hideTemplateModal();
        hideProjectModal();
        showToast('テンプレートからプロジェクトを作成しました', 'success');
    } catch (error) {
        console.error('Failed to create project from template:', error);
        showToast('プロジェクトの作成に失敗しました', 'error');
    }
}

function hideTemplateModal() {
    const modal = document.querySelector('.js-template-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// テンプレートDB操作
async function saveTemplate(template) {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_TEMPLATES], 'readwrite');
        const store = transaction.objectStore(STORE_TEMPLATES);
        const request = store.put(template);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function getTemplateList() {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_TEMPLATES], 'readonly');
        const store = transaction.objectStore(STORE_TEMPLATES);
        const index = store.index('createdAt');
        const request = index.openCursor(null, 'prev');
        
        const templates = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                templates.push({
                    id: cursor.value.id,
                    name: cursor.value.name,
                    createdAt: cursor.value.createdAt
                });
                cursor.continue();
            } else {
                resolve(templates);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function getTemplate(id) {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_TEMPLATES], 'readonly');
        const store = transaction.objectStore(STORE_TEMPLATES);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteTemplate(id) {
    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_TEMPLATES], 'readwrite');
        const store = transaction.objectStore(STORE_TEMPLATES);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// ========================================
// 追加のイベントリスナー
// ========================================

// DOMContentLoaded後に追加イベントを設定
document.addEventListener('DOMContentLoaded', () => {
    // 画像生成ボタン
    document.querySelector('.js-image-btn')?.addEventListener('click', () => {
        showImageModal();
    });
    
    // テンプレートボタン
    document.querySelector('.js-template-btn')?.addEventListener('click', () => {
        showTemplateModal();
    });
    
    // テンプレートから作成ボタン
    document.querySelector('.js-template-select')?.addEventListener('click', () => {
        hideProjectModal();
        showTemplateModal();
    });
});


/**
 * バナー作成ツール - AI対話型
 * Claude SDKで参考画像分析 → 対話 → Gemini Imagen（nanobanana pro）でバナー作成
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // 要素取得
    // ========================================
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const generateCount = document.getElementById('generateCount');
    const galleryContent = document.getElementById('galleryContent');
    const galleryEmpty = document.getElementById('galleryEmpty');
    const bannerCount = document.getElementById('bannerCount');
    const exportAllBtn = document.getElementById('exportAllBtn');
    const sizeBtns = document.querySelectorAll('.size-btn');
    const projectSelect = document.getElementById('projectSelect');
    const bannerSizeSelect = document.getElementById('bannerSizeSelect');
    
    // モーダル
    const commentModal = document.getElementById('commentModal');
    const commentModalClose = document.getElementById('commentModalClose');
    const commentText = document.getElementById('commentText');
    const commentCancel = document.getElementById('commentCancel');
    const commentConfirm = document.getElementById('commentConfirm');
    
    // タブ関連
    const tabsContainer = document.getElementById('tabsContainer');
    const newTabBtn = document.getElementById('newTabBtn');
    const historyBtn = document.getElementById('historyBtn');
    const historyMenu = document.getElementById('historyMenu');
    const historyList = document.getElementById('historyList');
    
    // 任意設定パネル
    const presetPanel = document.querySelector('.preset-panel');
    const presetHeader = document.getElementById('presetHeader');
    const presetToggle = document.getElementById('presetToggle');
    const presetTarget = document.getElementById('presetTarget');
    const presetAppeal = document.getElementById('presetAppeal');
    const presetTone = document.getElementById('presetTone');
    const presetDetails = document.getElementById('presetDetails');

    // ========================================
    // 状態管理
    // ========================================
    let projects = []; // プロジェクト一覧
    let deletedProjects = []; // 削除されたプロジェクト（履歴用）
    let currentProjectId = null; // 現在アクティブなプロジェクトID
    let projectCounter = 0; // プロジェクトIDカウンター
    
    // 現在のプロジェクトの状態を取得するヘルパー
    function getCurrentProject() {
        return projects.find(p => p.id === currentProjectId);
    }
    
    // 一時的な変数（現在のプロジェクトの状態へのアクセサ）
    let currentBannerId = null;
    let isProcessing = false;
    let abortController = null; // 中断用コントローラー
    
    // 領域選択関連
    let regionSelectMode = false;
    let regionSelectBannerId = null;
    let regionDragStart = null;
    let currentSelectionBox = null;
    
    const API_BASE_URL = `${window.location.origin}/api`;
    
    const canvasSizes = {
        '1080x1080': { width: 280, height: 280, label: 'スクエア', actualWidth: 1080, actualHeight: 1080 },
        '1080x1920': { width: 180, height: 320, label: '縦長', actualWidth: 1080, actualHeight: 1920 },
        '1200x628': { width: 280, height: 146, label: 'Facebook', actualWidth: 1200, actualHeight: 628 },
        '300x250': { width: 240, height: 200, label: 'レクタングル', actualWidth: 300, actualHeight: 250 },
        '728x90': { width: 280, height: 35, label: 'リーダーボード', actualWidth: 728, actualHeight: 90 }
    };
    
    const STORAGE_KEY = 'banner_projects';
    const DB_NAME = 'BannerToolDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'projects';
    const MAX_PROJECT_AGE_DAYS = 30; // 30日以上前のプロジェクトを自動削除
    
    let db = null; // IndexedDB インスタンス

    // ========================================
    // IndexedDB ユーティリティ
    // ========================================
    
    // データベース初期化
    function initDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('⚠️ IndexedDB がサポートされていません。LocalStorageにフォールバックします。');
                resolve(null);
                return;
            }
            
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('IndexedDB エラー:', event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('✅ IndexedDB 接続成功');
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // オブジェクトストアを作成
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    console.log('📦 IndexedDB オブジェクトストア作成完了');
                }
            };
        });
    }
    
    // IndexedDBに保存
    function saveToIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!db) {
                // フォールバック: LocalStorageを使用
                saveToLocalStorageFallback();
                resolve();
                return;
            }
            
            try {
                // 各プロジェクトにlastModifiedを追加
                projects.forEach(project => {
                    if (!project.lastModified) {
                        project.lastModified = new Date().toISOString();
                    }
                });
                
                const data = {
                    id: STORAGE_KEY,
                    projects: projects,
                    deletedProjects: deletedProjects,
                    currentProjectId: currentProjectId,
                    projectCounter: projectCounter,
                    lastModified: new Date().toISOString(),
                    settings: {
                        panelCollapsed: document.getElementById('favoriteBannerPanel')?.classList.contains('collapsed') || false
                    }
                };
                
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(data);
                
                request.onsuccess = () => {
                    const sizeInMB = new Blob([JSON.stringify(data)]).size / (1024 * 1024);
                    console.log(`💾 IndexedDB 保存成功: ${sizeInMB.toFixed(2)} MB`);
                    resolve();
                };
                
                request.onerror = (event) => {
                    console.error('IndexedDB 保存エラー:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('IndexedDB 保存エラー:', error);
                reject(error);
            }
        });
    }
    
    // IndexedDBから読み込み
    function loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!db) {
                // フォールバック: LocalStorageを使用
                const result = loadFromLocalStorageFallback();
                resolve(result);
                return;
            }
            
            try {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(STORAGE_KEY);
                
                request.onsuccess = (event) => {
                    const data = event.target.result;
                    if (data) {
                        projects = data.projects || [];
                        deletedProjects = data.deletedProjects || [];
                        currentProjectId = data.currentProjectId;
                        projectCounter = data.projectCounter || 0;
                        
                        // パネル状態を復元
                        if (data.settings?.panelCollapsed) {
                            const panel = document.getElementById('favoriteBannerPanel');
                            if (panel) panel.classList.add('collapsed');
                        }
                        
                        // 古いプロジェクトを自動削除
                        cleanupOldProjects();
                        
                        console.log('✅ IndexedDB 読み込み成功');
                        resolve(true);
                    } else {
                        // LocalStorageからの移行を試みる
                        const migrated = migrateFromLocalStorage();
                        resolve(migrated);
                    }
                };
                
                request.onerror = (event) => {
                    console.error('IndexedDB 読み込みエラー:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('IndexedDB 読み込みエラー:', error);
                reject(error);
            }
        });
    }
    
    // 古いプロジェクトの自動削除
    function cleanupOldProjects() {
        const now = new Date();
        const maxAge = MAX_PROJECT_AGE_DAYS * 24 * 60 * 60 * 1000; // ミリ秒に変換
        
        const oldProjects = projects.filter(project => {
            if (!project.lastModified) return false;
            const lastModified = new Date(project.lastModified);
            return (now - lastModified) > maxAge;
        });
        
        if (oldProjects.length > 0) {
            console.log(`🗑️ ${oldProjects.length}件の古いプロジェクトを自動削除します（${MAX_PROJECT_AGE_DAYS}日以上前）`);
            
            // 削除対象のプロジェクトID
            const oldProjectIds = oldProjects.map(p => p.id);
            
            // プロジェクトから削除
            projects = projects.filter(p => !oldProjectIds.includes(p.id));
            
            // 現在のプロジェクトが削除された場合は調整
            if (oldProjectIds.includes(currentProjectId)) {
                currentProjectId = projects.length > 0 ? projects[0].id : null;
            }
            
            // 保存
            saveToIndexedDB();
            
            console.log(`✅ 古いプロジェクトの削除完了: ${oldProjects.map(p => p.name).join(', ')}`);
        }
    }
    
    // LocalStorageからの移行
    function migrateFromLocalStorage() {
        try {
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                console.log('📦 LocalStorageからIndexedDBへ移行中...');
                const data = JSON.parse(savedData);
                projects = data.projects || [];
                deletedProjects = data.deletedProjects || [];
                currentProjectId = data.currentProjectId;
                projectCounter = data.projectCounter || 0;
                
                // 各プロジェクトにlastModifiedを追加
                projects.forEach(project => {
                    if (!project.lastModified) {
                        project.lastModified = new Date().toISOString();
                    }
                });
                
                // IndexedDBに保存
                saveToIndexedDB().then(() => {
                    // 移行完了後、LocalStorageをクリア
                    localStorage.removeItem(STORAGE_KEY);
                    console.log('✅ LocalStorageからIndexedDBへの移行完了');
                });
                
                return true;
            }
        } catch (error) {
            console.error('LocalStorage移行エラー:', error);
        }
        return false;
    }
    
    // フォールバック: LocalStorageに保存
    function saveToLocalStorageFallback() {
        try {
            const data = {
                projects: projects,
                deletedProjects: deletedProjects,
                currentProjectId: currentProjectId,
                projectCounter: projectCounter
            };
            const jsonData = JSON.stringify(data);
            
            const sizeInMB = new Blob([jsonData]).size / (1024 * 1024);
            console.log(`💾 LocalStorage(フォールバック) 保存: ${sizeInMB.toFixed(2)} MB`);
            
            localStorage.setItem(STORAGE_KEY, jsonData);
        } catch (error) {
            console.error('LocalStorage保存エラー:', error);
            
            if (error.name === 'QuotaExceededError' || error.code === 22) {
                console.warn('💾 localStorage容量超過');
                alert('保存容量が不足しています。古いプロジェクトを削除してください。');
            }
        }
    }
    
    // フォールバック: LocalStorageから読み込み
    function loadFromLocalStorageFallback() {
        try {
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                const data = JSON.parse(savedData);
                projects = data.projects || [];
                deletedProjects = data.deletedProjects || [];
                currentProjectId = data.currentProjectId;
                projectCounter = data.projectCounter || 0;
                return true;
            }
        } catch (error) {
            console.error('LocalStorage読み込みエラー:', error);
        }
        return false;
    }
    
    // 互換性のためのラッパー関数
    function saveToLocalStorage() {
        saveToIndexedDB().catch(error => {
            console.error('保存エラー:', error);
        });
    }
    
    function loadFromLocalStorage() {
        // この関数は非同期だが、init()で適切に処理される
        return false; // 初期化時はinitDatabase()経由で読み込む
    }

    // ========================================
    // 初期化
    // ========================================
    async function init() {
        try {
            // IndexedDBを初期化
            await initDatabase();
            
            // IndexedDBからデータを読み込み
            const loaded = await loadFromIndexedDB();
            
            if (loaded && projects.length > 0) {
                // 保存されたプロジェクトがある場合は復元
                restoreProjectState();
                renderTabs();
            } else {
                // 初回プロジェクト作成
                createProject('プロジェクト 1');
            }
        } catch (error) {
            console.error('初期化エラー:', error);
            // エラー時はフォールバックとして新規プロジェクトを作成
            createProject('プロジェクト 1');
        }
        
        setupTabEvents();
        setupPresetPanel();
        setupFavoritePanelToggle();
        
        // ページ離脱時に現在のプロジェクト状態を保存
        window.addEventListener('beforeunload', () => {
            saveCurrentProjectState();
        });
        
        // 入力フィールドの変更を定期的に保存
        setInterval(() => {
            saveCurrentProjectState();
        }, 5000); // 5秒ごとに自動保存
        
        console.log('✅ バナーツール初期化完了');
    }
    
    // ========================================
    // 好調バナーパネル開閉
    // ========================================
    function setupFavoritePanelToggle() {
        const panel = document.getElementById('favoriteBannerPanel');
        const toggleBtn = document.getElementById('panelToggleBtn');
        
        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                // パネルの状態をIndexedDBに保存（saveToLocalStorage経由）
                saveToLocalStorage();
                // ギャラリーを再描画してサイズを更新
                renderGallery();
            });
            // パネル状態の復元はloadFromIndexedDB()内で行われる
        }
    }
    
    // ========================================
    // 任意設定パネル
    // ========================================
    function setupPresetPanel() {
        // ヘッダークリックで開閉
        if (presetHeader) {
            presetHeader.addEventListener('click', () => {
                presetPanel.classList.toggle('collapsed');
            });
        }
        
        // トグルボタンでも開閉
        if (presetToggle) {
            presetToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                presetPanel.classList.toggle('collapsed');
            });
        }
    }
    
    // プリセット値を取得するヘルパー
    function getPresetValues() {
        return {
            target: presetTarget ? presetTarget.value.trim() : '',
            appeal: presetAppeal ? presetAppeal.value.trim() : '',
            tone: presetTone ? presetTone.value.trim() : '',
            details: presetDetails ? presetDetails.value.trim() : ''
        };
    }

    // ========================================
    // キャンバスサイズ変更
    // ========================================
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const project = getCurrentProject();
            if (project) {
                project.canvasSize = btn.dataset.size;
            }
        });
    });

    // ========================================
    // 画像分析（Claude）- 参考デザインを分析
    // ========================================
    async function analyzeImage() {
        const project = getCurrentProject();
        if (!project || project.referenceImages.length === 0) return;
        
        addMessage('system', '📸 参考画像を分析しています...');
        
        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '参考画像をアップロードしました。この画像を分析して、どのような広告バナーを作成できるか提案してください。',
                    images: project.referenceImages.map(img => img.data),
                    conversationHistory: project.conversationHistory,
                    canvasSize: project.canvasSize,
                    projectType: projectSelect.value
                })
            });
            
            if (!response.ok) {
                throw new Error('API error');
            }
            
            const data = await response.json();
            project.conversationHistory = data.conversationHistory || [];
            addMessage('assistant', data.message);
            saveToLocalStorage();
            
            // ツール使用があった場合（画像生成）
            if (data.generatedImages && data.generatedImages.length > 0) {
                handleGeneratedImages(data.generatedImages);
            }
        } catch (error) {
            console.error('画像分析エラー:', error);
            addMessage('assistant', 'すみません、画像の分析中にエラーが発生しました。サーバーが起動しているか確認してください。');
        }
    }

    // ========================================
    // チャット機能（Claude対話）
    // ========================================
    function addMessage(type, content, isHtml = false) {
        const div = document.createElement('div');
        div.className = `chat-message ${type}`;
        
        let formattedContent;
        if (isHtml) {
            // HTMLの場合もマークダウンとしてパース
            formattedContent = content;
        } else if (type === 'assistant') {
            // アシスタントからのメッセージはマークダウンとしてパース
            formattedContent = parseMarkdown(content);
        } else {
            // ユーザーやシステムメッセージはそのままエスケープ
            formattedContent = `<p>${escapeHtml(content)}</p>`;
        }
        
        div.innerHTML = `<div class="message-content">${formattedContent}</div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message || isProcessing) return;
        
        const project = getCurrentProject();
        if (!project) return;

        addMessage('user', message);
        chatInput.value = '';
        isProcessing = true;
        chatSendBtn.disabled = true;
        abortController = new AbortController(); // 中断用コントローラー作成

        // 中断ボタン付きの「考えています」メッセージ
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'chat-message assistant thinking';
        thinkingDiv.innerHTML = `
            <div class="message-content thinking-content">
                <span class="thinking-text">考えています...</span>
                <button class="thinking-abort-btn" id="thinkingAbortBtn">中断</button>
            </div>
        `;
        chatMessages.appendChild(thinkingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 中断ボタンのイベント
        const abortBtn = thinkingDiv.querySelector('#thinkingAbortBtn');
        abortBtn.addEventListener('click', () => {
            if (abortController) {
                abortController.abort();
                thinkingDiv.remove();
                addMessage('system', '⏹ 処理を中断しました');
                isProcessing = false;
                chatSendBtn.disabled = false;
                abortController = null;
            }
        });

        try {
            // サイズ選択を反映
            const selectedSize = bannerSizeSelect.value;
            if (selectedSize && canvasSizes[selectedSize]) {
                project.canvasSize = selectedSize;
            }
            
            const presets = getPresetValues();
            
            console.log('📋 送信するselectedFavoriteBanners:', selectedFavoriteBanners);
            console.log('📋 送信するprojectType:', projectSelect.value);
            
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    images: project.referenceImages.map(img => img.data),
                    conversationHistory: project.conversationHistory,
                    canvasSize: project.canvasSize,
                    generateCount: parseInt(generateCount.value),
                    projectType: currentFavoriteProjectType,  // 好調バナーパネルのprojectTypeを使用
                    presets: presets,
                    selectedBanners: selectedFavoriteBanners
                }),
                signal: abortController.signal // 中断シグナルを渡す
            });

            thinkingDiv.remove();

            if (!response.ok) {
                throw new Error('API error');
            }

            const data = await response.json();
            project.conversationHistory = data.conversationHistory || [];
            addMessage('assistant', data.message);
            saveToLocalStorage();

            // ツール使用があった場合（画像生成）
            if (data.generatedImages && data.generatedImages.length > 0) {
                handleGeneratedImages(data.generatedImages);
            }
        } catch (error) {
            thinkingDiv.remove();
            if (error.name === 'AbortError') {
                // 中断された場合は既にメッセージ表示済み
            } else {
                console.error('チャットエラー:', error);
                addMessage('assistant', 'すみません、エラーが発生しました。サーバーが起動しているか確認してください。');
            }
        } finally {
            isProcessing = false;
            chatSendBtn.disabled = false;
            abortController = null;
        }
    }

    function handleGeneratedImages(images) {
        const project = getCurrentProject();
        if (!project) return;
        
        const sizeInfo = canvasSizes[project.canvasSize];
        
        images.forEach((imageUrl, i) => {
            const banner = {
                id: Date.now() + i,
                prompt: '',
                size: project.canvasSize,
                sizeInfo: sizeInfo,
                comments: [],
                imageUrl: imageUrl,
                createdAt: new Date(),
                // 実際の画像サイズは後で計測
                actualSize: null
            };
            
            // 実際の画像サイズを計測
            if (imageUrl && imageUrl.startsWith('data:')) {
                const img = new Image();
                img.onload = () => {
                    banner.actualSize = {
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    };
                    console.log(`📐 バナー ${banner.id} の実サイズ: ${img.naturalWidth}x${img.naturalHeight}`);
                    saveToLocalStorage();
                };
                img.src = imageUrl;
            }
            
            project.banners.push(banner);
        });
        
        renderGallery();
        bannerCount.textContent = project.banners.length + '枚';
        addMessage('assistant', `✅ ${images.length}枚のバナーを生成しました！各バナーにコメントを追加して「修正」ボタンで改善できます。`);
        saveToLocalStorage();
    }

    chatSendBtn.addEventListener('click', sendMessage);
    
    // Enter2回で送信（シナリオツールと同様）
    let lastEnterTime = 0;
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const currentTime = new Date().getTime();
            const timeDiff = currentTime - lastEnterTime;
            
            // 500ms以内の連打で送信
            if (timeDiff < 500) {
                e.preventDefault(); // 2回目の改行を阻止
                sendMessage();
                lastEnterTime = 0; // リセット
            } else {
                lastEnterTime = currentTime;
                // 1回目は改行を許可（デフォルト動作）
            }
        }
    });

    // ========================================
    // ギャラリー表示
    // ========================================
    function renderGallery() {
        const project = getCurrentProject();
        const projectBanners = project ? project.banners : [];
        
        if (projectBanners.length === 0) {
            galleryEmpty.style.display = 'flex';
            galleryContent.querySelectorAll('.banner-card').forEach(el => el.remove());
            return;
        }
        
        galleryEmpty.style.display = 'none';
        
        galleryContent.querySelectorAll('.banner-card').forEach(el => el.remove());
        
        projectBanners.forEach(banner => {
            const card = document.createElement('div');
            card.className = 'banner-card';
            card.dataset.id = banner.id;
            
            const sizeInfo = banner.sizeInfo;
            const hasImage = banner.imageUrl && (banner.imageUrl.startsWith('http') || banner.imageUrl.startsWith('data:'));
            
            // コメントを正規化（古い文字列形式と新オブジェクト形式の両方に対応）
            const normalizedComments = (banner.comments || []).map((c, i) => {
                if (typeof c === 'string') {
                    return { text: c, region: null };
                }
                return c;
            });
            
            // 領域マーカーのHTML生成
            const regionMarkersHtml = normalizedComments
                .filter(c => c.region)
                .map((c, i) => {
                    const idx = normalizedComments.indexOf(c);
                    return `
                        <div class="region-marker" data-idx="${idx}" 
                            style="left:${c.region.x}%;top:${c.region.y}%;width:${c.region.width}%;height:${c.region.height}%;">
                            <span class="region-marker-label">${idx + 1}</span>
                        </div>
                    `;
                }).join('');
            
            // アスペクト比を計算
            const aspectRatio = sizeInfo.actualWidth / sizeInfo.actualHeight;
            
            card.innerHTML = `
                <div class="banner-preview" data-banner-id="${banner.id}" style="width:100%;aspect-ratio:${aspectRatio};background:#f0f0f0;">
                    ${hasImage ? `<img src="${banner.imageUrl}" alt="バナー" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">` : `
                    <div class="banner-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21,15 16,10 5,21"/>
                        </svg>
                        <span>バナー #${projectBanners.indexOf(banner) + 1}</span>
                    </div>
                    `}
                    ${regionMarkersHtml}
                </div>
                <div class="banner-comments">
                    <div class="comments-header">
                        <span class="comments-label">修正コメント</span>
                        <span class="comments-count">${normalizedComments.length}</span>
                    </div>
                    <div class="comments-list" id="comments-${banner.id}">
                        ${normalizedComments.length === 0 ? 
                            '<div class="comment-empty">コメントなし</div>' :
                            normalizedComments.map((c, i) => `
                                <div class="comment-item" data-idx="${i}">
                                    ${c.region ? `<span class="comment-region-badge">${i + 1}</span>` : `<span class="comment-num">${i + 1}</span>`}
                                    <span class="comment-text">${escapeHtml(c.text || c)}</span>
                                    <button class="comment-delete" data-banner="${banner.id}" data-idx="${i}">×</button>
                                </div>
                            `).join('')
                        }
                    </div>
                    <button class="add-comment-btn" data-id="${banner.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        コメント追加
                    </button>
                </div>
                <div class="banner-actions">
                    <button class="action-btn region-select-btn" data-id="${banner.id}" title="範囲を選択してコメント">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
                        </svg>
                        範囲選択
                    </button>
                    <button class="action-btn revise-btn" data-id="${banner.id}" ${normalizedComments.length === 0 ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
                        </svg>
                        修正
                    </button>
                    <button class="action-btn download-btn" data-id="${banner.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7,10 12,15 17,10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        DL
                    </button>
                    <button class="action-btn delete-btn" data-id="${banner.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
            
            galleryContent.appendChild(card);
        });
        
        // イベント設定
        galleryContent.querySelectorAll('.add-comment-btn').forEach(btn => {
            btn.addEventListener('click', () => openCommentModal(btn.dataset.id));
        });
        
        galleryContent.querySelectorAll('.comment-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const bannerId = parseInt(btn.dataset.banner);
                const idx = parseInt(btn.dataset.idx);
                const project = getCurrentProject();
                if (project) {
                    const banner = project.banners.find(b => b.id === bannerId);
                    if (banner) {
                        banner.comments.splice(idx, 1);
                        renderGallery();
                    }
                }
            });
        });
        
        galleryContent.querySelectorAll('.revise-btn').forEach(btn => {
            btn.addEventListener('click', () => reviseBanner(parseInt(btn.dataset.id)));
        });
        
        galleryContent.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', () => downloadBanner(parseInt(btn.dataset.id)));
        });
        
        galleryContent.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('このバナーを削除しますか？')) {
                    const project = getCurrentProject();
                    if (project) {
                        project.banners = project.banners.filter(b => b.id !== parseInt(btn.dataset.id));
                        renderGallery();
                        bannerCount.textContent = project.banners.length + '枚';
                    }
                }
            });
        });
        
        // 範囲選択ボタンのイベント
        galleryContent.querySelectorAll('.region-select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const bannerId = parseInt(btn.dataset.id);
                startRegionSelectMode(bannerId);
            });
        });
        
        // 領域マーカークリックでハイライト
        galleryContent.querySelectorAll('.region-marker').forEach(marker => {
            marker.addEventListener('click', (e) => {
                const idx = parseInt(marker.dataset.idx);
                const card = marker.closest('.banner-card');
                const commentItem = card.querySelector(`.comment-item[data-idx="${idx}"]`);
                if (commentItem) {
                    commentItem.classList.add('highlight');
                    setTimeout(() => commentItem.classList.remove('highlight'), 1500);
                }
            });
        });
        
        // コメント編集機能（ダブルクリックで編集モード）
        galleryContent.querySelectorAll('.comment-text').forEach(textEl => {
            textEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const commentItem = textEl.closest('.comment-item');
                const card = commentItem.closest('.banner-card');
                const bannerId = parseInt(card.dataset.id);
                const idx = parseInt(commentItem.dataset.idx);
                
                // 既に編集中なら何もしない
                if (commentItem.classList.contains('editing')) return;
                
                const project = getCurrentProject();
                if (!project) return;
                
                const banner = project.banners.find(b => b.id === bannerId);
                if (!banner) return;
                
                const comment = banner.comments[idx];
                const currentText = typeof comment === 'string' ? comment : comment.text;
                
                // 編集モードに切り替え
                commentItem.classList.add('editing');
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'comment-edit-input';
                input.value = currentText;
                
                textEl.textContent = '';
                textEl.appendChild(input);
                input.focus();
                input.select();
                
                // 編集完了
                function finishEdit() {
                    const newText = input.value.trim();
                    if (newText) {
                        if (typeof comment === 'string') {
                            banner.comments[idx] = newText;
                        } else {
                            banner.comments[idx].text = newText;
                        }
                        saveToLocalStorage();
                    }
                    renderGallery();
                }
                
                input.addEventListener('blur', finishEdit);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        input.value = currentText;
                        input.blur();
                    }
                });
            });
        });
    }

    // ========================================
    // 領域選択機能
    // ========================================
    let pendingRegion = null; // 選択中の領域
    
    function startRegionSelectMode(bannerId) {
        regionSelectMode = true;
        regionSelectBannerId = bannerId;
        
        // ボタンをアクティブ状態に
        galleryContent.querySelectorAll('.region-select-btn').forEach(btn => {
            if (parseInt(btn.dataset.id) === bannerId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 対象のbanner-previewを選択モードに
        const preview = document.querySelector(`.banner-preview[data-banner-id="${bannerId}"]`);
        if (preview) {
            preview.classList.add('region-select-mode');
        }
    }
    
    function endRegionSelectMode() {
        regionSelectMode = false;
        regionSelectBannerId = null;
        regionDragStart = null;
        pendingRegion = null;
        
        // 選択ボックスを削除
        if (currentSelectionBox) {
            currentSelectionBox.remove();
            currentSelectionBox = null;
        }
        
        // すべてのボタンを非アクティブに
        galleryContent.querySelectorAll('.region-select-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // すべてのpreviewから選択モードを解除
        document.querySelectorAll('.banner-preview.region-select-mode').forEach(el => {
            el.classList.remove('region-select-mode');
        });
    }
    
    // ドラッグイベント
    document.addEventListener('mousedown', (e) => {
        if (!regionSelectMode) return;
        
        const preview = e.target.closest('.banner-preview.region-select-mode');
        if (!preview) {
            endRegionSelectMode();
            return;
        }
        
        const rect = preview.getBoundingClientRect();
        regionDragStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            previewRect: rect
        };
        
        // 選択ボックスを作成
        currentSelectionBox = document.createElement('div');
        currentSelectionBox.className = 'region-selection-box';
        currentSelectionBox.style.left = regionDragStart.x + 'px';
        currentSelectionBox.style.top = regionDragStart.y + 'px';
        currentSelectionBox.style.width = '0px';
        currentSelectionBox.style.height = '0px';
        preview.appendChild(currentSelectionBox);
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!regionSelectMode || !regionDragStart || !currentSelectionBox) return;
        
        const preview = document.querySelector('.banner-preview.region-select-mode');
        if (!preview) return;
        
        const rect = regionDragStart.previewRect;
        const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        
        const x = Math.min(regionDragStart.x, currentX);
        const y = Math.min(regionDragStart.y, currentY);
        const width = Math.abs(currentX - regionDragStart.x);
        const height = Math.abs(currentY - regionDragStart.y);
        
        currentSelectionBox.style.left = x + 'px';
        currentSelectionBox.style.top = y + 'px';
        currentSelectionBox.style.width = width + 'px';
        currentSelectionBox.style.height = height + 'px';
    });
    
    document.addEventListener('mouseup', (e) => {
        if (!regionSelectMode || !regionDragStart || !currentSelectionBox) return;
        
        const preview = document.querySelector('.banner-preview.region-select-mode');
        if (!preview) {
            endRegionSelectMode();
            return;
        }
        
        const rect = regionDragStart.previewRect;
        const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        
        const x = Math.min(regionDragStart.x, currentX);
        const y = Math.min(regionDragStart.y, currentY);
        const width = Math.abs(currentX - regionDragStart.x);
        const height = Math.abs(currentY - regionDragStart.y);
        
        // 最小サイズチェック
        if (width < 10 || height < 10) {
            if (currentSelectionBox) {
                currentSelectionBox.remove();
                currentSelectionBox = null;
            }
            regionDragStart = null;
            return;
        }
        
        // パーセントに変換
        pendingRegion = {
            x: (x / rect.width) * 100,
            y: (y / rect.height) * 100,
            width: (width / rect.width) * 100,
            height: (height / rect.height) * 100
        };
        
        // コメント入力モーダルを開く
        openCommentModal(regionSelectBannerId, pendingRegion);
        
        // 選択ボックスを削除
        if (currentSelectionBox) {
            currentSelectionBox.remove();
            currentSelectionBox = null;
        }
        regionDragStart = null;
    });
    
    // ESCで選択モードキャンセル
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && regionSelectMode) {
            endRegionSelectMode();
        }
    });

    // ========================================
    // コメントモーダル
    // ========================================
    function openCommentModal(bannerId, region = null) {
        currentBannerId = parseInt(bannerId);
        pendingRegion = region;
        commentText.value = '';
        commentModal.classList.add('visible');
        commentText.focus();
    }

    function closeCommentModal() {
        commentModal.classList.remove('visible');
        currentBannerId = null;
        pendingRegion = null;
        endRegionSelectMode();
    }

    commentModalClose.addEventListener('click', closeCommentModal);
    commentCancel.addEventListener('click', closeCommentModal);
    commentModal.addEventListener('click', (e) => {
        if (e.target === commentModal) closeCommentModal();
    });

    commentConfirm.addEventListener('click', () => {
        const text = commentText.value.trim();
        if (!text || currentBannerId === null) {
            closeCommentModal();
            return;
        }
        
        const project = getCurrentProject();
        if (project) {
            const banner = project.banners.find(b => b.id === currentBannerId);
            if (banner) {
                // 新しいコメントオブジェクト形式で保存
                const comment = {
                    text: text,
                    region: pendingRegion || null
                };
                banner.comments.push(comment);
                renderGallery();
                saveToLocalStorage();
            }
        }
        closeCommentModal();
    });

    commentText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commentConfirm.click();
        }
    });

    // ========================================
    // バナー修正（AI連携）
    // ========================================
    
    // 赤枠付き画像を生成する関数（視覚的確認用）
    function createAnnotatedImage(imageUrl, regions) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                
                // 元画像を描画
                ctx.drawImage(img, 0, 0);
                
                // 赤枠を描画（各領域）
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = Math.max(6, canvas.width * 0.01);
                ctx.setLineDash([15, 10]);
                
                regions.forEach((region, i) => {
                    const x = (region.x / 100) * canvas.width;
                    const y = (region.y / 100) * canvas.height;
                    const width = (region.width / 100) * canvas.width;
                    const height = (region.height / 100) * canvas.height;
                    
                    ctx.strokeRect(x, y, width, height);
                    
                    ctx.fillStyle = '#FF0000';
                    ctx.font = `bold ${Math.max(24, canvas.width * 0.03)}px sans-serif`;
                    ctx.fillText(`${i + 1}`, x + 5, y - 10);
                });
                
                resolve(canvas.toDataURL('image/png'));
            };
            
            img.onerror = () => {
                reject(new Error('画像の読み込みに失敗しました'));
            };
            
            img.src = imageUrl;
        });
    }
    
    // マスク画像を生成する関数（白=編集領域、黒=保持領域）
    function createMaskImage(imageUrl, regions) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                
                // 全体を黒（保持領域）で塗りつぶし
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // 選択領域を白（編集領域）で塗りつぶし
                ctx.fillStyle = '#FFFFFF';
                regions.forEach((region) => {
                    const x = (region.x / 100) * canvas.width;
                    const y = (region.y / 100) * canvas.height;
                    const width = (region.width / 100) * canvas.width;
                    const height = (region.height / 100) * canvas.height;
                    
                    ctx.fillRect(x, y, width, height);
                });
                
                console.log(`🎭 マスク画像生成: ${regions.length}領域, サイズ: ${canvas.width}x${canvas.height}`);
                resolve(canvas.toDataURL('image/png'));
            };
            
            img.onerror = () => {
                reject(new Error('マスク画像の読み込みに失敗しました'));
            };
            
            img.src = imageUrl;
        });
    }
    
    // 領域の座標からセマンティックな位置説明を生成
    function getPositionDescription(region) {
        const centerX = region.x + region.width / 2;
        const centerY = region.y + region.height / 2;
        
        let vertical = '';
        if (centerY < 33) vertical = '上部';
        else if (centerY > 66) vertical = '下部';
        else vertical = '中央';
        
        let horizontal = '';
        if (centerX < 33) horizontal = '左側';
        else if (centerX > 66) horizontal = '右側';
        else horizontal = '中央';
        
        // 「中央中央」を「中央」に
        if (vertical === '中央' && horizontal === '中央') {
            return '画像の中央部分';
        }
        
        return `画像の${vertical}${horizontal !== '中央' ? horizontal : ''}の部分`;
    }
    
    async function reviseBanner(bannerId) {
        const project = getCurrentProject();
        if (!project) return;
        
        const banner = project.banners.find(b => b.id === bannerId);
        if (!banner || banner.comments.length === 0) return;
        
        const idx = project.banners.indexOf(banner) + 1;
        
        // コメントを正規化
        const normalizedComments = banner.comments.map((c, i) => {
            if (typeof c === 'string') {
                return { text: c, region: null };
            }
            return c;
        });
        
        // 領域情報付きのコメントテキスト生成
        const commentsText = normalizedComments.map((c, i) => {
            let commentStr = `${i + 1}. ${c.text}`;
            return commentStr;
        }).join('\n');
        
        // 修正ボタンをローディング状態に
        const reviseBtn = document.querySelector(`.revise-btn[data-id="${bannerId}"]`);
        if (reviseBtn) {
            reviseBtn.disabled = true;
            reviseBtn.classList.add('loading');
            reviseBtn.innerHTML = `
                <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                </svg>
                修正中...
            `;
        }
        
        isProcessing = true;
        
        try {
            // 領域修正があるかチェック
            const regionComments = normalizedComments.filter(c => c.region);
            const hasRegionComments = regionComments.length > 0;
            
            let imageToSend = banner.imageUrl;
            let revisionPrompt;
            
            if (hasRegionComments && banner.imageUrl) {
                // AIに領域の要素を言語化してもらう
                try {
                    // 領域とコメントをペアで送信
                    const regionsWithComments = regionComments.map(c => ({
                        region: c.region,
                        comment: c.text
                    }));
                    
                    // describe-region APIを呼び出し
                    console.log('🔍 AIに領域の要素を分析させています...');
                    const describeResponse = await fetch(`${API_BASE_URL}/banner/describe-region`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: banner.imageUrl,
                            regionsWithComments: regionsWithComments
                        })
                    });
                    
                    let elementDescriptions = {};
                    if (describeResponse.ok) {
                        const describeData = await describeResponse.json();
                        console.log('📝 AI言語化結果:', describeData.description);
                        
                        // レスポンスから領域ごとの説明を抽出
                        const lines = describeData.description.split('\n');
                        lines.forEach(line => {
                            const match = line.match(/領域(\d+)[：:]\s*(.+)/);
                            if (match) {
                                elementDescriptions[parseInt(match[1])] = match[2].trim();
                            }
                        });
                    }
                    
                    // 各コメントにAIの説明を追加
                    const detailedComments = regionComments.map((c, i) => {
                        const aiDesc = elementDescriptions[i + 1] || getPositionDescription(c.region);
                        return `${i + 1}. 「${aiDesc}」を修正：${c.text}`;
                    }).join('\n');
                    
                    // 公式推奨テンプレートに基づくプロンプト
                    revisionPrompt = `Using the provided banner image, please modify the following elements:

${detailedComments}

Important instructions:
- Only modify the specified elements, keep all other parts exactly the same
- Maintain the original style, colors, and layout
- Ensure the changes integrate naturally with the rest of the image
- Output image should have the same size and aspect ratio as the input`;
                    
                    imageToSend = banner.imageUrl;
                    console.log('📝 最終プロンプト:', revisionPrompt);
                } catch (err) {
                    console.warn('AI言語化に失敗、フォールバック:', err);
                    revisionPrompt = `バナー #${idx} を以下の修正コメントに基づいて修正してください：\n${commentsText}`;
                }
            } else {
                revisionPrompt = `バナー #${idx} を以下の修正コメントに基づいて修正してください。全体的な雰囲気は維持しつつ、指示された点のみ改善してください：\n${commentsText}`;
            }
            
            // imagesを配列として渡す
            const imagesToSend = Array.isArray(imageToSend) ? imageToSend : (imageToSend ? [imageToSend] : []);
            
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: revisionPrompt,
                    images: imagesToSend,
                    conversationHistory: project.conversationHistory,
                    canvasSize: banner.size || project.canvasSize,
                    originalBannerSize: banner.actualSize 
                        ? `${banner.actualSize.width}x${banner.actualSize.height}` 
                        : (banner.sizeInfo ? `${banner.sizeInfo.width}x${banner.sizeInfo.height}` : null),
                    generateCount: 1,
                    revisionMode: true,
                    projectType: projectSelect.value
                })
            });
            
            if (!response.ok) {
                throw new Error('API error');
            }
            
            const data = await response.json();
            project.conversationHistory = data.conversationHistory || [];
            saveToLocalStorage();
            
            if (data.generatedImages && data.generatedImages.length > 0) {
                banner.imageUrl = data.generatedImages[0];
                banner.comments = [];
                renderGallery();
                // 控えめな通知をシステムメッセージとして表示
                addMessage('system', `✅ バナー #${idx} の修正が完了しました`);
                saveToLocalStorage();
            } else {
                // エラーメッセージのみ表示
                addMessage('system', `⚠️ バナー #${idx} の修正に問題がありました`);
            }
        } catch (error) {
            console.error('修正エラー:', error);
            addMessage('system', '❌ 修正中にエラーが発生しました');
        } finally {
            isProcessing = false;
            // ボタンを元に戻す（renderGalleryで再描画されるが念のため）
            if (reviseBtn) {
                reviseBtn.disabled = false;
                reviseBtn.classList.remove('loading');
            }
        }
    }

    // ========================================
    // ダウンロード
    // ========================================
    async function downloadBanner(bannerId) {
        const project = getCurrentProject();
        if (!project) return;
        
        const banner = project.banners.find(b => b.id === bannerId);
        if (!banner) return;
        
        if (banner.imageUrl) {
            try {
                let blob;
                
                if (banner.imageUrl.startsWith('data:')) {
                    // Base64形式のdata: URL
                    const base64Data = banner.imageUrl.split(',')[1];
                    const mimeType = banner.imageUrl.split(';')[0].split(':')[1];
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    blob = new Blob([byteArray], { type: mimeType });
                } else if (banner.imageUrl.startsWith('http')) {
                    // HTTP URL
                    const response = await fetch(banner.imageUrl);
                    blob = await response.blob();
                } else {
                    alert('不正な画像形式です');
                    return;
                }
                
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `banner_${project.banners.indexOf(banner) + 1}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('ダウンロードエラー:', error);
                alert('ダウンロードに失敗しました');
            }
        } else {
            alert(`バナー #${project.banners.indexOf(banner) + 1} はまだ生成されていません`);
        }
    }

    exportAllBtn.addEventListener('click', async () => {
        const project = getCurrentProject();
        if (!project || project.banners.length === 0) {
            alert('ダウンロードするバナーがありません');
            return;
        }
        
        for (let i = 0; i < project.banners.length; i++) {
            if (project.banners[i].imageUrl) {
                await downloadBanner(project.banners[i].id);
            }
        }
    });

    // ========================================
    // ユーティリティ
    // ========================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // マークダウンをHTMLに変換する関数
    function parseMarkdown(text) {
        if (!text) return '';
        
        let html = text;
        
        // 見出し（### → h3, ## → h2, # → h1）- まず行単位で処理
        html = html.replace(/^### (.+)$/gm, '{{H4}}$1{{/H4}}');
        html = html.replace(/^## (.+)$/gm, '{{H3}}$1{{/H3}}');
        html = html.replace(/^# (.+)$/gm, '{{H2}}$1{{/H2}}');
        
        // 太字 **text** - エスケープ前に処理
        html = html.replace(/\*\*([^*]+)\*\*/g, '{{STRONG}}$1{{/STRONG}}');
        
        // 斜体 *text* (太字でないもの)
        html = html.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '{{EM}}$1{{/EM}}');
        
        // インラインコード `code`
        html = html.replace(/`([^`]+)`/g, '{{CODE}}$1{{/CODE}}');
        
        // 番号付きリスト
        html = html.replace(/^(\d+)\. (.+)$/gm, '{{OL}}$2{{/OL}}');
        
        // 箇条書きリスト（- または *）
        html = html.replace(/^- (.+)$/gm, '{{UL}}$1{{/UL}}');
        
        // 水平線
        html = html.replace(/^---+$/gm, '{{HR}}');
        
        // 引用 > text
        html = html.replace(/^> (.+)$/gm, '{{QUOTE}}$1{{/QUOTE}}');
        
        // HTMLエスケープ（残りのテキストのみ）
        html = escapeHtml(html);
        
        // プレースホルダーを実際のHTMLに変換
        html = html.replace(/\{\{H4\}\}(.*?)\{\{\/H4\}\}/g, '<h4 class="md-h4">$1</h4>');
        html = html.replace(/\{\{H3\}\}(.*?)\{\{\/H3\}\}/g, '<h3 class="md-h3">$1</h3>');
        html = html.replace(/\{\{H2\}\}(.*?)\{\{\/H2\}\}/g, '<h2 class="md-h2">$1</h2>');
        html = html.replace(/\{\{STRONG\}\}(.*?)\{\{\/STRONG\}\}/g, '<strong>$1</strong>');
        html = html.replace(/\{\{EM\}\}(.*?)\{\{\/EM\}\}/g, '<em>$1</em>');
        html = html.replace(/\{\{CODE\}\}(.*?)\{\{\/CODE\}\}/g, '<code class="md-code">$1</code>');
        html = html.replace(/\{\{OL\}\}(.*?)\{\{\/OL\}\}/g, '<li class="md-ol-item">$1</li>');
        html = html.replace(/\{\{UL\}\}(.*?)\{\{\/UL\}\}/g, '<li class="md-ul-item">$1</li>');
        html = html.replace(/\{\{HR\}\}/g, '<hr class="md-hr">');
        html = html.replace(/\{\{QUOTE\}\}(.*?)\{\{\/QUOTE\}\}/g, '<blockquote class="md-quote">$1</blockquote>');
        
        // 連続するリストアイテムをラップ
        html = html.replace(/((?:<li class="md-ol-item">.*?<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');
        html = html.replace(/((?:<li class="md-ul-item">.*?<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');
        
        // 連続する引用をマージ
        html = html.replace(/(<\/blockquote>)\n(<blockquote class="md-quote">)/g, '<br>');
        
        // 改行処理
        html = html.replace(/\n\n+/g, '</p><p class="md-paragraph">');
        html = html.replace(/\n/g, '<br>');
        
        // 全体を段落でラップ
        html = '<p class="md-paragraph">' + html + '</p>';
        
        // 空の段落を削除
        html = html.replace(/<p class="md-paragraph"><\/p>/g, '');
        html = html.replace(/<p class="md-paragraph">(<(?:h[2-4]|ul|ol|hr|blockquote)[^>]*>)/g, '$1');
        html = html.replace(/(<\/(?:h[2-4]|ul|ol|hr|blockquote)>)<\/p>/g, '$1');
        
        return html;
    }
    
    // ========================================
    // タブ（プロジェクト）管理
    // ========================================
    function createProject(name = null) {
        projectCounter++;
        const project = {
            id: projectCounter,
            name: name || `プロジェクト ${projectCounter}`,
            banners: [],
            referenceImages: [],
            conversationHistory: [],
            canvasSize: '1080x1080',
            chatMessages: [],
            chatInputValue: '',
            selectedFavoriteBanners: [],
            projectType: '',
            bannerSize: '1080x1080',
            presets: {
                target: '',
                appeal: '',
                tone: '',
                details: ''
            }
        };
        projects.push(project);
        switchProject(project.id);
        renderTabs();
        saveToLocalStorage();
        return project;
    }
    
    function switchProject(projectId) {
        // 現在のプロジェクトの状態を保存
        saveCurrentProjectState();
        
        // プロジェクトを切り替え
        currentProjectId = projectId;
        
        // 新しいプロジェクトの状態を復元
        restoreProjectState();
        renderTabs();
    }
    
    function deleteProject(projectId) {
        if (projects.length === 1) {
            alert('最後のプロジェクトは削除できません');
            return;
        }
        
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        
        // 削除したプロジェクトを履歴に保存
        project.deletedAt = new Date().toISOString();
        deletedProjects.unshift(project);
        // 履歴は最大20件保持
        if (deletedProjects.length > 20) {
            deletedProjects.pop();
        }
        
        const idx = projects.findIndex(p => p.id === projectId);
        projects.splice(idx, 1);
        
        // 削除したのが現在のプロジェクトなら別のプロジェクトに切り替え
        if (currentProjectId === projectId) {
            const newIdx = Math.min(idx, projects.length - 1);
            switchProject(projects[newIdx].id);
        } else {
            renderTabs();
            saveToLocalStorage();
        }
    }
    
    function renameProject(projectId) {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        
        // タブ名をインライン編集可能にする
        const tabSpan = tabsContainer.querySelector(`.tab[data-project-id="${projectId}"] .tab-name`);
        if (!tabSpan) return;
        
        const currentName = project.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'tab-name-input';
        
        // 既存のテキストを入力フィールドに置き換え
        tabSpan.textContent = '';
        tabSpan.appendChild(input);
        input.focus();
        input.select();
        
        function finishEdit() {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                project.name = newName;
            }
            renderTabs();
            saveToLocalStorage();
        }
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName; // キャンセル
                input.blur();
            }
        });
    }
    
    function saveCurrentProjectState() {
        const project = getCurrentProject();
        if (!project) return;
        
        // チャットメッセージを保存
        project.chatMessages = chatMessages.innerHTML;
        
        // 入力中のテキストを保存
        project.chatInputValue = chatInput ? chatInput.value : '';
        
        // 選択された参考デザインを保存
        project.selectedFavoriteBanners = selectedFavoriteBanners.slice();
        
        // プロジェクトタイプを保存
        project.projectType = projectSelect ? projectSelect.value : '';
        
        // バナーサイズを保存
        project.bannerSize = bannerSizeSelect ? bannerSizeSelect.value : '1080x1080';
        
        // プリセット値を保存
        project.presets = {
            target: presetTarget ? presetTarget.value : '',
            appeal: presetAppeal ? presetAppeal.value : '',
            tone: presetTone ? presetTone.value : '',
            details: presetDetails ? presetDetails.value : ''
        };
        
        saveToLocalStorage();
    }
    
    function restoreProjectState() {
        const project = getCurrentProject();
        if (!project) return;
        
        // チャットメッセージを復元
        if (project.chatMessages) {
            chatMessages.innerHTML = project.chatMessages;
        } else {
            chatMessages.innerHTML = `
                <div class="chat-message system">
                    <div class="message-content">
                        <p>👋 バナーに入れる文言を教えてください</p>
                        <p class="hint">左パネルから参考デザインを選択した上で、キャッチコピーや訴求内容を入力してください。</p>
                    </div>
                </div>
            `;
        }
        
        // 入力中のテキストを復元
        if (chatInput) {
            chatInput.value = project.chatInputValue || '';
        }
        
        // 選択された参考デザインを復元
        selectedFavoriteBanners = project.selectedFavoriteBanners ? project.selectedFavoriteBanners.slice() : [];
        
        // プロジェクトタイプを復元
        if (projectSelect) {
            projectSelect.value = project.projectType || '';
        }
        
        // バナーサイズを復元
        if (bannerSizeSelect) {
            bannerSizeSelect.value = project.bannerSize || '1080x1080';
        }
        
        // プリセット値を復元
        if (project.presets) {
            if (presetTarget) presetTarget.value = project.presets.target || '';
            if (presetAppeal) presetAppeal.value = project.presets.appeal || '';
            if (presetTone) presetTone.value = project.presets.tone || '';
            if (presetDetails) presetDetails.value = project.presets.details || '';
        } else {
            // プリセット値がない場合はクリア
            if (presetTarget) presetTarget.value = '';
            if (presetAppeal) presetAppeal.value = '';
            if (presetTone) presetTone.value = '';
            if (presetDetails) presetDetails.value = '';
        }
        
        // 参考画像を復元
        renderReferencePreviews();
        
        // キャンバスサイズを復元
        sizeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === project.canvasSize);
        });
        
        // ギャラリーを復元
        renderGallery();
        bannerCount.textContent = project.banners.length + '枚';
        
        // 参考デザインリストの選択状態を更新
        renderFavoriteBannerList();
    }
    
    function setupTabEvents() {
        newTabBtn.addEventListener('click', () => {
            createProject();
        });
        
        // 履歴ボタン
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderHistory();
            historyMenu.classList.toggle('show');
        });
        
        // 履歴メニュー外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!historyMenu.contains(e.target) && !historyBtn.contains(e.target)) {
                historyMenu.classList.remove('show');
            }
        });
    }
    
    function renderHistory() {
        const allProjects = [
            ...projects.map(p => ({ ...p, isActive: p.id === currentProjectId, isDeleted: false })),
            ...deletedProjects.map(p => ({ ...p, isActive: false, isDeleted: true }))
        ];
        
        if (allProjects.length === 0) {
            historyList.innerHTML = '<div class="history-empty">履歴がありません</div>';
            return;
        }
        
        historyList.innerHTML = allProjects.map(project => `
            <div class="history-item ${project.isActive ? 'active' : ''} ${project.isDeleted ? 'deleted' : ''}" 
                 data-project-id="${project.id}" data-deleted="${project.isDeleted}">
                <span class="history-item-name">${escapeHtml(project.name)}</span>
                <span class="history-item-date">${project.isDeleted ? '削除済' : ''}</span>
            </div>
        `).join('');
        
        // 履歴項目のクリックイベント
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const projectId = parseInt(item.dataset.projectId);
                const isDeleted = item.dataset.deleted === 'true';
                
                if (isDeleted) {
                    // 削除されたプロジェクトを復元
                    restoreProject(projectId);
                } else {
                    // 既存プロジェクトに切り替え
                    switchProject(projectId);
                }
                
                historyMenu.classList.remove('show');
            });
        });
    }
    
    function restoreProject(projectId) {
        const idx = deletedProjects.findIndex(p => p.id === projectId);
        if (idx === -1) return;
        
        const project = deletedProjects[idx];
        delete project.deletedAt;
        deletedProjects.splice(idx, 1);
        projects.push(project);
        
        switchProject(project.id);
        saveToLocalStorage();
    }
    
    function renderTabs() {
        tabsContainer.innerHTML = projects.map(project => `
            <button class="tab ${project.id === currentProjectId ? 'active' : ''}" data-project-id="${project.id}">
                <span class="tab-name">${escapeHtml(project.name)}</span>
                <button class="tab-close" data-project-id="${project.id}">×</button>
            </button>
        `).join('');
        
        // タブクリックイベント
        tabsContainer.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                // 閉じるボタンやタブ名のクリックは無視
                if (e.target.classList.contains('tab-close') || e.target.classList.contains('tab-name')) {
                    return;
                }
                switchProject(parseInt(tab.dataset.projectId));
            });
        });
        
        // タブ閉じるイベント
        tabsContainer.querySelectorAll('.tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const projectId = parseInt(btn.dataset.projectId);
                // confirmが競合しないよう遅延
                setTimeout(() => deleteProject(projectId), 10);
            });
        });
        
        // タブ名クリックで切り替え、ダブルクリックで名前変更
        tabsContainer.querySelectorAll('.tab-name').forEach(span => {
            let clickTimeout = null;
            
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // ダブルクリック検出のため少し待つ
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    return; // ダブルクリックなのでシングルクリック処理をスキップ
                }
                
                clickTimeout = setTimeout(() => {
                    clickTimeout = null;
                    const tab = span.closest('.tab');
                    switchProject(parseInt(tab.dataset.projectId));
                }, 250);
            });
            
            span.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // シングルクリックタイマーをキャンセル
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                
                const tab = span.closest('.tab');
                const projectId = parseInt(tab.dataset.projectId);
                renameProject(projectId);
            });
        });
    }
    
    // プロジェクトの状態を取得するヘルパー（既存のコードとの互換性のため）
    function getBanners() {
        const project = getCurrentProject();
        return project ? project.banners : [];
    }
    
    function getReferenceImages() {
        const project = getCurrentProject();
        return project ? project.referenceImages : [];
    }
    
    // 参考画像プレビューをレンダリング（プロジェクト復元時に使用）
    function renderReferencePreviews() {
        // 現在のUIでは参考画像はお気に入りバナーパネルで管理されているため、
        // この関数は互換性のために空実装
        const project = getCurrentProject();
        if (!project) return;
        
        // 画像プレビューが必要な場合はここに実装を追加
        console.log('参考画像数:', project.referenceImages.length);
    }
    
    function getConversationHistory() {
        const project = getCurrentProject();
        return project ? project.conversationHistory : [];
    }
    
    function setConversationHistory(history) {
        const project = getCurrentProject();
        if (project) {
            project.conversationHistory = history;
        }
    }
    
    function getCurrentCanvasSize() {
        const project = getCurrentProject();
        return project ? project.canvasSize : '1080x1080';
    }

    // 親フレームからのメッセージを受信
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'switchProject') {
            if (event.data.restore) {
                // 削除されたプロジェクトを復元
                restoreProject(event.data.projectId);
            } else {
                // 既存プロジェクトに切り替え
                switchProject(event.data.projectId);
            }
        } else if (event.data && event.data.type === 'deleteFromHistory') {
            // 履歴から完全削除
            deleteFromHistory(event.data.projectId, event.data.isDeleted);
        }
    });
    
    function deleteFromHistory(projectId, isDeleted) {
        if (isDeleted) {
            // 削除済みプロジェクトから削除
            const idx = deletedProjects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                deletedProjects.splice(idx, 1);
            }
        } else {
            // アクティブプロジェクトから削除（履歴に移動）
            const idx = projects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                // 最後のプロジェクトは削除不可
                if (projects.length === 1) return;
                
                const project = projects[idx];
                project.deletedAt = new Date().toISOString();
                deletedProjects.unshift(project);
                projects.splice(idx, 1);
                
                // 現在のプロジェクトだった場合は別のプロジェクトに切り替え
                if (currentProjectId === projectId) {
                    const newIdx = Math.min(idx, projects.length - 1);
                    switchProject(projects[newIdx].id);
                } else {
                    renderTabs();
                }
            }
        }
        saveToLocalStorage();
    }

    // ========================================
    // 好調バナー管理機能
    // ========================================
    
    // 要素取得
    const favoriteBannerProjectSelect = document.getElementById('favoriteBannerProjectSelect');
    const favoriteBannerList = document.getElementById('favoriteBannerList');
    const addFavoriteBannerBtn = document.getElementById('addFavoriteBannerBtn');
    
    // 保存モーダル
    const favoriteBannerSaveModal = document.getElementById('favoriteBannerSaveModal');
    const favoriteBannerSaveModalClose = document.getElementById('favoriteBannerSaveModalClose');
    const favoriteBannerSaveModalCancel = document.getElementById('favoriteBannerSaveModalCancel');
    const favoriteBannerSaveModalConfirm = document.getElementById('favoriteBannerSaveModalConfirm');
    const favoriteBannerName = document.getElementById('favoriteBannerName');
    const bannerUploadArea = document.getElementById('bannerUploadArea');
    const bannerImageInput = document.getElementById('bannerImageInput');
    const bannerUploadPlaceholder = document.getElementById('bannerUploadPlaceholder');
    const bannerUploadPreview = document.getElementById('bannerUploadPreview');
    const bannerPreviewImage = document.getElementById('bannerPreviewImage');
    const removeBannerPreview = document.getElementById('removeBannerPreview');
    
    // 編集モーダル
    const favoriteBannerEditModal = document.getElementById('favoriteBannerEditModal');
    const favoriteBannerEditModalClose = document.getElementById('favoriteBannerEditModalClose');
    const favoriteBannerEditModalCancel = document.getElementById('favoriteBannerEditModalCancel');
    const favoriteBannerEditModalConfirm = document.getElementById('favoriteBannerEditModalConfirm');
    const editFavoriteBannerName = document.getElementById('editFavoriteBannerName');
    const editFavoriteBannerFilename = document.getElementById('editFavoriteBannerFilename');
    const editBannerPreviewImage = document.getElementById('editBannerPreviewImage');
    
    // 削除モーダル
    const favoriteBannerDeleteModal = document.getElementById('favoriteBannerDeleteModal');
    const favoriteBannerDeleteModalClose = document.getElementById('favoriteBannerDeleteModalClose');
    const favoriteBannerDeleteModalCancel = document.getElementById('favoriteBannerDeleteModalCancel');
    const favoriteBannerDeleteModalConfirm = document.getElementById('favoriteBannerDeleteModalConfirm');
    const deleteBannerName = document.getElementById('deleteBannerName');
    const deleteBannerFilename = document.getElementById('deleteBannerFilename');
    
    // 状態管理
    let favoriteBanners = [];
    let selectedFavoriteBanners = [];
    let currentFavoriteProjectType = 'debt';
    let currentBannerImage = null;
    let currentBannerSize = { width: null, height: null };
    
    // サイズ入力要素
    const bannerSizeGroup = document.getElementById('bannerSizeGroup');
    const bannerWidthInput = document.getElementById('bannerWidth');
    const bannerHeightInput = document.getElementById('bannerHeight');
    const sizePresetBtns = document.querySelectorAll('.size-preset-btn');
    
    // 好調バナー一覧を読み込み
    async function loadFavoriteBanners() {
        try {
            const response = await fetch(`${API_BASE_URL}/banner/list?projectType=${currentFavoriteProjectType}`);
            if (response.ok) {
                favoriteBanners = await response.json();
                renderFavoriteBannerList();
            }
        } catch (error) {
            console.error('好調バナー一覧取得エラー:', error);
            renderFavoriteBannerList();
        }
    }
    
    // 好調バナー一覧を描画
    function renderFavoriteBannerList() {
        if (favoriteBanners.length === 0) {
            favoriteBannerList.innerHTML = '<div class="favorite-banner-empty">好調バナーがありません<br>＋ボタンで追加してください</div>';
            return;
        }
        
        favoriteBannerList.innerHTML = favoriteBanners.map(banner => `
            <div class="favorite-banner-item ${selectedFavoriteBanners.includes(banner.filename) ? 'selected' : ''}" data-filename="${banner.filename}">
                <input type="checkbox" ${selectedFavoriteBanners.includes(banner.filename) ? 'checked' : ''}>
                <div class="favorite-banner-thumb">
                    ${banner.thumbnail ? `<img src="${banner.thumbnail}" alt="${escapeHtml(banner.name)}">` : ''}
                </div>
                <div class="favorite-banner-info">
                    <div class="favorite-banner-name">${escapeHtml(banner.name)}</div>
                    <div class="favorite-banner-preview">${escapeHtml(banner.preview || '')}</div>
                </div>
                <div class="favorite-banner-actions">
                    <button class="favorite-banner-action-btn edit-btn" data-filename="${banner.filename}" title="編集">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="favorite-banner-action-btn delete-btn" data-filename="${banner.filename}" data-name="${escapeHtml(banner.name)}" title="削除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
        // アイテムクリックでチェックボックストグル
        favoriteBannerList.querySelectorAll('.favorite-banner-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-banner-action-btn')) return;
                
                const checkbox = item.querySelector('input[type="checkbox"]');
                const filename = item.dataset.filename;
                const bannerInfo = favoriteBanners.find(b => b.filename === filename);
                const bannerName = bannerInfo ? bannerInfo.name : filename;
                
                if (e.target === checkbox) {
                    if (checkbox.checked) {
                        if (!selectedFavoriteBanners.includes(filename)) {
                            selectedFavoriteBanners.push(filename);
                            // チャットに選択通知を追加
                            addMessage('system', `📎 参考デザイン「${bannerName}」を選択しました。（現在${selectedFavoriteBanners.length}件選択中）`);
                        }
                        item.classList.add('selected');
                    } else {
                        selectedFavoriteBanners = selectedFavoriteBanners.filter(f => f !== filename);
                        item.classList.remove('selected');
                        // チャットに選択解除通知を追加
                        addMessage('system', `📎 参考デザイン「${bannerName}」の選択を解除しました。（現在${selectedFavoriteBanners.length}件選択中）`);
                    }
                } else {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        if (!selectedFavoriteBanners.includes(filename)) {
                            selectedFavoriteBanners.push(filename);
                            // チャットに選択通知を追加
                            addMessage('system', `📎 参考デザイン「${bannerName}」を選択しました。（現在${selectedFavoriteBanners.length}件選択中）`);
                        }
                        item.classList.add('selected');
                    } else {
                        selectedFavoriteBanners = selectedFavoriteBanners.filter(f => f !== filename);
                        item.classList.remove('selected');
                        // チャットに選択解除通知を追加
                        addMessage('system', `📎 参考デザイン「${bannerName}」の選択を解除しました。（現在${selectedFavoriteBanners.length}件選択中）`);
                    }
                }
                // 選択状態を保存
                saveCurrentProjectState();
            });
        });
        
        // 編集ボタン
        favoriteBannerList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openFavoriteBannerEditModal(btn.dataset.filename);
            });
        });
        
        // 削除ボタン
        favoriteBannerList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openFavoriteBannerDeleteModal(btn.dataset.filename, btn.dataset.name);
            });
        });
    }
    
    // プロジェクト選択変更
    if (favoriteBannerProjectSelect) {
        favoriteBannerProjectSelect.addEventListener('change', () => {
            currentFavoriteProjectType = favoriteBannerProjectSelect.value;
            selectedFavoriteBanners = [];
            loadFavoriteBanners();
        });
    }
    
    // 保存モーダルを開く
    function openFavoriteBannerSaveModal() {
        favoriteBannerName.value = '';
        currentBannerImage = null;
        currentBannerSize = { width: null, height: null };
        bannerUploadPlaceholder.style.display = 'flex';
        bannerUploadPreview.style.display = 'none';
        if (bannerWidthInput) bannerWidthInput.value = '';
        if (bannerHeightInput) bannerHeightInput.value = '';
        sizePresetBtns.forEach(btn => btn.classList.remove('active'));
        favoriteBannerSaveModalConfirm.disabled = true;
        favoriteBannerSaveModal.classList.add('show');
    }
    
    // 保存モーダルを閉じる
    function closeFavoriteBannerSaveModal() {
        favoriteBannerSaveModal.classList.remove('show');
        currentBannerImage = null;
        currentBannerSize = { width: null, height: null };
    }
    
    // サイズプリセットボタンのイベント設定
    sizePresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const width = parseInt(btn.dataset.width);
            const height = parseInt(btn.dataset.height);
            if (bannerWidthInput) bannerWidthInput.value = width;
            if (bannerHeightInput) bannerHeightInput.value = height;
            currentBannerSize = { width, height };
            
            // アクティブ状態を更新
            sizePresetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 画像があれば保存ボタンを有効化
            if (currentBannerImage) {
                favoriteBannerSaveModalConfirm.disabled = false;
            }
        });
    });
    
    // 画像アップロードエリアクリック
    if (bannerUploadArea) {
        bannerUploadArea.addEventListener('click', () => {
            if (bannerUploadPreview.style.display === 'none') {
                bannerImageInput.click();
            }
        });
    }
    
    // 画像選択
    if (bannerImageInput) {
        bannerImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 10 * 1024 * 1024) {
                alert('画像サイズは10MB以下にしてください');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (ev) => {
                currentBannerImage = ev.target.result;
                bannerPreviewImage.src = currentBannerImage;
                bannerUploadPlaceholder.style.display = 'none';
                bannerUploadPreview.style.display = 'block';
                
                // 画像から自動でサイズを検出
                const img = new Image();
                img.onload = function() {
                    // 常に自動でサイズを取得
                    currentBannerSize = { width: img.naturalWidth, height: img.naturalHeight };
                    
                    // サイズ表示を更新
                    const bannerSizeDisplay = document.getElementById('bannerSizeDisplay');
                    const bannerSizeGroup = document.getElementById('bannerSizeGroup');
                    if (bannerSizeDisplay) {
                        bannerSizeDisplay.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
                    }
                    if (bannerSizeGroup) {
                        bannerSizeGroup.style.display = 'block';
                    }
                    
                    // 画像アップロード完了したので保存ボタンを有効化
                    favoriteBannerSaveModalConfirm.disabled = false;
                };
                img.src = currentBannerImage;
            };
            reader.readAsDataURL(file);
            bannerImageInput.value = '';
        });
    }
    
    
    // 画像アップロード時に自動でサイズ検出
    
    // プレビュー削除
    if (removeBannerPreview) {
        removeBannerPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            currentBannerImage = null;
            currentBannerSize = { width: null, height: null };
            bannerUploadPlaceholder.style.display = 'flex';
            bannerUploadPreview.style.display = 'none';
            if (bannerSizeGroup) bannerSizeGroup.style.display = 'none';
            if (bannerWidthInput) bannerWidthInput.value = '';
            if (bannerHeightInput) bannerHeightInput.value = '';
            sizePresetBtns.forEach(btn => btn.classList.remove('active'));
            favoriteBannerSaveModalConfirm.disabled = true;
        });
    }
    
    // 保存モーダルのイベント
    if (addFavoriteBannerBtn) {
        addFavoriteBannerBtn.addEventListener('click', openFavoriteBannerSaveModal);
    }
    
    if (favoriteBannerSaveModalClose) {
        favoriteBannerSaveModalClose.addEventListener('click', closeFavoriteBannerSaveModal);
    }
    
    if (favoriteBannerSaveModalCancel) {
        favoriteBannerSaveModalCancel.addEventListener('click', closeFavoriteBannerSaveModal);
    }
    
    if (favoriteBannerSaveModalConfirm) {
        favoriteBannerSaveModalConfirm.addEventListener('click', async () => {
            const name = favoriteBannerName.value.trim();
            
            if (!name || !currentBannerImage) {
                alert('バナー名と画像を入力してください');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE_URL}/banner/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        image: currentBannerImage,
                        size: currentBannerSize,
                        projectType: currentFavoriteProjectType
                    })
                });
                
                if (response.ok) {
                    closeFavoriteBannerSaveModal();
                    loadFavoriteBanners();
                } else {
                    alert('保存に失敗しました');
                }
            } catch (error) {
                console.error('保存エラー:', error);
                alert('保存に失敗しました');
            }
        });
    }
    
    // 編集モーダル
    async function openFavoriteBannerEditModal(filename) {
        try {
            const response = await fetch(`${API_BASE_URL}/banner/detail?filename=${encodeURIComponent(filename)}&projectType=${currentFavoriteProjectType}`);
            if (!response.ok) {
                throw new Error('バナーの取得に失敗しました');
            }
            
            const data = await response.json();
            editFavoriteBannerFilename.value = filename;
            editFavoriteBannerName.value = data.name;
            editBannerPreviewImage.src = data.image || data.thumbnail || '';
            favoriteBannerEditModal.classList.add('show');
        } catch (error) {
            console.error('編集モーダル表示エラー:', error);
            alert('バナーの読み込みに失敗しました');
        }
    }
    
    function closeFavoriteBannerEditModal() {
        favoriteBannerEditModal.classList.remove('show');
    }
    
    if (favoriteBannerEditModalClose) {
        favoriteBannerEditModalClose.addEventListener('click', closeFavoriteBannerEditModal);
    }
    
    if (favoriteBannerEditModalCancel) {
        favoriteBannerEditModalCancel.addEventListener('click', closeFavoriteBannerEditModal);
    }
    
    if (favoriteBannerEditModalConfirm) {
        favoriteBannerEditModalConfirm.addEventListener('click', async () => {
            const filename = editFavoriteBannerFilename.value;
            const name = editFavoriteBannerName.value.trim();
            
            if (!name) {
                alert('バナー名を入力してください');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE_URL}/banner/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: filename,
                        name: name,
                        projectType: currentFavoriteProjectType
                    })
                });
                
                if (response.ok) {
                    closeFavoriteBannerEditModal();
                    loadFavoriteBanners();
                } else {
                    const errorData = await response.json();
                    alert(errorData.error || '更新に失敗しました');
                }
            } catch (error) {
                console.error('更新エラー:', error);
                alert('更新に失敗しました');
            }
        });
    }
    
    // 削除モーダル
    function openFavoriteBannerDeleteModal(filename, name) {
        deleteBannerFilename.value = filename;
        deleteBannerName.textContent = name;
        favoriteBannerDeleteModal.classList.add('show');
    }
    
    function closeFavoriteBannerDeleteModal() {
        favoriteBannerDeleteModal.classList.remove('show');
    }
    
    if (favoriteBannerDeleteModalClose) {
        favoriteBannerDeleteModalClose.addEventListener('click', closeFavoriteBannerDeleteModal);
    }
    
    if (favoriteBannerDeleteModalCancel) {
        favoriteBannerDeleteModalCancel.addEventListener('click', closeFavoriteBannerDeleteModal);
    }
    
    if (favoriteBannerDeleteModalConfirm) {
        favoriteBannerDeleteModalConfirm.addEventListener('click', async () => {
            const filename = deleteBannerFilename.value;
            
            try {
                const response = await fetch(`${API_BASE_URL}/banner/delete`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: filename,
                        projectType: currentFavoriteProjectType
                    })
                });
                
                if (response.ok) {
                    closeFavoriteBannerDeleteModal();
                    selectedFavoriteBanners = selectedFavoriteBanners.filter(f => f !== filename);
                    loadFavoriteBanners();
                } else {
                    const errorData = await response.json();
                    alert(errorData.error || '削除に失敗しました');
                }
            } catch (error) {
                console.error('削除エラー:', error);
                alert('削除に失敗しました');
            }
        });
    }
    
    // 初期化時に好調バナーを読み込み
    loadFavoriteBanners();

    // 初期化実行
    init();
});

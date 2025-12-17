/**
 * Mixboard - 自由配置型バナー作成ツール
 * 画像の自由配置、赤枠修正指示、AI生成チャット機能を統合
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // 要素取得
    // ========================================
    // キャンバス関連
    const canvasContainer = document.getElementById('canvasContainer');
    const mixboardCanvasArea = document.getElementById('mixboardCanvasArea');
    const addImageBtn = document.getElementById('addImageBtn');

    // チャット関連（下部ピル型）
    const floatingChatMessages = document.getElementById('floatingChatMessages');
    const floatingChatInput = document.getElementById('floatingChatInput');
    const floatingChatSendBtn = document.getElementById('floatingChatSendBtn');
    
    
    // ========================================
    // 状態管理
    // ========================================
    let elements = []; // キャンバス上の要素（画像、テキスト）
    let selectedElementId = null; // 現在選択中の要素ID
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let draggedElement = null;
    
    // IndexedDB関連
    const API_BASE_URL = `${window.location.origin}/api`;
    const DB_NAME = 'BannerToolDB'; // 既存DBを共有
    const STORE_NAME = 'projects';
    const STORAGE_KEY = 'mixboard_project_v1'; // Mixboard用のキー
    
    // ========================================
    // キャンバス管理クラス
    // ========================================
    class CanvasManager {
        constructor() {
            this.setupEventListeners();
            this.loadState();
        }

        setupEventListeners() {
            // ドラッグ&ドロップ（ファイル）
            mixboardCanvasArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                mixboardCanvasArea.style.background = '#e8e8e8';
            });
            
            mixboardCanvasArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                mixboardCanvasArea.style.background = '#f0f0f0';
            });
            
            mixboardCanvasArea.addEventListener('drop', (e) => {
                e.preventDefault();
                mixboardCanvasArea.style.background = '#f0f0f0';
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileDrop(files[0], e.clientX, e.clientY);
                }
            });

            // 右パネルトグル
            const rightPanelToggle = document.getElementById('rightPanelToggle');
            const chatPanel = document.querySelector('.chat-panel-wide');
            if (rightPanelToggle && chatPanel) {
                rightPanelToggle.addEventListener('click', () => {
                    chatPanel.classList.toggle('collapsed');
                });
            }

            // 画像追加ボタン
            if (addImageBtn) {
                addImageBtn.addEventListener('click', () => {
                    // ファイル選択ダイアログを開く
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                        if (e.target.files.length > 0) {
                            this.handleFileDrop(e.target.files[0], 100, 100);
                        }
                    };
                    input.click();
                });
            }

            // キャンバス背景クリックで選択解除
            canvasContainer.addEventListener('mousedown', (e) => {
                if (e.target === canvasContainer) {
                    this.deselectAll();
                }
            });

            // マウス移動（ドラッグ処理）
            document.addEventListener('mousemove', (e) => {
                if (isDragging && draggedElement) {
                    this.handleDragMove(e);
                }
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    draggedElement = null;
                    this.saveState(); // ドラッグ終了時に保存
                }
            });
        }

        // ファイル読み込みと配置
        handleFileDrop(file, clientX, clientY) {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                // ドロップ位置をキャンバス座標に変換
                const rect = canvasContainer.getBoundingClientRect();
                const x = clientX - rect.left;
                const y = clientY - rect.top;
                
                this.addImageElement(e.target.result, x, y);
            };
            reader.readAsDataURL(file);
        }

        // 画像要素を追加
        addImageElement(src, x, y) {
            const id = 'img_' + Date.now();
            const element = {
                id: id,
                type: 'image',
                src: src,
                x: x,
                y: y,
                width: 300, // 初期サイズ
                zIndex: elements.length + 1
            };
            
            elements.push(element);
            this.renderElement(element);
            this.saveState();
            
            // 追加した要素を選択状態にする
            this.selectElement(id);
        }

        // テキスト要素を追加
        addTextElement(text, x, y, fontFamily = 'sans-serif', fontWeight = 400) {
            const id = 'txt_' + Date.now();
            const element = {
                id: id,
                type: 'text',
                text: text,
                x: x,
                y: y,
                fontFamily: fontFamily,
                fontWeight: fontWeight,
                fontSize: 18,
                zIndex: elements.length + 1
            };
            
            elements.push(element);
            this.renderElement(element);
            this.saveState();
            this.selectElement(id);
        }

        // 要素を描画
        renderElement(data) {
            let el = document.getElementById(data.id);
            if (!el) {
                if (data.type === 'image') {
                    el = document.createElement('div');
                    el.className = 'canvas-image-wrapper';
                    el.innerHTML = `<img src="${data.src}" class="canvas-image" draggable="false">`;
                    
                    // ダブルクリックで拡大（修正モード）
                    el.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        this.enterRevisionMode(data);
                    });
                } else if (data.type === 'text') {
                    el = document.createElement('div');
                    el.className = 'canvas-text-wrapper';
                    el.contentEditable = true;
                    el.innerText = data.text;
                    el.style.fontFamily = data.fontFamily;
                    el.style.fontWeight = data.fontWeight;
                    el.style.fontSize = data.fontSize + 'px';
                    
                    // テキスト編集保存
                    el.addEventListener('blur', () => {
                        const idx = elements.findIndex(e => e.id === data.id);
                        if (idx !== -1) {
                            elements[idx].text = el.innerText;
                            this.saveState();
                        }
                    });
                }
                
                el.id = data.id;
                
                // 選択・ドラッグ開始イベント
                el.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    this.selectElement(data.id);
                    
                    isDragging = true;
                    draggedElement = el;
                    
                    const rect = el.getBoundingClientRect();
                    dragOffset.x = e.clientX - rect.left;
                    dragOffset.y = e.clientY - rect.top;
                });
                
                canvasContainer.appendChild(el);
            }
            
            // 位置・スタイルの適用
            el.style.left = data.x + 'px';
            el.style.top = data.y + 'px';
            el.style.zIndex = data.zIndex;
            
            if (data.type === 'image') {
                const img = el.querySelector('img');
                if (data.width) img.style.width = data.width + 'px';
            }
        }

        // 要素選択
        selectElement(id) {
            selectedElementId = id;
            
            // 全要素の選択クラスを外す
            document.querySelectorAll('.canvas-image-wrapper, .canvas-text-wrapper').forEach(el => {
                el.classList.remove('selected');
            });
            
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('selected');
                
                // テキスト入力プロンプトを選択画像のコンテキストに設定
                const data = elements.find(e => e.id === id);
                if (data && data.type === 'image') {
                    floatingChatInput.placeholder = "この画像について修正・変更の指示があれば入力...";
                }
            } else {
                selectedElementId = null;
                floatingChatInput.placeholder = "指示を入力...";
            }
        }

        deselectAll() {
            selectedElementId = null;
            document.querySelectorAll('.canvas-image-wrapper, .canvas-text-wrapper').forEach(el => {
                el.classList.remove('selected');
            });
            floatingChatInput.placeholder = "指示を入力...";
        }

        // ドラッグ移動処理
        handleDragMove(e) {
            if (!draggedElement) return;
            
            const rect = canvasContainer.getBoundingClientRect();
            let x = e.clientX - rect.left - dragOffset.x;
            let y = e.clientY - rect.top - dragOffset.y;
            
            draggedElement.style.left = x + 'px';
            draggedElement.style.top = y + 'px';
            
            // データ更新
            const id = draggedElement.id;
            const idx = elements.findIndex(e => e.id === id);
            if (idx !== -1) {
                elements[idx].x = x;
                elements[idx].y = y;
            }
        }

        // 修正モード（拡大表示 + 赤枠）
        enterRevisionMode(data) {
            if (data.type !== 'image') return;
            
            // 既存のオーバーレイがあれば削除
            const oldOverlay = document.querySelector('.zoom-container');
            if (oldOverlay) oldOverlay.remove();
            
            // 背景暗転
            let bgOverlay = document.querySelector('.canvas-overlay');
            if (!bgOverlay) {
                bgOverlay = document.createElement('div');
                bgOverlay.className = 'canvas-overlay';
                document.body.appendChild(bgOverlay);
            }
            bgOverlay.classList.add('active');
            
            // AbortController for cleanup
            const abortController = new AbortController();
            const signal = abortController.signal;
            
            // 拡大コンテナ作成
            const zoomContainer = document.createElement('div');
            zoomContainer.className = 'zoom-container active';
            
            zoomContainer.innerHTML = `
                <div class="revision-frame">
                    <div class="revision-wrapper" style="position: relative; display: inline-block; box-shadow: 0 20px 50px rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden;">
                        <img src="${data.src}" style="max-width: 70vw; max-height: 70vh; display: block; user-select: none;" id="revisionTargetImage" draggable="false">
                        <div class="revision-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair;"></div>
                    </div>
                </div>
                
                <!-- 右側ツールパレット -->
                <div class="revision-tools-palette">
                    <button class="palette-btn color-red active" data-color="red"></button>
                    <button class="palette-btn color-green" data-color="green"></button>
                    <button class="palette-btn color-blue" data-color="blue"></button>
                    <button class="palette-btn color-yellow" data-color="yellow"></button>
                </div>

                <!-- 下部アクションボタン -->
                <div class="revision-actions">
                    <button class="rev-action-btn rev-cancel">Cancel</button>
                    <button class="rev-action-btn rev-save active">Save</button>
                </div>
            `;
            
            document.body.appendChild(zoomContainer);
            
            // 既存の修正指示を表示
            const revisionLayer = zoomContainer.querySelector('.revision-layer');
            
            // 一時的な修正リスト（保存するまで確定しない）
            let currentRevisions = data.revisions ? JSON.parse(JSON.stringify(data.revisions)) : [];
            let currentColor = 'red';

            const renderRevisions = () => {
                revisionLayer.innerHTML = '';
                currentRevisions.forEach(rev => {
                    this.renderRevisionBox(rev, revisionLayer, (revId) => {
                        currentRevisions = currentRevisions.filter(r => r.id !== revId);
                    }, (revId, newText) => {
                        const target = currentRevisions.find(r => r.id === revId);
                        if (target) target.text = newText;
                    });
                });
            };
            
            renderRevisions();
            
            // クローズハンドラ（リスナー削除含む）
            const closeHandler = () => {
                abortController.abort(); // すべてのリスナーを削除
                zoomContainer.remove();
                bgOverlay.classList.remove('active');
            };

            // Cancel
            zoomContainer.querySelector('.rev-cancel').addEventListener('click', closeHandler);
            
            // Save
            zoomContainer.querySelector('.rev-save').addEventListener('click', () => {
                data.revisions = currentRevisions;
                this.saveState();
                closeHandler();
            });

            // カラーパレット切り替え
            zoomContainer.querySelectorAll('.palette-btn[data-color]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    zoomContainer.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    currentColor = e.target.dataset.color;
                });
            });
            
            // 赤枠描画ロジック
            let isDrawingBox = false;
            let startBox = { x: 0, y: 0 };
            let tempBox = null;
            
            revisionLayer.addEventListener('mousedown', (e) => {
                isDrawingBox = true;
                const rect = revisionLayer.getBoundingClientRect();
                startBox = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                
                tempBox = document.createElement('div');
                tempBox.className = `revision-box`;
                tempBox.style.left = startBox.x + 'px';
                tempBox.style.top = startBox.y + 'px';
                tempBox.style.width = '0px';
                tempBox.style.height = '0px';
                tempBox.style.border = `2px solid ${this.getColorCode(currentColor)}`;
                revisionLayer.appendChild(tempBox);
            });
            
            // AbortController を使ってグローバルリスナーを登録
            window.addEventListener('mousemove', (e) => {
                if (!isDrawingBox || !tempBox) return;
                
                const rect = revisionLayer.getBoundingClientRect();
                const currentX = e.clientX - rect.left;
                const currentY = e.clientY - rect.top;
                
                const width = Math.abs(currentX - startBox.x);
                const height = Math.abs(currentY - startBox.y);
                const left = Math.min(startBox.x, currentX);
                const top = Math.min(startBox.y, currentY);
                
                tempBox.style.width = width + 'px';
                tempBox.style.height = height + 'px';
                tempBox.style.left = left + 'px';
                tempBox.style.top = top + 'px';
            }, { signal });
            
            window.addEventListener('mouseup', (e) => {
                if (!isDrawingBox) return;
                isDrawingBox = false;
                
                if (!tempBox || parseFloat(tempBox.style.width) < 10 || parseFloat(tempBox.style.height) < 10) {
                    if (tempBox) tempBox.remove();
                    tempBox = null;
                    return;
                }
                
                const comment = prompt("この箇所の修正指示を入力してください:");
                if (comment) {
                    const revision = {
                        id: 'rev_' + Date.now(),
                        x: parseFloat(tempBox.style.left),
                        y: parseFloat(tempBox.style.top),
                        width: parseFloat(tempBox.style.width),
                        height: parseFloat(tempBox.style.height),
                        text: comment,
                        color: currentColor
                    };
                    
                    currentRevisions.push(revision);
                    tempBox.remove();
                    this.renderRevisionBox(revision, revisionLayer, (revId) => {
                        currentRevisions = currentRevisions.filter(r => r.id !== revId);
                    }, (revId, newText) => {
                        const target = currentRevisions.find(r => r.id === revId);
                        if (target) target.text = newText;
                    });
                } else {
                    tempBox.remove();
                }
                tempBox = null;
            }, { signal });
        }
        
        getColorCode(name) {
            const colors = {
                red: '#ff4d4d',
                green: '#22c55e',
                blue: '#3b82f6',
                yellow: '#eab308'
            };
            return colors[name] || colors.red;
        }

        // 修正ボックスを描画するヘルパー
        // deleteCallback: 削除時の処理
        // editCallback: 編集時の処理
        renderRevisionBox(rev, container, deleteCallback, editCallback) {
            const box = document.createElement('div');
            box.className = 'revision-box';
            box.dataset.id = rev.id;
            box.style.left = rev.x + 'px';
            box.style.top = rev.y + 'px';
            box.style.width = rev.width + 'px';
            box.style.height = rev.height + 'px';
            box.style.border = `2px solid ${this.getColorCode(rev.color || 'red')}`;
            box.title = rev.text;
            
            // ラベル
            const label = document.createElement('div');
            label.className = 'revision-label';
            label.innerText = rev.text;
            label.style.backgroundColor = this.getColorCode(rev.color || 'red');
            label.title = "クリックして編集";
            box.appendChild(label);
            
            // 編集（ラベルクリック）
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                const newText = prompt("修正指示を編集:", rev.text);
                if (newText !== null && newText !== rev.text) {
                    label.innerText = newText;
                    if (editCallback) editCallback(rev.id, newText);
                    else {
                        // 通常モード（非一時的）の場合はデータを直接更新
                        const elData = elements.find(e => e.revisions && e.revisions.find(r => r.id === rev.id));
                         if (elData) {
                             const target = elData.revisions.find(r => r.id === rev.id);
                             if(target) target.text = newText;
                             this.saveState();
                         }
                    }
                }
            });
            
            // 削除ボタン
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '×';
            delBtn.className = 'rev-delete-btn';
            delBtn.style.color = this.getColorCode(rev.color || 'red');
            
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('この修正指示を削除しますか？')) {
                    box.remove();
                    if (deleteCallback) deleteCallback(rev.id);
                    else {
                        // 通常モードの場合
                        const elData = elements.find(e => e.revisions && e.revisions.find(r => r.id === rev.id));
                        if (elData) {
                            elData.revisions = elData.revisions.filter(r => r.id !== rev.id);
                            this.saveState();
                        }
                    }
                }
            });
            
            box.appendChild(delBtn);
            container.appendChild(box);
        }
        
        saveState() {
            const data = {
                elements: elements,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        
        loadState() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.elements) {
                    elements = data.elements;
                    canvasContainer.innerHTML = ''; // クリア
                    elements.forEach(el => this.renderElement(el));
                }
            }
        }
    }

    // ========================================
    // チャット管理（FloatingChat）
    // ========================================
    class FloatingChat {
        constructor() {
            this.setupEvents();
        }

        setupEvents() {
            floatingChatSendBtn.addEventListener('click', () => this.sendMessage());
            floatingChatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        async sendMessage() {
            const text = floatingChatInput.value.trim();
            if (!text) return;
            
            this.addMessage('user', text);
            floatingChatInput.value = '';
            
            // コンテキスト収集
            let selectedImage = null;
            if (selectedElementId) {
                const el = elements.find(e => e.id === selectedElementId);
                if (el && el.type === 'image') {
                    selectedImage = el.src; // dataURL
                }
            }
            
            this.addMessage('system', '思考中...');
            
            try {
                // API送信
                const response = await fetch(`${API_BASE_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        images: selectedImage ? [selectedImage] : [],
                        canvasSize: '1080x1080', // デフォルト
                        projectType: 'mixboard'
                    })
                });
                
                const data = await response.json();
                
                // systemメッセージ削除（簡易）
                const msgs = floatingChatMessages.querySelectorAll('.system');
                if (msgs.length > 0) msgs[msgs.length-1].remove();
                
                this.addMessage('assistant', data.message);
                
                // 生成画像の処理
                if (data.generatedImages && data.generatedImages.length > 0) {
                    data.generatedImages.forEach(imgSrc => {
                        // キャンバス中央に追加
                        canvasManager.addImageElement(imgSrc, 200, 200);
                        this.addMessage('system', '画像をキャンバスに追加しました');
                    });
                }
                
            } catch (e) {
                console.error(e);
                this.addMessage('system', 'エラーが発生しました');
            }
        }

        addMessage(role, text) {
            // 下部ポップオーバーに追加
            const div = document.createElement('div');
            div.className = `chat-message ${role}`;
            div.innerText = text;
            floatingChatMessages.appendChild(div);
            floatingChatMessages.scrollTop = floatingChatMessages.scrollHeight;
            
            // 右パネルの履歴にも追加（存在する場合）
            const historyPanel = document.getElementById('chatMessages');
            if (historyPanel && role !== 'system') {
                const historyDiv = document.createElement('div');
                historyDiv.className = `chat-message ${role}`;
                historyDiv.innerHTML = `<div class="message-content"><p>${text}</p></div>`;
                historyPanel.appendChild(historyDiv);
                historyPanel.scrollTop = historyPanel.scrollHeight;
            }
        }
    }

    // 初期化実行
    const canvasManager = new CanvasManager();
    const chat = new FloatingChat();
});

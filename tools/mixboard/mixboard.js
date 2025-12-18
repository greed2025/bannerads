/**
 * Mixboard - 自由配置型バナー作成ツール
 * ツール切り替え、画像操作、AI生成、対話チャット機能を統合
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // 要素取得
    // ========================================
    const canvasWrapper = document.getElementById('canvasWrapper');
    const canvasContainer = document.getElementById('canvasContainer');
    const canvasEmptyState = document.getElementById('canvasEmptyState');
    
    // パネル
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const leftPanelToggle = document.getElementById('leftPanelToggle');
    const rightPanelToggle = document.getElementById('rightPanelToggle');
    
    // ツールバー
    const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
    const elementToolbar = document.getElementById('elementToolbar');
    const textToolbar = document.getElementById('textToolbar');
    
    // 画像選択時ツールバーボタン
    const btnRefresh = document.getElementById('btnRefresh');
    const btnEdit = document.getElementById('btnEdit');
    const btnDuplicate = document.getElementById('btnDuplicate');
    const btnDownload = document.getElementById('btnDownload');
    const btnDelete = document.getElementById('btnDelete');
    
    // ズーム
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const zoomLevel = document.getElementById('zoomLevel');
    
    // 下部チャット（画像生成用）
    const generatorInput = document.getElementById('generatorInput');
    const generatorSendBtn = document.getElementById('generatorSendBtn');
    const chatPlusBtn = document.getElementById('chatPlusBtn');
    
    // 右パネルチャット（対話AI）
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatMessages = document.getElementById('chatMessages');
    
    // 修正モード
    const revisionOverlay = document.getElementById('revisionOverlay');
    const revisionCancelBtn = document.getElementById('revisionCancelBtn');
    const revisionCancelBtn2 = document.getElementById('revisionCancelBtn2');
    const revisionSaveBtn = document.getElementById('revisionSaveBtn');
    
    // ========================================
    // 状態管理
    // ========================================
    const API_BASE_URL = `${window.location.origin}/api`;
    const STORAGE_KEY = 'mixboard_project_v2';
    
    let elements = [];
    let selectedElementIds = []; // 複数選択対応
    let currentTool = 'select';
    let zoomScale = 1;
    let isGenerating = false;
    
    // ドラッグ状態
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let draggedElement = null;
    let dragStartPositions = {}; // 複数選択ドラッグ用: { id: { x, y } }
    
    // パン状態
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panOffset = { x: 0, y: 0 };
    
    // テキストスタイル
    let textStyle = {
        fontSize: 28,
        fontFamily: 'sans-serif',
        color: '#7c3aed',
        bold: false,
        italic: false,
        underline: false
    };
    
    // 生成画像サイズ
    let generatorSize = {
        width: 512,
        height: 512
    };
    
    // 範囲選択状態
    let isSelecting = false;
    let selectionStart = { x: 0, y: 0 };
    
    // アンドゥ/リドゥ履歴
    const MAX_HISTORY = 50;
    let historyStack = [];
    let historyIndex = -1;
    let isHistoryAction = false; // 履歴操作中フラグ
    
    // ========================================
    // 初期化
    // ========================================
    function init() {
        setupEventListeners();
        loadState();
        updateEmptyState();
        
        // 履歴の初期状態を設定
        setTimeout(() => {
            historyStack = [JSON.stringify(elements)];
            historyIndex = 0;
        }, 500);
    }
    
    // ========================================
    // イベントリスナー設定
    // ========================================
    function setupEventListeners() {
        // パネルトグル
        leftPanelToggle?.addEventListener('click', () => {
            leftPanel.classList.toggle('collapsed');
        });
        
        rightPanelToggle?.addEventListener('click', () => {
            rightPanel.classList.toggle('collapsed');
        });
        
        // ツール切り替え
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                setCurrentTool(tool);
            });
        });
        
        // キャンバスクリック
        canvasContainer.addEventListener('mousedown', handleCanvasMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // ドラッグ&ドロップ
        canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            canvasContainer.style.outline = '2px dashed #7c3aed';
        });
        
        canvasContainer.addEventListener('dragleave', () => {
            canvasContainer.style.outline = '';
        });
        
        canvasContainer.addEventListener('drop', handleDrop);
        
        // 画像追加ボタン
        chatPlusBtn?.addEventListener('click', openImagePicker);
        document.getElementById('addImagePlaceholder')?.addEventListener('click', openImagePicker);
        
        // ズーム
        zoomIn?.addEventListener('click', () => changeZoom(0.1));
        zoomOut?.addEventListener('click', () => changeZoom(-0.1));
        
        // トラックパッド/マウスホイールでのズーム
        canvasWrapper.addEventListener('wheel', (e) => {
            // Ctrl/Cmdキー + スクロールまたはピンチズーム
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                changeZoom(delta);
            }
        }, { passive: false });
        
        // 画像選択時ツールバー
        btnRefresh?.addEventListener('click', refreshElement);
        btnEdit?.addEventListener('click', editElement);
        btnDuplicate?.addEventListener('click', duplicateElement);
        btnDownload?.addEventListener('click', downloadElement);
        btnDelete?.addEventListener('click', deleteElement);
        
        // 下部チャット（画像生成）- 送信ボタンのみで送信、Enterでは送信しない
        generatorSendBtn?.addEventListener('click', sendGeneratorMessage);
        generatorInput?.addEventListener('keydown', (e) => {
            // Enterキーは送信せず、改行も防止（単一行入力）
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
            }
        });
        
        // 右パネルチャット（対話AI）
        chatSendBtn?.addEventListener('click', sendChatMessage);
        let chatLastEnterTime = 0;
        chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const now = Date.now();
                if (now - chatLastEnterTime < 500) {
                    // 2回目のEnter: 送信
                    e.preventDefault();
                    sendChatMessage();
                    chatLastEnterTime = 0;
                } else {
                    // 1回目のEnter: 改行を許可しない、タイマー開始
                    e.preventDefault();
                    chatLastEnterTime = now;
                }
            }
        });
        
        // 修正モード
        revisionCancelBtn?.addEventListener('click', closeRevisionMode);
        revisionCancelBtn2?.addEventListener('click', closeRevisionMode);
        revisionSaveBtn?.addEventListener('click', saveRevision);
        
        // 修正モードの色パレット
        document.querySelectorAll('.palette-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // アクティブ状態を更新
                document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 色を設定
                const colorMap = {
                    'red': '#ef4444',
                    'green': '#22c55e',
                    'blue': '#3b82f6',
                    'yellow': '#eab308'
                };
                revisionColor = colorMap[btn.dataset.color] || '#ef4444';
            });
        });
        
        // 設定パネル
        setupSettingsPanel();
        
        // プレビューバー閉じるボタン
        document.getElementById('previewCloseBtn')?.addEventListener('click', deselectAll);
        
        // テキストツールバー
        setupTextToolbar();
        
        // キーボードショートカット
        document.addEventListener('keydown', handleKeydown);
    }
    
    // ========================================
    // ツール管理
    // ========================================
    function setCurrentTool(tool) {
        currentTool = tool;
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        // カーソル変更
        if (tool === 'hand') {
            canvasContainer.style.cursor = 'grab';
        } else if (tool === 'text') {
            canvasContainer.style.cursor = 'text';
        } else {
            canvasContainer.style.cursor = 'default';
        }
        
        // ツールバー非表示
        hideToolbars();
    }
    
    // ========================================
    // キャンバスマウスイベント
    // ========================================
    function handleCanvasMouseDown(e) {
        if (e.target === canvasContainer || e.target === canvasEmptyState || e.target.id === 'selectionBox') {
            if (currentTool === 'hand') {
                // パン開始
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
                canvasContainer.style.cursor = 'grabbing';
            } else if (currentTool === 'text') {
                // テキスト追加
                const rect = canvasContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / zoomScale;
                const y = (e.clientY - rect.top) / zoomScale;
                addTextElement(x, y);
            } else if (currentTool === 'select') {
                // 範囲選択開始
                const rect = canvasContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / zoomScale;
                const y = (e.clientY - rect.top) / zoomScale;
                
                isSelecting = true;
                selectionStart = { x, y };
                
                const selectionBox = document.getElementById('selectionBox');
                if (selectionBox) {
                    selectionBox.style.left = x + 'px';
                    selectionBox.style.top = y + 'px';
                    selectionBox.style.width = '0px';
                    selectionBox.style.height = '0px';
                    selectionBox.style.display = 'block';
                }
                
                // 選択解除（Shiftキーを押していない場合）
                if (!e.shiftKey) {
                    deselectAll();
                }
            }
        }
    }
    
    function handleMouseMove(e) {
        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            canvasWrapper.scrollLeft -= dx;
            canvasWrapper.scrollTop -= dy;
            panStart = { x: e.clientX, y: e.clientY };
        } else if (isSelecting) {
            // 範囲選択中
            const rect = canvasContainer.getBoundingClientRect();
            const currentX = (e.clientX - rect.left) / zoomScale;
            const currentY = (e.clientY - rect.top) / zoomScale;
            
            const selectionBox = document.getElementById('selectionBox');
            if (selectionBox) {
                const left = Math.min(selectionStart.x, currentX);
                const top = Math.min(selectionStart.y, currentY);
                const width = Math.abs(currentX - selectionStart.x);
                const height = Math.abs(currentY - selectionStart.y);
                
                selectionBox.style.left = left + 'px';
                selectionBox.style.top = top + 'px';
                selectionBox.style.width = width + 'px';
                selectionBox.style.height = height + 'px';
            }
        } else if (isDragging && draggedElement) {
            const rect = canvasContainer.getBoundingClientRect();
            const currentX = (e.clientX - rect.left) / zoomScale;
            const currentY = (e.clientY - rect.top) / zoomScale;
            
            // ドラッグした要素の新位置
            const newX = currentX - dragOffset.x;
            const newY = currentY - dragOffset.y;
            
            // ドラッグした要素の移動量を計算
            const draggedId = draggedElement.dataset.id;
            const startPos = dragStartPositions[draggedId];
            const deltaX = newX - startPos.x;
            const deltaY = newY - startPos.y;
            
            // 選択中の全要素を移動（複数選択ドラッグ）
            selectedElementIds.forEach(id => {
                const el = document.querySelector(`[data-id="${id}"]`);
                const elementData = elements.find(e => e.id === id);
                const start = dragStartPositions[id];
                
                if (el && elementData && start) {
                    const x = start.x + deltaX;
                    const y = start.y + deltaY;
                    
                    el.style.left = x + 'px';
                    el.style.top = y + 'px';
                    
                    elementData.x = x;
                    elementData.y = y;
                }
            });
            
            updateElementToolbarPosition();
        }
    }
    
    function handleMouseUp(e) {
        if (isPanning) {
            isPanning = false;
            if (currentTool === 'hand') {
                canvasContainer.style.cursor = 'grab';
            }
        }
        
        if (isSelecting) {
            isSelecting = false;
            
            const selectionBox = document.getElementById('selectionBox');
            if (selectionBox) {
                // 選択範囲内の要素を選択
                const boxLeft = parseFloat(selectionBox.style.left);
                const boxTop = parseFloat(selectionBox.style.top);
                const boxWidth = parseFloat(selectionBox.style.width);
                const boxHeight = parseFloat(selectionBox.style.height);
                
                // 最小サイズチェック（クリックで終了した場合は解除のみ）
                if (boxWidth > 5 && boxHeight > 5) {
                    const boxRight = boxLeft + boxWidth;
                    const boxBottom = boxTop + boxHeight;
                    
                    elements.forEach(data => {
                        const el = document.querySelector(`[data-id="${data.id}"]`);
                        if (!el) return;
                        
                        // 要素の境界を取得
                        const elLeft = data.x;
                        const elTop = data.y;
                        const elWidth = data.type === 'image' ? data.width : el.offsetWidth;
                        const elHeight = data.type === 'image' ? (data.width / (el.querySelector('img')?.naturalWidth || 1)) * (el.querySelector('img')?.naturalHeight || 1) : el.offsetHeight;
                        const elRight = elLeft + elWidth;
                        const elBottom = elTop + elHeight;
                        
                        // 要素が選択範囲と交差しているかチェック
                        if (elLeft < boxRight && elRight > boxLeft && elTop < boxBottom && elBottom > boxTop) {
                            if (!selectedElementIds.includes(data.id)) {
                                selectedElementIds.push(data.id);
                                el.classList.add('selected');
                            }
                        }
                    });
                    
                    updateToolbarsAndPreview();
                }
                
                selectionBox.style.display = 'none';
            }
        }
        
        if (isDragging) {
            isDragging = false;
            draggedElement = null;
            saveState();
        }
    }
    
    // ========================================
    // ドラッグ&ドロップ
    // ========================================
    function handleDrop(e) {
        e.preventDefault();
        canvasContainer.style.outline = '';
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            const rect = canvasContainer.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoomScale;
            const y = (e.clientY - rect.top) / zoomScale;
            loadImageFile(files[0], x, y);
        }
    }
    
    function openImagePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                loadImageFile(e.target.files[0], 100, 100);
            }
        };
        input.click();
    }
    
    function loadImageFile(file, x, y) {
        const reader = new FileReader();
        reader.onload = (e) => {
            addImageElement(e.target.result, x, y);
        };
        reader.readAsDataURL(file);
    }
    
    // ========================================
    // 要素追加
    // ========================================
    function addImageElement(src, x, y, fadeIn = false) {
        const id = 'img_' + Date.now();
        const element = {
            id,
            type: 'image',
            src,
            x,
            y,
            width: 300,
            zIndex: elements.length + 1,
            fadeIn
        };
        
        elements.push(element);
        renderElement(element);
        selectElement(id);
        updateEmptyState();
        saveState();
    }
    
    function addTextElement(x, y) {
        const id = 'txt_' + Date.now();
        const element = {
            id,
            type: 'text',
            text: 'Add your text',
            x,
            y,
            ...textStyle,
            zIndex: elements.length + 1
        };
        
        elements.push(element);
        renderElement(element);
        selectElement(id);
        updateEmptyState();
        saveState();
        
        // フォーカス
        setTimeout(() => {
            const el = document.querySelector(`[data-id="${id}"]`);
            if (el) {
                el.focus();
                document.execCommand('selectAll', false, null);
            }
        }, 50);
    }
    
    // ========================================
    // 要素描画
    // ========================================
    function renderElement(data) {
        let el = document.querySelector(`[data-id="${data.id}"]`);
        
        if (!el) {
            el = document.createElement('div');
            el.className = 'canvas-element';
            if (data.fadeIn) el.classList.add('fade-in');
            el.dataset.id = data.id;
            
            if (data.type === 'image') {
                el.innerHTML = `
                    <img src="${data.src}" draggable="false" style="width: ${data.width}px;">
                    <div class="resize-handle resize-handle-se" data-handle="se"></div>
                    <div class="resize-handle resize-handle-sw" data-handle="sw"></div>
                    <div class="resize-handle resize-handle-ne" data-handle="ne"></div>
                    <div class="resize-handle resize-handle-nw" data-handle="nw"></div>
                `;
                
                // ダブルクリックで編集モード
                el.addEventListener('dblclick', (e) => {
                    if (!e.target.classList.contains('resize-handle')) {
                        openRevisionMode(data);
                    }
                });
                
                // リサイズハンドルのイベント
                setupResizeHandles(el, data);
            } else if (data.type === 'text') {
                el.className = 'canvas-element canvas-text';
                el.contentEditable = true;
                el.innerText = data.text;
                el.style.fontFamily = data.fontFamily;
                el.style.fontWeight = data.bold ? 'bold' : 'normal';
                el.style.fontStyle = data.italic ? 'italic' : 'normal';
                el.style.textDecoration = data.underline ? 'underline' : 'none';
                el.style.fontSize = data.fontSize + 'px';
                el.style.color = data.color;
                
                el.addEventListener('blur', () => {
                    const idx = elements.findIndex(e => e.id === data.id);
                    if (idx !== -1) {
                        elements[idx].text = el.innerText;
                        saveState();
                    }
                });
                
                el.addEventListener('focus', () => {
                    selectElement(data.id);
                    showTextToolbar();
                });
            }
            
            // 選択・ドラッグ
            el.addEventListener('mousedown', (e) => {
                // リサイズハンドルをクリックした場合はドラッグを開始しない
                if (e.target.classList.contains('resize-handle')) return;
                
                if (currentTool !== 'select' && currentTool !== 'text') return;
                if (e.target.contentEditable === 'true' && document.activeElement === el) return;
                
                e.stopPropagation();
                selectElement(data.id, e.shiftKey); // Shift+クリックで複数選択
                
                isDragging = true;
                draggedElement = el;
                
                // 選択中の全要素の開始位置を記録（複数選択ドラッグ用）
                dragStartPositions = {};
                selectedElementIds.forEach(id => {
                    const elementData = elements.find(e => e.id === id);
                    if (elementData) {
                        dragStartPositions[id] = { x: elementData.x, y: elementData.y };
                    }
                });
                
                const rect = el.getBoundingClientRect();
                const containerRect = canvasContainer.getBoundingClientRect();
                dragOffset.x = (e.clientX - rect.left) / zoomScale;
                dragOffset.y = (e.clientY - rect.top) / zoomScale;
            });
            
            canvasContainer.appendChild(el);
        }
        
        // 位置・スタイル適用
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
        el.style.zIndex = data.zIndex;
        
        // 画像サイズ更新
        if (data.type === 'image') {
            const img = el.querySelector('img');
            if (img) img.style.width = data.width + 'px';
        }
    }
    
    // ========================================
    // リサイズハンドル設定
    // ========================================
    function setupResizeHandles(el, data) {
        const handles = el.querySelectorAll('.resize-handle');
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const handleType = handle.dataset.handle;
                const img = el.querySelector('img');
                if (!img) return;
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startWidth = data.width;
                const startLeft = data.x;
                const startTop = data.y;
                
                // アスペクト比を取得
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                
                const onMouseMove = (moveEvent) => {
                    const deltaX = (moveEvent.clientX - startX) / zoomScale;
                    const deltaY = (moveEvent.clientY - startY) / zoomScale;
                    
                    let newWidth = startWidth;
                    let newX = startLeft;
                    let newY = startTop;
                    
                    // ハンドルに応じてサイズ変更
                    if (handleType === 'se') {
                        newWidth = Math.max(50, startWidth + deltaX);
                    } else if (handleType === 'sw') {
                        const widthChange = -deltaX;
                        newWidth = Math.max(50, startWidth + widthChange);
                        newX = startLeft - (newWidth - startWidth);
                    } else if (handleType === 'ne') {
                        newWidth = Math.max(50, startWidth + deltaX);
                        const heightChange = newWidth / aspectRatio - startWidth / aspectRatio;
                        newY = startTop - (heightChange);
                    } else if (handleType === 'nw') {
                        const widthChange = -deltaX;
                        newWidth = Math.max(50, startWidth + widthChange);
                        newX = startLeft - (newWidth - startWidth);
                        const heightChange = newWidth / aspectRatio - startWidth / aspectRatio;
                        newY = startTop - (heightChange);
                    }
                    
                    // データ更新
                    data.width = newWidth;
                    data.x = newX;
                    data.y = newY;
                    
                    // DOM更新
                    img.style.width = newWidth + 'px';
                    el.style.left = newX + 'px';
                    el.style.top = newY + 'px';
                };
                
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    saveState();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    }
    
    // ========================================
    // 要素選択（複数選択対応）
    // ========================================
    function selectElement(id, addToSelection = false) {
        if (!addToSelection) {
            // 通常クリック：一つだけ選択
            selectedElementIds = [id];
            document.querySelectorAll('.canvas-element').forEach(el => {
                el.classList.remove('selected');
            });
        } else {
            // Shift+クリック：選択に追加/削除
            const idx = selectedElementIds.indexOf(id);
            if (idx === -1) {
                selectedElementIds.push(id);
            } else {
                selectedElementIds.splice(idx, 1);
            }
        }
        
        // 選択状態を更新
        selectedElementIds.forEach(selectedId => {
            const el = document.querySelector(`[data-id="${selectedId}"]`);
            if (el) el.classList.add('selected');
        });
        
        // 選択解除されたものからclassを削除
        document.querySelectorAll('.canvas-element').forEach(el => {
            const elId = el.dataset.id;
            if (!selectedElementIds.includes(elId)) {
                el.classList.remove('selected');
            }
        });
        
        // ツールバーとプレビュー更新
        updateToolbarsAndPreview();
    }
    
    function updateToolbarsAndPreview() {
        const previewBar = document.getElementById('selectedImagePreviewBar');
        const thumbnailsContainer = document.getElementById('previewThumbnails');
        const previewLabel = document.getElementById('previewLabel');
        
        if (selectedElementIds.length === 0) {
            hideToolbars();
            if (previewBar) previewBar.style.display = 'none';
            if (generatorInput) {
                generatorInput.placeholder = 'What do you want to create?';
            }
            return;
        }
        
        // 選択された画像要素を取得
        const selectedImages = selectedElementIds
            .map(id => elements.find(e => e.id === id))
            .filter(data => data && data.type === 'image');
        
        // 最初に選択した要素のデータを取得
        const firstData = elements.find(e => e.id === selectedElementIds[0]);
        
        if (selectedImages.length > 0) {
            const el = document.querySelector(`[data-id="${selectedElementIds[0]}"]`);
            showElementToolbar(el);
            hideTextToolbar();
            
            // プレビューバー更新（入力バーの上に複数サムネイル表示）
            if (previewBar && thumbnailsContainer) {
                // 既存のサムネイルをクリア
                thumbnailsContainer.innerHTML = '';
                
                // 選択された画像のサムネイルを追加（最大5枚まで表示）
                const displayImages = selectedImages.slice(0, 5);
                displayImages.forEach((imgData, index) => {
                    const img = document.createElement('img');
                    img.src = imgData.src;
                    img.alt = `選択中 ${index + 1}`;
                    img.title = `画像 ${index + 1}`;
                    img.style.zIndex = displayImages.length - index; // 重なり順序
                    thumbnailsContainer.appendChild(img);
                });
                
                // 5枚以上の場合は残り枚数を表示
                if (selectedImages.length > 5) {
                    const moreIndicator = document.createElement('span');
                    moreIndicator.className = 'more-indicator';
                    moreIndicator.textContent = `+${selectedImages.length - 5}`;
                    moreIndicator.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 36px;
                        height: 36px;
                        background: var(--color-gray-200);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        color: var(--color-gray-600);
                        margin-left: -12px;
                    `;
                    thumbnailsContainer.appendChild(moreIndicator);
                }
                
                previewBar.style.display = 'block';
                
                // ラベルを更新
                if (previewLabel) {
                    if (selectedImages.length === 1) {
                        previewLabel.textContent = '選択中';
                    } else {
                        previewLabel.textContent = `${selectedImages.length}枚選択中`;
                    }
                }
            }
            
            if (selectedImages.length === 1) {
                generatorInput.placeholder = 'What do you want to change?';
            } else {
                generatorInput.placeholder = `${selectedImages.length}枚選択中 - どのように変更しますか？`;
            }
        } else if (firstData && firstData.type === 'text') {
            showTextToolbar();
            hideElementToolbar();
            if (previewBar) previewBar.style.display = 'none';
            
            // テキストスタイルを選択要素の値で初期化（既存スタイルの維持）
            syncTextStyleFromElement(firstData);
        }
    }
    
    function deselectAll() {
        selectedElementIds = [];
        document.querySelectorAll('.canvas-element').forEach(el => {
            el.classList.remove('selected');
        });
        hideToolbars();
        
        const previewBar = document.getElementById('selectedImagePreviewBar');
        if (previewBar) previewBar.style.display = 'none';
        
        if (generatorInput) {
            generatorInput.placeholder = 'What do you want to create?';
        }
    }
    
    // ========================================
    // ツールバー表示
    // ========================================
    function showElementToolbar(el) {
        if (!elementToolbar) return;
        elementToolbar.style.display = 'flex';
        updateElementToolbarPosition();
    }
    
    function updateElementToolbarPosition() {
        if (!elementToolbar || selectedElementIds.length === 0) return;
        const el = document.querySelector(`[data-id="${selectedElementIds[0]}"]`);
        if (!el) return;
        
        const rect = el.getBoundingClientRect();
        
        // fixed位置でビューポート基準
        const top = rect.top - 60;
        const left = rect.left + (rect.width / 2);
        
        // 画面外に出ないように調整
        const toolbarWidth = elementToolbar.offsetWidth || 200;
        const viewportWidth = window.innerWidth;
        const adjustedLeft = Math.max(toolbarWidth / 2 + 10, Math.min(left, viewportWidth - toolbarWidth / 2 - 10));
        const adjustedTop = Math.max(100, top);
        
        elementToolbar.style.top = adjustedTop + 'px';
        elementToolbar.style.left = adjustedLeft + 'px';
        elementToolbar.style.transform = 'translateX(-50%)';
    }
    
    function hideElementToolbar() {
        if (elementToolbar) elementToolbar.style.display = 'none';
    }
    
    function showTextToolbar() {
        if (textToolbar) textToolbar.style.display = 'flex';
    }
    
    function hideTextToolbar() {
        if (textToolbar) textToolbar.style.display = 'none';
    }
    
    function hideToolbars() {
        hideElementToolbar();
        hideTextToolbar();
    }
    
    // ========================================
    // 画像操作
    // ========================================
    async function refreshElement() {
        if (selectedElementIds.length === 0) return;
        const data = elements.find(e => e.id === selectedElementIds[0]);
        if (data && data.type === 'image') {
            // 選択画像を再生成
            const prompt = `この画像をベースに、同じスタイルで新しいバリエーションを作成してください`;
            generatorInput.value = prompt;
            await sendGeneratorMessage();
        }
    }
    
    function editElement() {
        if (selectedElementIds.length === 0) return;
        const data = elements.find(e => e.id === selectedElementIds[0]);
        if (data && data.type === 'image') {
            openRevisionMode(data);
        }
    }
    
    function duplicateElement() {
        if (selectedElementIds.length === 0) return;
        
        const newIds = [];
        selectedElementIds.forEach((id, index) => {
            const data = elements.find(e => e.id === id);
            if (!data) return;
            
            const newId = data.type + '_' + Date.now() + '_' + index;
            const newElement = {
                ...JSON.parse(JSON.stringify(data)),
                id: newId,
                x: data.x + 20,
                y: data.y + 20,
                zIndex: elements.length + 1
            };
            
            elements.push(newElement);
            renderElement(newElement);
            newIds.push(newId);
        });
        
        selectedElementIds = newIds;
        updateToolbarsAndPreview();
        saveState();
    }
    
    function downloadElement() {
        if (selectedElementIds.length === 0) return;
        
        selectedElementIds.forEach(id => {
            const data = elements.find(e => e.id === id);
            if (data && data.type === 'image') {
                const link = document.createElement('a');
                link.download = `mixboard_${Date.now()}_${id}.png`;
                link.href = data.src;
                link.click();
            }
        });
    }
    
    function deleteElement() {
        if (selectedElementIds.length === 0) return;
        
        selectedElementIds.forEach(id => {
            const el = document.querySelector(`[data-id="${id}"]`);
            if (el) el.remove();
            elements = elements.filter(e => e.id !== id);
        });
        
        deselectAll();
        updateEmptyState();
        saveState();
    }
    
    // ========================================
    // 修正モード
    // ========================================
    let currentRevisions = []; // 現在の修正指示 { x, y, width, height, color, comment }[]
    let revisionColor = '#ef4444'; // 赤
    
    function openRevisionMode(data) {
        if (!revisionOverlay) return;
        
        const img = document.getElementById('revisionImage');
        if (img) img.src = data.src;
        
        revisionOverlay.style.display = 'flex';
        revisionOverlay.dataset.elementId = data.id;
        currentRevisions = data.revisions ? [...data.revisions] : [];
        
        // 既存の修正枠を描画
        renderRevisionBoxes();
        
        // 赤枠描画のイベント設定
        setupRevisionDrawing();
    }
    
    function setupRevisionDrawing() {
        const revisionLayer = document.getElementById('revisionLayer');
        if (!revisionLayer) return;
        
        let isDrawing = false;
        let startX = 0, startY = 0;
        let tempBox = null;
        
        const onMouseDown = (e) => {
            if (e.target !== revisionLayer) return;
            isDrawing = true;
            const rect = revisionLayer.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            
            tempBox = document.createElement('div');
            tempBox.className = 'revision-box temp';
            tempBox.style.borderColor = revisionColor;
            tempBox.style.left = startX + 'px';
            tempBox.style.top = startY + 'px';
            revisionLayer.appendChild(tempBox);
        };
        
        const onMouseMove = (e) => {
            if (!isDrawing || !tempBox) return;
            const rect = revisionLayer.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            
            tempBox.style.left = left + 'px';
            tempBox.style.top = top + 'px';
            tempBox.style.width = width + 'px';
            tempBox.style.height = height + 'px';
        };
        
        const onMouseUp = (e) => {
            if (!isDrawing || !tempBox) return;
            isDrawing = false;
            
            const rect = revisionLayer.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            
            // 最小サイズチェック
            if (width < 20 || height < 20) {
                tempBox.remove();
                tempBox = null;
                return;
            }
            
            // コメント入力
            const comment = prompt('この部分への修正指示を入力してください:');
            if (!comment) {
                tempBox.remove();
                tempBox = null;
                return;
            }
            
            const revision = {
                x: Math.min(startX, currentX),
                y: Math.min(startY, currentY),
                width,
                height,
                color: revisionColor,
                comment
            };
            
            currentRevisions.push(revision);
            tempBox.remove();
            tempBox = null;
            renderRevisionBoxes();
        };
        
        // イベントリスナー設定（既存のものを削除してから追加）
        revisionLayer.onmousedown = onMouseDown;
        document.onmousemove = onMouseMove;
        document.onmouseup = onMouseUp;
    }
    
    function renderRevisionBoxes() {
        const revisionLayer = document.getElementById('revisionLayer');
        if (!revisionLayer) return;
        
        // 既存のボックスをクリア
        revisionLayer.querySelectorAll('.revision-box:not(.temp)').forEach(el => el.remove());
        
        currentRevisions.forEach((rev, index) => {
            const box = document.createElement('div');
            box.className = 'revision-box';
            box.style.left = rev.x + 'px';
            box.style.top = rev.y + 'px';
            box.style.width = rev.width + 'px';
            box.style.height = rev.height + 'px';
            box.style.borderColor = rev.color;
            
            // ラベル
            const label = document.createElement('div');
            label.className = 'revision-label';
            label.style.background = rev.color;
            label.textContent = rev.comment.substring(0, 20) + (rev.comment.length > 20 ? '...' : '');
            label.title = rev.comment;
            box.appendChild(label);
            
            // 削除ボタン
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'rev-delete-btn';
            deleteBtn.style.borderColor = rev.color;
            deleteBtn.style.color = rev.color;
            deleteBtn.textContent = '×';
            deleteBtn.onclick = () => {
                currentRevisions.splice(index, 1);
                renderRevisionBoxes();
            };
            box.appendChild(deleteBtn);
            
            revisionLayer.appendChild(box);
        });
    }
    
    async function saveRevision() {
        if (currentRevisions.length === 0) {
            showToast('修正指示を追加してください（画像上をドラッグして範囲を指定）');
            return;
        }
        
        const elementId = revisionOverlay.dataset.elementId;
        const data = elements.find(e => e.id === elementId);
        if (!data) return;
        
        // ローディング状態
        const saveBtn = document.getElementById('revisionSaveBtn');
        const originalText = saveBtn?.textContent;
        if (saveBtn) {
            saveBtn.textContent = '編集中...';
            saveBtn.disabled = true;
        }
        
        try {
            // 元画像に赤枠とコメントを描画した画像を作成
            const annotatedImage = await createAnnotatedImage(data.src);
            
            // 修正指示のテキストを作成
            const instructions = currentRevisions.map((r, i) => 
                `修正${i + 1}: ${r.comment}`
            ).join('\n');
            
            const prompt = `この画像には赤い枠とラベルで修正指示が描かれています。
以下の修正を実行してください：
${instructions}

重要：修正後は赤い枠とラベルを完全に除去し、自然な画像として仕上げてください。
枠とラベルは修正指示を示すためのもので、最終画像には含めないでください。`;
            
            const response = await fetch(`${API_BASE_URL}/mixboard/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    images: [annotatedImage],
                    width: data.width,
                    height: Math.round(data.width * (await getImageAspectRatio(data.src)))
                })
            });
            
            const result = await response.json();
            
            // 生成画像を取得
            let generatedImage = result.generatedImages?.[0] || result.images?.[0] || 
                                 result.generatedImage || result.imageData;
            
            if (generatedImage) {
                // 修正後の画像を元画像の右に新規追加
                const newX = data.x + data.width + 30;
                const newY = data.y;
                
                // 新しい画像要素として追加
                addImageElement(generatedImage, newX, newY, true);
                
                closeRevisionMode();
                showToast('修正画像を追加しました（元の画像は保持されています）');
            } else {
                showToast('画像の生成に失敗しました。再度お試しください。', 'error');
            }
        } catch (error) {
            console.error('Revision save error:', error);
            showToast('エラーが発生しました: ' + error.message, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }
    
    // 修正指示付きの画像を作成
    async function createAnnotatedImage(imageSrc) {
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
                
                // 修正枠のスケール計算（表示サイズと実際のサイズの比率）
                const revisionLayer = document.getElementById('revisionLayer');
                const displayWidth = revisionLayer?.offsetWidth || img.naturalWidth;
                const scaleX = img.naturalWidth / displayWidth;
                const scaleY = img.naturalHeight / (revisionLayer?.offsetHeight || img.naturalHeight);
                
                // 各修正指示を描画
                currentRevisions.forEach((rev, index) => {
                    const x = rev.x * scaleX;
                    const y = rev.y * scaleY;
                    const width = rev.width * scaleX;
                    const height = rev.height * scaleY;
                    
                    // 赤枠を描画
                    ctx.strokeStyle = rev.color;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x, y, width, height);
                    
                    // ラベル背景
                    ctx.fillStyle = rev.color;
                    const labelText = `修正${index + 1}: ${rev.comment}`;
                    ctx.font = 'bold 16px sans-serif';
                    const textMetrics = ctx.measureText(labelText);
                    const labelWidth = Math.min(textMetrics.width + 16, width);
                    const labelHeight = 24;
                    
                    ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight);
                    
                    // ラベルテキスト
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.fillText(
                        labelText.length > 30 ? labelText.substring(0, 30) + '...' : labelText,
                        x + 8,
                        y - 7
                    );
                });
                
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = imageSrc;
        });
    }
    
    // 画像のアスペクト比を取得
    function getImageAspectRatio(imageSrc) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
            img.onerror = () => resolve(1);
            img.src = imageSrc;
        });
    }
    
    function closeRevisionMode() {
        if (revisionOverlay) {
            revisionOverlay.style.display = 'none';
            currentRevisions = [];
            // イベントリスナーをクリア
            document.onmousemove = null;
            document.onmouseup = null;
        }
    }
    
    // トースト通知
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: ${type === 'error' ? '#ef4444' : '#1a1a1a'};
            color: white;
            border-radius: 8px;
            font-size: 14px;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // ========================================
    // ズーム
    // ========================================
    function changeZoom(delta) {
        zoomScale = Math.max(0.25, Math.min(2, zoomScale + delta));
        canvasContainer.style.transform = `scale(${zoomScale})`;
        canvasContainer.style.transformOrigin = 'center center';
        
        if (zoomLevel) {
            zoomLevel.textContent = Math.round(zoomScale * 100) + '%';
        }
    }
    
    // ========================================
    // チャット機能（画像生成）
    // ========================================
    async function sendGeneratorMessage() {
        const text = generatorInput?.value.trim();
        if (!text || isGenerating) return;
        
        generatorInput.value = '';
        isGenerating = true;
        
        const bottomChatBar = document.getElementById('bottomChatBar');
        bottomChatBar?.classList.add('loading');
        
        // 選択中の画像を取得（複数対応）
        const selectedImages = [];
        selectedElementIds.forEach(id => {
            const data = elements.find(e => e.id === id);
            if (data && data.type === 'image') {
                selectedImages.push(data.src);
            }
        });
        
        // 生成中プレースホルダーを表示
        const placeholderId = 'gen_' + Date.now();
        const placeholder = createGeneratingPlaceholder(placeholderId);
        canvasContainer.appendChild(placeholder);
        updateEmptyState();
        
        try {
            // Mixboard専用の画像生成API（直接Gemini）
            const response = await fetch(`${API_BASE_URL}/mixboard/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    images: selectedImages,
                    count: 1,
                    width: generatorSize.width,
                    height: generatorSize.height
                })
            });
            
            const result = await response.json();
            console.log('API Response:', JSON.stringify(result, null, 2)); // 詳細ログ
            console.log('Response keys:', Object.keys(result));
            
            // プレースホルダーを削除
            placeholder.remove();
            
            // 生成画像をキャンバスに追加（複数の応答形式に対応）
            let images = result.generatedImages || result.images || [];
            if (result.generatedImage) images = [result.generatedImage];
            if (result.imageData) images = [result.imageData];
            
            if (images.length > 0) {
                images.forEach((imgSrc, index) => {
                    addImageElement(imgSrc, 150 + index * 30, 150 + index * 30, true);
                });
                showToast('画像を生成しました');
            } else if (result.message) {
                // テキスト応答のみの場合、右チャットに追加
                addChatMessage('assistant', result.message);
            } else {
                showToast('画像を生成できませんでした', 'error');
                console.log('No images in response:', result);
            }
        } catch (error) {
            console.error('Generator error:', error);
            placeholder.remove();
            showToast('画像生成中にエラーが発生しました', 'error');
        } finally {
            isGenerating = false;
            bottomChatBar?.classList.remove('loading');
        }
    }
    
    // 生成中プレースホルダー作成
    function createGeneratingPlaceholder(id) {
        const placeholder = document.createElement('div');
        placeholder.id = id;
        placeholder.className = 'generating-placeholder';
        placeholder.style.left = '150px';
        placeholder.style.top = '150px';
        placeholder.style.width = '300px';
        placeholder.style.height = '300px';
        placeholder.innerHTML = `
            <div class="spinner"></div>
            <span class="status-text">生成中...</span>
        `;
        return placeholder;
    }
    
    async function sendChatMessage() {
        const text = chatInput?.value.trim();
        if (!text) return;
        
        addChatMessage('user', text);
        chatInput.value = '';
        
        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    projectType: 'mixboard'
                })
            });
            
            const result = await response.json();
            addChatMessage('assistant', result.message);
        } catch (error) {
            console.error('Chat error:', error);
            addChatMessage('system', 'エラーが発生しました');
        }
    }
    
    function addChatMessage(role, text) {
        if (!chatMessages) return;
        
        const div = document.createElement('div');
        div.className = `chat-message ${role}`;
        div.innerHTML = `<div class="message-content"><p>${escapeHtml(text)}</p></div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // ========================================
    // 設定パネル設定
    // ========================================
    function setupSettingsPanel() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('generatorSettingsPanel');
        const settingsCloseBtn = document.getElementById('settingsCloseBtn');
        const sizePresetBtns = document.querySelectorAll('.size-preset-btn');
        const customWidthInput = document.getElementById('customWidthInput');
        const customHeightInput = document.getElementById('customHeightInput');
        const applyCustomSizeBtn = document.getElementById('applyCustomSizeBtn');
        const currentSizeDisplay = document.getElementById('currentSizeDisplay');
        
        // 設定ボタンクリックでパネル開閉
        settingsBtn?.addEventListener('click', () => {
            const isVisible = settingsPanel?.style.display === 'block';
            if (settingsPanel) {
                settingsPanel.style.display = isVisible ? 'none' : 'block';
            }
            settingsBtn.classList.toggle('active', !isVisible);
        });
        
        // 閉じるボタン
        settingsCloseBtn?.addEventListener('click', () => {
            if (settingsPanel) settingsPanel.style.display = 'none';
            settingsBtn?.classList.remove('active');
        });
        
        // プリセットサイズボタン
        sizePresetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const width = parseInt(btn.dataset.width);
                const height = parseInt(btn.dataset.height);
                
                generatorSize.width = width;
                generatorSize.height = height;
                
                // アクティブ状態を更新
                sizePresetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 表示を更新
                if (currentSizeDisplay) {
                    currentSizeDisplay.textContent = `${width}×${height}`;
                }
                
                // カスタム入力をクリア
                if (customWidthInput) customWidthInput.value = '';
                if (customHeightInput) customHeightInput.value = '';
            });
        });
        
        // カスタムサイズ適用
        applyCustomSizeBtn?.addEventListener('click', () => {
            const width = parseInt(customWidthInput?.value);
            const height = parseInt(customHeightInput?.value);
            
            if (!width || !height || width < 256 || height < 256 || width > 2048 || height > 2048) {
                showToast('サイズは256-2048の範囲で指定してください', 'error');
                return;
            }
            
            generatorSize.width = width;
            generatorSize.height = height;
            
            // プリセットのアクティブ状態を解除
            sizePresetBtns.forEach(b => b.classList.remove('active'));
            
            // 表示を更新
            if (currentSizeDisplay) {
                currentSizeDisplay.textContent = `${width}×${height}`;
            }
            
            showToast(`画像サイズを ${width}×${height} に設定しました`);
        });
    }
    
    // ========================================
    // テキストツールバー設定
    // ========================================
    function setupTextToolbar() {
        const fontSizeDown = document.getElementById('fontSizeDown');
        const fontSizeUp = document.getElementById('fontSizeUp');
        const fontSizeDisplay = document.getElementById('fontSizeDisplay');
        const fontSelect = document.getElementById('fontSelect');
        const textColorBtn = document.getElementById('textColorBtn');
        const textColorInput = document.getElementById('textColorInput');
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');
        
        fontSizeDown?.addEventListener('click', () => {
            textStyle.fontSize = Math.max(8, textStyle.fontSize - 2);
            if (fontSizeDisplay) fontSizeDisplay.textContent = textStyle.fontSize;
            applyTextStyle();
        });
        
        fontSizeUp?.addEventListener('click', () => {
            textStyle.fontSize = Math.min(120, textStyle.fontSize + 2);
            if (fontSizeDisplay) fontSizeDisplay.textContent = textStyle.fontSize;
            applyTextStyle();
        });
        
        fontSelect?.addEventListener('change', (e) => {
            textStyle.fontFamily = e.target.value;
            applyTextStyle();
        });
        
        textColorBtn?.addEventListener('click', () => {
            textColorInput?.click();
        });
        
        textColorInput?.addEventListener('input', (e) => {
            textStyle.color = e.target.value;
            const indicator = textColorBtn?.querySelector('.color-indicator');
            if (indicator) indicator.style.background = textStyle.color;
            applyTextStyle();
        });
        
        boldBtn?.addEventListener('click', () => {
            textStyle.bold = !textStyle.bold;
            boldBtn.classList.toggle('active', textStyle.bold);
            applyTextStyle();
        });
        
        italicBtn?.addEventListener('click', () => {
            textStyle.italic = !textStyle.italic;
            italicBtn.classList.toggle('active', textStyle.italic);
            applyTextStyle();
        });
        
        underlineBtn?.addEventListener('click', () => {
            textStyle.underline = !textStyle.underline;
            underlineBtn.classList.toggle('active', textStyle.underline);
            applyTextStyle();
        });
        
        // テキスト削除ボタン
        const textDeleteBtn = document.getElementById('textDeleteBtn');
        textDeleteBtn?.addEventListener('click', () => {
            deleteElement();
        });
    }
    
    function applyTextStyle() {
        if (selectedElementIds.length === 0) return;
        const data = elements.find(e => e.id === selectedElementIds[0]);
        if (!data || data.type !== 'text') return;
        
        const el = document.querySelector(`[data-id="${selectedElementIds[0]}"]`);
        if (!el) return;
        
        data.fontSize = textStyle.fontSize;
        data.fontFamily = textStyle.fontFamily;
        data.color = textStyle.color;
        data.bold = textStyle.bold;
        data.italic = textStyle.italic;
        data.underline = textStyle.underline;
        
        el.style.fontSize = textStyle.fontSize + 'px';
        el.style.fontFamily = textStyle.fontFamily;
        el.style.color = textStyle.color;
        el.style.fontWeight = textStyle.bold ? 'bold' : 'normal';
        el.style.fontStyle = textStyle.italic ? 'italic' : 'normal';
        el.style.textDecoration = textStyle.underline ? 'underline' : 'none';
        
        saveState();
    }
    
    // テキスト要素のスタイルをtextStyleに同期（選択時に呼び出し）
    function syncTextStyleFromElement(data) {
        if (!data || data.type !== 'text') return;
        
        // textStyleを要素の値で更新
        textStyle.fontSize = data.fontSize || 28;
        textStyle.fontFamily = data.fontFamily || 'sans-serif';
        textStyle.color = data.color || '#7c3aed';
        textStyle.bold = data.bold || false;
        textStyle.italic = data.italic || false;
        textStyle.underline = data.underline || false;
        
        // ツールバーUIを更新
        const fontSizeDisplay = document.getElementById('fontSizeDisplay');
        const fontSelect = document.getElementById('fontSelect');
        const textColorBtn = document.getElementById('textColorBtn');
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');
        
        if (fontSizeDisplay) fontSizeDisplay.textContent = textStyle.fontSize;
        if (fontSelect) fontSelect.value = textStyle.fontFamily;
        
        const indicator = textColorBtn?.querySelector('.color-indicator');
        if (indicator) indicator.style.background = textStyle.color;
        
        boldBtn?.classList.toggle('active', textStyle.bold);
        italicBtn?.classList.toggle('active', textStyle.italic);
        underlineBtn?.classList.toggle('active', textStyle.underline);
    }
    
    // ========================================
    // キーボードショートカット
    // ========================================
    function handleKeydown(e) {
        // Delete/Backspace で要素削除
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
            const activeEl = document.activeElement;
            // テキスト入力中は要素削除をスキップ
            if (activeEl && (
                activeEl.contentEditable === 'true' ||
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA'
            )) return;
            
            e.preventDefault();
            deleteElement();
        }
        
        // Escape で選択解除
        if (e.key === 'Escape') {
            if (revisionOverlay?.style.display === 'flex') {
                closeRevisionMode();
            } else {
                deselectAll();
            }
        }
        
        // V: 選択ツール
        if (e.key === 'v' && !e.metaKey && !e.ctrlKey) {
            setCurrentTool('select');
        }
        
        // H: ハンドツール
        if (e.key === 'h' && !e.metaKey && !e.ctrlKey) {
            setCurrentTool('hand');
        }
        
        // T: テキストツール
        if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.contentEditable === 'true')) return;
            setCurrentTool('text');
        }
        
        // Cmd/Ctrl + D: 複製
        if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedElementIds.length > 0) {
            e.preventDefault();
            duplicateElement();
        }
        
        // Cmd/Ctrl + Z: アンドゥ
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        
        // Cmd/Ctrl + Shift + Z または Cmd/Ctrl + Y: リドゥ
        if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    }
    
    // ========================================
    // ユーティリティ
    // ========================================
    function updateEmptyState() {
        if (canvasEmptyState) {
            canvasEmptyState.style.display = elements.length === 0 ? 'block' : 'none';
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function saveState() {
        // 履歴操作中は履歴に追加しない
        if (!isHistoryAction) {
            // 現在位置より後の履歴を削除
            historyStack = historyStack.slice(0, historyIndex + 1);
            
            // 新しい状態を履歴に追加
            const snapshot = JSON.stringify(elements);
            historyStack.push(snapshot);
            
            // 最大履歴数を超えた場合、古いものを削除
            if (historyStack.length > MAX_HISTORY) {
                historyStack.shift();
            } else {
                historyIndex++;
            }
        }
        
        // IndexedDBに保存
        saveToIndexedDB();
    }
    
    function loadState() {
        loadFromIndexedDB();
    }
    
    // ========================================
    // アンドゥ / リドゥ
    // ========================================
    function undo() {
        if (historyIndex <= 0) {
            showToast('これ以上元に戻せません');
            return;
        }
        
        historyIndex--;
        isHistoryAction = true;
        
        // 履歴から状態を復元
        const snapshot = historyStack[historyIndex];
        elements = JSON.parse(snapshot);
        
        // DOMをクリアして再描画
        rerenderAllElements();
        
        isHistoryAction = false;
        saveToIndexedDB();
        showToast('元に戻しました');
    }
    
    function redo() {
        if (historyIndex >= historyStack.length - 1) {
            showToast('これ以上やり直せません');
            return;
        }
        
        historyIndex++;
        isHistoryAction = true;
        
        // 履歴から状態を復元
        const snapshot = historyStack[historyIndex];
        elements = JSON.parse(snapshot);
        
        // DOMをクリアして再描画
        rerenderAllElements();
        
        isHistoryAction = false;
        saveToIndexedDB();
        showToast('やり直しました');
    }
    
    function rerenderAllElements() {
        // 既存のDOM要素をクリア
        canvasContainer.querySelectorAll('.canvas-element').forEach(el => el.remove());
        
        // すべての要素を再描画
        elements.forEach(el => renderElement(el));
        
        // 選択解除
        deselectAll();
        updateEmptyState();
    }
    
    // ========================================
    // IndexedDB ストレージ
    // ========================================
    const DB_NAME = 'mixboard_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'projects';
    
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }
    
    async function saveToIndexedDB() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            const data = {
                id: STORAGE_KEY,
                elements,
                updatedAt: new Date().toISOString()
            };
            
            store.put(data);
            
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            
            // データサイズをログ出力
            const jsonSize = JSON.stringify(data).length / (1024 * 1024);
            console.log('State saved to IndexedDB:', elements.length, 'elements,', jsonSize.toFixed(2), 'MB');
            
            db.close();
        } catch (error) {
            console.error('IndexedDB save error:', error);
            showToast('保存中にエラーが発生しました', 'error');
        }
    }
    
    async function loadFromIndexedDB() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            
            const request = store.get(STORAGE_KEY);
            
            const data = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (data && data.elements && data.elements.length > 0) {
                elements = data.elements;
                console.log('Loaded from IndexedDB:', elements.length, 'elements');
                elements.forEach(el => renderElement(el));
            } else {
                // localStorageからの移行を試行
                migrateFromLocalStorage();
            }
            
            db.close();
            updateEmptyState();
        } catch (error) {
            console.error('IndexedDB load error:', error);
            // フォールバック: localStorageから読み込み
            migrateFromLocalStorage();
        }
    }
    
    function migrateFromLocalStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.elements && data.elements.length > 0) {
                    elements = data.elements;
                    console.log('Migrated from localStorage:', elements.length, 'elements');
                    elements.forEach(el => renderElement(el));
                    
                    // IndexedDBに保存してlocalStorageを削除
                    saveToIndexedDB().then(() => {
                        localStorage.removeItem(STORAGE_KEY);
                        console.log('Migration complete, localStorage cleared');
                        showToast('データをIndexedDBに移行しました');
                    });
                }
            }
        } catch (error) {
            console.error('Migration error:', error);
        }
    }
    
    // 初期化実行
    init();
});

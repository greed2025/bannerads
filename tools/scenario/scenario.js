/**
 * シナリオ作成ツール - メインスクリプト
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // DOM要素
    // ========================================
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const attachBtn = document.getElementById('attachBtn');
    const referenceInput = document.getElementById('referenceInput');
    const uploadPreviews = document.getElementById('uploadPreviews');
    
    const scenarioList = document.getElementById('scenarioList');
    const scenarioDisplay = document.getElementById('scenarioDisplay');
    const scenarioCount = document.getElementById('scenarioCount');
    const addScenarioBtn = document.getElementById('addScenarioBtn');
    
    const saveModal = document.getElementById('saveModal');
    const saveModalClose = document.getElementById('saveModalClose');
    const saveModalCancel = document.getElementById('saveModalCancel');
    const saveModalConfirm = document.getElementById('saveModalConfirm');
    const scenarioFileName = document.getElementById('scenarioFileName');
    const scenarioContent = document.getElementById('scenarioContent');
    
    const tabsContainer = document.getElementById('tabsContainer');
    const newTabBtn = document.getElementById('newTabBtn');

    
    // 案件選択
    const projectSelectLeft = document.getElementById('projectSelectLeft');
    const projectSelectChat = document.getElementById('projectSelectChat');
    const generationCount = document.getElementById('generationCount');
    
    // 事前設定パネル
    const presetPanel = document.querySelector('.preset-panel');
    const presetToggle = document.getElementById('presetToggle');
    const presetTarget = document.getElementById('presetTarget');
    const presetAppeal = document.getElementById('presetAppeal');
    const presetDetails = document.getElementById('presetDetails');
    
    // マーカーツールバー関連
    const greenMarkerTool = document.getElementById('greenMarkerTool');
    const redMarkerTool = document.getElementById('redMarkerTool');
    const previewMarkerTool = document.getElementById('previewMarkerTool');
    const markerCount = document.getElementById('markerCount');
    const applyMarkersBtn = document.getElementById('applyMarkers'); // 削除済み - nullになる
    const clearMarkersBtn = document.getElementById('clearMarkers');
    const markerPreviewPanel = document.getElementById('markerPreviewPanel');
    const markerPreviewList = document.getElementById('markerPreviewList');
    const markerPreviewClose = document.getElementById('markerPreviewClose');
    
    // 編集モーダル関連
    const editModal = document.getElementById('editModal');
    const editModalClose = document.getElementById('editModalClose');
    const editModalCancel = document.getElementById('editModalCancel');
    const editModalConfirm = document.getElementById('editModalConfirm');
    const editScenarioFileName = document.getElementById('editScenarioFileName');
    const editScenarioContent = document.getElementById('editScenarioContent');
    const editOriginalFileName = document.getElementById('editOriginalFileName');
    
    // 削除モーダル関連
    const deleteModal = document.getElementById('deleteModal');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const deleteModalCancel = document.getElementById('deleteModalCancel');
    const deleteModalConfirm = document.getElementById('deleteModalConfirm');
    const deleteScenarioName = document.getElementById('deleteScenarioName');
    const deleteScenarioFilename = document.getElementById('deleteScenarioFilename');

    // ========================================
    // 状態管理
    // ========================================
    let projects = [];
    let deletedProjects = [];
    let currentProjectId = null;
    let projectCounter = 0;
    let referenceImages = [];
    let savedScenarios = []; // 保存済み好調シナリオ
    let selectedScenarios = []; // 選択中のシナリオ
    let isProcessing = false;
    let abortController = null; // 中断用コントローラー
    let currentProjectType = 'debt'; // 現在選択中の案件タイプ
    
    // マーカー関連の状態
    let activeMarkerTool = null; // 'green' or 'red' or null
    let markersList = []; // { id, type, text, instruction, range }
    let markerIdCounter = 0;
    let historyStack = []; // アンドゥ用履歴スタック
    let redoStack = []; // リドゥ用スタック
    
    const STORAGE_KEY = 'scenario_projects';
    const FEEDBACK_KEY = 'scenario_feedback'; // 赤マーカーのフィードバック保存用
    const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}/api`;

    // ========================================
    // LocalStorage 保存・読み込み
    // ========================================
    function saveToLocalStorage() {
        try {
            const data = {
                projects: projects,
                deletedProjects: deletedProjects,
                currentProjectId: currentProjectId,
                projectCounter: projectCounter
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('LocalStorage保存エラー:', error);
        }
    }
    
    function loadFromLocalStorage() {
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

    // ========================================
    // 初期化
    // ========================================
    function init() {
        const loaded = loadFromLocalStorage();
        
        if (loaded && projects.length > 0) {
            restoreProjectState();
            renderTabs();
        } else {
            createProject('シナリオ 1');
        }
        
        setupTabEvents();
        loadSavedScenarios();
        setupProjectAndModelSelects();
    }
    
    // 案件選択のセットアップ
    function setupProjectAndModelSelects() {
        // 左パネルの案件選択（好調シナリオ管理用 - 独立）
        projectSelectLeft.addEventListener('change', (e) => {
            currentProjectType = e.target.value;
            selectedScenarios = [];
            loadSavedScenarios();
        });
        
        // チャットパネルの案件選択（チャット用 - 独立）
        // projectSelectChatは現在は未使用（将来的にチャット内容のフィルタに使用可能）
        
        // 事前設定パネルの開閉
        presetToggle.addEventListener('click', () => {
            presetPanel.classList.toggle('collapsed');
        });
        
        // ヘッダー全体をクリック可能に
        document.querySelector('.preset-header').addEventListener('click', (e) => {
            if (e.target !== presetToggle && !presetToggle.contains(e.target)) {
                presetPanel.classList.toggle('collapsed');
            }
        });
    }
    
    // 事前設定の取得
    function getPresetSettings() {
        return {
            target: presetTarget.value.trim(),
            appeal: presetAppeal.value.trim(),
            details: presetDetails.value.trim()
        };
    }

    // ========================================
    // プロジェクト管理
    // ========================================
    function getCurrentProject() {
        return projects.find(p => p.id === currentProjectId);
    }
    
    function createProject(name = null) {
        projectCounter++;
        const project = {
            id: projectCounter,
            name: name || `シナリオ ${projectCounter}`,
            content: '',
            conversationHistory: [],
            chatMessages: '',
            scenarioType: 'short',
            markers: [],          // タブ別マーカー情報
            markerIdCounter: 0    // タブ別マーカーIDカウンター
        };
        projects.push(project);
        switchProject(project.id);
        renderTabs();
        saveToLocalStorage();
        return project;
    }
    
    function switchProject(projectId) {
        saveCurrentProjectState();
        currentProjectId = projectId;
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
        
        project.deletedAt = new Date().toISOString();
        deletedProjects.unshift(project);
        if (deletedProjects.length > 20) {
            deletedProjects.pop();
        }
        
        const idx = projects.findIndex(p => p.id === projectId);
        projects.splice(idx, 1);
        
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
        
        const tabSpan = tabsContainer.querySelector(`.tab[data-project-id="${projectId}"] .tab-name`);
        if (!tabSpan) return;
        
        const currentName = project.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'tab-name-input';
        
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
                input.value = currentName;
                input.blur();
            }
        });
    }
    
    function saveCurrentProjectState() {
        const project = getCurrentProject();
        if (!project) return;
        project.chatMessages = chatMessages.innerHTML;
        
        // マーカー情報をプロジェクトに保存
        project.markers = markersList;
        project.markerIdCounter = markerIdCounter;
    }
    
    function restoreProjectState() {
        const project = getCurrentProject();
        if (!project) return;
        
        if (project.chatMessages) {
            chatMessages.innerHTML = project.chatMessages;
        } else {
            chatMessages.innerHTML = `
                <div class="chat-message system">
                    <div class="message-content">
                        <p>👋 どんなシナリオを作成しますか？</p>
                        <p class="hint">左パネルから好調シナリオを選択すると、参考にして作成します。</p>
                    </div>
                </div>
            `;
        }
        
        if (project.content) {
            renderScenarioContent(project.content);
        } else {
            scenarioDisplay.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <p>右側のチャットでシナリオを作成しましょう</p>
                </div>
            `;
        }
        
        // マーカー情報をプロジェクトから復元
        markersList = project.markers || [];
        markerIdCounter = project.markerIdCounter || 0;
        
        // DOMにマーカーハイライトを再適用
        restoreMarkerHighlights();
        
        // マーカーUI更新
        updateMarkerUI();
        
        updateScenarioCount();
    }

    // ========================================
    // タブUI
    // ========================================
    function setupTabEvents() {
        newTabBtn.addEventListener('click', () => {
            createProject();
        });
    }
    
    function renderTabs() {
        tabsContainer.innerHTML = projects.map(project => `
            <button class="tab ${project.id === currentProjectId ? 'active' : ''}" data-project-id="${project.id}">
                <span class="tab-name">${escapeHtml(project.name)}</span>
                <button class="tab-close" data-project-id="${project.id}">×</button>
            </button>
        `).join('');
        
        tabsContainer.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-close') || e.target.classList.contains('tab-name')) {
                    return;
                }
                switchProject(parseInt(tab.dataset.projectId));
            });
        });
        
        tabsContainer.querySelectorAll('.tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const projectId = parseInt(btn.dataset.projectId);
                setTimeout(() => deleteProject(projectId), 10);
            });
        });
        
        tabsContainer.querySelectorAll('.tab-name').forEach(span => {
            let clickTimeout = null;
            
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    return;
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

    // ========================================
    // チャット機能
    // ========================================
    function addMessage(role, content, isMarkdown = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isMarkdown) {
            contentDiv.innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
        } else {
            contentDiv.innerHTML = `<p>${escapeHtml(content)}</p>`;
        }
        
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message && referenceImages.length === 0) return;
        if (isProcessing) return;
        
        const project = getCurrentProject();
        if (!project) return;
        
        isProcessing = true;
        chatSendBtn.disabled = true;
        abortController = new AbortController(); // 中断用コントローラー作成
        
        if (message) {
            addMessage('user', message);
        }
        
        if (referenceImages.length > 0) {
            addMessage('user', `📎 ${referenceImages.length}枚の画像を添付しました`);
        }
        
        chatInput.value = '';
        
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'thinking';
        thinkingDiv.innerHTML = `
            <div class="thinking-content">
                <div class="thinking-dots">
                    <span></span><span></span><span></span>
                </div>
                <span>シナリオを考えています...</span>
            </div>
            <button class="thinking-abort-btn" id="thinkingAbortBtn">中断</button>
        `;
        chatMessages.appendChild(thinkingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 中断ボタンのイベント
        const abortBtn = thinkingDiv.querySelector('#thinkingAbortBtn');
        abortBtn.addEventListener('click', () => {
            if (abortController) {
                abortController.abort();
            }
        });
        
        try {
            // 各設定を個別の変数として取得
            const targetValue = presetTarget.value.trim();       // ターゲット
            const appealValue = presetAppeal.value.trim();       // 訴求軸
            const detailsValue = presetDetails.value.trim();     // 詳細
            const countValue = generationCount.value || '1';     // 作成数
            
            const response = await fetch(`${API_BASE_URL}/scenario/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    images: referenceImages.map(img => img.data),
                    conversationHistory: project.conversationHistory,
                    selectedScenarios: selectedScenarios,
                    scenarioType: project.scenarioType,
                    projectType: currentProjectType, // 左パネルで選択された案件タイプ
                    // 個別の変数として送信
                    target: targetValue,
                    appeal: appealValue,
                    details: detailsValue,
                    generationCount: parseInt(countValue)
                }),
                signal: abortController.signal // 中断シグナルを渡す
            });

            thinkingDiv.remove();

            if (!response.ok) {
                throw new Error('API error');
            }

            const data = await response.json();
            project.conversationHistory = data.conversationHistory || [];
            addMessage('assistant', data.message, true);
            
            if (data.scenario) {
                project.content = data.scenario;
                renderScenarioContent(data.scenario);
            }
            
            saveToLocalStorage();
            
        } catch (error) {
            thinkingDiv.remove();
            if (error.name === 'AbortError') {
                // ユーザーが中断した場合
                addMessage('assistant', '⏹️ 生成を中断しました。');
            } else {
                console.error('チャットエラー:', error);
                addMessage('assistant', 'すみません、エラーが発生しました。サーバーが起動しているか確認してください。');
            }
        } finally {
            isProcessing = false;
            chatSendBtn.disabled = false;
            abortController = null;
            referenceImages = [];
            renderImagePreviews();
        }
    }

    // ========================================
    // 画像アップロード
    // ========================================
    attachBtn.addEventListener('click', () => {
        referenceInput.click();
    });
    
    referenceInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                referenceImages.push({
                    name: file.name,
                    data: event.target.result
                });
                renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    });
    
    function renderImagePreviews() {
        uploadPreviews.innerHTML = referenceImages.map((img, idx) => `
            <div class="preview-item">
                <img src="${img.data}" alt="${img.name}">
                <button class="preview-remove" data-idx="${idx}">×</button>
            </div>
        `).join('');
        
        uploadPreviews.querySelectorAll('.preview-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                referenceImages.splice(idx, 1);
                renderImagePreviews();
            });
        });
        
        attachBtn.classList.toggle('has-images', referenceImages.length > 0);
    }

    // ========================================
    // シナリオ表示・マーカー
    // ========================================
    function renderScenarioContent(content) {
        // 「---」で区切ってシナリオを分割
        const scenarios = content.split(/\n---\n/).filter(s => s.trim());
        
        if (scenarios.length <= 1) {
            // 単一シナリオの場合
            scenarioDisplay.innerHTML = `
                <div class="scenario-card" data-index="0">
                    <div class="scenario-card-header">
                        <span class="scenario-card-title">シナリオ</span>
                        <div class="scenario-card-actions">
                            <button class="action-btn add-btn" onclick="addScenarioPanel(0)" title="下に新規追加">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                <span>追加</span>
                            </button>
                            <button class="action-btn duplicate-btn" onclick="duplicateScenarioPanel(0)" title="複製">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="8" y="8" width="12" height="12" rx="2" ry="2"/>
                                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
                                </svg>
                                <span>複製</span>
                            </button>
                            <button class="action-btn copy-btn" onclick="copyScenario(0)" title="コピー">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                                <span>コピー</span>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteScenarioPanel(0)" title="削除">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                                <span>削除</span>
                            </button>
                        </div>
                    </div>
                    <div class="scenario-card-content scenario-editable" id="scenarioText-0" contenteditable="true" data-idx="0">
                        ${content.replace(/\n/g, '<br>')}
                    </div>
                </div>
            `;
        } else {
            // 複数シナリオの場合
            scenarioDisplay.innerHTML = scenarios.map((scenario, idx) => {
                // 【シナリオN】の形式を除去して本文のみ抽出
                const cleanedScenario = scenario.replace(/^【シナリオ\d+】\s*/i, '').trim();
                return `
                    <div class="scenario-card" data-index="${idx}">
                        <div class="scenario-card-header">
                            <span class="scenario-card-title">シナリオ ${idx + 1}</span>
                            <div class="scenario-card-actions">
                                <button class="action-btn add-btn" onclick="addScenarioPanel(${idx})" title="下に新規追加">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="5" x2="12" y2="19"/>
                                        <line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                    <span>追加</span>
                                </button>
                                <button class="action-btn duplicate-btn" onclick="duplicateScenarioPanel(${idx})" title="複製">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="8" y="8" width="12" height="12" rx="2" ry="2"/>
                                        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
                                    </svg>
                                    <span>複製</span>
                                </button>
                                <button class="action-btn copy-btn" onclick="copyScenario(${idx})" title="コピー">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                    <span>コピー</span>
                                </button>
                                <button class="action-btn delete-btn" onclick="deleteScenarioPanel(${idx})" title="削除">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                    <span>削除</span>
                                </button>
                            </div>
                        </div>
                        <div class="scenario-card-content scenario-editable" id="scenarioText-${idx}" contenteditable="true" data-idx="${idx}">
                            ${cleanedScenario.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                `;
            }).join('');
        }
        updateScenarioCount();
        
        // 編集時に自動保存をセットアップ
        document.querySelectorAll('.scenario-editable').forEach(el => {
            el.addEventListener('blur', () => {
                autoSaveFromEditable(el);
            });
        });
    }

    // シナリオパネル削除機能
    window.deleteScenarioPanel = function(index) {
        if (!confirm('このシナリオを削除してもよろしいですか？')) return;
        
        const project = getCurrentProject();
        if (!project || !project.content) return;
        
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        
        // 該当のシナリオを削除
        scenarios.splice(index, 1);
        
        // 更新後のコンテンツをセット
        if (scenarios.length === 0) {
            project.content = '';
        } else {
            project.content = scenarios.join('\n---\n');
        }
        
        // 再描画と保存
        renderScenarioContent(project.content);
        saveToLocalStorage();
        showToast('シナリオを削除しました');
    };
    
    // シナリオパネル追加機能（指定位置の下に新規パネルを挿入）
    window.addScenarioPanel = function(index) {
        const project = getCurrentProject();
        if (!project) return;
        
        const newScenarioText = 'ここに新しいシナリオを入力してください';
        
        if (!project.content || project.content.trim() === '') {
            // コンテンツが空の場合
            project.content = newScenarioText;
        } else {
            const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
            
            // 指定位置の後に新規シナリオを挿入
            scenarios.splice(index + 1, 0, newScenarioText);
            
            project.content = scenarios.join('\n---\n');
        }
        
        // 再描画と保存
        renderScenarioContent(project.content);
        saveToLocalStorage();
        showToast('新しいシナリオを追加しました');
        
        // 新しく追加されたシナリオにフォーカス
        setTimeout(() => {
            const newCard = document.getElementById(`scenarioText-${index + 1}`);
            if (newCard) {
                newCard.focus();
                // テキストを選択状態にする
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(newCard);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }, 100);
    };
    
    // シナリオパネル複製機能（指定パネルを複製して下に挿入）
    window.duplicateScenarioPanel = function(index) {
        const project = getCurrentProject();
        if (!project || !project.content) return;
        
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        
        if (index >= scenarios.length) return;
        
        // 指定位置のシナリオを複製して直後に挿入
        const duplicatedScenario = scenarios[index];
        scenarios.splice(index + 1, 0, duplicatedScenario);
        
        project.content = scenarios.join('\n---\n');
        
        // 再描画と保存
        renderScenarioContent(project.content);
        saveToLocalStorage();
        showToast('シナリオを複製しました');
        
        // 複製されたシナリオにスクロール
        setTimeout(() => {
            const duplicatedCard = document.querySelector(`.scenario-card[data-index="${index + 1}"]`);
            if (duplicatedCard) {
                duplicatedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };
    
    // テキストエリアの高さを内容に合わせて調整
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
    
    // contenteditableからの自動保存
    function autoSaveFromEditable(el) {
        const idx = parseInt(el.dataset.idx);
        const project = getCurrentProject();
        if (!project) return;
        
        // HTMLからテキストを取得（<br>を改行に変換、マーカーハイライトは保持）
        const html = el.innerHTML;
        const text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<span[^>]*class="[^"]*marker-highlight[^"]*"[^>]*>(.*?)<\/span>/gi, '$1')
            .replace(/<[^>]*>/g, '');
        
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        
        if (scenarios.length <= 1) {
            project.content = text;
        } else {
            scenarios[idx] = text;
            project.content = scenarios.join('\n---\n');
        }
        
        saveToLocalStorage();
    }
    
    // 自動保存機能（レガシーサポート）
    window.autoSaveScenario = function(index) {
        const textarea = document.getElementById(`scenarioEditArea-${index}`);
        if (!textarea) return;
        
        const newText = textarea.value;
        const project = getCurrentProject();
        if (!project) return;
        
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        
        if (scenarios.length <= 1) {
            project.content = newText;
        } else {
            scenarios[index] = newText;
            project.content = scenarios.join('\n---\n');
        }
        
        saveToLocalStorage();
    };
    
    // コピー機能をグローバルに公開
    window.copyScenario = function(index) {
        const contentEl = document.getElementById(`scenarioText-${index}`);
        if (!contentEl) return;
        
        // HTMLからテキストを取得（マーカーを除去）
        const html = contentEl.innerHTML;
        const text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<span[^>]*class="[^"]*marker-highlight[^"]*"[^>]*>(.*?)<\/span>/gi, '$1')
            .replace(/<[^>]*>/g, '');
        
        navigator.clipboard.writeText(text).then(() => {
            const btn = contentEl.closest('.scenario-card').querySelector('.copy-btn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>コピー完了</span>
            `;
            btn.classList.add('copied');
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('コピーエラー:', err);
            alert('コピーに失敗しました');
        });
    };
    
    // 編集機能をグローバルに公開
    window.editScenario = function(index) {
        const contentEl = document.getElementById(`scenarioText-${index}`);
        const card = contentEl.closest('.scenario-card');
        if (!contentEl || card.classList.contains('editing')) return;
        
        // 現在のテキストを取得
        const currentText = contentEl.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '');
        
        // 編集モードに切り替え
        card.classList.add('editing');
        
        // コンテンツをテキストエリアに置き換え
        contentEl.innerHTML = `
            <textarea class="scenario-edit-textarea" id="scenarioEditArea-${index}">${escapeHtml(currentText)}</textarea>
            <div class="scenario-edit-actions">
                <button class="btn btn-secondary scenario-cancel-btn" onclick="cancelEditScenario(${index})">キャンセル</button>
                <button class="btn btn-primary scenario-save-btn" onclick="saveEditScenario(${index})">保存</button>
            </div>
        `;
        
        // テキストエリアにフォーカス
        const textarea = document.getElementById(`scenarioEditArea-${index}`);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        
        // ヘッダーの編集ボタンを非表示
        const editBtn = card.querySelector('.edit-scenario-btn');
        if (editBtn) editBtn.style.display = 'none';
    };
    
    // 編集キャンセル
    window.cancelEditScenario = function(index) {
        const project = getCurrentProject();
        if (!project || !project.content) return;
        
        // 元のコンテンツで再描画
        renderScenarioContent(project.content);
    };
    
    // 編集保存
    window.saveEditScenario = function(index) {
        const textarea = document.getElementById(`scenarioEditArea-${index}`);
        if (!textarea) return;
        
        const newText = textarea.value;
        const project = getCurrentProject();
        if (!project) return;
        
        // プロジェクトのコンテンツを更新
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        
        if (scenarios.length <= 1) {
            // 単一シナリオの場合
            project.content = newText;
        } else {
            // 複数シナリオの場合、該当インデックスのシナリオを更新
            scenarios[index] = newText;
            project.content = scenarios.join('\n---\n');
        }
        
        // 再描画
        renderScenarioContent(project.content);
        saveToLocalStorage();
        
        // 成功メッセージ表示
        showToast('シナリオを更新しました');
    };
    
    // トースト通知
    function showToast(message) {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    
    function updateScenarioCount() {
        const count = projects.filter(p => p.content).length;
        scenarioCount.textContent = `${count}件`;
    }

    // ========================================
    // 好調シナリオ管理
    // ========================================
    async function loadSavedScenarios() {
        try {
            const response = await fetch(`${API_BASE_URL}/scenario/list?projectType=${currentProjectType}`);
            if (response.ok) {
                savedScenarios = await response.json();
                renderScenarioList();
            }
        } catch (error) {
            console.error('シナリオ一覧取得エラー:', error);
            renderScenarioList();
        }
    }
    
    function renderScenarioList() {
        if (savedScenarios.length === 0) {
            scenarioList.innerHTML = '<div class="scenario-empty">好調シナリオがありません<br>＋ボタンで追加してください</div>';
            return;
        }
        
        scenarioList.innerHTML = savedScenarios.map(scenario => `
            <div class="scenario-item ${selectedScenarios.includes(scenario.filename) ? 'selected' : ''}" data-filename="${scenario.filename}">
                <input type="checkbox" ${selectedScenarios.includes(scenario.filename) ? 'checked' : ''}>
                <div class="scenario-item-info">
                    <div class="scenario-item-name">${escapeHtml(scenario.name)}</div>
                    <div class="scenario-item-preview">${escapeHtml(scenario.preview || '')}</div>
                </div>
                <div class="scenario-item-actions">
                    <button class="scenario-action-btn edit-btn" data-filename="${scenario.filename}" title="編集">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="scenario-action-btn delete-btn" data-filename="${scenario.filename}" data-name="${escapeHtml(scenario.name)}" title="削除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
        // パネル全体をクリック可能に（チェックボックストグル）
        scenarioList.querySelectorAll('.scenario-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // 編集・削除ボタンのクリックは無視
                if (e.target.closest('.scenario-action-btn')) {
                    return;
                }
                
                const checkbox = item.querySelector('input[type="checkbox"]');
                const filename = item.dataset.filename;
                
                // チェックボックス自体のクリックの場合はそのままにする
                if (e.target === checkbox) {
                    if (checkbox.checked) {
                        if (!selectedScenarios.includes(filename)) {
                            selectedScenarios.push(filename);
                        }
                        item.classList.add('selected');
                    } else {
                        selectedScenarios = selectedScenarios.filter(f => f !== filename);
                        item.classList.remove('selected');
                    }
                } else {
                    // パネルクリックでチェックボックスをトグル
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        if (!selectedScenarios.includes(filename)) {
                            selectedScenarios.push(filename);
                        }
                        item.classList.add('selected');
                    } else {
                        selectedScenarios = selectedScenarios.filter(f => f !== filename);
                        item.classList.remove('selected');
                    }
                }
            });
        });
        
        // 編集ボタンのイベント
        scenarioList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(btn.dataset.filename);
            });
        });
        
        // 削除ボタンのイベント
        scenarioList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteModal(btn.dataset.filename, btn.dataset.name);
            });
        });
    }
    
    // シナリオ保存モーダル
    const videoUploadHeader = document.getElementById('videoUploadHeader');
    const videoUploadContent = document.getElementById('videoUploadContent');
    const videoUploadGroup = document.querySelector('.video-upload-group');
    const videoUploadArea = document.getElementById('videoUploadArea');
    const videoInput = document.getElementById('videoInput');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadResult = document.getElementById('uploadResult');
    const uploadResultText = document.getElementById('uploadResultText');
    
    // 動画アップロードプルダウンの開閉
    videoUploadHeader.addEventListener('click', () => {
        const isOpen = videoUploadGroup.classList.contains('open');
        if (isOpen) {
            videoUploadGroup.classList.remove('open');
            videoUploadContent.style.display = 'none';
        } else {
            videoUploadGroup.classList.add('open');
            videoUploadContent.style.display = 'block';
        }
    });
    
    addScenarioBtn.addEventListener('click', () => {
        scenarioFileName.value = '';
        scenarioContent.value = '';
        resetVideoUpload();
        saveModal.classList.add('show');
    });
    
    // 動画アップロードエリアのクリック処理
    videoUploadArea.addEventListener('click', () => {
        if (!uploadProgress.style.display || uploadProgress.style.display === 'none') {
            videoInput.click();
        }
    });
    
    // 動画ファイル選択時の処理
    videoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // ファイルサイズチェック
        if (file.size > 100 * 1024 * 1024) {
            alert('ファイルサイズは100MB以下にしてください');
            return;
        }
        
        await transcribeVideo(file);
        e.target.value = '';
    });
    
    // 動画文字起こし処理
    async function transcribeVideo(file) {
        // UIを進捗表示に切り替え
        uploadPlaceholder.style.display = 'none';
        uploadResult.style.display = 'none';
        uploadProgress.style.display = 'flex';
        progressFill.style.width = '30%';
        progressText.textContent = `${file.name} を処理中...`;
        
        try {
            const formData = new FormData();
            formData.append('video', file);
            
            progressFill.style.width = '60%';
            progressText.textContent = '音声を文字起こし中...';
            
            const response = await fetch(`${API_BASE_URL}/scenario/transcribe`, {
                method: 'POST',
                body: formData
            });
            
            progressFill.style.width = '90%';
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '文字起こしに失敗しました');
            }
            
            const data = await response.json();
            
            progressFill.style.width = '100%';
            
            // 成功表示
            uploadProgress.style.display = 'none';
            uploadResult.style.display = 'flex';
            videoUploadArea.classList.remove('error');
            uploadResultText.textContent = `文字起こし完了（${data.transcription.length}文字）`;
            
            // テキストエリアに追加
            if (scenarioContent.value) {
                scenarioContent.value += '\n\n---\n\n' + data.transcription;
            } else {
                scenarioContent.value = data.transcription;
            }
            
        } catch (error) {
            console.error('文字起こしエラー:', error);
            
            // エラー表示
            uploadProgress.style.display = 'none';
            uploadResult.style.display = 'flex';
            videoUploadArea.classList.add('error');
            uploadResultText.textContent = `エラー: ${error.message}`;
        }
    }
    
    // 動画アップロードUIをリセット
    function resetVideoUpload() {
        uploadPlaceholder.style.display = 'flex';
        uploadProgress.style.display = 'none';
        uploadResult.style.display = 'none';
        videoUploadArea.classList.remove('error');
        progressFill.style.width = '0%';
        videoInput.value = '';
        // プルダウンを閉じる
        videoUploadGroup.classList.remove('open');
        videoUploadContent.style.display = 'none';
    }
    
    saveModalClose.addEventListener('click', () => {
        saveModal.classList.remove('show');
        resetVideoUpload();
    });
    
    saveModalCancel.addEventListener('click', () => {
        saveModal.classList.remove('show');
        resetVideoUpload();
    });
    
    saveModalConfirm.addEventListener('click', async () => {
        const filename = scenarioFileName.value.trim();
        const content = scenarioContent.value.trim();
        
        if (!filename || !content) {
            alert('ファイル名と本文を入力してください');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/scenario/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename + '.md',
                    content: content,
                    projectType: currentProjectType
                })
            });
            
            if (response.ok) {
                saveModal.classList.remove('show');
                resetVideoUpload();
                loadSavedScenarios();
            } else {
                alert('保存に失敗しました');
            }
        } catch (error) {
            console.error('保存エラー:', error);
            alert('保存に失敗しました');
        }
    });

    // ========================================
    // 編集モーダル
    // ========================================
    async function openEditModal(filename) {
        try {
            const response = await fetch(`${API_BASE_URL}/scenario/detail?filename=${encodeURIComponent(filename)}&projectType=${currentProjectType}`);
            if (!response.ok) {
                throw new Error('シナリオの取得に失敗しました');
            }
            
            const data = await response.json();
            editOriginalFileName.value = filename;
            editScenarioFileName.value = data.name;
            editScenarioContent.value = data.content;
            editModal.classList.add('show');
        } catch (error) {
            console.error('編集モーダル表示エラー:', error);
            alert('シナリオの読み込みに失敗しました');
        }
    }
    
    editModalClose.addEventListener('click', () => {
        editModal.classList.remove('show');
    });
    
    editModalCancel.addEventListener('click', () => {
        editModal.classList.remove('show');
    });
    
    editModalConfirm.addEventListener('click', async () => {
        const originalFilename = editOriginalFileName.value;
        const newFilename = editScenarioFileName.value.trim();
        const content = editScenarioContent.value.trim();
        
        if (!newFilename || !content) {
            alert('ファイル名と本文を入力してください');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/scenario/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: originalFilename,
                    newFilename: newFilename + '.md',
                    content: content,
                    projectType: currentProjectType
                })
            });
            
            if (response.ok) {
                editModal.classList.remove('show');
                loadSavedScenarios();
            } else {
                const errorData = await response.json();
                alert(errorData.error || '更新に失敗しました');
            }
        } catch (error) {
            console.error('更新エラー:', error);
            alert('更新に失敗しました');
        }
    });

    // ========================================
    // 削除モーダル
    // ========================================
    function openDeleteModal(filename, name) {
        deleteScenarioFilename.value = filename;
        deleteScenarioName.textContent = name;
        deleteModal.classList.add('show');
    }
    
    deleteModalClose.addEventListener('click', () => {
        deleteModal.classList.remove('show');
    });
    
    deleteModalCancel.addEventListener('click', () => {
        deleteModal.classList.remove('show');
    });
    
    deleteModalConfirm.addEventListener('click', async () => {
        const filename = deleteScenarioFilename.value;
        
        try {
            const response = await fetch(`${API_BASE_URL}/scenario/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    projectType: currentProjectType
                })
            });
            
            if (response.ok) {
                deleteModal.classList.remove('show');
                // 選択中のシナリオからも削除
                selectedScenarios = selectedScenarios.filter(f => f !== filename);
                loadSavedScenarios();
            } else {
                const errorData = await response.json();
                alert(errorData.error || '削除に失敗しました');
            }
        } catch (error) {
            console.error('削除エラー:', error);
            alert('削除に失敗しました');
        }
    });

    // ========================================
    // イベントリスナー
    // ========================================
    chatSendBtn.addEventListener('click', sendMessage);
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
    // マーカー機能（新実装）
    // ========================================
    
    // マーカーツール選択
    greenMarkerTool.addEventListener('click', () => {
        toggleMarkerTool('green');
    });
    
    redMarkerTool.addEventListener('click', () => {
        toggleMarkerTool('red');
    });
    
    function toggleMarkerTool(type) {
        if (activeMarkerTool === type) {
            activeMarkerTool = null;
            greenMarkerTool.classList.remove('active');
            redMarkerTool.classList.remove('active');
        } else {
            activeMarkerTool = type;
            greenMarkerTool.classList.toggle('active', type === 'green');
            redMarkerTool.classList.toggle('active', type === 'red');
        }
        // カーソルスタイルを変更
        scenarioDisplay.style.cursor = activeMarkerTool ? 'crosshair' : 'auto';
    }
    
    // テキスト選択時にマーカーを追加
    scenarioDisplay.addEventListener('mouseup', (e) => {
        if (!activeMarkerTool) return;
        
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // マーカーを追加
            addMarker(activeMarkerTool, selectedText, range);
            
            // 選択を解除
            selection.removeAllRanges();
        }
    });
    
    // マーカーアクションを履歴に追加
    function pushToHistory(action) {
        historyStack.push(action);
        redoStack = []; // 新しいアクション時はリドゥスタックをクリア
        updateHistoryButtons();
    }
    
    // 履歴ボタンの更新
    function updateHistoryButtons() {
        const undoBtn = document.getElementById('undoMarkerBtn');
        const redoBtn = document.getElementById('redoMarkerBtn');
        
        if (undoBtn) undoBtn.disabled = historyStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }
    
    // アンドゥ実行
    function undoMarkerAction() {
        if (historyStack.length === 0) return;
        
        const action = historyStack.pop();
        redoStack.push(action);
        
        restoreMarkerState(action, true); // true = undo direction
        updateHistoryButtons();
    }
    
    // リドゥ実行
    function redoMarkerAction() {
        if (redoStack.length === 0) return;
        
        const action = redoStack.pop();
        historyStack.push(action);
        
        restoreMarkerState(action, false); // false = redo direction
        updateHistoryButtons();
    }
    
    // 状態の復元 (Undo/Redo共通)
    function restoreMarkerState(action, isUndo) {
        if (action.type === 'add') {
            if (isUndo) {
                // 追加の取り消し = 削除
                deleteMarkerInternal(action.data.id);
            } else {
                // 追加のやり直し = 再追加
                addMarkerInternal(action.data);
            }
        } else if (action.type === 'delete') {
            if (isUndo) {
                // 削除の取り消し = 復元
                addMarkerInternal(action.data);
            } else {
                // 削除のやり直し = 再削除
                deleteMarkerInternal(action.data.id);
            }
        } else if (action.type === 'clear') {
            if (isUndo) {
                // クリアの取り消し = 全復元
                action.data.forEach(marker => addMarkerInternal(marker));
            } else {
                // クリアのやり直し = 全削除
                clearAllMarkersInternal();
            }
        }
    }
    
    // 内部的なマーカー追加（履歴操作なし）
    function addMarkerInternal(markerData) {
        // IDが既存なら上書きにならないようにチェック（通常はユニーク）
        const existing = markersList.find(m => m.id == markerData.id);
        if (existing) return;
        
        markersList.push(markerData);
        // DOMのハイライトはrestoreMarkerHighlightsで一括処理したほうが安全
        // しかし、特定の場所だけ更新するなら個別処理も可。
        // ここでは簡略化のため、再描画を呼ぶ
        
        // 再描画（ハイライト再適用）
        // 注: rangeオブジェクトは保存されていないため、テキスト検索で再適用するrestoreMarkerHighlightsを使う
        restoreMarkerHighlights(); 
        updateMarkerUI();
    }
    
    // 内部的なマーカー削除（履歴操作なし）
    function deleteMarkerInternal(markerId) {
        markersList = markersList.filter(m => m.id != markerId);
        
        // DOMからハイライトを削除
        const highlight = document.querySelector(`[data-marker-id="${markerId}"]`);
        if (highlight) {
            const text = document.createTextNode(highlight.textContent);
            highlight.parentNode.replaceChild(text, highlight);
        }
        
        updateMarkerUI();
    }
    
    // 内部的な全クリア
    function clearAllMarkersInternal() {
        // DOMからすべてのハイライトを削除
        document.querySelectorAll('.marker-highlight').forEach(el => {
            const text = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(text, el);
        });
        
        markersList = [];
        updateMarkerUI();
    }

    // マーカーを追加（ユーザー操作）
    function addMarker(type, text, range) {
        const markerId = ++markerIdCounter;
        
        const markerData = {
            id: markerId,
            type: type,
            text: text,
            instruction: '',
            scenarioIndex: getCurrentScenarioIndex()
        };
        
        // テキストにハイライトを適用
        const highlight = document.createElement('span');
        highlight.className = `marker-highlight marker-${type}`;
        highlight.dataset.markerId = markerId;
        
        try {
            range.surroundContents(highlight);
        } catch (e) {
            console.warn('マーカー適用エラー:', e);
            showToast('この部分にはマーカーを引けません');
            return;
        }
        
        // マーカーリストに追加
        markersList.push(markerData);
        
        // 履歴に追加
        pushToHistory({
            type: 'add',
            data: markerData
        });
        
        updateMarkerUI();
    }
    
    // 現在のシナリオインデックスを取得
    function getCurrentScenarioIndex() {
        const project = getCurrentProject();
        if (!project || !project.content) return 0;
        const scenarios = project.content.split(/\n---\n/).filter(s => s.trim());
        return scenarios.length > 1 ? 0 : 0; // デフォルトは最初のシナリオ
    }
    
    // マーカーハイライトをDOMに再適用
    function restoreMarkerHighlights() {
        // マーカーがない場合は何もしない
        if (markersList.length === 0) return;
        
        // 各シナリオのテキストエリアを走査
        const scenarioCards = document.querySelectorAll('.scenario-card-content');
        
        markersList.forEach(marker => {
            // 各シナリオカード内でマーカーテキストを検索
            scenarioCards.forEach(card => {
                const textContent = card.innerHTML;
                
                // 既にハイライトされていないか確認
                if (textContent.includes(`data-marker-id="${marker.id}"`)) return;
                
                // テキストを検索して置換
                const escapedText = marker.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedText})(?![^<]*>)`, 'g');
                
                let found = false;
                const newContent = textContent.replace(regex, (match) => {
                    if (found) return match; // 最初のマッチのみ置換
                    found = true;
                    return `<span class="marker-highlight marker-${marker.type}" data-marker-id="${marker.id}">${match}</span>`;
                });
                
                if (found) {
                    card.innerHTML = newContent;
                }
            });
        });
    }
    
    // マーカーUIを更新
    function updateMarkerUI() {
        // カウント更新
        markerCount.textContent = markersList.length;
        
        // バッジ更新
        const badge = document.getElementById('markerPreviewBadge');
        if (badge) badge.textContent = markersList.length;
        
        // 適用ボタンの有効/無効
        if (applyMarkersBtn) applyMarkersBtn.disabled = markersList.length === 0;
        
        const applyBtn = document.getElementById('markerPreviewApplyBtn');
        if (applyBtn) applyBtn.disabled = markersList.length === 0;
        
        // プレビューリスト更新
        renderMarkerPreviewList();
    }
    
    // プレビューリストをレンダリング
    function renderMarkerPreviewList() {
        const markerPreviewTabs = document.getElementById('markerPreviewTabs');
        
        if (markersList.length === 0) {
            if (markerPreviewTabs) markerPreviewTabs.innerHTML = '';
            markerPreviewList.innerHTML = `
                <div class="marker-preview-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <p>マーカーが選択されていません</p>
                    <span>テキストを選択してマーカーを追加してください</span>
                </div>
            `;
            return;
        }
        
        // シナリオごとにグループ化
        const project = getCurrentProject();
        const scenarios = project?.content?.split(/\n---\n/).filter(s => s.trim()) || [];
        const scenarioCount = scenarios.length > 1 ? scenarios.length : 1;
        
        // タブを生成
        if (markerPreviewTabs && scenarioCount > 1) {
            const tabsHTML = [];
            for (let i = 0; i < scenarioCount; i++) {
                const markersInScenario = markersList.filter(m => m.scenarioIndex === i);
                tabsHTML.push(`
                    <button class="marker-preview-tab active" data-scenario-index="${i}">
                        シナリオ ${i + 1}
                        <span class="marker-preview-tab-count">${markersInScenario.length}</span>
                    </button>
                `);
            }
            markerPreviewTabs.innerHTML = tabsHTML.join('');
        } else if (markerPreviewTabs) {
            markerPreviewTabs.innerHTML = '';
        }
        
        // マーカーリストを生成
        markerPreviewList.innerHTML = markersList.map((marker, idx) => `
            <div class="marker-preview-item ${marker.type}-item" data-marker-id="${marker.id}">
                <div class="marker-preview-item-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="marker-preview-type ${marker.type}">
                            <span class="marker-dot ${marker.type}"></span>
                            ${marker.type === 'green' ? '単発修正' : '永続ルール'}
                        </span>
                        ${scenarioCount > 1 ? `<span class="marker-preview-scenario">シナリオ ${(marker.scenarioIndex || 0) + 1}</span>` : ''}
                    </div>
                    <button class="marker-preview-delete" onclick="deleteMarker(${marker.id})" title="削除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="marker-preview-content">
                    <div class="marker-preview-text">${escapeHtml(marker.text)}</div>
                    <textarea
                        class="marker-preview-input"
                        placeholder="修正指示を入力（例: より柔らかい表現に変更）"
                        rows="2"
                        onchange="updateMarkerInstruction(${marker.id}, this.value)"
                    >${escapeHtml(marker.instruction)}</textarea>
                </div>
                <div class="marker-preview-item-actions">
                    <button class="marker-preview-single-apply" id="apply-btn-${marker.id}" onclick="applySingleMarker(${marker.id})">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        この修正だけ適用
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // 単一マーカーの適用をグローバルに公開
    window.applySingleMarker = async function(markerId) {
        const marker = markersList.find(m => m.id === markerId);
        if (!marker) return;
        
        if (!marker.instruction.trim()) {
            showToast('修正指示を入力してください');
            return;
        }
        
        const project = getCurrentProject();
        if (!project || !project.content) return;
        
        // ボタンをローディング状態に
        const btn = document.getElementById(`apply-btn-${markerId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <div class="thinking-dots" style="transform: scale(0.4);">
                    <span></span><span></span><span></span>
                </div>
            `;
        }
        
        try {
            // 永続フィードバックがある場合は取得
            let feedbackRules = [];
            try {
                feedbackRules = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
            } catch (e) {}
            
            // 赤マーカーなら永続ルールに追加
            if (marker.type === 'red') {
                const newRule = {
                    selectedText: marker.text,
                    instruction: marker.instruction,
                    createdAt: new Date().toISOString()
                };
                feedbackRules.push(newRule);
                localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbackRules));
            }
            
            // API呼び出し
            const response = await fetch(`${API_BASE_URL}/scenario/correct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalContent: project.content,
                    selectedText: marker.text,
                    instruction: marker.instruction,
                    markerType: marker.type,
                    feedbackRules: marker.type === 'green' ? feedbackRules : []
                })
            });
            
            if (!response.ok) {
                throw new Error('API error');
            }
            
            const data = await response.json();
            
            if (data.correctedContent) {
                // シナリオ更新
                project.content = data.correctedContent;
                renderScenarioContent(project.content);
                saveToLocalStorage();
                
                // マーカー削除
                deleteMarker(markerId);
                
                showToast('修正を適用しました');
            }
        } catch (error) {
            console.error('修正エラー:', error);
            showToast('修正の適用に失敗しました');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    この修正だけ適用
                `;
            }
        }
    };
    
    // マーカー削除をグローバルに公開
    window.deleteMarker = function(markerId) {
        console.log('deleteMarker called with:', markerId, typeof markerId);
        // ID比較を緩くする（文字列・数値の不一致防止）
        const marker = markersList.find(m => m.id == markerId);
        
        if (!marker) {
            console.warn('Marker not found for deletion:', markerId);
            return;
        }
        
        // 履歴に追加
        pushToHistory({
            type: 'delete',
            data: marker
        });
        
        // 内部的削除を実行
        deleteMarkerInternal(markerId);
    };
    
    // マーカー指示更新をグローバルに公開
    window.updateMarkerInstruction = function(markerId, instruction) {
        const marker = markersList.find(m => m.id === markerId);
        if (marker) {
            marker.instruction = instruction;
        }
    };
    
    // プレビューパネル表示/非表示（スライドイン）
    previewMarkerTool.addEventListener('click', () => {
        const isVisible = markerPreviewPanel.classList.contains('show');
        if (isVisible) {
            markerPreviewPanel.classList.remove('show');
        } else {
            markerPreviewPanel.classList.add('show');
            renderMarkerPreviewList();
        }
    });
    
    markerPreviewClose.addEventListener('click', () => {
        markerPreviewPanel.classList.remove('show');
    });
    
    // マーカークリア
    clearMarkersBtn.addEventListener('click', () => {
        clearAllMarkers();
    });
    
    // パネル内のクリアボタン
    document.getElementById('markerPreviewClearBtn')?.addEventListener('click', () => {
        clearAllMarkers();
    });
    
    function clearAllMarkers() {
        if (markersList.length === 0) return;
        
        if (confirm('すべてのマーカーをクリアしますか？')) {
            // 履歴に追加
            pushToHistory({
                type: 'clear',
                data: [...markersList] // コピーを保存
            });
            
            clearAllMarkersInternal();
            
            markerPreviewPanel.classList.remove('show');
            showToast('マーカーをクリアしました');
        }
    }
    
    // アンドゥ・リドゥボタンのイベント（削除済みのため、要素が存在する場合のみ設定）
    document.getElementById('undoMarkerBtn')?.addEventListener('click', undoMarkerAction);
    document.getElementById('redoMarkerBtn')?.addEventListener('click', redoMarkerAction);
    
    // キーボードショートカット (Ctrl+Z / Cmd+Z)
    window.addEventListener('keydown', (e) => {
        // 入力フォームやテキストエリアでは無効化（ただし、シナリオ表示エリアは除く）
        const activeTag = document.activeElement.tagName.toLowerCase();
        const isInput = activeTag === 'input' || activeTag === 'textarea';
        const isContentEditable = document.activeElement.isContentEditable;
        
        // マーカープレビューの入力欄などでアンドゥしたい場合はデフォルトの挙動を優先
        if (isInput) return;
        
        // シナリオ本文の編集エリア（contenteditable）にいる場合
        // テキスト編集のUndo/Redoと衝突する可能性があるが、
        // マーカーモード中（ツール選択中）または履歴がある場合はマーカーUndoを優先するか検討
        // ここでは「履歴スタックにアクションがあり、かつマーカーツールがアクティブ」な場合はマーカーUndoを優先する
        // あるいはシンプルに Cmd+Z で履歴があれば実行する
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            if (e.shiftKey) {
                // Redo (Ctrl+Shift+Z)
                e.preventDefault();
                redoMarkerAction();
            } else {
                // Undo (Ctrl+Z)
                e.preventDefault();
                undoMarkerAction();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            // Redo (Ctrl+Y)
            e.preventDefault();
            redoMarkerAction();
        }
    });
    
    // 修正を適用（ヘッダーのボタン - 削除済みのため条件付き）
    applyMarkersBtn?.addEventListener('click', async () => {
        await applyMarkerCorrections();
    });
    
    // パネル内の適用ボタン
    document.getElementById('markerPreviewApplyBtn')?.addEventListener('click', async () => {
        await applyMarkerCorrections();
    });
    
    async function applyMarkerCorrections() {
        if (markersList.length === 0) return;
        
        // 指示が入力されていないマーカーをチェック
        const emptyMarkers = markersList.filter(m => !m.instruction.trim());
        if (emptyMarkers.length > 0) {
            showToast('すべてのマーカーに修正指示を入力してください');
            markerPreviewPanel.classList.add('show');
            return;
        }
        
        await executeAllMarkerCorrections();
    }
    
    // 全てのマーカー修正を実行（内部処理、チャット非表示）
    async function executeAllMarkerCorrections() {
        const project = getCurrentProject();
        if (!project || !project.content) return;
        
        isProcessing = true;
        if (applyMarkersBtn) {
            applyMarkersBtn.disabled = true;
            applyMarkersBtn.innerHTML = `
            <div class="thinking-dots" style="transform: scale(0.6);">
                <span></span><span></span><span></span>
            </div>
            <span>...</span>
        `;
        }
        
        try {
            // 永続フィードバックを取得
            let feedbackRules = [];
            try {
                feedbackRules = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
            } catch (e) {}
            
            // 赤マーカーの指示を永続ルールに保存
            markersList.filter(m => m.type === 'red').forEach(marker => {
                feedbackRules.push({
                    selectedText: marker.text,
                    instruction: marker.instruction,
                    createdAt: new Date().toISOString()
                });
            });
            localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbackRules));
            
            // 全修正を一括でAPIに送信
            const corrections = markersList.map(m => ({
                selectedText: m.text,
                instruction: m.instruction,
                type: m.type
            }));
            
            const response = await fetch(`${API_BASE_URL}/scenario/correct-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalContent: project.content,
                    corrections: corrections,
                    feedbackRules: feedbackRules
                })
            });
            
            if (!response.ok) {
                // batch APIがない場合は個別に実行
                let currentContent = project.content;
                
                for (const marker of markersList) {
                    const resp = await fetch(`${API_BASE_URL}/scenario/correct`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            originalContent: currentContent,
                            selectedText: marker.text,
                            instruction: marker.instruction,
                            markerType: marker.type,
                            feedbackRules: marker.type === 'green' ? feedbackRules : []
                        })
                    });
                    
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.correctedContent) {
                            currentContent = data.correctedContent;
                        }
                    }
                }
                
                project.content = currentContent;
            } else {
                const data = await response.json();
                if (data.correctedContent) {
                    project.content = data.correctedContent;
                }
            }
            
            // マーカーをクリアして再描画
            markersList = [];
            updateMarkerUI();
            renderScenarioContent(project.content);
            saveToLocalStorage();
            
            // ツール選択を解除
            activeMarkerTool = null;
            greenMarkerTool.classList.remove('active');
            redMarkerTool.classList.remove('active');
            scenarioDisplay.style.cursor = 'auto';
            
            // プレビューパネルを閉じる
            markerPreviewPanel.style.display = 'none';
            
            showToast('適用しました');
            
        } catch (error) {
            console.error('修正エラー:', error);
            showToast('修正中にエラーが発生しました');
        } finally {
            isProcessing = false;
        if (applyMarkersBtn) {
            applyMarkersBtn.disabled = markersList.length === 0;
            applyMarkersBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>適用</span>
            `;
        }
        }
    }
    
    // 永続修正ルールを保存
    function saveFeedback(selectedText, instruction) {
        try {
            const feedbackData = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
            feedbackData.push({
                selectedText: selectedText,
                instruction: instruction,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbackData));
        } catch (error) {
            console.error('フィードバック保存エラー:', error);
        }
    }

    // ========================================
    // ユーティリティ
    // ========================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 親フレームからのメッセージを受信
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'switchProject') {
            if (event.data.restore) {
                restoreProject(event.data.projectId);
            } else {
                switchProject(event.data.projectId);
            }
        } else if (event.data && event.data.type === 'deleteFromHistory') {
            deleteFromHistory(event.data.projectId, event.data.isDeleted);
        }
    });
    
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
    
    function deleteFromHistory(projectId, isDeleted) {
        if (isDeleted) {
            const idx = deletedProjects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                deletedProjects.splice(idx, 1);
            }
        } else {
            const idx = projects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                if (projects.length === 1) return;
                
                const project = projects[idx];
                project.deletedAt = new Date().toISOString();
                deletedProjects.unshift(project);
                projects.splice(idx, 1);
                
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

    // 初期化実行
    init();
});

/**
 * 仕事用ツール - メインアプリケーション
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
    const toolFrame = document.getElementById('toolFrame');
    const navLinks = document.querySelectorAll('.nav-link');

    // サイドバー開閉
    function toggleSidebar(collapsed) {
        if (collapsed) {
            sidebar.classList.add('collapsed');
            sidebarOpenBtn.classList.add('visible');
        } else {
            sidebar.classList.remove('collapsed');
            sidebarOpenBtn.classList.remove('visible');
        }
    }

    sidebarToggle.addEventListener('click', () => {
        toggleSidebar(true);
    });

    sidebarOpenBtn.addEventListener('click', () => {
        toggleSidebar(false);
    });

    const toolPaths = {
        banner: 'tools/banner/banner.html',
        scenario: 'tools/scenario/scenario.html'
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const toolName = e.currentTarget.dataset.tool;
            
            if (e.currentTarget.disabled) return;

            // アクティブ状態を更新
            navLinks.forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // iframeのソースを変更
            if (toolPaths[toolName]) {
                toolFrame.src = toolPaths[toolName];
            }
            
            // ドロップダウンを閉じる
            document.querySelectorAll('.nav-item.has-dropdown.open').forEach(item => {
                item.classList.remove('open');
            });
        });
    });
    
    // ドロップダウントグルボタン
    document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const toolName = e.currentTarget.dataset.tool;
            const navItem = e.currentTarget.closest('.nav-item');
            
            // 他のドロップダウンを閉じる
            document.querySelectorAll('.nav-item.has-dropdown.open').forEach(item => {
                if (item !== navItem) {
                    item.classList.remove('open');
                }
            });
            
            navItem.classList.toggle('open');
            loadProjectHistory(toolName);
        });
    });
    
    // プロジェクト履歴を読み込み
    function loadProjectHistory(toolName) {
        let storageKey, listElement;
        
        if (toolName === 'banner') {
            storageKey = 'banner_projects';
            listElement = document.getElementById('bannerProjectList');
        } else if (toolName === 'scenario') {
            storageKey = 'scenario_projects';
            listElement = document.getElementById('scenarioProjectList');
        } else {
            return;
        }
        
        if (!storageKey || !listElement) return;
        
        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const data = JSON.parse(savedData);
                const projects = data.projects || [];
                const deletedProjects = data.deletedProjects || [];
                const currentProjectId = data.currentProjectId;
                
                const allItems = [
                    ...projects.map(p => ({ ...p, isActive: p.id === currentProjectId, isDeleted: false })),
                    ...deletedProjects.map(p => ({ ...p, isActive: false, isDeleted: true }))
                ];
                
                if (allItems.length === 0) {
                    listElement.innerHTML = '<div class="dropdown-empty">履歴がありません</div>';
                    return;
                }
                
                listElement.innerHTML = allItems.map(p => `
                    <div class="dropdown-item ${p.isActive ? 'active' : ''} ${p.isDeleted ? 'deleted' : ''}"
                         data-project-id="${p.id}" data-deleted="${p.isDeleted}">
                        <span class="dropdown-item-name">${escapeHtml(p.name)}</span>
                        <button class="dropdown-item-delete" data-project-id="${p.id}" data-deleted="${p.isDeleted}" title="履歴から削除">×</button>
                    </div>
                `).join('');
                
                // クリックイベント（項目選択）
                listElement.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        // 削除ボタンをクリックした場合は無視
                        if (e.target.classList.contains('dropdown-item-delete')) return;
                        
                        e.stopPropagation();
                        const projectId = parseInt(item.dataset.projectId);
                        const isDeleted = item.dataset.deleted === 'true';
                        
                        // iframeにメッセージを送信
                        toolFrame.contentWindow.postMessage({
                            type: 'switchProject',
                            projectId: projectId,
                            restore: isDeleted
                        }, '*');
                        
                        // ドロップダウンを閉じる
                        document.querySelector('.nav-item.has-dropdown').classList.remove('open');
                    });
                });
                
                // 削除ボタンのクリックイベント
                listElement.querySelectorAll('.dropdown-item-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const projectId = parseInt(btn.dataset.projectId);
                        const isDeleted = btn.dataset.deleted === 'true';
                        
                        // iframeにメッセージを送信
                        toolFrame.contentWindow.postMessage({
                            type: 'deleteFromHistory',
                            projectId: projectId,
                            isDeleted: isDeleted
                        }, '*');
                        
                        // 項目を即座に非表示
                        btn.closest('.dropdown-item').remove();
                    });
                });
            } else {
                listElement.innerHTML = '<div class="dropdown-empty">履歴がありません</div>';
            }
        } catch (error) {
            console.error('履歴読み込みエラー:', error);
            listElement.innerHTML = '<div class="dropdown-empty">読み込みエラー</div>';
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + \ でサイドバートグル
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
            e.preventDefault();
            const isCollapsed = sidebar.classList.contains('collapsed');
            toggleSidebar(!isCollapsed);
        }
    });
});

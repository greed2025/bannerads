/**
 * LP Builder - タブ管理モジュール
 * 
 * 複数LPプロジェクトをタブで管理する機能を提供
 */

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.MAX_TABS = 5;
    }
    
    /**
     * 新規タブを作成
     * @param {string} name - タブ名
     * @param {string} projectId - プロジェクトID（オプション）
     * @returns {Object|null} 作成されたタブ、または最大数超過時はnull
     */
    createTab(name, projectId = null) {
        // 最大タブ数チェック
        if (this.tabs.length >= this.MAX_TABS) {
            return null;
        }
        
        const tab = {
            id: this._generateId(),
            name: name,
            projectId: projectId,
            isDirty: false
        };
        
        this.tabs.push(tab);
        this.activeTabId = tab.id;
        
        return tab;
    }
    
    /**
     * 全タブを取得
     * @returns {Array} タブ配列
     */
    getTabs() {
        return this.tabs;
    }
    
    /**
     * アクティブタブIDを取得
     * @returns {string|null} アクティブタブID
     */
    getActiveTabId() {
        return this.activeTabId;
    }
    
    /**
     * タブを閉じる
     * @param {string} tabId - 閉じるタブのID
     * @returns {boolean} 成功時true
     */
    closeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) {
            return false;
        }
        
        // タブを削除
        this.tabs.splice(index, 1);
        
        // 最後のタブだった場合は新規作成
        if (this.tabs.length === 0) {
            this.createTab('新規LP');
        }
        
        // アクティブタブが閉じられた場合、隣のタブをアクティブに
        if (this.activeTabId === tabId) {
            const newIndex = Math.min(index, this.tabs.length - 1);
            this.activeTabId = this.tabs[newIndex]?.id || null;
        }
        
        return true;
    }
    
    /**
     * タブを切り替える
     * @param {string} tabId - 切り替え先タブのID
     * @returns {boolean} 成功時true
     */
    switchTab(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) {
            return false;
        }
        this.activeTabId = tabId;
        return true;
    }
    
    /**
     * タブ状態をシリアライズ（LocalStorage保存用）
     * @returns {Object} シリアライズされたタブ状態
     */
    serialize() {
        return {
            tabs: this.tabs.map(t => ({
                id: t.id,
                name: t.name,
                projectId: t.projectId
            })),
            activeTabId: this.activeTabId
        };
    }
    
    /**
     * タブ状態をデシリアライズ（LocalStorage復元用）
     * @param {Object} data - シリアライズされたデータ
     */
    deserialize(data) {
        if (!data || !data.tabs) return;
        
        this.tabs = data.tabs.map(t => ({
            id: t.id,
            name: t.name,
            projectId: t.projectId,
            isDirty: false
        }));
        this.activeTabId = data.activeTabId || (this.tabs[0]?.id || null);
    }
    
    /**
     * UUID生成
     * @private
     */
    _generateId() {
        return 'tab-' + Math.random().toString(36).substring(2, 11);
    }
}

// CommonJS / ESModule両対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TabManager };
}

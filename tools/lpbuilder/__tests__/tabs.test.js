/**
 * LP Builder タブ管理機能 テスト
 * 
 * テスト実行: 
 *   node --experimental-vm-modules node_modules/jest/bin/jest.js tools/lpbuilder/__tests__/tabs.test.js
 * 
 * または単純に:
 *   cd tools/lpbuilder && node __tests__/tabs.test.js
 */

// テスト対象のモジュール（まだ存在しない）
// const { TabManager } = require('../tabManager.js');

// 簡易テストランナー（Node.js単体実行用）
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`❌ FAILED: ${message}`);
    }
    console.log(`✅ PASSED: ${message}`);
};

const describe = (name, fn) => {
    console.log(`\n📦 ${name}`);
    fn();
};

const it = (name, fn) => {
    try {
        fn();
    } catch (e) {
        console.error(`  ❌ ${name}`);
        console.error(`     ${e.message}`);
        process.exitCode = 1;
        return;
    }
    console.log(`  ✅ ${name}`);
};

// ========================================
// テストケース
// ========================================

describe('TabManager', () => {
    
    it('新規タブを作成すると、タブが1個追加される', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        
        // Act
        const tab = manager.createTab('新規LP');
        
        // Assert
        assert(manager.getTabs().length === 1, 'タブ数は1であるべき');
        assert(tab.name === '新規LP', 'タブ名は"新規LP"であるべき');
        assert(tab.id !== undefined, 'タブにはIDがあるべき');
    });
    
    it('新規タブを作成すると、そのタブがアクティブになる', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        
        // Act
        const tab = manager.createTab('新規LP');
        
        // Assert
        assert(manager.getActiveTabId() === tab.id, 'アクティブタブIDは作成したタブのIDであるべき');
    });
    
    it('最大5タブまで作成可能、6つ目はnullを返す', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        
        // Act - 5タブ作成
        for (let i = 1; i <= 5; i++) {
            manager.createTab(`LP${i}`);
        }
        
        // 6つ目を作成
        const sixthTab = manager.createTab('LP6');
        
        // Assert
        assert(manager.getTabs().length === 5, 'タブ数は5であるべき');
        assert(sixthTab === null, '6つ目のタブはnullであるべき');
    });
    
    it('タブを閉じるとタブ数が減る', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        const tab1 = manager.createTab('LP1');
        const tab2 = manager.createTab('LP2');
        
        // Act
        const result = manager.closeTab(tab1.id);
        
        // Assert
        assert(result === true, 'closeTabはtrueを返すべき');
        assert(manager.getTabs().length === 1, 'タブ数は1であるべき');
        assert(manager.getTabs()[0].id === tab2.id, '残っているタブはtab2であるべき');
    });
    
    it('最後のタブを閉じると新規タブが自動作成される', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        const tab = manager.createTab('LP1');
        
        // Act
        manager.closeTab(tab.id);
        
        // Assert
        assert(manager.getTabs().length === 1, 'タブ数は1であるべき（新規が自動作成）');
        assert(manager.getTabs()[0].id !== tab.id, '新しいタブが作成されているべき');
    });
    
    it('タブを切り替えるとアクティブタブが変わる', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        const tab1 = manager.createTab('LP1');
        const tab2 = manager.createTab('LP2');
        
        // Act
        manager.switchTab(tab1.id);
        
        // Assert
        assert(manager.getActiveTabId() === tab1.id, 'アクティブタブはtab1であるべき');
    });
    
    it('タブ状態をシリアライズ・デシリアライズできる', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        manager.createTab('LP1', 'project-1');
        manager.createTab('LP2', 'project-2');
        
        // Act
        const serialized = manager.serialize();
        const newManager = new TabManager();
        newManager.deserialize(serialized);
        
        // Assert
        assert(newManager.getTabs().length === 2, 'タブ数は2であるべき');
        assert(newManager.getTabs()[0].name === 'LP1', '1番目のタブ名はLP1');
        assert(newManager.getTabs()[1].projectId === 'project-2', '2番目のprojectIdはproject-2');
    });
    
    it('projectIdでタブを検索できる', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        manager.createTab('LP1', 'project-1');
        const tab2 = manager.createTab('LP2', 'project-2');
        
        // Act
        const found = manager.findTabByProjectId('project-2');
        const notFound = manager.findTabByProjectId('project-999');
        
        // Assert
        assert(found !== null, 'project-2のタブが見つかるべき');
        assert(found.id === tab2.id, '見つかったタブはtab2であるべき');
        assert(notFound === null, '存在しないprojectIdはnullを返すべき');
    });
    
    it('タブ名を変更できる', () => {
        // Arrange
        const { TabManager } = require('../tabManager.js');
        const manager = new TabManager();
        const tab = manager.createTab('古い名前');
        
        // Act
        const result = manager.renameTab(tab.id, '新しい名前');
        
        // Assert
        assert(result === true, 'renameTabはtrueを返すべき');
        assert(manager.getTabs()[0].name === '新しい名前', 'タブ名が変更されているべき');
    });

});

console.log('\n✨ テスト完了');

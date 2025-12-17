/**
 * ファイルリポジトリモジュール
 * ファイルシステムI/O（fs.promises使用）
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { config } = require('../config');

// キャッシュ
const cache = {
    knowledge: new Map(),
    skills: new Map(),
    writingStyle: null,
};

/**
 * ナレッジファイル読み込み（キャッシュ付き）
 */
async function loadKnowledge(projectType) {
    if (cache.knowledge.has(projectType)) {
        return cache.knowledge.get(projectType);
    }
    
    const knowledgePath = path.join(config.paths.knowledge, `${projectType}.md`);
    try {
        const content = await fs.readFile(knowledgePath, 'utf-8');
        cache.knowledge.set(projectType, content);
        return content;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('ナレッジファイル読み込みエラー:', error);
        }
        return '';
    }
}

/**
 * ライティングスタイル読み込み（CLAUDE.md）キャッシュ付き
 */
async function loadWritingStyle() {
    if (cache.writingStyle !== null) {
        return cache.writingStyle;
    }
    
    const stylePath = path.join(config.paths.server, 'CLAUDE.md');
    try {
        const content = await fs.readFile(stylePath, 'utf-8');
        cache.writingStyle = content;
        return content;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('CLAUDE.md読み込みエラー:', error);
        }
        cache.writingStyle = '';
        return '';
    }
}

/**
 * スキルファイル読み込み（案件別NG表現など）キャッシュ付き
 */
async function loadSkills(projectType) {
    if (cache.skills.has(projectType)) {
        return cache.skills.get(projectType);
    }
    
    const skillPath = path.join(config.paths.skills, `${projectType}.md`);
    try {
        const content = await fs.readFile(skillPath, 'utf-8');
        cache.skills.set(projectType, content);
        return content;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('スキルファイル読み込みエラー:', error);
        }
        return '';
    }
}

/**
 * ファイル名をサニタイズ
 */
function sanitizeFilename(filename) {
    return filename.replace(/[\/\\:*?"<>|]/g, '_');
}

/**
 * ディレクトリ確認・作成
 */
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * ファイル存在確認（同期版 - 既存コードとの互換性）
 */
function existsSync(filePath) {
    return fsSync.existsSync(filePath);
}

/**
 * JSONファイル読み込み
 */
async function readJson(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

/**
 * JSONファイル書き込み
 */
async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * テキストファイル読み込み
 */
async function readText(filePath) {
    return await fs.readFile(filePath, 'utf-8');
}

/**
 * テキストファイル書き込み
 */
async function writeText(filePath, content) {
    await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * ファイル削除
 */
async function deleteFile(filePath) {
    await fs.unlink(filePath);
}

/**
 * ディレクトリ内のファイル一覧
 */
async function listFiles(dirPath, extension = null) {
    try {
        const files = await fs.readdir(dirPath);
        if (extension) {
            return files.filter(f => f.endsWith(extension));
        }
        return files;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * キャッシュクリア（開発用）
 */
function clearCache() {
    cache.knowledge.clear();
    cache.skills.clear();
    cache.writingStyle = null;
}

module.exports = {
    // ナレッジ/スキル読み込み
    loadKnowledge,
    loadWritingStyle,
    loadSkills,
    
    // ファイル操作
    sanitizeFilename,
    ensureDir,
    existsSync,
    readJson,
    writeJson,
    readText,
    writeText,
    deleteFile,
    listFiles,
    
    // キャッシュ
    clearCache,
};

/**
 * 設定管理モジュール
 * 環境変数の読み込みと検証
 */

const path = require('path');
const dotenv = require('dotenv');

// 環境変数読み込み（プロジェクトルートの.envを読み込む）
const envPath = path.resolve(__dirname, '../../../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.warn('⚠️ .envファイルが見つかりません:', envPath);
}

/**
 * APIキーのバリデーション
 */
function validateApiKey(key, name) {
    if (!key) {
        console.warn(`⚠️ ${name} が設定されていません`);
        return false;
    }
    if (key.startsWith('your_') || key.includes('_here')) {
        console.warn(`⚠️ ${name} がプレースホルダーのままです`);
        return false;
    }
    return true;
}

// 設定オブジェクト
const config = {
    // サーバー設定
    port: process.env.PORT || 3000,
    
    // モデル設定
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    
    // APIキー
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    
    // APIキーの有効性
    hasAnthropicKey: validateApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
    hasOpenaiKey: validateApiKey(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY'),
    hasGeminiKey: validateApiKey(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY'),
    
    // パス設定
    paths: {
        root: path.resolve(__dirname, '../../..'), // プロジェクトルート（serverの親）
        server: path.resolve(__dirname, '../..'),
        knowledge: path.resolve(__dirname, '../../knowledge'),
        skills: path.resolve(__dirname, '../../skills'),
        banners: path.resolve(__dirname, '../../banners'),
        scenarios: path.resolve(__dirname, '../../scenarios'),
        uploads: path.resolve(__dirname, '../../uploads'),
    },
    
    // リクエスト制限
    jsonLimit: '50mb',
    uploadLimit: 100 * 1024 * 1024, // 100MB
};

module.exports = {
    config,
    validateApiKey,
};

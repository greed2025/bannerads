/**
 * 仕事用ツール - AIバックエンドサーバー
 * リファクタリング版 - モジュール分割構成
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

// 設定読み込み
const { config } = require('./config');

// ルーターインポート
const chatRoutes = require('./routes/chat');
const scenarioRoutes = require('./routes/scenario');

// ミドルウェアインポート
const { errorHandler, requestLogger } = require('./middleware/errorHandler');

// サービスから状態取得（ログ出力のため）
const { getClientStatus, generateTextWithGemini, generateImageWithGemini } = require('./services/llm');

// Expressアプリ初期化
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: config.jsonLimit }));
// app.use(requestLogger); // 必要に応じて有効化

// アップロードディレクトリの事前作成
const { ensureDir } = require('./repositories/file');
(async () => {
    await ensureDir(config.paths.uploads);
})();

// 静的ファイル配信（必要なパスのみ - server/以下は含めない）
app.use('/tools', express.static(path.join(config.paths.root, 'tools')));
app.use('/css', express.static(path.join(config.paths.root, 'css')));
app.use('/js', express.static(path.join(config.paths.root, 'js')));
// ルートへのアクセスはindex.htmlのみ
app.get('/', (req, res) => {
    res.sendFile(path.join(config.paths.root, 'index.html'));
});

// APIルート登録（重複なし）
app.use('/api/chat', chatRoutes);
app.use('/api/scenario', scenarioRoutes);

// ヘルスチェック（/api直下に配置）
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        apis: getClientStatus()
    });
});

// Mixboard ツールへのショートカット
app.get('/mixboard', (req, res) => {
    res.sendFile(path.join(config.paths.root, 'tools/mixboard/mixboard.html'));
});

const IMAGE_ASPECT_RATIOS = [
    { label: '1:1', value: 1 },
    { label: '2:3', value: 2 / 3 },
    { label: '3:2', value: 3 / 2 },
    { label: '3:4', value: 3 / 4 },
    { label: '4:3', value: 4 / 3 },
    { label: '9:16', value: 9 / 16 },
    { label: '16:9', value: 16 / 9 },
    { label: '21:9', value: 21 / 9 }
];

function buildImageConfig(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    
    const ratio = width / height;
    let best = IMAGE_ASPECT_RATIOS[0];
    let bestDiff = Math.abs(ratio - best.value);
    
    for (const candidate of IMAGE_ASPECT_RATIOS.slice(1)) {
        const diff = Math.abs(ratio - candidate.value);
        if (diff < bestDiff) {
            best = candidate;
            bestDiff = diff;
        }
    }
    
    const maxDim = Math.max(width, height);
    let imageSize = '1K';
    if (maxDim > 2048) {
        imageSize = '4K';
    } else if (maxDim > 1024) {
        imageSize = '2K';
    }
    
    return {
        aspectRatio: best.label,
        imageSize: imageSize
    };
}

// Mixboard専用 画像生成API（直接Geminiで生成）
app.post('/api/mixboard/generate', async (req, res) => {
    try {
        const clientStatus = getClientStatus();
        if (!clientStatus.gemini) {
            return res.status(400).json({ 
                error: 'Gemini APIが初期化されていません',
                message: 'GEMINI_API_KEYを.envに設定してください'
            });
        }
        
        const { prompt, images = [], count = 1, width, height } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'promptが必要です' });
        }
        
        const parsedWidth = Number(width);
        const parsedHeight = Number(height);
        const imageConfig = buildImageConfig(parsedWidth, parsedHeight);
        
        console.log(`🎨 Mixboard生成リクエスト: "${prompt.substring(0, 50)}...", 参考画像: ${images.length}枚`);
        
        const generatedImages = await generateImageWithGemini(prompt, count, images, imageConfig);
        
        res.json({
            success: true,
            generatedImages: generatedImages,
            message: `${generatedImages.length}枚の画像を生成しました`
        });
        
    } catch (error) {
        console.error('Mixboard Generate Error:', error);
        res.status(500).json({
            error: '画像生成エラー',
            message: error.message
        });
    }
});

// Gemini APIテスト
app.post('/api/test/gemini', async (req, res) => {
    try {
        const { prompt = 'こんにちは！簡単に自己紹介してください。' } = req.body;
        
        const clientStatus = getClientStatus();
        if (!clientStatus.gemini) {
            return res.status(400).json({ 
                error: 'Gemini APIが初期化されていません',
                message: 'GEMINI_API_KEYを.envに設定してください'
            });
        }
        
        const response = await generateTextWithGemini(prompt);
        
        res.json({
            success: true,
            model: 'gemini-2.5-flash-preview-05-20',
            prompt: prompt,
            response: response
        });
        
    } catch (error) {
        console.error('Gemini Test Error:', error);
        res.status(500).json({
            error: 'Gemini APIエラー',
            message: error.message
        });
    }
});

// エラーハンドリング
app.use(errorHandler);

// サーバー起動
app.listen(config.port, () => {
    console.log(`🚀 Work Tools Server running on http://localhost:${config.port}`);
    console.log(`📝 API endpoints:`);
    console.log(`   POST /api/chat - Chat with Claude`);
    console.log(`   POST /api/scenario/chat - Chat with Claude (Scenario)`);
    console.log(`   POST /api/scenario/transcribe - Transcribe video`);
    console.log(`   GET  /api/scenario/list - List saved scenarios`);
    console.log(`   GET  /api/health - Health check`);
    
    const status = getClientStatus();
    console.log(`\n📊 API Status:`);
    console.log(`   Claude: ${status.claude ? '✅' : '❌'}`);
    console.log(`   OpenAI: ${status.openai ? '✅' : '❌'}`);
    console.log(`   Gemini: ${status.gemini ? '✅' : '❌'}`);
});

module.exports = app;

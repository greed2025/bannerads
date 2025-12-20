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
const lpRoutes = require('./routes/lp');

// ミドルウェアインポート
const { errorHandler, requestLogger } = require('./middleware/errorHandler');

// サービスから状態取得（ログ出力のため）
const { getClientStatus, generateTextWithGemini, generateTextWithClaude, generateImageWithGemini } = require('./services/llm');

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

// APIルート登録
app.use('/api/chat', chatRoutes);
app.use('/api/scenario', scenarioRoutes);
app.use('/api/lp', lpRoutes);

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

// LP Builder ツールへのショートカット
app.get('/lpbuilder', (req, res) => {
    res.sendFile(path.join(config.paths.root, 'tools/lpbuilder/lpbuilder.html'));
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

// ========================================
// LP Builder API
// ========================================

// LP Builder - 要素修正API
app.post('/api/lp/modify-element', async (req, res) => {
    try {
        const clientStatus = getClientStatus();
        if (!clientStatus.claude && !clientStatus.gemini) {
            return res.status(400).json({ 
                error: 'AIクライアントが初期化されていません',
                message: 'API KEYを.envに設定してください'
            });
        }
        
        const { elementHtml, instruction, fullHtml } = req.body;
        
        if (!elementHtml || !instruction) {
            return res.status(400).json({ error: 'elementHtmlとinstructionが必要です' });
        }
        
        console.log(`📝 LP要素修正: "${instruction.substring(0, 50)}..."`);
        
        const prompt = `あなたはHTML/CSSの専門家です。以下のHTMLの一部を修正してください。

## 修正対象の要素
\`\`\`html
${elementHtml}
\`\`\`

## 修正指示
${instruction}

## 全体HTML（参考）
\`\`\`html
${fullHtml.substring(0, 3000)}${fullHtml.length > 3000 ? '...(省略)' : ''}
\`\`\`

## 出力形式
修正後の全体HTMLのみを出力してください。修正対象の要素を修正指示に従って変更し、全体HTMLに適用した結果を返してください。コードブロックや説明は不要です。HTMLのみを出力してください。`;

        let modifiedHtml;
        if (clientStatus.claude) {
            modifiedHtml = await generateTextWithClaude(prompt);
        } else {
            modifiedHtml = await generateTextWithGemini(prompt);
        }
        
        // HTMLタグを抽出（コードブロックがあれば除去）
        modifiedHtml = modifiedHtml.replace(/```html\n?/gi, '').replace(/```\n?/g, '').trim();
        
        res.json({
            success: true,
            modifiedHtml: modifiedHtml
        });
        
    } catch (error) {
        console.error('LP Modify Element Error:', error);
        res.status(500).json({
            error: '要素修正エラー',
            message: error.message
        });
    }
});

// LP Builder - コード選択修正API
app.post('/api/lp/modify-selection', async (req, res) => {
    try {
        const clientStatus = getClientStatus();
        if (!clientStatus.claude && !clientStatus.gemini) {
            return res.status(400).json({ 
                error: 'AIクライアントが初期化されていません'
            });
        }
        
        const { selectedCode, instruction, codeType } = req.body;
        
        if (!selectedCode || !instruction) {
            return res.status(400).json({ error: 'selectedCodeとinstructionが必要です' });
        }
        
        console.log(`📝 LPコード修正(${codeType}): "${instruction.substring(0, 50)}..."`);
        
        const prompt = `あなたは${codeType.toUpperCase()}の専門家です。以下のコードを修正してください。

## 修正対象のコード
\`\`\`${codeType}
${selectedCode}
\`\`\`

## 修正指示
${instruction}

## 出力形式
修正後のコードのみを出力してください。コードブロックや説明は不要です。`;

        let modifiedCode;
        if (clientStatus.claude) {
            modifiedCode = await generateTextWithClaude(prompt);
        } else {
            modifiedCode = await generateTextWithGemini(prompt);
        }
        
        // コードブロックを除去
        modifiedCode = modifiedCode.replace(/```\w*\n?/gi, '').replace(/```\n?/g, '').trim();
        
        res.json({
            success: true,
            modifiedCode: modifiedCode
        });
        
    } catch (error) {
        console.error('LP Modify Selection Error:', error);
        res.status(500).json({
            error: 'コード修正エラー',
            message: error.message
        });
    }
});

// LP Builder - 画像生成API
app.post('/api/image/generate', async (req, res) => {
    try {
        const clientStatus = getClientStatus();
        if (!clientStatus.gemini) {
            return res.status(400).json({ 
                error: 'Gemini APIが初期化されていません',
                message: 'GEMINI_API_KEYを.envに設定してください'
            });
        }
        
        const { prompt, size = '1024x1024' } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'promptが必要です' });
        }
        
        console.log(`🎨 LP画像生成: "${prompt.substring(0, 50)}..."`);
        
        // サイズをパース
        const [width, height] = size.split('x').map(Number);
        const imageConfig = buildImageConfig(width || 1024, height || 1024);
        
        const generatedImages = await generateImageWithGemini(prompt, 1, [], imageConfig);
        
        if (generatedImages.length > 0) {
            res.json({
                success: true,
                image: generatedImages[0] // Base64
            });
        } else {
            res.status(500).json({
                error: '画像生成に失敗しました'
            });
        }
        
    } catch (error) {
        console.error('Image Generate Error:', error);
        res.status(500).json({
            error: '画像生成エラー',
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

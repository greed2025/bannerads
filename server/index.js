/**
 * バナー作成ツール - AIバックエンドサーバー
 * Claude SDKで対話、Gemini Imagen（nanobanana pro）で画像生成
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const multer = require('multer');
const FormData = require('form-data');

// 環境変数読み込み（複数パスを試行）
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.warn('⚠️ .envファイルが見つかりません:', envPath);
}

// 動画アップロード用の設定
const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB制限
});

// APIキーのバリデーション
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

// リトライ付きAPI呼び出し
async function withRetry(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            const isRetryable = error.code === 'ECONNRESET' || 
                               error.code === 'ETIMEDOUT' || 
                               error.code === 'ECONNREFUSED' ||
                               error.message?.includes('Connection error');
            
            if (i === maxRetries - 1 || !isRetryable) {
                throw error;
            }
            
            console.log(`🔄 リトライ ${i + 1}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
    }
}

// ナレッジファイル読み込み
function loadKnowledge(projectType) {
    const knowledgePath = path.join(__dirname, 'knowledge', `${projectType}.md`);
    try {
        if (fs.existsSync(knowledgePath)) {
            return fs.readFileSync(knowledgePath, 'utf-8');
        }
    } catch (error) {
        console.error('ナレッジファイル読み込みエラー:', error);
    }
    return '';
}

// ライティングスタイル読み込み（CLAUDE.md）
function loadWritingStyle() {
    const stylePath = path.join(__dirname, 'CLAUDE.md');
    try {
        if (fs.existsSync(stylePath)) {
            return fs.readFileSync(stylePath, 'utf-8');
        }
    } catch (error) {
        console.error('CLAUDE.md読み込みエラー:', error);
    }
    return '';
}

// スキルファイル読み込み（案件別NG表現など）
function loadSkills(projectType) {
    const skillPath = path.join(__dirname, 'skills', `${projectType}.md`);
    try {
        if (fs.existsSync(skillPath)) {
            return fs.readFileSync(skillPath, 'utf-8');
        }
    } catch (error) {
        console.error('スキルファイル読み込みエラー:', error);
    }
    return '';
}

const app = express();
const PORT = process.env.PORT || 3000;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静的ファイル配信（必要なパスのみホワイトリスト）
// server/banners, server/uploadsは静的配信から除外しAPI経由のみでアクセス
app.use('/tools', express.static(path.join(__dirname, '../tools')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
// ルートへのアクセスはindex.htmlを返す
app.use(express.static(path.join(__dirname, '../'), { 
    index: 'index.html',
    dotfiles: 'ignore'
}));

// APIクライアント初期化（安全な初期化）
let anthropic = null;
if (validateApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY')) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('✅ Claude API クライアント初期化完了');
}

let openai = null;
if (validateApiKey(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY')) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI API クライアント初期化完了');
}

// Geminiクライアント初期化（APIキーがある場合のみ）
let gemini = null;
if (validateApiKey(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY')) {
    gemini = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    });
    console.log('✅ Gemini API クライアント初期化完了');
}

// システムプロンプト
const SYSTEM_PROMPT = `あなたは広告バナー制作のエキスパートです。ユーザーと対話しながら最適なバナー広告を作成します。

## あなたの役割
1. **参考デザインの分析**: ユーザーが選択した参考デザインを確認し、そのデザインで必要なコンテンツ要素を特定する
2. **不足情報のヒアリング**: バナー生成に必要だが未入力の情報を自然な会話で聞き出す
3. **提案と確認**: コンセプトを提案し、ユーザーの合意を得てから生成する

## 対話のガイドライン
- 参考デザインが選択されている場合、そのデザインを分析し「このデザインを参考にするなら○○の情報が必要です」と伝える
- 以下の情報が不足している場合は、自然な会話で1〜2個ずつ質問する：
  * キャッチコピー/メインメッセージ
  * CTAボタンのテキスト（必要な場合）
  * ターゲット層
  * 訴求ポイント
  * トーン（信頼感、緊急性、親しみやすさなど）
- すでにプリセットで入力されている情報は確認程度にし、重複して聞かない
- ユーザーが「作って」「生成して」など明確に依頼した場合は、不足情報があっても生成に進む

## 生成時の注意
- 十分な情報が揃ったら generate_banner_image ツールを使用してバナーを生成
- プロンプトは英語で、具体的かつ詳細に記述する
- 参考デザインの特徴（色使い、レイアウト、フォントの雰囲気）を反映する`;


// ツール定義
const tools = [
    {
        name: 'generate_banner_image',
        description: 'バナー画像を生成します。ユーザーと合意したコンセプトに基づいて画像を生成する時に使用してください。',
        input_schema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: '画像生成のためのプロンプト（英語推奨）'
                },
                style: {
                    type: 'string',
                    description: '画像のスタイル（例: modern, minimalist, vibrant, professional）'
                },
                count: {
                    type: 'number',
                    description: '生成する画像の枚数（デフォルト: 1）'
                }
            },
            required: ['prompt']
        }
    }
];

// 画像生成関数（Gemini nanobanana pro - gemini-3-pro-image-preview）
async function generateWithNanabana(prompt, size = '1024x1024', count = 1, referenceImages = []) {
    if (!gemini) {
        throw new Error('Gemini APIが初期化されていません。GEMINI_API_KEYを確認してください。');
    }
    
    const images = [];
    
    try {
        console.log(`🎨 Gemini画像生成: ${count}枚, 参考画像: ${referenceImages.length}枚, プロンプト: ${prompt.substring(0, 50)}...`);
        
        // 複数枚生成の場合は順次リクエスト
        for (let i = 0; i < count; i++) {
            // コンテンツを構築（参考画像 + プロンプト）
            const contents = [];
            
            // 参考画像がある場合は追加（最大14枚まで）
            const maxRefImages = Math.min(referenceImages.length, 14);
            for (let j = 0; j < maxRefImages; j++) {
                const imgData = referenceImages[j];
                if (imgData && imgData.startsWith('data:')) {
                    // data:image/xxx;base64,xxxxx 形式
                    const base64Data = imgData.split(',')[1];
                    const mimeType = imgData.split(';')[0].split(':')[1];
                    contents.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    });
                }
            }
            
            // テキストプロンプトを追加（日本語での生成を明示）
            const japaneseInstruction = '\n\n【重要】バナー内のテキストは必ず日本語で作成してください。英語は使用しないでください。';
            if (referenceImages.length > 0) {
                contents.push({ text: `参考画像を参考にして、以下のスタイルで新しいバナー画像を生成してください:\n\n${prompt}${japaneseInstruction}` });
            } else {
                contents.push({ text: `${prompt}${japaneseInstruction}` });
            }
            
            const response = await gemini.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: contents,
                config: {
                    responseModalities: ['Image', 'Text']
                }
            });
            
            // デバッグ: レスポンス構造を確認
            console.log('🔍 Geminiレスポンス構造:', JSON.stringify(response, null, 2).substring(0, 500));
            
            // レスポンスから画像を抽出（複数の形式に対応）
            if (response.candidates && response.candidates[0] && response.candidates[0].content) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const imageData = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        const dataUrl = `data:${mimeType};base64,${imageData}`;
                        images.push(dataUrl);
                        console.log(`📷 画像抽出成功: ${mimeType}, データ長: ${imageData.length}`);
                    }
                }
            }
            // 代替: response.partsが直接存在する場合
            if (response.parts) {
                for (const part of response.parts) {
                    if (part.inlineData) {
                        const imageData = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        const dataUrl = `data:${mimeType};base64,${imageData}`;
                        images.push(dataUrl);
                    }
                }
            }
        }
        
        console.log(`✅ ${images.length}枚の画像を生成しました`);
    } catch (error) {
        console.error('Gemini画像生成エラー:', error);
        throw error;
    }
    
    return images;
}

// Geminiテキスト生成関数
async function generateWithGemini(prompt, systemPrompt = '', images = []) {
    if (!gemini) {
        throw new Error('Gemini APIが初期化されていません。GEMINI_API_KEYを確認してください。');
    }
    
    try {
        const contents = [];
        
        // 画像がある場合はマルチモーダルコンテンツを構築
        if (images && images.length > 0) {
            for (const imgData of images) {
                if (imgData.startsWith('data:image')) {
                    const base64Data = imgData.split(',')[1];
                    const mimeType = imgData.split(';')[0].split(':')[1];
                    contents.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    });
                }
            }
        }
        
        // テキストプロンプトを追加
        contents.push({ text: prompt });
        
        // システムプロンプトがある場合
        const config = {};
        if (systemPrompt) {
            config.systemInstruction = systemPrompt;
        }
        
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash-preview-05-20',
            contents: contents,
            ...config
        });
        
        return response.text;
    } catch (error) {
        console.error('Gemini生成エラー:', error);
        throw error;
    }
}

// チャットAPI
app.post('/api/chat', async (req, res) => {
    try {
        // Claude APIが初期化されているか確認
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { message, images, conversationHistory, canvasSize, imageModel, generateCount, revisionMode, projectType, presets, selectedBanners = [] } = req.body;
        
        // ナレッジファイルを読み込み
        let knowledgeContent = '';
        if (projectType) {
            knowledgeContent = loadKnowledge(projectType);
        }
        
        // システムプロンプトを構築
        let systemPrompt = SYSTEM_PROMPT;
        if (knowledgeContent) {
            systemPrompt = `${SYSTEM_PROMPT}\n\n---\n以下は現在の案件に関するナレッジです。このナレッジを参考にして、適切なバナーを提案してください：\n\n${knowledgeContent}`;
        }
        
        // 好調バナーの情報と画像を追加
        let referenceImagesForGemini = [];  // Gemini画像生成に渡す参考画像
        let referenceImagesForClaude = [];  // Claude分析に渡す参考画像
        
        console.log('📋 受信したselectedBanners:', selectedBanners);
        console.log('📋 projectType:', projectType);
        
        if (selectedBanners && selectedBanners.length > 0) {
            let bannerInfo = '\n\n---\n【参考デザイン】\n以下の参考デザイン画像を分析してください。これらのデザインの特徴を把握し、ユーザーの要望に合わせてどのようなバナーを作成すべきか提案してください：\n';
            
            for (const bannerFilename of selectedBanners) {
                const bannerDir = path.join(__dirname, 'banners', projectType || 'debt');
                const bannerPath = path.join(bannerDir, bannerFilename);
                
                if (fs.existsSync(bannerPath)) {
                    try {
                        const bannerData = JSON.parse(fs.readFileSync(bannerPath, 'utf-8'));
                        bannerInfo += `\n### ${bannerData.name}\n`;
                        
                        // 参考画像を収集（GeminiとClaude両方用）
                        if (bannerData.image) {
                            referenceImagesForGemini.push(bannerData.image);
                            referenceImagesForClaude.push({
                                name: bannerData.name,
                                image: bannerData.image
                            });
                            console.log(`🖼️ 参考画像追加: ${bannerData.name}`);
                        }
                    } catch (e) {
                        console.error('好調バナー読み込みエラー:', bannerFilename, e);
                    }
                }
            }
            
            systemPrompt += bannerInfo;
        }
        
        // プリセット値をシステムプロンプトに追加（入力済み・未入力を明示）
        if (presets) {
            let filledInfo = '';
            let missingInfo = '';
            
            if (presets.target) {
                filledInfo += `- ターゲット: ${presets.target}\n`;
            } else {
                missingInfo += '- ターゲット（未入力）\n';
            }
            if (presets.appeal) {
                filledInfo += `- 訴求ポイント: ${presets.appeal}\n`;
            } else {
                missingInfo += '- 訴求ポイント（未入力）\n';
            }
            if (presets.tone) {
                filledInfo += `- トーン＆マナー: ${presets.tone}\n`;
            } else {
                missingInfo += '- トーン＆マナー（未入力）\n';
            }
            if (presets.details) {
                filledInfo += `- 詳細/キャッチコピー: ${presets.details}\n`;
            } else {
                missingInfo += '- 詳細/キャッチコピー（未入力）\n';
            }
            
            let presetSection = '\n\n---\n【プリセット設定の状態】\n';
            if (filledInfo) {
                presetSection += `入力済み:\n${filledInfo}`;
            }
            if (missingInfo) {
                presetSection += `\n未入力（必要に応じてヒアリングしてください）:\n${missingInfo}`;
            }
            systemPrompt += presetSection;
        }
        
        // メッセージを構築
        const userContent = [];
        
        // 参考デザイン画像がある場合は先に追加（Claudeで分析してもらう）
        if (referenceImagesForClaude && referenceImagesForClaude.length > 0) {
            for (const refImage of referenceImagesForClaude) {
                if (refImage.image && refImage.image.startsWith('data:image')) {
                    const base64Data = refImage.image.split(',')[1];
                    const mediaType = refImage.image.split(';')[0].split(':')[1];
                    userContent.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data
                        }
                    });
                }
            }
            // 参考画像の説明を追加
            const imageNames = referenceImagesForClaude.map(r => r.name).join('、');
            userContent.push({
                type: 'text',
                text: `【上記は参考デザイン画像です: ${imageNames}】\nこれらのデザインを参考に、以下の要望に応えてください：\n\n`
            });
        }
        
        // ユーザーがアップロードした画像がある場合は追加
        if (images && images.length > 0) {
            for (const imgData of images) {
                if (imgData.startsWith('data:image')) {
                    // Base64画像
                    const base64Data = imgData.split(',')[1];
                    const mediaType = imgData.split(';')[0].split(':')[1];
                    userContent.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data
                        }
                    });
                }
            }
        }
        
        userContent.push({
            type: 'text',
            text: message
        });
        
        // 会話履歴を構築
        const messages = conversationHistory || [];
        messages.push({
            role: 'user',
            content: userContent
        });
        
        // Claude APIを呼び出し
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            tools: tools,
            messages: messages
        });
        
        // レスポンスを処理
        let assistantMessage = '';
        let generatedImages = [];
        
        for (const block of response.content) {
            if (block.type === 'text') {
                assistantMessage += block.text;
            } else if (block.type === 'tool_use') {
                // ツール使用（画像生成）
                if (block.name === 'generate_banner_image') {
                    const toolInput = block.input;
                    const prompt = toolInput.prompt;
                    const count = toolInput.count || generateCount || 1;
                    
                    // 画像サイズを変換（canvasSizeに基づいて最適なサイズを選択）
                    let size = '1024x1024';  // デフォルト
                    const sizeMap = {
                        '1080x1080': '1024x1024',
                        '1080x1920': '1024x1792',
                        '1200x628': '1536x768',   // 横長
                        '300x250': '1024x1024',   // 小さいのでデフォルト
                        '728x90': '1536x768'      // 横長バナー
                    };
                    if (canvasSize && sizeMap[canvasSize]) {
                        size = sizeMap[canvasSize];
                    }
                    console.log(`📐 画像サイズ: ${canvasSize} -> ${size}`);
                    
                    // 拡張プロンプトを構築（Claudeのプロンプト + プリセット情報）
                    let enhancedPrompt = prompt;
                    
                    // プリセット情報を追加
                    if (presets) {
                        let presetPrompt = '\n\n---\n【作成条件】\n';
                        if (presets.target) presetPrompt += `ターゲット: ${presets.target}\n`;
                        if (presets.appeal) presetPrompt += `訴求ポイント: ${presets.appeal}\n`;
                        if (presets.tone) presetPrompt += `トーン: ${presets.tone}\n`;
                        if (presets.details) presetPrompt += `詳細: ${presets.details}\n`;
                        if (presetPrompt !== '\n\n---\n【作成条件】\n') {
                            enhancedPrompt += presetPrompt;
                        }
                    }
                    
                    console.log('📝 拡張プロンプト:', enhancedPrompt.substring(0, 300) + '...');
                    
                    // Gemini Imagenで画像生成（参考画像も渡す）
                    generatedImages = await generateWithNanabana(enhancedPrompt, size, count, referenceImagesForGemini);
                    
                    // ツール結果をメッセージに追加
                    messages.push({
                        role: 'assistant',
                        content: response.content
                    });
                    
                    messages.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: `${generatedImages.length}枚の画像を生成しました。`
                        }]
                    });
                    
                    // 最終レスポンスを取得
                    const finalResponse = await anthropic.messages.create({
                        model: CLAUDE_MODEL,
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: messages
                    });
                    
                    for (const finalBlock of finalResponse.content) {
                        if (finalBlock.type === 'text') {
                            assistantMessage = finalBlock.text;
                        }
                    }
                    
                    // 最終アシスタントメッセージを履歴に追加
                    messages.push({
                        role: 'assistant',
                        content: finalResponse.content
                    });
                }
            }
        }
        
        // ツール使用がなかった場合は通常のレスポンスを履歴に追加
        if (generatedImages.length === 0) {
            messages.push({
                role: 'assistant',
                content: response.content
            });
        }
        
        res.json({
            message: assistantMessage,
            generatedImages: generatedImages,
            conversationHistory: messages
        });
        
    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        apis: {
            claude: !!anthropic,
            openai: !!openai,
            gemini: !!gemini
        }
    });
});

// Mixboard ツールへのショートカット
app.get('/mixboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../tools/mixboard/mixboard.html'));
});

// Gemini APIテスト
app.post('/api/test/gemini', async (req, res) => {
    try {
        const { prompt = 'こんにちは！簡単に自己紹介してください。' } = req.body;
        
        if (!gemini) {
            return res.status(400).json({ 
                error: 'Gemini APIが初期化されていません',
                message: 'GEMINI_API_KEYを.envに設定してください'
            });
        }
        
        const response = await generateWithGemini(prompt);
        
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
// シナリオ作成ツール API
// ========================================

const SCENARIO_SYSTEM_PROMPT = `あなたはシナリオライターの専門家です。ユーザーとの対話を通じて、効果的なシナリオを作成します。

以下のルールに従ってください：
1. ユーザーの要望を丁寧にヒアリングする
2. 参考シナリオが提供された場合、そのトーンや構成を参考にする
3. シナリオは自然な会話文・ナレーション形式で作成する
4. 複数のシナリオを作成する場合は、各シナリオを「---」で区切り、番号を付ける

【重要：出力形式】
シナリオを作成した場合は、必ず以下の形式で出力してください。
<<<SCENARIO_START>>>
【シナリオ1】
本文...

---

【シナリオ2】
本文...
<<<SCENARIO_END>>>

通常の会話や説明は、このタグの外側に記述してください。
タグ内にはシナリオ本文のみを含めてください。`;

// シナリオ一覧取得
app.get('/api/scenario/list', async (req, res) => {
    try {
        const projectType = req.query.projectType || 'debt';
        const scenarioDir = path.join(__dirname, 'scenarios', projectType);
        
        if (!fs.existsSync(scenarioDir)) {
            fs.mkdirSync(scenarioDir, { recursive: true });
            return res.json([]);
        }
        
        const files = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.md'));
        const scenarios = files.map(filename => {
            const content = fs.readFileSync(path.join(scenarioDir, filename), 'utf-8');
            return {
                filename: filename,
                name: filename.replace('.md', ''),
                preview: content.substring(0, 100).replace(/\n/g, ' '),
                projectType: projectType
            };
        });
        
        res.json(scenarios);
    } catch (error) {
        console.error('Scenario list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ保存
app.post('/api/scenario/save', async (req, res) => {
    try {
        const { filename, content, projectType = 'debt' } = req.body;
        
        if (!filename || !content) {
            return res.status(400).json({ error: 'ファイル名と内容が必要です' });
        }
        
        const scenarioDir = path.join(__dirname, 'scenarios', projectType);
        if (!fs.existsSync(scenarioDir)) {
            fs.mkdirSync(scenarioDir, { recursive: true });
        }
        
        const safeName = filename.replace(/[\/\\:*?"<>|]/g, '_') + '.md';
        const filePath = path.join(scenarioDir, safeName);
        
        fs.writeFileSync(filePath, content, 'utf-8');
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Scenario save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオチャット
app.post('/api/scenario/chat', async (req, res) => {
    try {
        // Claude APIが初期化されているか確認
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { 
            message, 
            conversationHistory, 
            selectedScenarios = [], 
            projectType = 'debt',
            generationCount = 1
        } = req.body;
        
        // ライティングスタイル読み込み
        const writingStyle = loadWritingStyle();
        
        // スキルファイル読み込み
        const skills = loadSkills(projectType);
        
        // 参考シナリオを読み込み
        let referenceScenarios = '';
        if (selectedScenarios && selectedScenarios.length > 0) {
            referenceScenarios = '\n\n---\n【参考シナリオ】\n';
            for (const scenarioName of selectedScenarios) {
                const filePath = path.join(__dirname, 'scenarios', projectType, scenarioName);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    referenceScenarios += `\n### ${scenarioName}\n${content}\n`;
                }
            }
        }
        
        // システムプロンプトを構築
        let systemPrompt = SCENARIO_SYSTEM_PROMPT;
        
        if (writingStyle) {
            systemPrompt += `\n\n---\n【ライティングスタイル】\n${writingStyle}`;
        }
        
        if (skills) {
            systemPrompt += `\n\n---\n【案件別ルール】\n${skills}`;
        }
        
        if (referenceScenarios) {
            systemPrompt += referenceScenarios;
        }
        
        // 生成件数をメッセージに追加
        let enhancedMessage = message;
        if (generationCount > 1) {
            enhancedMessage += `\n\n【生成件数: ${generationCount}件のバリエーションを作成してください】`;
        }
        
        // メッセージを構築
        const messages = conversationHistory || [];
        messages.push({
            role: 'user',
            content: enhancedMessage
        });
        
        // Claude APIを呼び出し
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: messages
        });
        
        // レスポンスを処理
        let assistantMessage = '';
        for (const block of response.content) {
            if (block.type === 'text') {
                assistantMessage += block.text;
            }
        }
        
        // 履歴に追加
        messages.push({
            role: 'assistant',
            content: response.content
        });
        
        // シナリオ抽出（デリミタベースの厳密な抽出）
        let scenario = null;
        
        const scenarioMatch = assistantMessage.match(/<<<SCENARIO_START>>>([\s\S]*?)<<<SCENARIO_END>>>/);
        if (scenarioMatch) {
            scenario = scenarioMatch[1].trim();
        } else {
            // バックアップ: 古い形式（コードブロック）も一応サポート
            const codeBlockMatch = assistantMessage.match(/```(?:markdown)?\n?([\s\S]*?)```/);
            if (codeBlockMatch) {
                // コードブロックの中身がシナリオっぽいか確認（【シナリオ】などが含まれるか）
                if (codeBlockMatch[1].includes('【シナリオ') || codeBlockMatch[1].includes('---')) {
                    scenario = codeBlockMatch[1].trim();
                }
            }
        }
        
        res.json({
            message: assistantMessage,
            scenario: scenario,
            conversationHistory: messages
        });
        
    } catch (error) {
        console.error('Scenario chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ修正（マーカー機能）
app.post('/api/scenario/correct', async (req, res) => {
    try {
        const { originalContent, selectedText, instruction, markerType, feedbackRules } = req.body;
        
        let systemPrompt = `あなたはシナリオ編集の専門家です。ユーザーが選択したテキスト部分を指示に従って修正してください。

修正のルール：
1. 選択されたテキスト部分のみを修正する
2. 他の部分は一切変更しない
3. 修正後のシナリオ全文を返す
4. 説明は不要、修正後のシナリオ本文のみを返す`;

        // 永続修正ルールがある場合は追加
        if (feedbackRules && feedbackRules.length > 0) {
            systemPrompt += '\n\n【永続的な修正ルール】以下のルールも考慮して修正してください：\n';
            feedbackRules.forEach((rule, idx) => {
                systemPrompt += `${idx + 1}. 「${rule.selectedText}」→「${rule.instruction}」\n`;
            });
        }
        
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: `【元のシナリオ】
${originalContent}

【選択されたテキスト】
${selectedText}

【修正指示】
${instruction}

上記の選択部分を修正指示に従って修正し、シナリオ全文を返してください。`
            }]
        });
        
        const correctedContent = response.content[0].text.trim();
        
        res.json({
            correctedContent: correctedContent,
            message: '修正が完了しました'
        });
        
    } catch (error) {
        console.error('Scenario correct error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ一括修正（バッチ処理）
app.post('/api/scenario/correct-batch', async (req, res) => {
    try {
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { originalContent, corrections, feedbackRules = [] } = req.body;
        
        if (!originalContent || !corrections || !Array.isArray(corrections)) {
            return res.status(400).json({ error: '元のコンテンツと修正リストが必要です' });
        }
        
        if (corrections.length === 0) {
            return res.json({ correctedContent: originalContent, message: '修正対象がありません' });
        }
        
        // 修正指示をまとめてプロンプトを構築
        let systemPrompt = `あなたはシナリオ編集の専門家です。複数の修正指示に従ってテキストを修正してください。

修正のルール：
1. 各修正指示で指定されたテキスト部分のみを修正する
2. 他の部分は一切変更しない
3. 修正後のシナリオ全文を返す
4. 説明は不要、修正後のシナリオ本文のみを返す`;

        // 永続修正ルールがある場合は追加
        if (feedbackRules && feedbackRules.length > 0) {
            systemPrompt += '\n\n【永続的な修正ルール】以下のルールも考慮して修正してください：\n';
            feedbackRules.forEach((rule, idx) => {
                systemPrompt += `${idx + 1}. 「${rule.selectedText}」→「${rule.instruction}」\n`;
            });
        }
        
        // 修正リストを構築
        let correctionsText = '';
        corrections.forEach((c, idx) => {
            correctionsText += `\n【修正${idx + 1}】
対象テキスト: ${c.selectedText}
修正指示: ${c.instruction}
`;
        });
        
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: `【元のシナリオ】
${originalContent}

${correctionsText}

上記のすべての修正指示に従って修正し、シナリオ全文を返してください。`
            }]
        });
        
        const correctedContent = response.content[0].text.trim();
        
        res.json({
            correctedContent: correctedContent,
            message: `${corrections.length}件の修正が完了しました`
        });
        
    } catch (error) {
        console.error('Scenario batch correct error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ削除
app.delete('/api/scenario/delete', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const scenarioDir = path.join(__dirname, 'scenarios', projectType);
        const filePath = path.join(scenarioDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({ success: true, message: 'シナリオを削除しました' });
    } catch (error) {
        console.error('Scenario delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ更新
app.put('/api/scenario/update', async (req, res) => {
    try {
        const { filename, content, newFilename, projectType = 'debt' } = req.body;
        
        if (!filename || !content) {
            return res.status(400).json({ error: 'ファイル名と内容が必要です' });
        }
        
        const scenarioDir = path.join(__dirname, 'scenarios', projectType);
        const oldFilePath = path.join(scenarioDir, filename);
        
        if (!fs.existsSync(oldFilePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        // ファイル名が変更される場合
        const targetFilename = newFilename || filename;
        const safeName = targetFilename.replace(/[\/\\:*?"<>|]/g, '_');
        const newFilePath = path.join(scenarioDir, safeName);
        
        // 古いファイルを削除（名前が変わる場合）
        if (filename !== safeName && fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
        }
        
        // 新しい内容で保存
        fs.writeFileSync(newFilePath, content, 'utf-8');
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Scenario update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// シナリオ詳細取得
app.get('/api/scenario/detail', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.query;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const scenarioDir = path.join(__dirname, 'scenarios', projectType);
        const filePath = path.join(scenarioDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        
        res.json({
            filename: filename,
            name: filename.replace('.md', ''),
            content: content,
            projectType: projectType
        });
    } catch (error) {
        console.error('Scenario detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 動画から文字起こし
app.post('/api/scenario/transcribe', upload.single('video'), async (req, res) => {
    let audioPath = null;
    
    try {
        // OpenAI APIが初期化されているか確認
        if (!openai) {
            return res.status(503).json({ 
                error: 'OpenAI APIが初期化されていません。OPENAI_API_KEYを確認してください。' 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: '動画ファイルが必要です' });
        }
        
        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const fileSize = req.file.size;
        
        // サポートされるファイル形式をチェック
        const supportedFormats = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.mov', '.avi', '.mkv'];
        const fileExt = path.extname(originalName).toLowerCase();
        
        if (!supportedFormats.includes(fileExt)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ 
                error: `サポートされていないファイル形式です: ${fileExt}。サポート形式: ${supportedFormats.join(', ')}` 
            });
        }
        
        console.log(`📹 動画文字起こし開始: ${originalName} (${Math.round(fileSize / 1024 / 1024)}MB)`);
        
        // 25MBを超える場合、音声を抽出して圧縮
        const maxWhisperSize = 25 * 1024 * 1024;
        let fileToTranscribe = filePath;
        
        if (fileSize > maxWhisperSize || ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(fileExt)) {
            console.log('🔄 音声を抽出・圧縮中...');
            
            // ffmpegで音声を抽出・圧縮
            const ffmpeg = require('fluent-ffmpeg');
            audioPath = path.join(__dirname, 'uploads', `audio_${Date.now()}.mp3`);
            
            await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .audioBitrate('64k')  // 低ビットレートで圧縮
                    .audioChannels(1)      // モノラル
                    .audioFrequency(16000) // 16kHz（Whisper推奨）
                    .output(audioPath)
                    .on('end', () => {
                        console.log('✅ 音声抽出完了');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('ffmpegエラー:', err);
                        reject(new Error('音声抽出に失敗しました: ' + err.message));
                    })
                    .run();
            });
            
            fileToTranscribe = audioPath;
            
            // 抽出後のサイズチェック
            const audioStats = fs.statSync(audioPath);
            console.log(`📁 圧縮後サイズ: ${Math.round(audioStats.size / 1024)}KB`);
            
            if (audioStats.size > maxWhisperSize) {
                throw new Error('圧縮後も25MBを超えています。より短い動画をお試しください。');
            }
        }
        
        // Whisper APIを呼び出し
        console.log('🎤 Whisper APIで文字起こし中...');
        const fileStream = fs.createReadStream(fileToTranscribe);
        const transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: 'whisper-1',
            language: 'ja',
            response_format: 'text'
        });
        
        // アップロードファイルを削除
        fs.unlinkSync(filePath);
        if (audioPath && fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
        
        console.log(`✅ 文字起こし完了: ${transcription.length}文字`);
        
        // Claudeで整形・誤字修正
        console.log('🤖 Claudeで整形・誤字修正中...');
        let processedText = transcription;
        
        if (anthropic) {
            try {
                const response = await anthropic.messages.create({
                    model: CLAUDE_MODEL,
                    max_tokens: 4096,
                    system: `あなたは優秀な編集者です。提供された音声文字起こしテキストを読みやすく整形してください。
以下のルールに従ってください：
1. 【重要】句点「。」の直後で必ず改行を入れる
2. 読点「、」の直後でも、文が長くなる場合は改行を入れる
3. 明らかな誤字脱字や音声認識エラーを修正する
4. 要約はせず、元の発言内容・ニュアンスは極力維持する
5. 「えー」「あー」などの不要なフィラーは削除する
6. 句読点を適切に打つ
7. 出力は整形後のテキストのみを行う（挨拶や説明は不要）`,
                    messages: [{
                        role: 'user',
                        content: transcription
                    }]
                });
                
                if (response.content && response.content[0] && response.content[0].text) {
                    processedText = response.content[0].text;
                    console.log(`✅ 整形完了: ${processedText.length}文字`);
                }
            } catch (claudeError) {
                console.error('Claude整形エラー:', claudeError);
                console.log('⚠️ 整形処理をスキップし、生の文字起こし結果を使用します');
            }
        } else {
            console.log('⚠️ Claude APIが利用できないため、整形処理をスキップします');
        }
        
        res.json({
            success: true,
            transcription: processedText,
            filename: originalName
        });
        
    } catch (error) {
        console.error('Transcribe error:', error);
        
        // アップロードファイルがあれば削除
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (audioPath && fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
        
        // エラーメッセージを分かりやすく
        let errorMessage = error.message;
        if (error.code === 'ECONNRESET' || error.message?.includes('Connection error')) {
            errorMessage = 'ネットワーク接続エラーが発生しました。VPNをオフにするか、インターネット接続を確認してください。';
        } else if (error.status === 400) {
            errorMessage = 'ファイルの読み取りに失敗しました。ファイル形式やファイル内容を確認してください。';
        } else if (error.status === 401) {
            errorMessage = 'OpenAI APIキーが無効です。.envを確認してください。';
        }
        
        res.status(error.status || 500).json({ error: errorMessage });
    }
});

// ========================================
// 好調バナー管理 API
// ========================================

// 好調バナー一覧取得
app.get('/api/banner/list', async (req, res) => {
    try {
        const projectType = req.query.projectType || 'debt';
        const bannerDir = path.join(__dirname, 'banners', projectType);
        
        if (!fs.existsSync(bannerDir)) {
            fs.mkdirSync(bannerDir, { recursive: true });
            return res.json([]);
        }
        
        const files = fs.readdirSync(bannerDir).filter(f => f.endsWith('.json'));
        const banners = files.map(filename => {
            try {
                const content = fs.readFileSync(path.join(bannerDir, filename), 'utf-8');
                const data = JSON.parse(content);
                return {
                    filename: filename,
                    name: data.name || filename.replace('.json', ''),
                    thumbnail: data.thumbnail || data.image,
                    preview: data.analysis ? data.analysis.summary?.substring(0, 100) : '',
                    projectType: projectType
                };
            } catch (e) {
                console.error('バナーファイル読み込みエラー:', filename, e);
                return null;
            }
        }).filter(b => b !== null);
        
        res.json(banners);
    } catch (error) {
        console.error('Banner list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 好調バナー保存
app.post('/api/banner/save', async (req, res) => {
    try {
        const { name, image, analysis, size, projectType = 'debt' } = req.body;
        
        if (!name || !image) {
            return res.status(400).json({ error: 'バナー名と画像が必要です' });
        }
        
        const bannerDir = path.join(__dirname, 'banners', projectType);
        if (!fs.existsSync(bannerDir)) {
            fs.mkdirSync(bannerDir, { recursive: true });
        }
        
        const safeName = name.replace(/[\/\\:*?"<>|]/g, '_') + '.json';
        const filePath = path.join(bannerDir, safeName);
        
        // サムネイル生成（画像サイズを縮小）
        let thumbnail = image;
        // Note: 本来はsharpなどでリサイズするが、ここではそのまま保存
        
        const bannerData = {
            name: name,
            image: image,
            thumbnail: thumbnail,
            size: size || { width: null, height: null },
            analysis: analysis || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(filePath, JSON.stringify(bannerData, null, 2), 'utf-8');
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Banner save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 領域内の要素を言語化するAPI（Claude Visionで指定領域を分析）
app.post('/api/banner/describe-region', async (req, res) => {
    try {
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { image, regionsWithComments } = req.body;
        
        if (!image || !regionsWithComments || regionsWithComments.length === 0) {
            return res.status(400).json({ error: '画像と領域情報が必要です' });
        }
        
        // Base64画像をClaude Visionで分析
        const base64Data = image.split(',')[1];
        const mediaType = image.split(';')[0].split(':')[1] || 'image/png';
        
        // 領域情報とユーザーコメントをプロンプトに変換
        const regionDescriptions = regionsWithComments.map((item, i) => {
            const region = item.region;
            const comment = item.comment;
            const centerX = region.x + region.width / 2;
            const centerY = region.y + region.height / 2;
            let position = '';
            if (centerY < 33) position += '上部';
            else if (centerY > 66) position += '下部';
            else position += '中央';
            if (centerX < 33) position += '左側';
            else if (centerX > 66) position += '右側';
            else if (position !== '中央') position += '中央';
            return `領域${i + 1}: 画像の${position}（x:${Math.round(region.x)}%, y:${Math.round(region.y)}%, 幅:${Math.round(region.width)}%, 高さ:${Math.round(region.height)}%）
  └ ユーザーの修正コメント: 「${comment}」`;
        }).join('\n');
        
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: 'あなたはバナー広告の分析専門家です。ユーザーが選択した領域に何があるかを特定してください。ユーザーの修正コメントを参考に、ユーザーが何を指しているかを推論し、具体的な要素名を特定してください。',
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data
                        }
                    },
                    {
                        type: 'text',
                        text: `このバナー画像の以下の領域に何があるか、ユーザーの修正コメントを参考に特定してください。

${regionDescriptions}

ユーザーのコメントから、ユーザーが何を修正しようとしているかを推論してください。
例えば「もっと大きく」→テキストやロゴを指している可能性が高い
「色を変えて」→背景や図形を指している可能性が高い

各領域について、以下の形式で回答してください：
領域1: [ユーザーが指していると思われる具体的な要素（例：白文字のキャッチコピー「今すぐ相談」、赤いCTAボタン、人物の顔写真など）]
領域2: ...

要素は具体的に述べてください。テキストが読み取れる場合は内容も含めてください。`
                    }
                ]
            }]
        });
        
        const description = response.content[0].text;
        console.log('🔍 領域言語化結果:', description);
        
        res.json({
            success: true,
            description: description
        });
        
    } catch (error) {
        console.error('Banner describe-region error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 好調バナー削除
app.delete('/api/banner/delete', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(__dirname, 'banners', projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({ success: true, message: 'バナーを削除しました' });
    } catch (error) {
        console.error('Banner delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 好調バナー更新
app.put('/api/banner/update', async (req, res) => {
    try {
        const { filename, name, analysis, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(__dirname, 'banners', projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        // 既存データを読み込み
        const existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // 更新
        if (name) existingData.name = name;
        if (analysis) existingData.analysis = analysis;
        existingData.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf-8');
        
        res.json({ success: true, filename: filename, projectType: projectType });
    } catch (error) {
        console.error('Banner update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 好調バナー詳細取得
app.get('/api/banner/detail', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.query;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(__dirname, 'banners', projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        res.json({
            filename: filename,
            ...data,
            projectType: projectType
        });
    } catch (error) {
        console.error('Banner detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`🚀 Banner AI Server running on http://localhost:${PORT}`);
    console.log(`📝 API endpoints:`);
    console.log(`   POST /api/chat - Chat with Claude (Banner)`);
    console.log(`   POST /api/scenario/chat - Chat with Claude (Scenario)`);
    console.log(`   GET  /api/scenario/list - List saved scenarios`);
    console.log(`   POST /api/scenario/save - Save scenario`);
    console.log(`   GET  /api/banner/list - List favorite banners`);
    console.log(`   POST /api/banner/save - Save favorite banner`);
    console.log(`   GET  /api/health - Health check`);
});

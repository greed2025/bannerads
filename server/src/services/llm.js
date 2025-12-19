/**
 * LLMサービスモジュール
 * Claude / Gemini / OpenAI のクライアント初期化と生成関数
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const { config } = require('../config');

// クライアント初期化
let anthropic = null;
let openai = null;
let gemini = null;

if (config.hasAnthropicKey) {
    anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    console.log('✅ Claude API クライアント初期化完了');
}

if (config.hasOpenaiKey) {
    openai = new OpenAI({ apiKey: config.openaiApiKey });
    console.log('✅ OpenAI API クライアント初期化完了');
}

if (config.hasGeminiKey) {
    gemini = new GoogleGenAI({ apiKey: config.geminiApiKey });
    console.log('✅ Gemini API クライアント初期化完了');
}

/**
 * リトライ付きAPI呼び出し
 */
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

/**
 * Gemini画像生成（gemini-3-pro-image-preview）
 */
async function generateImageWithGemini(prompt, count = 1, referenceImages = [], imageConfig = null) {
    if (!gemini) {
        throw new Error('Gemini APIが初期化されていません。GEMINI_API_KEYを確認してください。');
    }
    
    const images = [];
    
    try {
        console.log(`🎨 Gemini画像生成: ${count}枚, 参考画像: ${referenceImages.length}枚, プロンプト: ${prompt.substring(0, 50)}...`);
        
        for (let i = 0; i < count; i++) {
            const contents = [];
            
            // 参考画像がある場合は追加（最大14枚まで）
            const maxRefImages = Math.min(referenceImages.length, 14);
            for (let j = 0; j < maxRefImages; j++) {
                const imgData = referenceImages[j];
                if (imgData && imgData.startsWith('data:')) {
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
            
            // テキストプロンプトを追加
            const japaneseInstruction = '\n\n【重要】バナー内のテキストは必ず日本語で作成してください。英語は使用しないでください。';
            if (referenceImages.length > 0) {
                contents.push({ text: `参考画像を参考にして、以下のスタイルで新しいバナー画像を生成してください:\n\n${prompt}${japaneseInstruction}` });
            } else {
                contents.push({ text: `${prompt}${japaneseInstruction}` });
            }
            
            const config = {
                responseModalities: ['Image', 'Text']
            };
            if (imageConfig) {
                config.imageConfig = imageConfig;
            }
            
            const response = await gemini.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: contents,
                config: config
            });
            
            // レスポンスから画像を抽出
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

/**
 * Geminiテキスト生成
 */
async function generateTextWithGemini(prompt, systemPrompt = '', images = []) {
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
        
        contents.push({ text: prompt });
        
        const apiConfig = {};
        if (systemPrompt) {
            apiConfig.systemInstruction = systemPrompt;
        }
        
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash-preview-05-20',
            contents: contents,
            ...apiConfig
        });
        
        return response.text;
    } catch (error) {
        console.error('Gemini生成エラー:', error);
        throw error;
    }
}

/**
 * Claude メッセージ送信
 */
async function sendClaudeMessage(options) {
    if (!anthropic) {
        throw new Error('Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。');
    }
    
    const { systemPrompt, messages, tools, maxTokens = 4096 } = options;
    
    const requestOptions = {
        model: config.claudeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages,
    };
    
    if (tools) {
        requestOptions.tools = tools;
    }
    
    return await anthropic.messages.create(requestOptions);
}

/**
 * OpenAI Whisper 文字起こし
 */
async function transcribeWithWhisper(fileStream, filename) {
    if (!openai) {
        throw new Error('OpenAI APIが初期化されていません。OPENAI_API_KEYを確認してください。');
    }
    
    return await openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: 'ja'
    });
}

// クライアント状態確認
function getClientStatus() {
    return {
        claude: !!anthropic,
        openai: !!openai,
        gemini: !!gemini
    };
}

module.exports = {
    // クライアント
    anthropic,
    openai,
    gemini,
    
    // 関数
    withRetry,
    generateImageWithGemini,
    generateTextWithGemini,
    sendClaudeMessage,
    transcribeWithWhisper,
    getClientStatus,
};

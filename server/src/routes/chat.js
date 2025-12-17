/**
 * チャットルート
 * バナー作成のためのClaudeチャットAPI
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { config } = require('../config');
const { anthropic, generateImageWithGemini, sendClaudeMessage, getClientStatus } = require('../services/llm');
const { loadKnowledge, existsSync, readJson } = require('../repositories/file');

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

/**
 * POST /api/chat
 * バナー作成チャット
 */
router.post('/', async (req, res) => {
    try {
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { message, images, conversationHistory, canvasSize, generateCount, projectType, presets, selectedBanners = [] } = req.body;
        
        // ナレッジファイルを読み込み
        let knowledgeContent = '';
        if (projectType) {
            knowledgeContent = await loadKnowledge(projectType);
        }
        
        // システムプロンプトを構築
        let systemPrompt = SYSTEM_PROMPT;
        if (knowledgeContent) {
            systemPrompt = `${SYSTEM_PROMPT}\n\n---\n以下は現在の案件に関するナレッジです。このナレッジを参考にして、適切なバナーを提案してください：\n\n${knowledgeContent}`;
        }
        
        // 好調バナーの情報と画像を追加
        let referenceImagesForGemini = [];
        let referenceImagesForClaude = [];
        
        if (selectedBanners && selectedBanners.length > 0) {
            let bannerInfo = '\n\n---\n【参考デザイン】\n以下の参考デザイン画像を分析してください。これらのデザインの特徴を把握し、ユーザーの要望に合わせてどのようなバナーを作成すべきか提案してください：\n';
            
            for (const bannerFilename of selectedBanners) {
                const bannerDir = path.join(config.paths.banners, projectType || 'debt');
                const bannerPath = path.join(bannerDir, bannerFilename);
                
                if (existsSync(bannerPath)) {
                    try {
                        const bannerData = await readJson(bannerPath);
                        bannerInfo += `\n### ${bannerData.name}\n`;
                        
                        if (bannerData.image) {
                            referenceImagesForGemini.push(bannerData.image);
                            referenceImagesForClaude.push({
                                name: bannerData.name,
                                image: bannerData.image
                            });
                        }
                    } catch (e) {
                        console.error('好調バナー読み込みエラー:', bannerFilename, e);
                    }
                }
            }
            
            systemPrompt += bannerInfo;
        }
        
        // プリセット値をシステムプロンプトに追加
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
        
        // 参考デザイン画像がある場合は先に追加
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
        const response = await sendClaudeMessage({
            systemPrompt: systemPrompt,
            messages: messages,
            tools: tools
        });
        
        // レスポンスを処理
        let assistantMessage = '';
        let generatedImages = [];
        
        for (const block of response.content) {
            if (block.type === 'text') {
                assistantMessage += block.text;
            } else if (block.type === 'tool_use') {
                if (block.name === 'generate_banner_image') {
                    const toolInput = block.input;
                    const prompt = toolInput.prompt;
                    const count = toolInput.count || generateCount || 1;
                    
                    // 拡張プロンプトを構築
                    let enhancedPrompt = prompt;
                    
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
                    
                    // Gemini Imagenで画像生成
                    generatedImages = await generateImageWithGemini(enhancedPrompt, count, referenceImagesForGemini);
                    
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
                    const finalResponse = await sendClaudeMessage({
                        systemPrompt: systemPrompt,
                        messages: messages,
                        maxTokens: 1024
                    });
                    
                    for (const finalBlock of finalResponse.content) {
                        if (finalBlock.type === 'text') {
                            assistantMessage = finalBlock.text;
                        }
                    }
                    
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

/**
 * GET /api/health
 * ヘルスチェック
 */
router.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        apis: getClientStatus()
    });
});

module.exports = router;

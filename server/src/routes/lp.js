/**
 * LP Builder API Routes
 * LP生成・チャット・画像生成用のAPIエンドポイント
 */

const express = require('express');
const router = express.Router();

// LLMサービスインポート
const { generateTextWithClaude, generateTextWithGemini, generateImageWithGemini, getClientStatus } = require('../services/llm');

// LP生成用システムプロンプト
const LP_SYSTEM_PROMPT = `あなたはLP（ランディングページ）作成の専門家です。
ユーザーの要望に基づいて、以下の規約に準拠したLP用のHTML/CSS/JSを生成してください。

【コーディング規約】
- CSS: BEM記法、styleタグ・インラインスタイル禁止
- JS: jQuery使用、イベントは js- 接頭辞のクラスセレクタで登録
- onclick等のイベント属性は禁止
- コメントは日本語で記述

【リンク設定】
- 運営者情報: <a href="../../company.html">運営者情報</a>
- プライバシーポリシー: <a href="../../privacy_policy.html">プライバシーポリシー</a>
- CTA: <a href="<?= $url ?>">テキスト</a>

【script.js構造】
$(function() {
    initializeFeature1();
    function initializeFeature1() { /* 処理 */ }
});

レスポンスは必ずJSON形式で、以下の構造で返してください:
{
  "html": "HTMLコード",
  "css": "CSSコード",
  "js": "JSコード",
  "message": "説明テキスト"
}`;

// LP生成/修正
router.post('/generate', async (req, res) => {
    try {
        const { action, prompt, currentCode, chatHistory = [] } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'promptが必要です',
                code: 'MISSING_PROMPT'
            });
        }
        
        const clientStatus = getClientStatus();
        if (!clientStatus.claude && !clientStatus.gemini) {
            return res.status(400).json({
                success: false,
                error: 'AIクライアントが初期化されていません',
                code: 'NO_AI_CLIENT'
            });
        }
        
        console.log(`🏗️ LP ${action}: "${prompt.substring(0, 50)}..."`);
        
        let systemMessage = LP_SYSTEM_PROMPT;
        let userMessage = prompt;
        
        if (action === 'modify' && currentCode) {
            userMessage = `現在のコード:
HTML:
\`\`\`html
${currentCode.html?.substring(0, 3000) || ''}
\`\`\`

CSS:
\`\`\`css
${currentCode.css?.substring(0, 2000) || ''}
\`\`\`

JS:
\`\`\`javascript
${currentCode.js?.substring(0, 1000) || ''}
\`\`\`

修正指示: ${prompt}

上記のコードを修正してください。変更箇所のみではなく、完全なコードを返してください。`;
        }
        
        // Claude優先、なければGemini
        let responseText;
        if (clientStatus.claude) {
            responseText = await generateTextWithClaude(userMessage, systemMessage, chatHistory);
        } else {
            responseText = await generateTextWithGemini(`${systemMessage}\n\n${userMessage}`);
        }
        
        // JSONをパース
        let codeResult;
        try {
            // JSONブロックを抽出
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                codeResult = JSON.parse(jsonMatch[1]);
            } else {
                // 直接JSONをパース
                codeResult = JSON.parse(responseText);
            }
        } catch (parseError) {
            // パース失敗時はテキストとして返す
            console.log('JSON parse failed, returning as message');
            return res.json({
                success: true,
                message: responseText,
                code: null
            });
        }
        
        res.json({
            success: true,
            code: {
                html: codeResult.html || null,
                css: codeResult.css || null,
                js: codeResult.js || null
            },
            message: codeResult.message || 'コードを生成しました'
        });
        
    } catch (error) {
        console.error('LP Generate Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'LP生成エラー',
            code: 'GENERATE_ERROR'
        });
    }
});

// LPチャット
router.post('/chat', async (req, res) => {
    try {
        const { message, chatHistory = [], projectContext } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'messageが必要です'
            });
        }
        
        const clientStatus = getClientStatus();
        if (!clientStatus.claude && !clientStatus.gemini) {
            return res.status(400).json({
                success: false,
                error: 'AIクライアントが初期化されていません'
            });
        }
        
        console.log(`💬 LP Chat: "${message.substring(0, 50)}..."`);
        
        const systemMessage = `あなたはLP作成をサポートするアシスタントです。
ユーザーの質問に答え、LPのデザインやコンテンツについてアドバイスしてください。
コードを生成する場合は、BEM記法・jQuery使用・js-接頭辞などの規約に従ってください。

${projectContext ? `現在のプロジェクト情報:
HTML抜粋: ${projectContext.html || '(なし)'}
CSS抜粋: ${projectContext.css || '(なし)'}` : ''}`;
        
        let responseText;
        if (clientStatus.claude) {
            responseText = await generateTextWithClaude(message, systemMessage, chatHistory);
        } else {
            responseText = await generateTextWithGemini(`${systemMessage}\n\nユーザー: ${message}`);
        }
        
        res.json({
            success: true,
            message: responseText
        });
        
    } catch (error) {
        console.error('LP Chat Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'チャットエラー'
        });
    }
});

// 画像生成
router.post('/image', async (req, res) => {
    try {
        const { prompt, width = 1024, height = 1024 } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'promptが必要です'
            });
        }
        
        const clientStatus = getClientStatus();
        if (!clientStatus.gemini) {
            return res.status(400).json({
                success: false,
                error: 'Gemini APIが初期化されていません'
            });
        }
        
        console.log(`🖼️ LP Image: "${prompt.substring(0, 50)}..."`);
        
        // アスペクト比を計算
        const ratio = width / height;
        let aspectRatio = '1:1';
        if (ratio > 1.5) aspectRatio = '16:9';
        else if (ratio > 1.2) aspectRatio = '4:3';
        else if (ratio < 0.67) aspectRatio = '9:16';
        else if (ratio < 0.8) aspectRatio = '3:4';
        
        const images = await generateImageWithGemini(prompt, 1, [], { aspectRatio, imageSize: '1K' });
        
        if (images && images.length > 0) {
            res.json({
                success: true,
                imageData: images[0]
            });
        } else {
            res.status(500).json({
                success: false,
                error: '画像生成に失敗しました'
            });
        }
        
    } catch (error) {
        console.error('LP Image Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || '画像生成エラー'
        });
    }
});

module.exports = router;

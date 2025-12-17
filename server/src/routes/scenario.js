/**
 * シナリオルート
 * シナリオ作成・編集・CRUD API
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { config } = require('../config');
const { anthropic, openai, sendClaudeMessage, transcribeWithWhisper } = require('../services/llm');
const { loadWritingStyle, loadSkills, sanitizeFilename, ensureDir, existsSync, readText, writeText, listFiles } = require('../repositories/file');

// 動画アップロード用の設定
const upload = multer({
    dest: config.paths.uploads,
    limits: { fileSize: config.uploadLimit }
});

// システムプロンプト
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

/**
 * GET /scenario/list
 * シナリオ一覧取得
 */
router.get('/list', async (req, res) => {
    try {
        const projectType = req.query.projectType || 'debt';
        const scenarioDir = path.join(config.paths.scenarios, projectType);
        
        await ensureDir(scenarioDir);
        
        const files = await listFiles(scenarioDir, '.md');
        const scenarios = await Promise.all(files.map(async filename => {
            const content = await readText(path.join(scenarioDir, filename));
            return {
                filename: filename,
                name: filename.replace('.md', ''),
                preview: content.substring(0, 100).replace(/\n/g, ' '),
                projectType: projectType
            };
        }));
        
        res.json(scenarios);
    } catch (error) {
        console.error('Scenario list error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /scenario/save
 * シナリオ保存
 */
router.post('/save', async (req, res) => {
    try {
        const { filename, content, projectType = 'debt' } = req.body;
        
        if (!filename || !content) {
            return res.status(400).json({ error: 'ファイル名と内容が必要です' });
        }
        
        const scenarioDir = path.join(config.paths.scenarios, projectType);
        await ensureDir(scenarioDir);
        
        const safeName = sanitizeFilename(filename) + '.md';
        const filePath = path.join(scenarioDir, safeName);
        
        await writeText(filePath, content);
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Scenario save error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /scenario/chat
 * シナリオチャット
 */
router.post('/chat', async (req, res) => {
    try {
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
        
        // ライティングスタイルとスキル読み込み
        const writingStyle = await loadWritingStyle();
        const skills = await loadSkills(projectType);
        
        // 参考シナリオを読み込み
        let referenceScenarios = '';
        if (selectedScenarios && selectedScenarios.length > 0) {
            referenceScenarios = '\n\n---\n【参考シナリオ】\n';
            for (const scenarioName of selectedScenarios) {
                const filePath = path.join(config.paths.scenarios, projectType, scenarioName);
                if (existsSync(filePath)) {
                    const content = await readText(filePath);
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
        const response = await sendClaudeMessage({
            systemPrompt: systemPrompt,
            messages: messages,
            maxTokens: 8192
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
        
        // シナリオ抽出
        let scenario = null;
        const scenarioMatch = assistantMessage.match(/<<<SCENARIO_START>>>([\s\S]*?)<<<SCENARIO_END>>>/);
        if (scenarioMatch) {
            scenario = scenarioMatch[1].trim();
            if (scenario) {
                const parts = scenario.split(/\n---\n/).filter(p => p.trim());
                if (parts.length > 1) {
                    scenario = parts;
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

/**
 * POST /scenario/correct
 * シナリオ修正（マーカー機能）
 */
router.post('/correct', async (req, res) => {
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
        
        const response = await sendClaudeMessage({
            systemPrompt: systemPrompt,
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

/**
 * POST /scenario/correct-batch
 * シナリオ一括修正（バッチ処理）
 */
router.post('/correct-batch', async (req, res) => {
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
        
        const response = await sendClaudeMessage({
            systemPrompt: systemPrompt,
            messages: [{
                role: 'user',
                content: `【元のシナリオ】
${originalContent}

${correctionsText}

上記のすべての修正指示に従って修正し、シナリオ全文を返してください。`
            }],
            maxTokens: 8192
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

/**
 * DELETE /scenario/delete
 * シナリオ削除
 */
router.delete('/delete', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const scenarioDir = path.join(config.paths.scenarios, projectType);
        const filePath = path.join(scenarioDir, filename);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({ success: true, message: 'シナリオを削除しました' });
    } catch (error) {
        console.error('Scenario delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /scenario/update
 * シナリオ更新
 */
router.put('/update', async (req, res) => {
    try {
        const { filename, content, newFilename, projectType = 'debt' } = req.body;
        
        if (!filename || !content) {
            return res.status(400).json({ error: 'ファイル名と内容が必要です' });
        }
        
        const scenarioDir = path.join(config.paths.scenarios, projectType);
        const oldFilePath = path.join(scenarioDir, filename);
        
        if (!existsSync(oldFilePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        // ファイル名が変更される場合
        const targetFilename = newFilename || filename;
        const safeName = sanitizeFilename(targetFilename);
        const newFilePath = path.join(scenarioDir, safeName);
        
        // 古いファイルを削除（名前が変わる場合）
        if (filename !== safeName && existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
        }
        
        // 新しい内容で保存
        await writeText(newFilePath, content);
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Scenario update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /scenario/detail
 * シナリオ詳細取得
 */
router.get('/detail', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.query;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const scenarioDir = path.join(config.paths.scenarios, projectType);
        const filePath = path.join(scenarioDir, filename);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        const content = await readText(filePath);
        
        res.json({
            filename: filename,
            content: content,
            projectType: projectType
        });
    } catch (error) {
        console.error('Scenario detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /scenario/transcribe
 * 動画から文字起こし
 */
router.post('/transcribe', upload.single('video'), async (req, res) => {
    let audioPath = null;
    
    try {
        if (!openai) {
            return res.status(503).json({ 
                error: 'OpenAI APIが初期化されていません。OPENAI_API_KEYを確認してください。' 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'ファイルがアップロードされていません' });
        }
        
        const filePath = req.file.path;
        const fileSize = req.file.size;
        const originalName = req.file.originalname;
        const fileExt = path.extname(originalName).toLowerCase();
        
        console.log(`📁 アップロードファイル: ${originalName} (${Math.round(fileSize / 1024)}KB)`);
        
        const maxWhisperSize = 25 * 1024 * 1024;
        let fileToTranscribe = filePath;
        
        if (fileSize > maxWhisperSize || ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(fileExt)) {
            console.log('🔄 音声を抽出・圧縮中...');
            
            const ffmpeg = require('fluent-ffmpeg');
            audioPath = filePath + '.mp3';
            
            await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .audioBitrate('64k')
                    .audioChannels(1)
                    .audioFrequency(16000)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(audioPath);
            });
            
            fileToTranscribe = audioPath;
            
            const audioStats = fs.statSync(audioPath);
            console.log(`📁 圧縮後サイズ: ${Math.round(audioStats.size / 1024)}KB`);
            
            if (audioStats.size > maxWhisperSize) {
                throw new Error('圧縮後も25MBを超えています。より短い動画をお試しください。');
            }
        }
        
        // Whisper APIを呼び出し
        console.log('🎤 Whisper APIで文字起こし中...');
        const fileStream = fs.createReadStream(fileToTranscribe);
        
        const transcription = await transcribeWithWhisper(fileStream, path.basename(fileToTranscribe));
        
        // 整形処理
        let processedText = transcription.text;
        if (anthropic && transcription.text.length > 50) {
            console.log('📝 テキスト整形中...');
            const formatResponse = await sendClaudeMessage({
                systemPrompt: `あなたは優秀な編集者です。提供された音声文字起こしテキストを読みやすく整形してください。
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
                    content: transcription.text
                }]
            });
            
            processedText = formatResponse.content[0].text.trim();
        }
        
        // クリーンアップ
        if (existsSync(filePath)) fs.unlinkSync(filePath);
        if (audioPath && existsSync(audioPath)) fs.unlinkSync(audioPath);
        
        res.json({
            success: true,
            transcription: processedText,
            filename: originalName
        });
        
    } catch (error) {
        console.error('Transcribe error:', error);
        
        // アップロードファイルがあれば削除
        if (req.file && existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (audioPath && existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
        
        let errorMessage = error.message;
        if (error.status === 400) {
            errorMessage = 'ファイル形式が対応していません。対応形式: mp3, mp4, m4a, wav, webm, mov';
        } else if (error.status === 401) {
            errorMessage = 'OpenAI APIキーが無効です。.envを確認してください。';
        }
        
        res.status(error.status || 500).json({ error: errorMessage });
    }
});

module.exports = router;

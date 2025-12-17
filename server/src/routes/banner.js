/**
 * バナールート
 * 好調バナー管理API
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { config } = require('../config');
const { anthropic, sendClaudeMessage } = require('../services/llm');
const { sanitizeFilename, ensureDir, existsSync, readJson, writeJson, listFiles } = require('../repositories/file');

/**
 * GET /banner/list
 * 好調バナー一覧取得
 */
router.get('/list', async (req, res) => {
    try {
        const projectType = req.query.projectType || 'debt';
        const bannerDir = path.join(config.paths.banners, projectType);
        
        await ensureDir(bannerDir);
        
        const files = await listFiles(bannerDir, '.json');
        const banners = await Promise.all(files.map(async filename => {
            try {
                const data = await readJson(path.join(bannerDir, filename));
                return {
                    filename: filename,
                    name: data.name,
                    image: data.image,
                    analysis: data.analysis,
                    size: data.size,
                    projectType: projectType
                };
            } catch (e) {
                return null;
            }
        }));
        
        res.json(banners.filter(b => b !== null));
    } catch (error) {
        console.error('Banner list error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /banner/save
 * 好調バナー保存
 */
router.post('/save', async (req, res) => {
    try {
        const { name, image, analysis, size, projectType = 'debt' } = req.body;
        
        if (!name || !image) {
            return res.status(400).json({ error: 'バナー名と画像が必要です' });
        }
        
        const bannerDir = path.join(config.paths.banners, projectType);
        await ensureDir(bannerDir);
        
        const safeName = sanitizeFilename(name) + '.json';
        const filePath = path.join(bannerDir, safeName);
        
        const bannerData = {
            name: name,
            image: image,
            analysis: analysis || '',
            size: size || null,
            createdAt: new Date().toISOString()
        };
        
        await writeJson(filePath, bannerData);
        
        res.json({ success: true, filename: safeName, projectType: projectType });
    } catch (error) {
        console.error('Banner save error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /banner/describe-region
 * 領域内の要素を言語化するAPI（Claude Visionで指定領域を分析）
 */
router.post('/describe-region', async (req, res) => {
    try {
        if (!anthropic) {
            return res.status(503).json({ 
                error: 'Claude APIが初期化されていません。ANTHROPIC_API_KEYを確認してください。' 
            });
        }
        
        const { image, regionsWithComments } = req.body;
        
        if (!image || !regionsWithComments) {
            return res.status(400).json({ error: '画像と領域情報が必要です' });
        }
        
        // 画像データをbase64に変換
        const base64Data = image.split(',')[1];
        const mediaType = image.split(';')[0].split(':')[1] || 'image/png';
        
        // 領域情報とユーザーコメントをプロンプトに変換
        const regionDescriptions = regionsWithComments.map((item, i) => {
            const region = item.region;
            const comment = item.comment;
            const centerX = region.x + region.width / 2;
            const centerY = region.y + region.height / 2;
            let position = '';
            if (centerY < 33) position = '上部';
            else if (centerY > 66) position = '下部';
            if (centerX < 33) position += '左側';
            else if (centerX > 66) position += '右側';
            else if (position !== '中央') position += '中央';
            return `領域${i + 1}: 画像の${position}（x:${Math.round(region.x)}%, y:${Math.round(region.y)}%, 幅:${Math.round(region.width)}%, 高さ:${Math.round(region.height)}%）
  └ ユーザーの修正コメント: 「${comment}」`;
        }).join('\n');
        
        const response = await sendClaudeMessage({
            systemPrompt: 'あなたはデザイン分析の専門家です。画像の指定された領域に何があるか、ユーザーの意図を読み取り、推定してください。',
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
「色を変えて」→背景やボタンを指している可能性が高い

簡潔に、画像の対象となる要素と推定される修正意図を説明してください。`
                    }
                ]
            }],
            maxTokens: 1024
        });
        
        const description = response.content[0].text.trim();
        
        res.json({
            success: true,
            description: description
        });
        
    } catch (error) {
        console.error('Banner describe-region error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /banner/delete
 * 好調バナー削除
 */
router.delete('/delete', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(config.paths.banners, projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({ success: true, message: 'バナーを削除しました' });
    } catch (error) {
        console.error('Banner delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /banner/update
 * 好調バナー更新
 */
router.put('/update', async (req, res) => {
    try {
        const { filename, name, analysis, projectType = 'debt' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(config.paths.banners, projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        const data = await readJson(filePath);
        
        if (name) data.name = name;
        if (analysis !== undefined) data.analysis = analysis;
        data.updatedAt = new Date().toISOString();
        
        await writeJson(filePath, data);
        
        res.json({ success: true, data: data });
    } catch (error) {
        console.error('Banner update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /banner/detail
 * 好調バナー詳細取得
 */
router.get('/detail', async (req, res) => {
    try {
        const { filename, projectType = 'debt' } = req.query;
        
        if (!filename) {
            return res.status(400).json({ error: 'ファイル名が必要です' });
        }
        
        const bannerDir = path.join(config.paths.banners, projectType);
        const filePath = path.join(bannerDir, filename);
        
        if (!existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが見つかりません' });
        }
        
        const data = await readJson(filePath);
        
        res.json({
            ...data,
            projectType: projectType
        });
    } catch (error) {
        console.error('Banner detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

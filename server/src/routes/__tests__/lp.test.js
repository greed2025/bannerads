// Gemini APIをモック
jest.mock('@google/genai', () => {
    return {
        GoogleGenAI: jest.fn().mockImplementation(() => ({
            models: {
                generateContent: jest.fn().mockResolvedValue({
                    candidates: [{
                        content: {
                            parts: [{
                                inlineData: {
                                    data: 'base64ImageData',
                                    mimeType: 'image/png'
                                }
                            }]
                        }
                    }]
                })
            }
        }))
    };
});

const request = require('supertest');
const express = require('express');
const lpRoutes = require('../lp');

describe('POST /api/lp/image', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/lp', lpRoutes);
    });

    test('should return success and imageData', async () => {
        // Arrange
        const requestBody = {
            prompt: 'Test image',
            width: 1024,
            height: 768
        };

        // Act
        const response = await request(app)
            .post('/api/lp/image')
            .send(requestBody);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('imageData');
        expect(response.body.imageData).toContain('data:image/');
    });

    test('imageData should be a complete data URL', async () => {
        // Arrange
        const requestBody = {
            prompt: 'Test image'
        };

        // Act
        const response = await request(app)
            .post('/api/lp/image')
            .send(requestBody);

        // Assert
        expect(response.body.imageData).toMatch(/^data:image\/[^;]+;base64,/);
    });
});

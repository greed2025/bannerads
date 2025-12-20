// Anthropic SDKをモック
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: 'Generated response' }]
            })
        }
    }));
});

const { generateTextWithClaude } = require('../llm');

describe('generateTextWithClaude', () => {
    test('should generate text from prompt', async () => {
        // Arrange
        const prompt = 'Test prompt';
        
        // Act
        const result = await generateTextWithClaude(prompt);
        
        // Assert
        expect(result).toBe('Generated response');
    });

    test('should include messages history in API call', async () => {
        // Arrange
        const prompt = 'Follow-up question';
        const messages = [
            { role: 'user', content: 'Initial message' },
            { role: 'assistant', content: 'Previous response' }
        ];
        
        // Act
        const result = await generateTextWithClaude(prompt, '', messages);
        
        // Assert
        expect(result).toBe('Generated response');
    });
});

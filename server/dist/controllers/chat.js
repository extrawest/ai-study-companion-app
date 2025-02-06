'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ChatWithContext = void 0;
const ChatWithContext = async (req, res) => {
    try {
        // Your chat logic here
        // For now, let's just return a test response
        res.json({
            message: 'Chat endpoint working',
            received: req.body
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.ChatWithContext = ChatWithContext;

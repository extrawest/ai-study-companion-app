"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chat_1 = require("../controllers/chat"); // We'll create this next
const router = express_1.default.Router();
router.post('/chat-with-context', chat_1.ChatWithContext);
router.get('/chat-with-context', (req, res) => {
    res.json({ message: 'Please use POST method for chat requests' });
});
exports.default = router;

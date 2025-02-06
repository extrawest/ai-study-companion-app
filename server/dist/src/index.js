import express from 'express';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import { handleDocumentProcessing } from '../routes/documentRoutes.js';
import { handleQuizGeneration, handleQuizEvaluation } from '../routes/quizRoutes.js';
const app = express();
// CORS setup
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
// Use /tmp directory for Vercel
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp' : './uploads';
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
// File handling setup
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });
// Basic route
app.get('/', (_req, res) => {
    res.json({ message: 'AI Companion API is running' });
});
// Routes
app.post('/api/chat-with-context', upload.array('files', 5), handleDocumentProcessing);
app.post('/api/quiz/generate', handleQuizGeneration);
app.post('/api/quiz/evaluate', handleQuizEvaluation);
const port = process.env.PORT || 8080;
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}
export default app;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleQuizGeneration = handleQuizGeneration;
exports.handleQuizEvaluation = handleQuizEvaluation;
const quizAgent_1 = require("../quizAgent");
const quizEvaluationAgent_1 = require("../quizEvaluationAgent");
// Store quizzes in memory (in a production environment, this should be in a database)
const quizzes = new Map();
async function handleQuizGeneration(req, res) {
    try {
        const { documentId } = req.body;
        if (!documentId) {
            return res.status(400).json({
                status: 'error',
                message: 'documentId is required'
            });
        }
        const quizResponse = await (0, quizAgent_1.generateQuiz)(documentId);
        // Ensure quiz response is properly parsed
        let quiz;
        try {
            quiz = typeof quizResponse === 'string' ? JSON.parse(quizResponse) : quizResponse;
            if (!Array.isArray(quiz)) {
                throw new Error('Quiz response is not an array');
            }
        }
        catch (error) {
            throw new Error('Invalid quiz format received from generator');
        }
        const quizId = `quiz_${Math.random().toString(36).substring(7)}`;
        quizzes.set(quizId, quiz);
        // Debug log
        console.log(`[Debug] Stored quiz with ID: ${quizId}`);
        console.log(`[Debug] Current quizzes in storage: ${Array.from(quizzes.keys()).join(', ')}`);
        // Create user-safe version without answers
        const quizForUser = quiz.map((q) => ({
            question: q.question,
            options: q.options
        }));
        res.json({
            status: 'success',
            quizId,
            quiz: quizForUser
        });
    }
    catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Error generating quiz'
        });
    }
}
async function handleQuizEvaluation(req, res) {
    try {
        const { quizId, answers } = req.body;
        // Debug log
        console.log(`[Debug] Attempting to evaluate quiz with ID: ${quizId}`);
        console.log(`[Debug] Available quiz IDs: ${Array.from(quizzes.keys()).join(', ')}`);
        // Validate request
        if (!quizId || !Array.isArray(answers)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid quizId and answers array are required'
            });
        }
        // Get the quiz from storage
        const quiz = quizzes.get(quizId);
        if (!quiz) {
            return res.status(404).json({
                status: 'error',
                message: `Quiz not found. Available quizzes: ${Array.from(quizzes.keys()).join(', ')}`
            });
        }
        // Validate answers length matches quiz length
        if (answers.length !== quiz.length) {
            return res.status(400).json({
                status: 'error',
                message: 'Number of answers must match number of questions'
            });
        }
        // Validate answer format
        if (!answers.every((answer) => ['A', 'B', 'C', 'D'].includes(answer))) {
            return res.status(400).json({
                status: 'error',
                message: 'All answers must be one of: A, B, C, or D'
            });
        }
        // Use the evaluation agent to evaluate the quiz
        const evaluationResult = await (0, quizEvaluationAgent_1.evaluateQuiz)(quiz, answers);
        res.json({
            status: 'success',
            evaluation: evaluationResult
        });
    }
    catch (error) {
        console.error('Error evaluating quiz:', error);
        res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Error evaluating quiz'
        });
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateQuiz = evaluateQuiz;
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const langgraph_1 = require("@langchain/langgraph");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
// Define evaluation result schema
const evaluationResultSchema = zod_1.z.object({
    score: zod_1.z.number(),
    totalCorrect: zod_1.z.number(),
    totalQuestions: zod_1.z.number(),
    details: zod_1.z.array(zod_1.z.object({
        questionNumber: zod_1.z.number(),
        userAnswer: zod_1.z.string(),
        isCorrect: zod_1.z.boolean(),
        correctAnswer: zod_1.z.string(),
        explanation: zod_1.z.string()
    }))
});
// Define quiz question schema for the tool
const quizQuestionSchema = zod_1.z.object({
    question: zod_1.z.string(),
    options: zod_1.z.object({
        A: zod_1.z.string(),
        B: zod_1.z.string(),
        C: zod_1.z.string(),
        D: zod_1.z.string()
    }),
    correctAnswer: zod_1.z.enum(['A', 'B', 'C', 'D']),
    explanation: zod_1.z.string()
});
// Create evaluation tool
const evaluationTool = new tools_1.DynamicStructuredTool({
    name: 'evaluate_quiz',
    description: 'Evaluate quiz answers and calculate score',
    schema: zod_1.z.object({
        quiz: zod_1.z.array(quizQuestionSchema),
        userAnswers: zod_1.z.array(zod_1.z.string().regex(/^[A-D]$/))
    }),
    func: async ({ quiz, userAnswers }) => {
        console.log('[Quiz Evaluation] Starting quiz evaluation');
        console.log(`[Quiz Evaluation] Processing ${quiz.length} questions with ${userAnswers.length} answers`);
        // Validate input
        if (!Array.isArray(quiz) || !Array.isArray(userAnswers)) {
            console.error('[Quiz Evaluation] Invalid input format detected');
            throw new Error('Invalid input format');
        }
        // Create evaluation data
        console.log('[Quiz Evaluation] Calculating results for each question');
        const evaluationData = quiz.map((question, index) => {
            const userAnswer = userAnswers[index];
            const isCorrect = question.correctAnswer === userAnswer;
            return {
                questionNumber: index + 1,
                userAnswer,
                isCorrect,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation
            };
        });
        const totalCorrect = evaluationData.filter((r) => r.isCorrect).length;
        const score = (totalCorrect / quiz.length) * 100;
        console.log(`[Quiz Evaluation] Score calculated: ${score}%, ${totalCorrect} correct out of ${quiz.length}`);
        return JSON.stringify({
            score,
            totalCorrect,
            totalQuestions: quiz.length,
            details: evaluationData
        });
    }
});
// Define the tools for the agent to use
const tools = [evaluationTool];
const toolNode = new prebuilt_1.ToolNode(tools);
// Create evaluation model and bind tools
const model = new openai_1.ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0
}).bindTools(tools);
// Define the system prompt
const SYSTEM_PROMPT = `You are a quiz evaluator that provides detailed feedback on quiz results.
You will receive evaluation data including score, correct/incorrect answers, and explanations.
Analyze this data and provide a detailed but concise evaluation summary.
Your response must be in valid JSON format with the exact same structure as the input.
Do not include any additional text or formatting outside of the JSON structure.

The response must follow this exact schema:
{
    "score": number,
    "totalCorrect": number,
    "totalQuestions": number,
    "details": [
        {
            "questionNumber": number,
            "userAnswer": string,
            "isCorrect": boolean,
            "correctAnswer": string,
            "explanation": string
        }
    ]
}`;
// Define the function that determines whether to continue or not
function shouldContinue({ messages }) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.additional_kwargs.tool_calls) {
        return 'tools';
    }
    return '__end__';
}
// Define the function that calls the model
async function callModel(state) {
    console.log('[Quiz Evaluation] Calling model to evaluate quiz');
    const response = await model.invoke(state.messages);
    console.log('[Quiz Evaluation] Received evaluation response from model');
    return { messages: [response] };
}
// Export the quiz evaluation function
async function evaluateQuiz(quiz, userAnswers) {
    console.log('[Quiz Evaluation] Starting quiz evaluation process');
    console.log(`[Quiz Evaluation] Evaluating quiz with ${userAnswers.length} user answers`);
    try {
        // Create the graph
        console.log('[Quiz Evaluation] Creating workflow graph');
        const workflow = new langgraph_1.StateGraph(langgraph_1.MessagesAnnotation)
            .addNode('agent', callModel)
            .addEdge('__start__', 'agent')
            .addNode('tools', toolNode)
            .addEdge('tools', 'agent')
            .addConditionalEdges('agent', shouldContinue);
        // Compile the graph
        console.log('[Quiz Evaluation] Compiling workflow graph');
        const app = workflow.compile();
        // Initialize the workflow with the system message and initial query
        console.log('[Quiz Evaluation] Initializing workflow with system message');
        const initialMessages = [
            new messages_1.SystemMessage(SYSTEM_PROMPT),
            new messages_1.HumanMessage(`Evaluate this quiz with the following answers. Quiz: ${JSON.stringify(quiz)}, User Answers: ${JSON.stringify(userAnswers)}`)
        ];
        // Run the workflow
        console.log('[Quiz Evaluation] Running evaluation workflow');
        const result = await app.invoke({
            messages: initialMessages
        });
        // Parse the final response
        console.log('[Quiz Evaluation] Processing model response');
        const lastMessage = result.messages[result.messages.length - 1];
        let rawResult = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        // Clean up the response to ensure valid JSON
        console.log('[Quiz Evaluation] Cleaning and parsing evaluation JSON');
        rawResult = rawResult.trim();
        // Remove any markdown code block markers if present
        rawResult = rawResult
            .replace(/^```json\s*/, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');
        try {
            // Parse and validate the evaluation structure
            console.log('[Quiz Evaluation] Attempting to parse and validate evaluation structure');
            const parsedResult = JSON.parse(rawResult);
            const result = evaluationResultSchema.parse(parsedResult);
            console.log(`[Quiz Evaluation] Successfully processed evaluation with score: ${result.score}%`);
            console.log(`[Quiz Evaluation] ${result.totalCorrect} correct answers out of ${result.totalQuestions} questions`);
            return result;
        }
        catch (parseError) {
            console.error('[Quiz Evaluation] Failed to parse evaluation response:', rawResult);
            console.error('[Quiz Evaluation] JSON parsing error:', parseError);
            throw new Error('Invalid evaluation format');
        }
    }
    catch (error) {
        console.error('[Quiz Evaluation] Error in quiz evaluation:', error);
        throw error;
    }
}

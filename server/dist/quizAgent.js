"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuiz = generateQuiz;
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const pinecone_1 = require("@langchain/pinecone");
const pinecone_2 = require("@pinecone-database/pinecone");
const openai_2 = require("@langchain/openai");
const tools_1 = require("@langchain/core/tools");
const langgraph_1 = require("@langchain/langgraph");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Initialize Pinecone
const pinecone = new pinecone_2.Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});
// Define the quiz question schema
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
const quizSchema = zod_1.z.array(quizQuestionSchema);
// Update the system prompt to be more explicit about JSON formatting
const SYSTEM_PROMPT = `You are a quiz generator that creates multiple choice questions. 
You must ALWAYS respond with ONLY a valid JSON array of exactly 2 questions, with no additional text or formatting.
Each question must have these exact fields:
- question: string
- options: object with A, B, C, D keys and string values
- correctAnswer: string (must be "A", "B", "C", or "D")
- explanation: string

Example format:
[
    {
        "question": "What is...",
        "options": {
            "A": "First option",
            "B": "Second option",
            "C": "Third option",
            "D": "Fourth option"
        },
        "correctAnswer": "A",
        "explanation": "This is correct because..."
    }
]

IMPORTANT: Return ONLY the JSON array. Do not include any additional text, markdown formatting, or explanations.`;
// Define fetch document tool
const fetchDocumentContentTool = new tools_1.DynamicStructuredTool({
    name: 'fetch_document_content',
    description: 'Fetch document content from Pinecone by documentId',
    schema: zod_1.z.object({
        documentId: zod_1.z.string()
    }),
    func: async ({ documentId }) => {
        const index = pinecone.Index('study-companion-db');
        const embeddings = new openai_2.OpenAIEmbeddings();
        const vectorStore = await pinecone_1.PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            filter: { documentId }
        });
        const results = await vectorStore.similaritySearch('', 10);
        return results.map((doc) => doc.pageContent).join('\n\n');
    }
});
// Define the tools for the agent to use
const tools = [fetchDocumentContentTool];
const toolNode = new prebuilt_1.ToolNode(tools);
// Create quiz generation model and bind tools
const model = new openai_1.ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7
}).bindTools(tools);
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
    const response = await model.invoke(state.messages);
    return { messages: [response] };
}
// Create the workflow
async function generateQuiz(documentId) {
    try {
        // Create the graph
        const workflow = new langgraph_1.StateGraph(langgraph_1.MessagesAnnotation)
            .addNode('agent', callModel)
            .addEdge('__start__', 'agent')
            .addNode('tools', toolNode)
            .addEdge('tools', 'agent')
            .addConditionalEdges('agent', shouldContinue);
        // Compile the graph
        const app = workflow.compile();
        // Initialize the workflow with the system message and initial query
        const initialMessages = [
            new messages_1.SystemMessage(SYSTEM_PROMPT),
            new messages_1.HumanMessage(`Create a quiz with 2 multiple choice questions based on the content from document ID: ${documentId}. Remember to return ONLY the JSON array with no additional text.`)
        ];
        // Run the workflow
        const result = await app.invoke({
            messages: initialMessages
        });
        // Parse the final response
        const lastMessage = result.messages[result.messages.length - 1];
        let rawQuiz = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        // Clean up the response to ensure valid JSON
        rawQuiz = rawQuiz.trim();
        // Remove any markdown code block markers if present
        rawQuiz = rawQuiz
            .replace(/^```json\s*/, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');
        try {
            // Try to parse the JSON
            const parsedQuiz = JSON.parse(rawQuiz);
            // Validate the quiz structure
            const quiz = quizSchema.parse(parsedQuiz);
            return quiz;
        }
        catch (parseError) {
            console.error('Raw quiz content:', rawQuiz);
            console.error('JSON parsing error:', parseError);
            throw new Error('Failed to parse quiz response. The model returned invalid JSON.');
        }
    }
    catch (error) {
        console.error('Error in quiz generation:', error);
        throw error;
    }
}

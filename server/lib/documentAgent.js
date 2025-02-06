"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDocument = processDocument;
exports.queryDocument = queryDocument;
exports.chatWithContext = chatWithContext;
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const langgraph_1 = require("@langchain/langgraph");
const document_1 = require("langchain/document");
const pinecone_1 = require("@langchain/pinecone");
const pinecone_2 = require("@pinecone-database/pinecone");
const openai_2 = require("@langchain/openai");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const text_splitter_1 = require("langchain/text_splitter");
const fileHandlerService_1 = require("./services/fileHandlerService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Initialize Pinecone
const pinecone = new pinecone_2.Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});
// Initialize Pinecone index name with type checking
const pineconeIndexName = process.env.PINECONE_INDEX_NAME;
if (!pineconeIndexName) {
    throw new Error('PINECONE_INDEX_NAME environment variable is not defined');
}
// Text splitter configuration
const textSplitter = new text_splitter_1.RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
});
// Initialize shared ChatOpenAI instance
const sharedChatModel = new openai_1.ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0
});
// Create a higher temperature version for more creative responses
const getCreativeChatModel = () => {
    return sharedChatModel.bind({ temperature: 0.7 });
};
// Custom tools for document processing
const extractContentTool = new tools_1.DynamicStructuredTool({
    name: 'extract_content',
    description: 'Extract content from a file using FileHandlerService',
    schema: zod_1.z.object({
        filePath: zod_1.z.string()
    }),
    func: async ({ filePath }) => {
        const content = await fileHandlerService_1.FileHandlerService.extractContent(filePath);
        return content;
    }
});
const splitTextTool = new tools_1.DynamicStructuredTool({
    name: 'split_text',
    description: 'Split text content into chunks',
    schema: zod_1.z.object({
        content: zod_1.z.string()
    }),
    func: async ({ content }) => {
        const chunks = await textSplitter.splitText(content);
        return JSON.stringify(chunks);
    }
});
const saveToPineconeTool = new tools_1.DynamicStructuredTool({
    name: 'save_to_pinecone',
    description: 'Save content chunks to Pinecone vector store',
    schema: zod_1.z.object({
        chunks: zod_1.z.array(zod_1.z.string()),
        documentId: zod_1.z.string(),
        metadata: zod_1.z.record(zod_1.z.any()).optional()
    }),
    func: async ({ chunks, documentId, metadata = {} }) => {
        const index = pinecone.Index(pineconeIndexName);
        const embeddings = new openai_2.OpenAIEmbeddings();
        const vectorStore = await pinecone_1.PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index
        });
        const documents = chunks.map((chunk, index) => {
            return new document_1.Document({
                pageContent: chunk,
                metadata: {
                    ...metadata,
                    documentId,
                    chunkIndex: index
                }
            });
        });
        await vectorStore.addDocuments(documents);
        return `Successfully saved ${chunks.length} chunks to Pinecone with documentId: ${documentId}`;
    }
});
// Custom tool for document querying
const queryPineconeTool = new tools_1.DynamicStructuredTool({
    name: 'query_pinecone',
    description: 'Query Pinecone vector store for relevant content',
    schema: zod_1.z.object({
        query: zod_1.z.string(),
        documentId: zod_1.z.string()
    }),
    func: async ({ query, documentId }) => {
        const index = pinecone.Index(pineconeIndexName);
        const embeddings = new openai_2.OpenAIEmbeddings();
        const vectorStore = await pinecone_1.PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            filter: { documentId }
        });
        const results = await retryWithExponentialBackoff(async () => {
            const searchResults = await vectorStore.similaritySearch(query, 3);
            return searchResults;
        });
        return JSON.stringify(results);
    }
});
// Add new direct chat tool
const directChatTool = new tools_1.DynamicStructuredTool({
    name: 'direct_chat',
    description: 'Have a direct conversation with ChatGPT without using document context',
    schema: zod_1.z.object({
        query: zod_1.z.string()
    }),
    func: async ({ query }) => {
        const chatModel = getCreativeChatModel();
        const response = await chatModel.invoke([
            new messages_1.SystemMessage(`You are a helpful AI assistant. Provide clear, informative, and engaging responses.
Your responses should be:
1. Accurate and well-reasoned
2. Easy to understand
3. Helpful and practical
4. Engaging but professional`),
            new messages_1.HumanMessage(query)
        ]);
        return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    }
});
// Update tool sets
const processingTools = [extractContentTool, splitTextTool, saveToPineconeTool];
const queryingTools = [queryPineconeTool, directChatTool];
// Create processing model and tool node
const processingModel = sharedChatModel.bindTools(processingTools);
const processingToolNode = new prebuilt_1.ToolNode(processingTools);
// Create querying model and tool node
const queryingModel = sharedChatModel.bindTools(queryingTools);
const queryingToolNode = new prebuilt_1.ToolNode(queryingTools);
// Define the function that determines whether to continue or not
function shouldContinue({ messages }) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.additional_kwargs.tool_calls) {
        return 'tools';
    }
    return '__end__';
}
// Define the model calling functions
async function callProcessingModel(state) {
    const response = await processingModel.invoke(state.messages);
    return { messages: [response] };
}
async function callQueryingModel(state) {
    const response = await queryingModel.invoke(state.messages);
    return { messages: [response] };
}
// Create the processing workflow
const processingWorkflow = new langgraph_1.StateGraph(langgraph_1.MessagesAnnotation)
    .addNode('agent', callProcessingModel)
    .addEdge('__start__', 'agent')
    .addNode('tools', processingToolNode)
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);
// Create the querying workflow
const queryingWorkflow = new langgraph_1.StateGraph(langgraph_1.MessagesAnnotation)
    .addNode('agent', callQueryingModel)
    .addEdge('__start__', 'agent')
    .addNode('tools', queryingToolNode)
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);
// Compile the workflows
const processingApp = processingWorkflow.compile();
const queryingApp = queryingWorkflow.compile();
// Helper function for retrying operations
async function retryWithExponentialBackoff(operation, maxRetries = 5, initialDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            if (Array.isArray(result) && result.length === 0 && i < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, i);
                console.log(`No results found in Pinecone yet, retrying... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            return result;
        }
        catch (error) {
            if (i === maxRetries - 1)
                throw error;
            const delay = initialDelay * Math.pow(2, i);
            console.log(`Error occurred, retrying... (Attempt ${i + 1}/${maxRetries})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries reached');
}
// Main processing function
async function processDocument(filePath, existingDocumentId) {
    try {
        const documentId = existingDocumentId || `doc_${Math.random().toString(36).substring(7)}`;
        console.log('Processing document:', filePath, 'with ID:', documentId);
        const systemPrompt = `You are a document processing assistant. Process the document by:
1. Extracting content from the file
2. Splitting the content into chunks
3. Saving the chunks to Pinecone with proper metadata
Use the available tools in sequence to accomplish this task.`;
        const result = await processingApp.invoke({
            messages: [new messages_1.SystemMessage(systemPrompt), new messages_1.HumanMessage(`Process this document: ${filePath} with documentId: ${documentId}`)]
        });
        const lastMessage = result.messages[result.messages.length - 1];
        const message = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        return {
            status: 'success',
            message,
            documentId
        };
    }
    catch (error) {
        console.error('Error processing document:', error);
        throw error;
    }
}
// Update the main querying function
async function queryDocument(query, documentId) {
    try {
        console.log(documentId ? `Querying document: ${documentId} with query: ${query}` : `Direct chat query: ${query}`);
        const systemPrompt = documentId
            ? `You are a document querying assistant. Your task is to:
1. Search the document for relevant content using the provided query
2. Analyze the search results
3. Provide a clear, concise response that directly addresses the query
Use the available tools to accomplish this task.`
            : `You are a helpful AI assistant. Your task is to:
1. Understand the user's query
2. Use the direct chat tool to provide a comprehensive response
3. Ensure the response is clear, informative, and directly addresses the query
Use the direct_chat tool to provide your response.`;
        const userMessage = documentId ? `Find information about: "${query}" in document: ${documentId}` : `Please respond to this query: "${query}"`;
        const result = await queryingApp.invoke({
            messages: [new messages_1.SystemMessage(systemPrompt), new messages_1.HumanMessage(userMessage)]
        });
        const lastMessage = result.messages[result.messages.length - 1];
        const message = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        return {
            status: 'success',
            message
        };
    }
    catch (error) {
        console.error('Error in query:', error);
        throw error;
    }
}
// Update the chatWithContext function
async function chatWithContext(query, filePaths) {
    try {
        // Validate input parameters
        if (!query) {
            return {
                status: 'error',
                message: 'Query is required'
            };
        }
        // Ensure filePaths is always an array
        const paths = filePaths || [];
        // If filePaths is empty, use direct chat with OpenAI
        if (paths.length === 0) {
            console.log('Direct chat query:', query);
            // Get response directly from the model
            const chatModel = getCreativeChatModel();
            const response = await chatModel.invoke([
                new messages_1.SystemMessage(`You are a helpful AI assistant. Provide clear, informative, and engaging responses.
Your responses should be:
1. Accurate and well-reasoned
2. Easy to understand
3. Helpful and practical
4. Engaging but professional`),
                new messages_1.HumanMessage(query)
            ]);
            const message = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
            return {
                status: 'success',
                message
            };
        }
        // If filePaths is not empty, process documents and query them
        // Process each file and collect their documentIds
        const documentIds = await Promise.all(paths.map(async (filePath) => {
            const result = await processDocument(filePath);
            return result.documentId;
        }));
        // Query all processed documents
        const results = await Promise.all(documentIds.map(async (documentId) => {
            const result = await queryDocument(query, documentId);
            return result.message;
        }));
        // Combine and return results
        return {
            status: 'success',
            message: results.join('\n\n')
        };
    }
    catch (error) {
        console.error('Error in chat with context:', error);
        // Return a more user-friendly error message
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'An unexpected error occurred'
        };
    }
}

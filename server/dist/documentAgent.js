import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { Document } from 'langchain/document';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { processFile } from './services/fileHandlerService.js';
import dotenv from 'dotenv';
import CredentialsService from './services/credentialsService.js';
dotenv.config();
// Initialize everything lazily
let pinecone = null;
let credentialsService = null;
let processingModel = null;
let queryingModel = null;
let processingToolNode = null;
let queryingToolNode = null;
let processingApp = null;
let queryingApp = null;
// Function to get or initialize credentials
function getCredentials() {
    if (!credentialsService) {
        credentialsService = CredentialsService.getInstance();
    }
    return credentialsService;
}
// Function to get or initialize Pinecone
function getPinecone() {
    if (!pinecone) {
        const credentials = getCredentials();
        pinecone = new Pinecone({
            apiKey: credentials.getPineconeKey()
        });
    }
    return pinecone;
}
// Text splitter configuration
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
});
// Initialize shared ChatOpenAI instance - make it a function
function getChatModel(temperature = 0) {
    const credentials = getCredentials();
    return new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature,
        openAIApiKey: credentials.getOpenAIKey()
    });
}
// Create a higher temperature version for more creative responses
const getCreativeChatModel = () => {
    return getChatModel(0.7);
};
// Custom tools for document processing
const extractContentTool = new DynamicStructuredTool({
    name: 'extract_content',
    description: 'Extract content from a file using FileHandlerService',
    schema: z.object({
        filePath: z.string()
    }),
    func: async ({ filePath }) => {
        const content = await processFile(filePath);
        return content;
    }
});
const splitTextTool = new DynamicStructuredTool({
    name: 'split_text',
    description: 'Split text content into chunks',
    schema: z.object({
        content: z.string()
    }),
    func: async ({ content }) => {
        const chunks = await textSplitter.splitText(content);
        return JSON.stringify(chunks);
    }
});
const saveToPineconeTool = new DynamicStructuredTool({
    name: 'save_to_pinecone',
    description: 'Save content chunks to Pinecone vector store',
    schema: z.object({
        chunks: z.array(z.string()),
        documentId: z.string(),
        metadata: z.record(z.any()).optional()
    }),
    func: async ({ chunks, documentId, metadata = {} }) => {
        const index = getPinecone().Index(getCredentials().getPineconeIndexName());
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: getCredentials().getOpenAIKey()
        });
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index
        });
        const documents = chunks.map((chunk, index) => {
            return new Document({
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
const queryPineconeTool = new DynamicStructuredTool({
    name: 'query_pinecone',
    description: 'Query Pinecone vector store for relevant content',
    schema: z.object({
        query: z.string(),
        documentId: z.string()
    }),
    func: async ({ query, documentId }) => {
        const index = getPinecone().Index(getCredentials().getPineconeIndexName());
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: getCredentials().getOpenAIKey()
        });
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
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
const directChatTool = new DynamicStructuredTool({
    name: 'direct_chat',
    description: 'Have a direct conversation with ChatGPT without using document context',
    schema: z.object({
        query: z.string()
    }),
    func: async ({ query }) => {
        const chatModel = getCreativeChatModel();
        const response = await chatModel.invoke([
            new SystemMessage(`You are a helpful AI assistant. Provide clear, informative, and engaging responses.
Your responses should be:
1. Accurate and well-reasoned
2. Easy to understand
3. Helpful and practical
4. Engaging but professional`),
            new HumanMessage(query)
        ]);
        return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    }
});
// Get or initialize the processing model
function getProcessingModel() {
    if (!processingModel) {
        processingModel = getChatModel().bindTools(getProcessingTools());
    }
    return processingModel;
}
// Get or initialize the querying model
function getQueryingModel() {
    if (!queryingModel) {
        queryingModel = getChatModel().bindTools(getQueryingTools());
    }
    return queryingModel;
}
// Get processing tools
function getProcessingTools() {
    return [extractContentTool, splitTextTool, saveToPineconeTool];
}
// Get querying tools
function getQueryingTools() {
    return [queryPineconeTool, directChatTool];
}
// Get or initialize the processing workflow
function getProcessingApp() {
    if (!processingApp) {
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode('agent', callProcessingModel)
            .addEdge('__start__', 'agent')
            .addNode('tools', new ToolNode(getProcessingTools()))
            .addEdge('tools', 'agent')
            .addConditionalEdges('agent', shouldContinue);
        processingApp = workflow.compile();
    }
    return processingApp;
}
// Get or initialize the querying workflow
function getQueryingApp() {
    if (!queryingApp) {
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode('agent', callQueryingModel)
            .addEdge('__start__', 'agent')
            .addNode('tools', new ToolNode(getQueryingTools()))
            .addEdge('tools', 'agent')
            .addConditionalEdges('agent', shouldContinue);
        queryingApp = workflow.compile();
    }
    return queryingApp;
}
// Update the model calling functions
async function callProcessingModel(state) {
    const response = await getProcessingModel().invoke(state.messages);
    return { messages: [response] };
}
async function callQueryingModel(state) {
    const response = await getQueryingModel().invoke(state.messages);
    return { messages: [response] };
}
// Define the function that determines whether to continue or not
function shouldContinue({ messages }) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.additional_kwargs.tool_calls) {
        return 'tools';
    }
    return '__end__';
}
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
// Update the main processing function
export async function processDocument(filePath, documentId) {
    try {
        console.log(`[Pinecone] Processing document: ${filePath}`);
        const content = await processFile(filePath);
        const chunks = await textSplitter.splitText(content);
        const index = getPinecone().Index(getCredentials().getPineconeIndexName());
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: getCredentials().getOpenAIKey()
        });
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index
        });
        // Create documents
        const documents = chunks.map((chunk, i) => new Document({
            pageContent: chunk,
            metadata: { documentId, chunkIndex: i }
        }));
        // Save to Pinecone
        console.log(`[Pinecone] Saving ${documents.length} chunks`);
        await vectorStore.addDocuments(documents);
        return {
            status: 'success',
            documentId
        };
    }
    catch (error) {
        console.error('[Pinecone] Error:', error);
        throw error;
    }
}
// Update the querying function
export async function queryDocument(query, documentId) {
    try {
        console.log(documentId ? `Querying document: ${documentId} with query: ${query}` : `Direct chat query: ${query}`);
        const app = getQueryingApp();
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
        const result = await app.invoke({
            messages: [new SystemMessage(systemPrompt), new HumanMessage(userMessage)]
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
// Update the chat function
export async function chatWithContext(query, filePaths) {
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
                new SystemMessage(`You are a helpful AI assistant. Provide clear, informative, and engaging responses.
Your responses should be:
1. Accurate and well-reasoned
2. Easy to understand
3. Helpful and practical
4. Engaging but professional`),
                new HumanMessage(query)
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
            const result = await processDocument(filePath, `doc_${Math.random().toString(36).substring(7)}`);
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
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'An unexpected error occurred'
        };
    }
}
// At the bottom of the file, add:
export const documentAgent = {
    processDocument,
    queryDocument,
    chatWithContext
};

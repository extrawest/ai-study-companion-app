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
import { FileHandlerService } from './services/fileHandlerService';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!
});

// Text splitter configuration
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
});

// Custom tools for document processing
const extractContentTool = new DynamicStructuredTool({
    name: 'extract_content',
    description: 'Extract content from a file using FileHandlerService',
    schema: z.object({
        filePath: z.string()
    }),
    func: async ({ filePath }) => {
        const content = await FileHandlerService.extractContent(filePath);
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
        const index = pinecone.Index('study-companion-db');
        const embeddings = new OpenAIEmbeddings();
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
        const index = pinecone.Index('study-companion-db');
        const embeddings = new OpenAIEmbeddings();
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

// Define tool sets for different workflows
const processingTools = [extractContentTool, splitTextTool, saveToPineconeTool];
const queryingTools = [queryPineconeTool];

// Create processing model and tool node
const processingModel = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0
}).bindTools(processingTools);

const processingToolNode = new ToolNode(processingTools);

// Create querying model and tool node
const queryingModel = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0
}).bindTools(queryingTools);

const queryingToolNode = new ToolNode(queryingTools);

// Define the function that determines whether to continue or not
function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.additional_kwargs.tool_calls) {
        return 'tools';
    }
    return '__end__';
}

// Define the model calling functions
async function callProcessingModel(state: typeof MessagesAnnotation.State) {
    const response = await processingModel.invoke(state.messages);
    return { messages: [response] };
}

async function callQueryingModel(state: typeof MessagesAnnotation.State) {
    const response = await queryingModel.invoke(state.messages);
    return { messages: [response] };
}

// Create the processing workflow
const processingWorkflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callProcessingModel)
    .addEdge('__start__', 'agent')
    .addNode('tools', processingToolNode)
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);

// Create the querying workflow
const queryingWorkflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callQueryingModel)
    .addEdge('__start__', 'agent')
    .addNode('tools', queryingToolNode)
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);

// Compile the workflows
const processingApp = processingWorkflow.compile();
const queryingApp = queryingWorkflow.compile();

// Helper function for retrying operations
async function retryWithExponentialBackoff<T>(operation: () => Promise<T>, maxRetries: number = 5, initialDelay: number = 2000): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            if (Array.isArray(result) && result.length === 0 && i < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, i);
                console.log(`No results found, retrying in ${delay / 1000} seconds... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            return result;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = initialDelay * Math.pow(2, i);
            console.log(`Error occurred, retrying in ${delay / 1000} seconds... (Attempt ${i + 1}/${maxRetries})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries reached');
}

// Main processing function
export async function processDocument(filePath: string, existingDocumentId?: string): Promise<{ status: string; message: string; documentId: string }> {
    try {
        const documentId = existingDocumentId || `doc_${Math.random().toString(36).substring(7)}`;
        console.log('Processing document:', filePath, 'with ID:', documentId);

        const systemPrompt = `You are a document processing assistant. Process the document by:
1. Extracting content from the file
2. Splitting the content into chunks
3. Saving the chunks to Pinecone with proper metadata
Use the available tools in sequence to accomplish this task.`;

        const result = await processingApp.invoke({
            messages: [new SystemMessage(systemPrompt), new HumanMessage(`Process this document: ${filePath} with documentId: ${documentId}`)]
        });

        const lastMessage = result.messages[result.messages.length - 1];
        const message = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        return {
            status: 'success',
            message,
            documentId
        };
    } catch (error) {
        console.error('Error processing document:', error);
        throw error;
    }
}

// Main querying function
export async function queryDocument(query: string, documentId: string): Promise<{ status: string; message: string }> {
    try {
        console.log('Querying document:', documentId, 'with query:', query);

        const systemPrompt = `You are a document querying assistant. Your task is to:
1. Search the document for relevant content using the provided query
2. Analyze the search results
3. Provide a clear, concise response that directly addresses the query
Use the available tools to accomplish this task.`;

        const result = await queryingApp.invoke({
            messages: [new SystemMessage(systemPrompt), new HumanMessage(`Find information about: "${query}" in document: ${documentId}`)]
        });

        const lastMessage = result.messages[result.messages.length - 1];
        const message = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        return {
            status: 'success',
            message
        };
    } catch (error) {
        console.error('Error querying document:', error);
        throw error;
    }
}

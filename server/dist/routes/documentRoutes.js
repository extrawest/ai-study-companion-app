import { documentAgent } from '../documentAgent.js';
import fs from 'fs';
// Add a delay utility
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function handleDocumentProcessing(req, res) {
    try {
        const query = req.body.query || 'give brief summary of these files';
        const uploadedFiles = req.files;
        console.log('Processing uploaded files:', uploadedFiles);
        if (!uploadedFiles || uploadedFiles.length === 0) {
            console.log('No files provided, using direct chat');
            const chatResult = await documentAgent.chatWithContext(query);
            return res.json({
                status: 'success',
                message: chatResult.message,
                type: 'direct_chat',
            });
        }
        console.log('Processing uploaded files:', uploadedFiles.map((f) => f.originalname));
        const sharedDocumentId = `doc_${Math.random()
            .toString(36)
            .substring(7)}`;
        const processedDocs = [];
        // Process documents first
        for (const file of uploadedFiles) {
            try {
                console.log(`Processing file: ${file.originalname}`);
                const processResult = await documentAgent.processDocument(file.path, sharedDocumentId ||
                    `doc_${Math.random().toString(36).substring(7)}`);
                processedDocs.push({
                    documentId: processResult.documentId,
                    fileName: file.originalname,
                    status: processResult.status,
                });
                // Wait a bit for Pinecone to index
                await delay(2000);
            }
            catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                processedDocs.push({
                    documentId: sharedDocumentId,
                    fileName: file.originalname,
                    status: 'error',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            finally {
                // Clean up uploaded file
                fs.unlink(file.path, (err) => {
                    if (err)
                        console.error('Error deleting file:', err);
                });
            }
        }
        // Then query the processed documents
        const successfulDocs = processedDocs.filter((doc) => doc.status === 'success');
        if (successfulDocs.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to process any documents',
                processedFiles: processedDocs,
            });
        }
        // Get unique documentIds
        const uniqueDocumentIds = [
            ...new Set(successfulDocs.map((doc) => doc.documentId)),
        ];
        // Query with retries
        const queryResults = await Promise.all(uniqueDocumentIds.map(async (documentId) => {
            const docsWithThisId = successfulDocs.filter((doc) => doc.documentId === documentId);
            const fileNames = docsWithThisId.map((doc) => doc.fileName);
            try {
                const result = await documentAgent.queryDocument(query, documentId);
                return {
                    ...result,
                    fileNames,
                    documentId,
                };
            }
            catch (error) {
                console.error(`Error querying document ${documentId}:`, error);
                return {
                    status: 'error',
                    message: 'Failed to query documents',
                    fileNames,
                    documentId,
                };
            }
        }));
        res.json({
            status: 'success',
            results: queryResults,
            processedFiles: processedDocs,
            type: 'document_query',
        });
    }
    catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error processing request',
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

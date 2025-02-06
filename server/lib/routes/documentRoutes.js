"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDocumentProcessing = handleDocumentProcessing;
const documentAgent_1 = require("../documentAgent");
const fs_1 = __importDefault(require("fs"));
async function handleDocumentProcessing(req, res) {
    try {
        // Get query from either form-data or JSON body
        const query = req.body.query || req.query || 'give brief summary of these files';
        const filePaths = Array.isArray(req.body.filePaths) ? req.body.filePaths : [];
        let filesToProcess = [];
        // Check if files were uploaded via multer
        const uploadedFiles = req.files;
        if (uploadedFiles && uploadedFiles.length > 0) {
            console.log('Processing uploaded files:', uploadedFiles.map((f) => f.originalname));
            filesToProcess.push(...uploadedFiles.map((file) => ({
                path: file.path,
                originalname: file.originalname
            })));
        }
        // Add manually specified file paths
        if (filePaths.length > 0) {
            console.log('Processing file paths:', filePaths);
            filesToProcess.push(...filePaths.map((filePath) => ({
                path: filePath,
                originalname: filePath.split('/').pop() || filePath
            })));
        }
        // If no files were provided, use direct chat
        if (filesToProcess.length === 0) {
            console.log('No files provided, using direct chat');
            const chatResult = await (0, documentAgent_1.chatWithContext)(query);
            return res.json({
                status: 'success',
                message: chatResult.message,
                type: 'direct_chat'
            });
        }
        // If files were provided, continue with document processing
        const sharedDocumentId = `doc_${Math.random().toString(36).substring(7)}`;
        // Process all documents
        const processedDocs = [];
        for (const file of filesToProcess) {
            try {
                console.log(`Processing file: ${file.originalname}`);
                if (!fs_1.default.existsSync(file.path)) {
                    console.error(`File not found: ${file.path}`);
                    processedDocs.push({
                        documentId: sharedDocumentId,
                        fileName: file.originalname,
                        status: 'error',
                        message: 'File not found'
                    });
                    continue;
                }
                const processResult = await (0, documentAgent_1.processDocument)(file.path, sharedDocumentId);
                processedDocs.push({
                    documentId: processResult.documentId,
                    fileName: file.originalname,
                    status: processResult.status
                });
                // Only delete the file if it was uploaded via multer
                if (uploadedFiles?.some((f) => f.path === file.path)) {
                    fs_1.default.unlink(file.path, (err) => {
                        if (err)
                            console.error('Error deleting file:', err);
                    });
                }
            }
            catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                processedDocs.push({
                    documentId: sharedDocumentId,
                    fileName: file.originalname,
                    status: 'error',
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        }
        // Check if any documents were processed successfully
        const successfulDocs = processedDocs.filter((doc) => doc.status === 'success');
        if (successfulDocs.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to process any documents',
                processedFiles: processedDocs
            });
        }
        // Get unique documentIds
        const uniqueDocumentIds = [...new Set(successfulDocs.map((doc) => doc.documentId))];
        // Query once per unique documentId
        const queryResults = await Promise.all(uniqueDocumentIds.map(async (documentId) => {
            const docsWithThisId = successfulDocs.filter((doc) => doc.documentId === documentId);
            const fileNames = docsWithThisId.map((doc) => doc.fileName);
            try {
                const result = await (0, documentAgent_1.queryDocument)(query, documentId);
                return {
                    ...result,
                    fileNames,
                    documentId
                };
            }
            catch (error) {
                console.error(`Error querying document ${documentId}:`, error);
                return {
                    status: 'error',
                    message: `Failed to query documents`,
                    fileNames,
                    documentId
                };
            }
        }));
        res.json({
            status: 'success',
            results: queryResults,
            processedFiles: processedDocs,
            type: 'document_query'
        });
    }
    catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error processing request',
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

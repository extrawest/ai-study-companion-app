import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import * as path from 'path';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs';

const getLoaderForFileType = (fileExtension: string, filePath: string) => {
    switch (fileExtension) {
        case '.pdf':
            return new PDFLoader(filePath, { splitPages: false });
        case '.docx':
            return new DocxLoader(filePath);
        case '.csv':
            return new CSVLoader(filePath);
        default:
            return null;
    }
};

const extractImageContent = async (filePath: string): Promise<string> => {
    try {
        // Initialize the client with credentials
        const client = new ImageAnnotatorClient({
            credentials: JSON.parse(
                process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}'
            ),
        });

        // Read the image file
        const [result] = await client.textDetection(filePath);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            return '';
        }

        return detections[0].description || '';
    } catch (error) {
        console.error('Error in OCR:', error);
        throw new Error('Failed to extract text from image');
    }
};

export const processFile = async (filePath: string): Promise<string> => {
    const extension = path.extname(filePath).toLowerCase();
    const loader = getLoaderForFileType(extension, filePath);

    if (loader) {
        const docs = await loader.load();
        return docs.map((doc: any) => doc.pageContent).join('\n');
    }

    if (['.jpg', '.jpeg', '.png'].includes(extension)) {
        return await extractImageContent(filePath);
    }

    throw new Error(`Unsupported file type: ${extension}`);
};

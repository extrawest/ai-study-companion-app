"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileHandlerService = void 0;
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const docx_1 = require("@langchain/community/document_loaders/fs/docx");
const csv_1 = require("@langchain/community/document_loaders/fs/csv");
const path = __importStar(require("path"));
const tesseract_js_1 = require("tesseract.js");
class FileHandlerService {
    static async extractContent(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        const loader = this.getLoaderForFileType(extension, filePath);
        if (loader) {
            const docs = await loader.load();
            return docs.map((doc) => doc.pageContent).join('\n');
        }
        // Handle image files separately since they need OCR
        if (['.jpg', '.jpeg', '.png'].includes(extension)) {
            return await this.extractImageContent(filePath);
        }
        throw new Error(`Unsupported file type: ${extension}`);
    }
    static getLoaderForFileType(fileExtension, filePath) {
        switch (fileExtension) {
            case '.pdf':
                return new pdf_1.PDFLoader(filePath, { splitPages: false });
            case '.docx':
                return new docx_1.DocxLoader(filePath);
            case '.csv':
                return new csv_1.CSVLoader(filePath);
            default:
                return null;
        }
    }
    static async extractImageContent(filePath) {
        // Initialize Tesseract.js worker
        const worker = await (0, tesseract_js_1.createWorker)('eng');
        try {
            // Perform OCR on the image
            const { data: { text } } = await worker.recognize(filePath);
            return text;
        }
        finally {
            await worker.terminate();
        }
    }
}
exports.FileHandlerService = FileHandlerService;

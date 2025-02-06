class CredentialsService {
    private static instance: CredentialsService;
    private credentials: {
        openaiApiKey: string | null;
        pineconeApiKey: string | null;
        pineconeIndexName: string | null;
    };

    private constructor() {
        this.credentials = {
            openaiApiKey: null,
            pineconeApiKey: null,
            pineconeIndexName: null,
        };
    }

    public static getInstance(): CredentialsService {
        if (!CredentialsService.instance) {
            CredentialsService.instance = new CredentialsService();
        }
        return CredentialsService.instance;
    }

    public setCredentials(credentials: {
        openaiApiKey: string;
        pineconeApiKey: string;
        pineconeIndexName: string;
    }) {
        this.credentials = credentials;
    }

    public getOpenAIKey(): string {
        if (!this.credentials.openaiApiKey) {
            throw new Error('OpenAI API key not set');
        }
        return this.credentials.openaiApiKey;
    }

    public getPineconeKey(): string {
        if (!this.credentials.pineconeApiKey) {
            throw new Error('Pinecone API key not set');
        }
        return this.credentials.pineconeApiKey;
    }

    public getPineconeIndexName(): string {
        if (!this.credentials.pineconeIndexName) {
            throw new Error('Pinecone index name not set');
        }
        return this.credentials.pineconeIndexName;
    }
}

export default CredentialsService;

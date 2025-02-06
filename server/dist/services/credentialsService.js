class CredentialsService {
    constructor() {
        this.credentials = {
            openaiApiKey: null,
            pineconeApiKey: null,
            pineconeIndexName: null,
        };
    }
    static getInstance() {
        if (!CredentialsService.instance) {
            CredentialsService.instance = new CredentialsService();
        }
        return CredentialsService.instance;
    }
    setCredentials(credentials) {
        this.credentials = credentials;
    }
    getOpenAIKey() {
        if (!this.credentials.openaiApiKey) {
            throw new Error('OpenAI API key not set');
        }
        return this.credentials.openaiApiKey;
    }
    getPineconeKey() {
        if (!this.credentials.pineconeApiKey) {
            throw new Error('Pinecone API key not set');
        }
        return this.credentials.pineconeApiKey;
    }
    getPineconeIndexName() {
        if (!this.credentials.pineconeIndexName) {
            throw new Error('Pinecone index name not set');
        }
        return this.credentials.pineconeIndexName;
    }
}
export default CredentialsService;

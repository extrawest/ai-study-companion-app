"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// ... your other imports
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Add a basic root route
app.get('/', (req, res) => {
    res.json({ message: 'AI Companion API is running' });
});
// Add your other routes here
// app.use('/api/something', someRouter);
// Get the port from the environment variable or use 8080 as fallback
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
exports.default = app;

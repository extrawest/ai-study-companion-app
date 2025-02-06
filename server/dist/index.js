import express from 'express';
import cors from 'cors';
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8080;
app.get('/', (req, res) => {
    res.status(200).json('Welcome, your app is working well');
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
export default app;

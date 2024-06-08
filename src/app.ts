import express from "express";
import dotenv from "dotenv";
import assistantRoutes from "./routes/assistantRoutes";
import googleApiRoutes from "./routes/googleApiRoutes";

dotenv.config();

// env path
// console.log("env path", process.env);
console.log("ENV:", process.env.OPENAI_API_KEY, process.env.ASSISTANT_ID);

const app = express();
app.use(express.json());

app.use("/assistant", assistantRoutes);
app.use("/calendar", googleApiRoutes);

export default app;

import express from "express";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";

dotenv.config();

import googleApiRoutes from "./routes/googleApiRoutes";
import { handleWebSocketMessage } from "./controllers/websocketController";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use("/auth", googleApiRoutes);

// redirect oauth2callback to auth/oauth2callback for Google API
app.get("/oauth2callback", (req, res) => {
  res.redirect(req.url.replace("/oauth2callback", "/auth/oauth2callback"));
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Set up WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket connection established");

  ws.on("message", (message) => {
    console.log(`Received message => ${message}`);
    handleWebSocketMessage(ws, message.toString());
  });
});

export { wss };

import express from "express";
import dotenv from "dotenv";

dotenv.config();

import assistantRoutes from "./routes/assistantRoutes";
import googleApiRoutes from "./routes/googleApiRoutes";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use("/assistant", assistantRoutes);
app.use("/auth", googleApiRoutes);

// redirect oauth2callback to auth/oauth2callback for Google API
app.get("/oauth2callback", (req, res) => {
  res.redirect(req.url.replace("/oauth2callback", "/auth/oauth2callback"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeCraftWithGemini } from "./src/server/gemini";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: "25mb" }));

app.post("/api/gemini/analyze-craft", async (req, res) => {
  try {
    const result = await analyzeCraftWithGemini(req.body);
    res.json(result);
  } catch (err: unknown) {
    console.error("Gemini error:", err);
    const errorMessage = err instanceof Error ? err.message : "Craft analysis failed";
    res.status(500).json({ error: errorMessage });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", pwa: true, gemini: Boolean(process.env.GEMINI_API_KEY) });
});

// Serve static frontend build in production
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`KalaKart production server running on port ${port}`);
});

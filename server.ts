import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON and CORS
  app.use(express.json());
  app.use(cors());

  // AI Client Initialization
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      version: "1.8.0",
      externalApi: true
    });
  });

  // Externalized Chat API
  app.post("/api/chat", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Missing 'prompt' in request body." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Server configuration error: Gemini API key missing." });
      }

      // Re-initialize for every request for isolation
      const ai = new GoogleGenAI({ apiKey });

      // Using the models.generateContent pattern as per guidelines
      const result = await (ai as any).models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          temperature: 0.7,
        },
      });

      if (!result || !result.text) {
        throw new Error("Empty response from Gemini API");
      }

      res.json({
        text: result.text,
        metadata: {
          model: "gemini-3-flash-preview",
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("Backend AI Proxy Error Details:", {
        message: error.message,
        stack: error.stack,
        details: error.details
      });
      res.status(500).json({ 
        error: "Internal Intelligence Error", 
        message: error.message 
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

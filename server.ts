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
  app.get("/api/delight/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      version: "1.8.0",
      externalApi: true
    });
  });

  // --- Delight Finance API Mocks ---
  const MOCK_DATA = {
    businesses: [] as any[],
    categories: [] as any[],
    transactions: [] as any[],
    rules: [] as any[]
  };

  // Seed some data if empty
  if (MOCK_DATA.businesses.length === 0) {
    MOCK_DATA.businesses.push({
      id: "default-biz-123",
      name: "Default Business",
      isDefault: true,
      businessSettingsJson: JSON.stringify({ currency: "USD", timezone: "UTC", isBudgetingEnabled: true, isGstEnabled: false }),
      userId: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  app.get("/api/delight/businesses", (req, res) => {
    res.json(MOCK_DATA.businesses);
  });

  app.post("/api/delight/business", (req, res) => {
    const biz = { 
      ...req.body, 
      id: req.body.Id || req.body.id || Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const index = MOCK_DATA.businesses.findIndex(b => b.id === biz.id);
    if (index >= 0) MOCK_DATA.businesses[index] = biz;
    else MOCK_DATA.businesses.push(biz);
    res.json(biz);
  });

  app.get("/api/delight/business/:id", (req, res) => {
    const biz = MOCK_DATA.businesses.find(b => b.id === req.params.id);
    if (biz) res.json(biz);
    else res.status(404).json({ error: "Business not found" });
  });

  app.delete("/api/delight/business/:id", (req, res) => {
    MOCK_DATA.businesses = MOCK_DATA.businesses.filter(b => b.id !== req.params.id);
    res.json({ success: true });
  });

  app.get("/api/delight/categories/:businessId", (req, res) => {
    const cats = MOCK_DATA.categories.filter(c => c.businessId === req.params.businessId);
    res.json(cats);
  });

  app.post("/api/delight/category/:businessId", (req, res) => {
    const id = req.body.Id || req.body.id;
    if (id) {
       const cat = { 
        ...req.body, 
        id: id,
        businessId: req.params.businessId 
      };
      const index = MOCK_DATA.categories.findIndex(c => (c.id === id || c.Id === id));
      if (index >= 0) MOCK_DATA.categories[index] = cat;
      else MOCK_DATA.categories.push(cat);
      res.json(id);
    } else {
      const newId = Math.random().toString(36).substr(2, 9);
      const cat = { 
        ...req.body, 
        id: newId,
        businessId: req.params.businessId 
      };
      MOCK_DATA.categories.push(cat);
      res.json(newId);
    }
  });

  app.delete("/api/delight/category/:id", (req, res) => {
    MOCK_DATA.categories = MOCK_DATA.categories.filter(c => c.id !== req.params.id);
    res.json({ success: true });
  });

  app.get("/api/delight/business/:businessId/transactions/paged", (req, res) => {
    const { startDate, endDate, page = 1, pageSize = 10, searchText = "" } = req.query;
    let filtered = MOCK_DATA.transactions.filter(t => t.businessId === req.params.businessId);
    
    if (startDate) filtered = filtered.filter(t => t.date >= (startDate as string));
    if (endDate) filtered = filtered.filter(t => t.date <= (endDate as string));
    if (searchText) {
      const s = (searchText as string).toLowerCase();
      filtered = filtered.filter(t => t.description.toLowerCase().includes(s) || t.notes?.toLowerCase().includes(s));
    }

    const totalCount = filtered.length;
    const start = (Number(page) - 1) * Number(pageSize);
    const items = filtered.slice(start, start + Number(pageSize));

    res.json({
      totalCount,
      page: Number(page),
      pageSize: Number(pageSize),
      items
    });
  });

  app.post("/api/delight/transaction", (req, res) => {
    const tx = { 
      ...req.body, 
      id: req.body.id || Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    MOCK_DATA.transactions.push(tx);
    res.json(tx);
  });

  app.get("/api/delight/business/:businessId/rules", (req, res) => {
    res.json(MOCK_DATA.rules.filter(r => r.businessId === req.params.businessId));
  });

  app.post("/api/delight/rule", (req, res) => {
    const rule = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
    MOCK_DATA.rules.push(rule);
    res.json(rule);
  });

  // Externalized Chat API
  app.post("/api/delight/chat", async (req, res) => {
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

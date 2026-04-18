import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export interface FinancialData {
  expenses: any[];
  budgets: any[];
  accounts: any[];
  investments: any[];
  summary: {
    totalSpent: number;
    totalBudget: number;
    surplus: number;
    topCategory: string;
    investmentValue: number;
  };
}

export const analyzeFinancialHealth = async (data: FinancialData, userQuery?: string) => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are Delight, an expert financial advisor and health analyzer.
    Analyzed Data:
    - Expenses: ${JSON.stringify(data.expenses.slice(0, 50))} (sample)
    - Total Spent: $${data.summary.totalSpent}
    - Total Budget: $${data.summary.totalBudget}
    - Variance: ${data.summary.totalSpent > data.summary.totalBudget ? 'OVER BUDGET' : 'UNDER BUDGET'}
    - Investments: ${JSON.stringify(data.investments)}
    
    Goal:
    Provide sharp, data-grounded insights.
    Identify risks (e.g., high spending vs income, poor asset allocation).
    Suggest improvements.
    
    Source Traceability:
    Always cite specific categories or accounts when making claims.
    Format your response in Markdown. Use bold for key numbers.
  `;

  const prompt = userQuery || "Provide a general analysis of my financial health based on the provided data.";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const correlationId = `TRC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const dataHash = `DTA-${data.expenses.length}e-${data.budgets.length}b`; // Simple hash for reproducibility check

    return {
      text: response.text,
      metadata: {
        correlationId,
        dataSnapshot: dataHash,
        timestamp: new Date().toISOString(),
        modelUsed: model
      }
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "I'm sorry, I couldn't perform the analysis right now. Please try again later.";
  }
};

export const generateSummaryReport = async (data: FinancialData) => {
  // Similar to analyze but focused on a formal report
  return analyzeFinancialHealth(data, "Generate a detailed monthly financial summary report with a focus on variances and investment performance.");
};

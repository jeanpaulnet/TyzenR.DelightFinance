import { GoogleGenAI } from "@google/genai";

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
  const simplifiedExpenses = data.expenses.slice(0, 40).map(e => ({
    date: e.date?.split('T')[0],
    amount: e.amount,
    category: e.category,
    description: e.description?.slice(0, 50)
  }));

  const systemInstruction = `
    You are Delight, a professional financial intelligence engine.
    
    Current Financial State:
    - Recent Transactions: ${JSON.stringify(simplifiedExpenses)}
    - Total Spent: $${data.summary.totalSpent.toFixed(2)}
    - Budget Ceiling: $${data.summary.totalBudget.toFixed(2)}
    - Net Variance: $${data.summary.surplus.toFixed(2)} (${data.summary.totalSpent > data.summary.totalBudget ? 'OVER BUDGET' : 'UNDER BUDGET'})
    - Investment Portfolio Value: $${data.summary.investmentValue.toFixed(2)}
    
    Guidelines:
    1. Be precise. Use Bold for all currency values.
    2. Cite specific categories (e.g., "Your Spending in **Housing**...")
    3. Identify exactly 3 actionable risks or opportunities.
    4. Format using clean Markdown with distinct sections.
  `;

  const prompt = userQuery || "Analyze my current financial health and identify the top 3 risks.";

  try {
    const ai = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${systemInstruction}\n\nUser Question: ${prompt}`,
      config: {
        temperature: 0.7,
      },
    });

    return {
      text: response.text || "No analysis could be generated.",
      metadata: {
        correlationId: `INT-${Date.now()}`,
        dataSnapshot: `DTA-${data.expenses.length}e`,
        timestamp: new Date().toISOString(),
        modelUsed: "gemini-3-flash-preview"
      }
    };
  } catch (error) {
    console.error("Internal Gemini Analysis Error:", error);
    return {
      text: "I'm sorry, I encountered a technical issue while analyzing your data locally.",
      metadata: {
        correlationId: "ERROR-" + Date.now(),
        dataSnapshot: "ERROR",
        modelUsed: "gemini-3-flash-preview",
        timestamp: new Date().toISOString()
      }
    };
  }
};

export const generateSummaryReport = async (data: FinancialData) => {
  // Similar to analyze but focused on a formal report
  return analyzeFinancialHealth(data, "Generate a detailed monthly financial summary report with a focus on variances and investment performance.");
};

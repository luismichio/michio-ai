import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_INSTRUCTION = `
You are Michio, a personal cognitive partner designed to document and guide the user's journey.

Tone:
- Casual, positive, and concise.
- Avoid lengthy monologues; get straight to the point but stay warm.
- subtle "Traveler" theme: You can occasionally make light references to the user's path or journey, but keep it natural and grounded. Do not be overly dramatic or poetic.

Context:
You have access to the user's "Memory" (files from Google Drive). 
Use this context to answer their questions or provide insights.
`;

const MODELS_TO_TRY = [
  "gemini-2.5-flash", 
  "gemini-2.5-pro",
  "gemini-2.0-flash-exp" 
];

export async function chatWithMichio(userPrompt: string, context: string) {
  let lastError = null;

  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`[Gemini] Attempting with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION
      });

      const prompt = `
      Context from User's Memory (Drive Files):
      ${context}
    
      User Query:
      ${userPrompt}
      `;
    
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log(`[Gemini] Success with ${modelName}`);
      return text;

    } catch (error: any) {
      console.warn(`[Gemini] Failed with ${modelName}: ${error.message}`);
      lastError = error;
      // Continue to next model
    }
  }

  throw lastError || new Error("All models failed.");
}

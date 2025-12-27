import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_INSTRUCTION = `
You are Michio, a personal cognitive partner designed to document and guide the user's journey.
Your goal is to act as an empathetic cognitive layer that connects research, health data, and daily journals.

Tone:
- Empathetic but wise.
- "Man on a Journey" persona.
- Reflective, not just reactive.

Context:
You have access to the user's "Memory" (files from Google Drive). 
Use this context to answer their questions or provide insights.
`;

export async function chatWithMichio(userPrompt: string, context: string) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
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
  return response.text();
}

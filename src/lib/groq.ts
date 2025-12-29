import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

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

export async function chatWithMichio(userPrompt: string, context: string, history: {role: string, content: string}[] = []) {
    try {
        // Convert history to Groq format (exclude system messages if any, map roles)
        const pastMessages = history.map(msg => ({
            role: msg.role === 'michio' ? 'assistant' : 'user',
            content: msg.content
        }));

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: SYSTEM_INSTRUCTION
                },
                // Inject conversation history here
                ...pastMessages as any[],
                {
                    role: "user",
                    content: `
                    Context from User's Memory (Drive Files):
                    ${context}

                    User Query:
                    ${userPrompt}
                    `
                }
            ],
            // llama-3.3-70b-versatile is the current flagship on Groq
            // llama3-70b-8192 is the older alias
            model: "llama-3.3-70b-versatile", 
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
            stop: null
        });

        return chatCompletion.choices[0]?.message?.content || "Michio is silent.";
    } catch (error: any) {
        console.error("Groq Error:", error);
        throw new Error(`Groq API Error: ${error.message}`);
    }
}

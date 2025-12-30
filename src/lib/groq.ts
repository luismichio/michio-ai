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

        // Define Tools
        const tools = [
            {
                type: "function",
                function: {
                    name: "update_file",
                    description: "Update the content of an existing file in the user's Knowledge Base (misc/ folder). Use this when the user explicitly asks to edit, modify, or append to a note.",
                    parameters: {
                        type: "object",
                        properties: {
                            filePath: {
                                type: "string",
                                description: "The path of the file to update (e.g., 'misc/notes/todo.md').",
                            },
                            newContent: {
                                type: "string",
                                description: "The FULL new content of the file. This REPLACES the old content.",
                            },
                        },
                        required: ["filePath", "newContent"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "create_file",
                    description: "Create a new file. If the folder path doesn't exist, it will be created automatically. Use this for creating new notes, lists, or other documents.",
                    parameters: {
                        type: "object",
                        properties: {
                            filePath: {
                                type: "string",
                                description: "The path for the new file (e.g., 'misc/shopping/list.md').",
                            },
                            content: {
                                type: "string",
                                description: "The content of the new file.",
                            },
                        },
                        required: ["filePath", "content"],
                    },
                },
            }
        ];

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
            stop: null,
            tools: tools as any[],
            tool_choice: "auto"
        });

        const choice = chatCompletion.choices[0];
        const message = choice?.message;

        // Check for Tool Calls
        if (message?.tool_calls && message.tool_calls.length > 0) {
            return { 
                content: message.content, // Might be null if tool call only
                tool_calls: message.tool_calls,
                usage: chatCompletion.usage 
            };
        }

        const content = message?.content || "Michio is silent.";
        const usage = chatCompletion.usage; 

        return { content, usage };
    } catch (error: any) {
        console.error("Groq Error:", error);
        throw new Error(`Groq API Error: ${error.message}`);
    }
}

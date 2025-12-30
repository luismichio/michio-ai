import { Groq } from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export async function generateSummary(content: string): Promise<string> {
    try {
        // Truncate if too huge (e.g. books) to avoid context errors/cost
        // 15k chars ~ 4k tokens.
        const truncateContent = content.slice(0, 15000); 

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a specialized summarizer. Your task is to generate a concise 1-paragraph summary of the provided text. The summary should capture the main topic, key insights, and purpose of the document. Start with 'Summary:'."
                },
                {
                    role: "user",
                    content: truncateContent
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            max_tokens: 300
        });

        return completion.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Summarization failed:", error);
        return ""; // Fail silently, just don't add summary
    }
}

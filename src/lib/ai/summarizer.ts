import { Groq } from 'groq-sdk';

const getGroqClient = () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return new Groq({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true // Required for client-side usage if not proxying
    });
};

export async function generateSummary(content: string): Promise<string> {
    try {
        const groq = getGroqClient();
        if (!groq) {
            console.warn("Summarization skipped: GROQ_API_KEY not found.");
            return "Summary unavailable (GROQ_API_KEY missing).";
        }

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

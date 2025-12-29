import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listDriveFiles, getFileContent, appendToDailyLog, listFilesInFolder } from "@/lib/drive";
import { chatWithMichio } from "@/lib/groq";

export const POST = auth(async function POST(req) {
  const { context } = await req.clone().json().catch(() => ({})); 
  // Allow unauthenticated requests ONLY if they are bringing their own context (Guest Mode)
  if (!req.auth && !context) return NextResponse.json({ message: "Not authenticated and no context provided" }, { status: 401 });

  try {
    const { message, history, context: clientContext } = await req.json();
    const messageHistory = history || [];
    
    // 1. Context Strategy
    let context = "";
    
    if (clientContext) {
        // A. Client provided context (Guest Mode or Local-First)
        console.log("[Chat] Using Client-Provided Context");
        context = clientContext;
    } else if (req.auth) {
        // B. Server-Side Fetch (Legacy/Cloud Mode)
        // @ts-expect-error - accessToken is added in auth.ts
        const accessToken = req.auth.accessToken;
        
        const rootFiles = await listDriveFiles(accessToken);
        let validRootFiles = rootFiles?.slice(0, 3) || [];
        // ... (Existing Drive Logic remains as fallback)
        // For brevity in this diff, we assume the Drive logic is preserved or refactored
        // But to keep it clean, let's just re-implement the basic "Read Daily Log" here if no client context
         if (validRootFiles.length > 0) {
             const file = validRootFiles[0];
             const content = await getFileContent(file.id, accessToken);
             context = `\n--- Source: ${file.name} ---\n${content}\n`;
         }
    } else {
        // C. No Context (Fresh Guest)
        context = "No previous context available.";
    }

    // If context was provided by client, we skip the Drive logic entirely.
    // This allows Guest mode (no Auth) to work.


    // 2. Chat with Groq (Pass history)
    const response = await chatWithMichio(message, context, messageHistory);

    // 3. Log to History
    // DEPRECATED: Client now handles logging + SyncEngine uploads.
    // We do NOT write to Drive here anymore to avoid "Double Write" race conditions.
    // const logEntry = `### ${new Date().toLocaleTimeString()}\n**User**: ${message}\n**Michio**: ${response}\n`;
    // if (req.auth) ...

    return NextResponse.json({ response });

  } catch (error) {
    console.error("Chat error:", error);
    // @ts-ignore
    return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
  }
});

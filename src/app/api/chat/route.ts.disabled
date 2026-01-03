import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listDriveFiles, getFileContent } from "@/lib/drive";
import { aiManager } from "@/lib/ai/manager";
import { AITool } from "@/lib/ai/types";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";

import { TOOLS } from "@/lib/ai/tools";

export const POST = auth(async function POST(req) {
  const { context } = await req.clone().json().catch(() => ({})); 

  // Allow unauthenticated requests ONLY if they are bringing their own context (Guest Mode)
  if (!req.auth && !context) return NextResponse.json({ message: "Not authenticated and no context provided" }, { status: 401 });

  try {
    const { message, history, context: clientContext, config } = await req.json();
    const messageHistory = history || [];
    
    // 1. Context Strategy
    let finalContext = "";
    
    if (clientContext) {
        // A. Client provided context (Guest Mode or Local-First)
        console.log("[Chat] Using Client-Provided Context");
        finalContext = clientContext;
    } else if (req.auth) {
        // B. Server-Side Fetch (Legacy/Cloud Mode)
        // @ts-expect-error - accessToken is added in auth.ts
        const accessToken = req.auth.accessToken;
        
        const rootFiles = await listDriveFiles(accessToken);
        const validRootFiles = rootFiles?.slice(0, 3) || [];
        
         if (validRootFiles.length > 0) {
             const file = validRootFiles[0];
             if (file.id) {
                 const content = await getFileContent(file.id, accessToken);
                 finalContext = `\n--- Source: ${file.name} ---\n${content}\n`;
             }
         }
    } else {
        // C. No Context (Fresh Guest)
        finalContext = "No previous context available.";
    }

    // 2. Chat with AI Manager
    const result = await aiManager.chat(
        message, 
        finalContext, 
        messageHistory, 
        config || {}, // Use client config or empty (defaults handled in manager)
        TOOLS
    );

    // 3. Handle Tool Calls
    if (result.tool_calls) {
        return NextResponse.json({ 
            response: null,
            tool_calls: result.tool_calls,
            usage: result.usage 
        });
    }

    const { content: responseText, usage } = result;

    return NextResponse.json({ response: responseText, usage });

  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
  }
});

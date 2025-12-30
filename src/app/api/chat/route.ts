import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listDriveFiles, getFileContent } from "@/lib/drive";
import { aiManager } from "@/lib/ai/manager";
import { AITool } from "@/lib/ai/types";

// Helper to define tools (could be moved to lib/ai/tools.ts)
const TOOLS: AITool[] = [
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
    },
    {
        type: "function",
        function: {
            name: "update_user_settings",
            description: "Update the user's profile settings such as their Name or preferred AI Tone. Use this during onboarding or when the user explicitly asks to change these settings.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "The user's preferred name (e.g. 'Luis', 'Captain')."
                    },
                    tone: {
                        type: "string",
                        description: "The preferred tone for the AI (e.g. 'Professional', 'Sarcastic', 'Pirate')."
                    }
                },
            },
        },
    }
];

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

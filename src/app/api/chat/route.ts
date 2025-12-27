import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listDriveFiles, getFileContent } from "@/lib/drive";
import { chatWithMichio } from "@/lib/gemini";

export const POST = auth(async function POST(req) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  try {
    const { message } = await req.json();
    // @ts-expect-error - accessToken is added in auth.ts
    const accessToken = req.auth.accessToken;

    // 1. Get Context (Naive PoC: Read first 3 markdown files)
    const files = await listDriveFiles(accessToken);
    let context = "";
    
    if (files && files.length > 0) {
      const topFiles = files.slice(0, 3);
      for (const file of topFiles) {
        if (file.id) {
          try {
            const content = await getFileContent(file.id, accessToken);
            context += `\n--- File: ${file.name} ---\n${content}\n`;
          } catch (e) {
            console.error(`Failed to read file ${file.name}`, e);
          }
        }
      }
    } else {
        context = "No files found in Drive.";
    }

    // 2. Chat with Gemini
    const response = await chatWithMichio(message, context);

    return NextResponse.json({ response });

  } catch (error) {
    console.error("Chat error:", error);
    // @ts-ignore
    return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
  }
});

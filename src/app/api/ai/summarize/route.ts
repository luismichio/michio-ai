import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/ai/summarizer";

export const POST = auth(async function POST(req) {
  // if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  try {
    const { content } = await req.json();
    if (!content) return NextResponse.json({ message: "No content provided" }, { status: 400 });

    const summary = await generateSummary(content);
    return NextResponse.json({ summary });

  } catch (error: any) {
    console.error("Summarize Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});

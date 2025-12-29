import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listFilesInFolder } from "@/lib/drive";

export const GET = auth(async function GET(req) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  // @ts-expect-error
  const accessToken = req.auth.accessToken;

  try {
    const files = await listFilesInFolder(accessToken, 'history');
    // Extract dates from "YYYY-MM-DD.md"
    const dates = files?.map(f => f.name?.replace('.md', ''))
                        .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name || '')) || [];
    
    return NextResponse.json({ dates });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});

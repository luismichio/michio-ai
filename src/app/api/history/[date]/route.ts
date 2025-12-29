import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listFilesInFolder, getFileContent } from "@/lib/drive";

// @ts-ignore
export const GET = auth(async function GET(req, { params }: any) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  // @ts-expect-error
  const accessToken = req.auth.accessToken;
  const { date } = await params; // YYYY-MM-DD

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ message: "Invalid date format" }, { status: 400 });
  }

  try {
    // 1. Find the file ID for this date
    const files = await listFilesInFolder(accessToken, 'history');
    const targetFile = files?.find(f => f.name === `${date}.md`);
    console.log(`[History] Fetching ${date}, File found: ${targetFile?.id}`);

    if (!targetFile || !targetFile.id) {
        return NextResponse.json({ content: "No journal entry found for this date." });
    }

    // 2. Read content
    const content = await getFileContent(targetFile.id, accessToken);
    return NextResponse.json({ content });

  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});

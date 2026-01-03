import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { google } from 'googleapis';
import { getOrCreateMeechiFolder, getOrCreateSubfolder } from "@/lib/drive";

export const POST = auth(async function POST(req) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  // @ts-expect-error
  const accessToken = req.auth.accessToken;
  const authClient = new google.auth.OAuth2();
  authClient.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: authClient });

  try {
    const rootId = await getOrCreateMeechiFolder(drive);
    
    // Create Subfolders
    await getOrCreateSubfolder(drive, rootId, 'core');
    await getOrCreateSubfolder(drive, rootId, 'history');
    await getOrCreateSubfolder(drive, rootId, 'media');
    await getOrCreateSubfolder(drive, rootId, 'misc');

    return NextResponse.json({ message: "Structure created: core, history, media, misc" });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});

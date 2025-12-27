import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { google } from 'googleapis';
import { getOrCreateMichioFolder } from "@/lib/drive";

export const POST = auth(async function POST(req) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  // @ts-expect-error
  const accessToken = req.auth.accessToken;
  const authClient = new google.auth.OAuth2();
  authClient.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: authClient });

  try {
    const folderId = await getOrCreateMichioFolder(drive);

    // Create a welcome file to prove it works
    await drive.files.create({
      requestBody: {
        name: 'Welcome to Michio.md',
        parents: [folderId],
        mimeType: 'text/markdown',
      },
      media: {
        mimeType: 'text/markdown',
        body: '# Welcome to your Michio Journal\n\nThis is the start of your journey. Michio will read files in this folder to assist you.',
      },
    });

    return NextResponse.json({ message: "Journal created successfully!" });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getFileContent, appendToDailyLog, getOrCreateMeechiFolder, getOrCreateSubfolder } from "@/lib/drive";
import { mergeLogs } from "@/lib/sync/merge";
import { google } from 'googleapis';

export const POST = auth(async function POST(req) {
  if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  try {
    const { filename, localContent } = await req.json();
    // @ts-expect-error - accessToken is added in auth.ts
    const accessToken = req.auth.accessToken;

    // 1. Read Remote Content
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: authClient });

    const rootId = await getOrCreateMeechiFolder(drive);
    const historyId = await getOrCreateSubfolder(drive, rootId, 'history');
    
    // Find specific file
    const filesRes = await drive.files.list({
      q: `name = '${filename}' and '${historyId}' in parents and trashed = false`,
      fields: 'files(id)',
    });

    let remoteContent = "";
    let fileId = null;

    if (filesRes.data.files && filesRes.data.files.length > 0) {
        fileId = filesRes.data.files[0].id;
        remoteContent = await getFileContent(fileId!, accessToken);
    }

    // 2. Merge
    const mergedContent = mergeLogs(localContent, remoteContent);

    // 3. Write Back if different
    // (Only if merged content is longer or different than remote)
    if (mergedContent !== remoteContent) {
        if (fileId) {
             await drive.files.update({
                fileId,
                media: { mimeType: 'text/markdown', body: mergedContent },
             });
        } else {
             // Create New
             await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [historyId],
                    mimeType: 'text/markdown',
                },
                media: { mimeType: 'text/markdown', body: mergedContent },
            });
        }
        console.log(`[Sync] Synced ${filename}. Length: ${mergedContent.length}`);
    } else {
        console.log(`[Sync] No changes for ${filename}`);
    }

    return NextResponse.json({ content: mergedContent });

  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ message: `Sync Error: ${error.message}` }, { status: 500 });
  }
});

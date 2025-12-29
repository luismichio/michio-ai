import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getFileContent, getOrCreateMichioFolder, getOrCreateSubfolder, listFilesInFolder } from "@/lib/drive";
import { google } from 'googleapis';

// Helper to get authorized drive client
async function getDrive(req: any) {
    if (!req.auth) throw new Error("Not authenticated");
    // @ts-expect-error - accessToken is added in auth.ts
    const accessToken = req.auth.accessToken;
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    return google.drive({ version: 'v3', auth: authClient });
}

export const GET = auth(async function GET(req) {
    if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId');

    try {
        // @ts-expect-error
        const accessToken = req.auth.accessToken;

        if (fileId) {
            // DOWNLOAD CONTENT
            const content = await getFileContent(fileId, accessToken);
            return NextResponse.json({ content });
        } else {
            // LIST FILES
            const files = await listFilesInFolder(accessToken, 'misc');
            return NextResponse.json({ files: files || [] });
        }
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});

export const POST = auth(async function POST(req) {
    if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

    try {
        const { name, content, topic } = await req.json();
        console.log(`[SyncAPI] Received upload: ${name}, Topic: "${topic}"`);

        const drive = await getDrive(req);

        // Get 'misc' folder ID
        const rootId = await getOrCreateMichioFolder(drive);
        const miscId = await getOrCreateSubfolder(drive, rootId, 'misc');
        
        let targetId = miscId;
        
        // Handle Topic Subfolder
        if (topic) {
            targetId = await getOrCreateSubfolder(drive, miscId, topic);
            console.log(`[SyncAPI] Resolved Topic "${topic}" to Folder ID: ${targetId}`);
        } else {
            console.log(`[SyncAPI] No topic provided, using misc root: ${miscId}`);
        }

        // Check if file exists in target (Topic) folder
        const res = await drive.files.list({
            q: `name = '${name}' and '${targetId}' in parents and trashed = false`,
            fields: 'files(id)',
        });
        
        const existingFile = res.data.files?.[0];

        if (existingFile) {
            // Update
            await drive.files.update({
                fileId: existingFile.id!,
                media: { mimeType: 'text/plain', body: content },
            });
        } else {
            // Create
            await drive.files.create({
                requestBody: {
                    name,
                    parents: [targetId],
                    mimeType: 'text/plain', 
                },
                media: { mimeType: 'text/plain', body: content },
            });
        }
        
        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});

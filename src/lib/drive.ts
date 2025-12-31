import { google } from 'googleapis';

const MEECHI_FOLDER_NAME = 'Meechi Journal';

export async function getOrCreateMeechiFolder(drive: any) {
  // 1. Search for existing folder
  const listRes = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${MEECHI_FOLDER_NAME}' and trashed = false`,
    fields: 'files(id, name)',
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    return listRes.data.files[0].id;
  }

  // 2. Create if not exists
  const createRes = await drive.files.create({
    requestBody: {
      name: MEECHI_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return createRes.data.id;
}

export async function getOrCreateSubfolder(drive: any, parentId: string, name: string) {
  // 1. Search for ANY folder in the parent
  const listRes = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    fields: 'files(id, name)',
  });

  // 2. Client-side case-insensitive match
  const existingFolder = listRes.data.files?.find((f: any) => f.name.toLowerCase() === name.toLowerCase());

  if (existingFolder) {
    return existingFolder.id;
  }

  // 3. Create if not found (using the preferred name casing provided)
  const createRes = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  return createRes.data.id;
}

export async function appendToDailyLog(accessToken: string, entry: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const rootId = await getOrCreateMeechiFolder(drive);
    const historyId = await getOrCreateSubfolder(drive, rootId, 'history');
    
    // Use Local Time for YYYY-MM-DD
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    // const today = new Date().toISOString().split('T')[0]; // Removed UTC to avoid timezone lag
    const fileName = `${today}.md`;

    // Check for existing file
    const filesRes = await drive.files.list({
      q: `name = '${fileName}' and '${historyId}' in parents and trashed = false`,
      fields: 'files(id)',
    });

    let currentContent = '';
    let fileId = null;

    if (filesRes.data.files && filesRes.data.files.length > 0) {
      fileId = filesRes.data.files[0].id;
      const getRes = await drive.files.get({ fileId: fileId!, alt: 'media' }, { responseType: 'stream' });
      currentContent = await new Promise<string>((resolve, reject) => {
        let data = '';

        getRes.data.on('data', c => data += c).on('end', () => resolve(data)).on('error', reject);
      });
    }

    const newContent = currentContent + '\n\n' + entry;

    if (fileId) {
      // Update
      await drive.files.update({
        fileId,
        media: { mimeType: 'text/markdown', body: newContent },
      });
    } else {
      // Create
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [historyId],
          mimeType: 'text/markdown',
        },
        media: { mimeType: 'text/markdown', body: newContent },
      });
    }

  } catch (e) {
    console.error("Failed to append log:", e);
  }
}

export async function listDriveFiles(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const folderId = await getOrCreateMeechiFolder(drive);

    // List files specifically INSIDE the Meechi folder (recursive search not efficient here, keeping simple)
    // For PoC, sticking to just finding md/txt anywhere in that folder structure would be complex.
    // Let's just look in the ROOT Meechi folder for context for now to verify "Structure" works.
    const res = await drive.files.list({
      pageSize: 10,
      q: `'${folderId}' in parents and (mimeType = 'text/markdown' or mimeType = 'text/plain') and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
    });
    
    return res.data.files;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

export async function getFileContent(fileId: string, accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
//     const getRes = await drive.files.get({ fileId: fileId!, alt: 'media' }, { responseType: 'stream' });
    
//     return new Promise<string>((resolve, reject) => {
//       let data = '';
//       getRes.data
//         // @ts-expect-error - Gaxios stream types are tricky
//         .on('data', (chunk: any) => {
//              console.log(`[Drive] Chunk received: ${chunk.length} bytes`);
//              data += chunk;
//         })
//         .on('end', () => {
//             console.log(`[Drive] Stream ended. Total length: ${data.length}`);
//             resolve(data);
//         })
//         .on('error', (err: any) => {
//             console.error("[Drive] Stream error:", err);
//             reject(err);
//         });
//     });

    // Strategy B: ArrayBuffer (Simpler for text files)
    const res = await drive.files.get(
      { fileId: fileId!, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    // Cast to unknown first to avoid Gaxios type mismatch
    const buf = Buffer.from(res.data as unknown as ArrayBuffer);
    const text = buf.toString('utf-8');
    console.log(`[Drive] Read file via Buffer. Length: ${text.length}`);
    return text;

  } catch (error) {
    console.error('Error reading file:', error);
    return "Error reading file.";
  }
}

export async function listFilesInFolder(accessToken: string, folderName: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const rootId = await getOrCreateMeechiFolder(drive);
    const targetFolderId = await getOrCreateSubfolder(drive, rootId, folderName);
    
    // Queue: { id, path } - path is relative to targetFolderId (e.g. "" or "Fatherhood")
    let queue = [{ id: targetFolderId, path: "" }];
    let files: { id: string, name: string, path: string, folder: string }[] = [];
    let scannedCount = 0;
    const MAX_FOLDERS = 20;

    while (queue.length > 0 && scannedCount < MAX_FOLDERS) {
        const current = queue.shift()!;
        scannedCount++;

        const res = await drive.files.list({
            pageSize: 100,
            q: `'${current.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            orderBy: 'name',
        });
        
        if (res.data.files) {
            for (const f of res.data.files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                    // It's a subfolder (Topic)
                    // Push to queue with updated path
                    const newPath = current.path ? `${current.path}/${f.name!}` : f.name!;
                    queue.push({ id: f.id!, path: newPath });
                } else {
                    // It's a file
                    files.push({
                        id: f.id!,
                        name: f.name!, // Filename
                        path: current.path, // e.g. "Fatherhood"
                        folder: current.path // The 'Topic'
                    });
                }
            }
        }
    }
    
    return files;
  } catch (error) {
    console.error(`Error listing files in ${folderName}:`, error);
    throw error;
  }
}

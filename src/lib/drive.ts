import { google } from 'googleapis';

const MICHIO_FOLDER_NAME = 'Michio Journal';

export async function getOrCreateMichioFolder(drive: any) {
  // 1. Search for existing folder
  const listRes = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${MICHIO_FOLDER_NAME}' and trashed = false`,
    fields: 'files(id, name)',
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    return listRes.data.files[0].id;
  }

  // 2. Create if not exists
  const createRes = await drive.files.create({
    requestBody: {
      name: MICHIO_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return createRes.data.id;
}

export async function listDriveFiles(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const folderId = await getOrCreateMichioFolder(drive);

    // List files specifically INSIDE the Michio folder
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
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    return new Promise<string>((resolve, reject) => {
      let data = '';
      res.data
        .on('data', (chunk) => (data += chunk))
        .on('end', () => resolve(data))
        .on('error', (err) => reject(err));
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return "Error reading file.";
  }
}

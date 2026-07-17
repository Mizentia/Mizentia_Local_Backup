const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { google } = require('googleapis');
const { 
  getWorkspaceRoot, 
  saveState, 
  getUploadTempDir, 
  getLocalDriveBackupRoot 
} = require('./config');

// Setup Google Drive client
function getDriveClient(config) {
  if (config.connectionType === 'simulation' || config.connectionType === 'local_drive') {
    return null;
  }

  if (config.connectionType === 'service_account') {
    if (!config.serviceAccount) {
      throw new Error('Service Account configuration is missing.');
    }
    const creds = typeof config.serviceAccount === 'string' 
      ? JSON.parse(config.serviceAccount) 
      : config.serviceAccount;
    
    const auth = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive']
    );
    return google.drive({ version: 'v3', auth });
  }

  if (config.connectionType === 'oauth2') {
    if (!config.oauth2 || !config.oauth2.tokens) {
      throw new Error('OAuth2 tokens are missing. Please authenticate first.');
    }
    const oauth2Client = new google.auth.OAuth2(
      config.oauth2.client_id,
      config.oauth2.client_secret,
      config.oauth2.redirect_uri
    );
    oauth2Client.setCredentials(config.oauth2.tokens);
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  throw new Error('Unknown connection type');
}

// Drive Operations Wrapper (Supports Drive API and Local Simulation)
const driveManager = {
  // Create or resolve folders recursively
  async resolveFolderId(drive, relativePath, config, state) {
    if (config.connectionType === 'simulation') {
      const folderId = 'sim-folder-' + relativePath.replace(/\//g, '-');
      state.folders = state.folders || {};
      state.folders[relativePath] = folderId;
      saveState(state);
      return folderId;
    }

    if (config.connectionType === 'local_drive') {
      const backupRoot = getLocalDriveBackupRoot(config);
      if (!backupRoot) {
        throw new Error('লোকাল ড্রাইভ ব্যাকআপ পাথ কনফিগার করা নেই।');
      }
      const targetDir = relativePath ? path.join(backupRoot, relativePath) : backupRoot;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      state.folders = state.folders || {};
      state.folders[relativePath] = targetDir;
      saveState(state);
      return targetDir;
    }

    if (!relativePath || relativePath === '.' || relativePath === '') {
      return config.driveFolderId || 'root';
    }

    // Check state cache first
    if (state.folders && state.folders[relativePath]) {
      return state.folders[relativePath];
    }

    const parts = relativePath.split('/');
    let currentParentId = config.driveFolderId || 'root';
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (state.folders && state.folders[currentPath]) {
        currentParentId = state.folders[currentPath];
        continue;
      }

      // Check Google Drive if folder exists under current parent
      console.log(`Checking GDrive folder: "${part}" under parent ID: ${currentParentId}`);
      const query = `name = '${part}' and mimeType = 'application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed = false`;
      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      let folderId;
      if (response.data.files && response.data.files.length > 0) {
        folderId = response.data.files[0].id;
        console.log(`Found existing folder "${part}" ID: ${folderId}`);
      } else {
        // Create it
        console.log(`Creating folder "${part}" under parent ID: ${currentParentId}`);
        const fileMetadata = {
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParentId]
        };
        const folder = await drive.files.create({
          resource: fileMetadata,
          fields: 'id'
        });
        folderId = folder.data.id;
        console.log(`Created folder "${part}" ID: ${folderId}`);
      }

      state.folders = state.folders || {};
      state.folders[currentPath] = folderId;
      saveState(state);
      currentParentId = folderId;
    }

    return currentParentId;
  },

  // Upload or update a file
  async uploadFile(drive, relativePath, localFullPath, config, state) {
    const parentDir = path.dirname(relativePath).replace(/\\/g, '/');
    const fileName = path.basename(relativePath);
    
    // Resolve parent folder ID
    const parentId = await this.resolveFolderId(drive, parentDir, config, state);

    if (config.connectionType === 'simulation') {
      // Simulation mode: copy file to .tmp.driveupload named by a random ID
      const simFileId = state.files[relativePath]?.driveFileId || crypto.randomBytes(8).toString('hex');
      const simDestPath = path.join(getUploadTempDir(), simFileId);
      fs.copyFileSync(localFullPath, simDestPath);
      return {
        id: simFileId,
        parentId: parentId
      };
    }

    if (config.connectionType === 'local_drive') {
      const destPath = path.join(parentId, fileName);
      console.log(`Copying file to local drive backup: ${destPath}`);
      fs.copyFileSync(localFullPath, destPath);
      return {
        id: destPath,
        parentId: parentId
      };
    }

    const fileMetadata = {
      name: fileName,
      parents: [parentId]
    };

    const media = {
      body: fs.createReadStream(localFullPath)
    };

    // If it was already backed up, we update it
    const existingFileId = state.files[relativePath]?.driveFileId;
    
    if (existingFileId) {
      try {
        console.log(`Updating existing Google Drive file: ${relativePath} (ID: ${existingFileId})`);
        const response = await drive.files.update({
          fileId: existingFileId,
          media: media,
          fields: 'id'
        });
        return { id: response.data.id, parentId: parentId };
      } catch (err) {
        console.warn(`Failed to update file ${existingFileId}, attempting to recreate:`, err.message);
      }
    }

    // Create new file
    console.log(`Uploading new file to Google Drive: ${relativePath}`);
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    return { id: response.data.id, parentId: parentId };
  },

  // Delete a file or directory
  async deleteFile(drive, driveFileId, config) {
    if (config.connectionType === 'simulation') {
      const simFilePath = path.join(getUploadTempDir(), driveFileId);
      if (fs.existsSync(simFilePath)) {
        fs.unlinkSync(simFilePath);
      }
      return true;
    }

    if (config.connectionType === 'local_drive') {
      console.log(`Deleting local drive backup item: ${driveFileId}`);
      if (fs.existsSync(driveFileId)) {
        try {
          const stats = fs.statSync(driveFileId);
          if (stats.isDirectory()) {
            fs.rmSync(driveFileId, { recursive: true, force: true });
          } else {
            fs.unlinkSync(driveFileId);
          }
        } catch (e) {
          console.error(`Error deleting local backup item ${driveFileId}:`, e.message);
        }
      }
      return true;
    }

    console.log(`Deleting file from Google Drive (ID: ${driveFileId})`);
    try {
      await drive.files.delete({
        fileId: driveFileId
      });
      return true;
    } catch (e) {
      console.error(`Error deleting file ${driveFileId} on Google Drive:`, e.message);
      return true;
    }
  },

  // Rename or Move a file in Drive
  async renameOrMoveFile(drive, oldRelativePath, newRelativePath, driveFileId, config, state) {
    const oldParentDir = path.dirname(oldRelativePath).replace(/\\/g, '/');
    const newParentDir = path.dirname(newRelativePath).replace(/\\/g, '/');
    const newFileName = path.basename(newRelativePath);

    const newParentId = await this.resolveFolderId(drive, newParentDir, config, state);

    if (config.connectionType === 'simulation') {
      return { id: driveFileId, parentId: newParentId };
    }

    if (config.connectionType === 'local_drive') {
      const newDestPath = path.join(newParentId, newFileName);
      console.log(`Renaming/moving local drive backup file: ${driveFileId} -> ${newDestPath}`);
      if (fs.existsSync(driveFileId)) {
        fs.renameSync(driveFileId, newDestPath);
      } else {
        const fullLocalPath = path.join(getWorkspaceRoot(), newRelativePath);
        fs.copyFileSync(fullLocalPath, newDestPath);
      }
      return { id: newDestPath, parentId: newParentId };
    }

    console.log(`Renaming/Moving GDrive file ID: ${driveFileId} to "${newRelativePath}"`);
    try {
      const file = await drive.files.get({
        fileId: driveFileId,
        fields: 'parents'
      });
      const previousParents = file.data.parents ? file.data.parents.join(',') : '';

      const response = await drive.files.update({
        fileId: driveFileId,
        addParents: newParentId,
        removeParents: previousParents,
        resource: { name: newFileName },
        fields: 'id, parents'
      });
      return { id: response.data.id, parentId: newParentId };
    } catch (e) {
      console.error(`Error moving file ${driveFileId}:`, e.message);
      const fullPath = path.join(getWorkspaceRoot(), newRelativePath);
      return await this.uploadFile(drive, newRelativePath, fullPath, config, state);
    }
  },

  // Download a file
  async downloadFile(drive, driveFileId, localFullPath, config) {
    const parentDir = path.dirname(localFullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (config.connectionType === 'simulation') {
      const simFilePath = path.join(getUploadTempDir(), driveFileId);
      if (!fs.existsSync(simFilePath)) {
        throw new Error(`Simulated backup file ${driveFileId} not found in .tmp.driveupload`);
      }
      fs.copyFileSync(simFilePath, localFullPath);
      return true;
    }

    if (config.connectionType === 'local_drive') {
      console.log(`Restoring local drive backup file: ${driveFileId} -> ${localFullPath}`);
      if (!fs.existsSync(driveFileId)) {
        throw new Error(`Local backup file not found at: ${driveFileId}`);
      }
      fs.copyFileSync(driveFileId, localFullPath);
      return true;
    }

    console.log(`Downloading file ID ${driveFileId} to ${localFullPath}`);
    const dest = fs.createWriteStream(localFullPath);
    const response = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    return new Promise((resolve, reject) => {
      response.data
        .on('end', () => {
          resolve(true);
        })
        .on('error', err => {
          console.error('Error downloading:', err);
          reject(err);
        })
        .pipe(dest);
    });
  }
};

module.exports = {
  getDriveClient,
  driveManager
};

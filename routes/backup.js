const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getWorkspaceRoot, loadConfig, loadState, saveState, getFileHash } = require('../lib/config');
const { getDriveClient, driveManager } = require('../lib/driveManager');

// Perform Backup
router.post('/', async (req, res) => {
  const { selections } = req.body; // array of { type: 'add'|'modify'|'delete'|'rename', path, oldPath, newPath }
  
  if (!selections || selections.length === 0) {
    return res.status(400).json({ success: false, error: 'No items selected for backup.' });
  }

  try {
    const config = loadConfig();
    const state = loadState();
    const drive = getDriveClient(config);

    const results = {
      success: [],
      failed: []
    };

    console.log(`Starting backup of ${selections.length} selected items...`);
    
    for (const item of selections) {
      const { type, path: relPath, oldPath, newPath, nodeType } = item;
      
      try {
        if (nodeType === 'folder') {
          if (type === 'add') {
            await driveManager.resolveFolderId(drive, relPath, config, state);
            results.success.push({ path: relPath, type });
          } else if (type === 'delete') {
            const driveFileId = state.folders ? state.folders[relPath] : null;
            if (driveFileId) {
              await driveManager.deleteFile(drive, driveFileId, config);
            }
            if (state.folders) {
              delete state.folders[relPath];
            }
            results.success.push({ path: relPath, type });
          } else if (type === 'rename') {
            const driveFileId = item.driveFileId || state.folders[oldPath];
            if (!driveFileId) {
              throw new Error(`No backup record ID found for renaming folder from ${oldPath}`);
            }

            const driveResult = await driveManager.renameOrMoveFile(drive, oldPath, newPath, driveFileId, config, state);

            state.folders = state.folders || {};
            if (state.folders[oldPath]) {
              delete state.folders[oldPath];
            }
            state.folders[newPath] = driveResult.id;

            // Update all nested files in state.files
            const oldPrefix = oldPath.endsWith('/') ? oldPath : oldPath + '/';
            const newPrefix = newPath.endsWith('/') ? newPath : newPath + '/';
            if (state.files) {
              for (const filePath in state.files) {
                if (filePath.startsWith(oldPrefix)) {
                  const newFilePath = newPrefix + filePath.slice(oldPrefix.length);
                  state.files[newFilePath] = {
                    ...state.files[filePath]
                  };
                  if (config.connectionType === 'local_drive') {
                    state.files[newFilePath].driveFileId = state.files[newFilePath].driveFileId.replace(oldPath, newPath);
                    state.files[newFilePath].driveParentId = state.files[newFilePath].driveParentId.replace(oldPath, newPath);
                  }
                  delete state.files[filePath];
                }
              }
            }
            // Update all nested folders in state.folders
            if (state.folders) {
              for (const folderPath in state.folders) {
                if (folderPath.startsWith(oldPrefix) && folderPath !== oldPath) {
                  const newFolderPath = newPrefix + folderPath.slice(oldPrefix.length);
                  state.folders[newFolderPath] = state.folders[folderPath];
                  if (config.connectionType === 'local_drive') {
                    state.folders[newFolderPath] = state.folders[newFolderPath].replace(oldPath, newPath);
                  }
                  delete state.folders[folderPath];
                }
              }
            }

            results.success.push({ oldPath, newPath, type });
          }
        } else {
          if (type === 'add' || type === 'modify') {
            const localFullPath = path.join(getWorkspaceRoot(), relPath);
            if (!fs.existsSync(localFullPath)) {
              throw new Error(`Local file not found at ${localFullPath}`);
            }

            const fileStats = fs.statSync(localFullPath);
            const hash = await getFileHash(localFullPath);

            const driveResult = await driveManager.uploadFile(drive, relPath, localFullPath, config, state);

            state.files = state.files || {};
            state.files[relPath] = {
              size: fileStats.size,
              mtime: fileStats.mtimeMs,
              hash: hash,
              driveFileId: driveResult.id,
              driveParentId: driveResult.parentId,
              updatedAt: new Date().toISOString()
            };
            results.success.push({ path: relPath, type });
          } 
          
          else if (type === 'delete') {
            const driveFileId = state.files[relPath]?.driveFileId;
            if (driveFileId) {
              await driveManager.deleteFile(drive, driveFileId, config);
            }
            if (state.files) {
              delete state.files[relPath];
            }
            results.success.push({ path: relPath, type });
          } else if (type === 'rename') {
            const driveFileId = item.driveFileId || state.files[oldPath]?.driveFileId;
            if (!driveFileId) {
              throw new Error(`No backup record ID found for renaming file from ${oldPath}`);
            }

            const localFullPath = path.join(getWorkspaceRoot(), newPath);
            const fileStats = fs.statSync(localFullPath);
            const hash = await getFileHash(localFullPath);

            const driveResult = await driveManager.renameOrMoveFile(drive, oldPath, newPath, driveFileId, config, state);

            state.files = state.files || {};
            if (state.files[oldPath]) {
              delete state.files[oldPath];
            }
            state.files[newPath] = {
              size: fileStats.size,
              mtime: fileStats.mtimeMs,
              hash: hash,
              driveFileId: driveResult.id,
              driveParentId: driveResult.parentId,
              updatedAt: new Date().toISOString()
            };
            results.success.push({ oldPath, newPath, type });
          }
        }

      } catch (err) {
        console.error(`Failed to back up ${relPath || oldPath || newPath}:`, err);
        results.failed.push({
          path: relPath || oldPath || newPath,
          type,
          error: err.message
        });
      }
    }

    state.lastBackupTime = new Date().toISOString();
    saveState(state);

    res.json({
      success: true,
      results
    });

  } catch (e) {
    console.error('Backup transaction failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

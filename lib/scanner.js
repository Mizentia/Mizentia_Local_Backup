const fs = require('fs');
const path = require('path');
const { getFileHash, saveState } = require('./config');

async function scanDirectory(dir, ig, rootDir, fileList = [], folderList = [], onProgress = null) {
  let files;
  try {
    files = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`Error reading directory ${dir}:`, e.message);
    return;
  }

  const relDir = path.relative(rootDir, dir).replace(/\\/g, '/');
  if (relDir && relDir !== '.' && relDir !== '') {
    folderList.push(relDir);
  }

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (ig.ignores(relativePath) || ig.ignores(relativePath + '/')) {
      continue;
    }

    if (onProgress) {
      onProgress(relativePath);
    }

    if (file.isDirectory()) {
      await scanDirectory(fullPath, ig, rootDir, fileList, folderList, onProgress);
    } else {
      try {
        const stats = await fs.promises.stat(fullPath);
        fileList.push({
          relativePath,
          fullPath,
          size: stats.size,
          mtime: stats.mtimeMs,
          type: 'file'
        });
      } catch (e) {
        console.error(`Error reading file stats for ${relativePath}:`, e);
      }
    }
  }
}

async function compareWorkspace(rootDir, state, ig, onProgress = null) {
  let stateModified = false;
  const fileList = [];
  const folderList = [];
  await scanDirectory(rootDir, ig, rootDir, fileList, folderList, onProgress);

  const localFilesMap = {};
  fileList.forEach(f => {
    localFilesMap[f.relativePath] = f;
  });

  const stateFiles = state.files || {};
  const added = [];
  const modified = [];
  const deleted = [];
  const unchanged = [];

  // Check for added and modified files
  for (const file of fileList) {
    const relPath = file.relativePath;
    const stateFile = stateFiles[relPath];

    if (!stateFile) {
      added.push(file);
    } else {
      if (file.size !== stateFile.size || Math.abs(file.mtime - stateFile.mtime) > 1000) {
        try {
          const currentHash = await getFileHash(file.fullPath);
          if (currentHash !== stateFile.hash) {
            modified.push({
              ...file,
              oldSize: stateFile.size,
              oldMtime: stateFile.mtime
            });
          } else {
            state.files[relPath].mtime = file.mtime;
            stateModified = true;
            unchanged.push(file);
          }
        } catch (hashErr) {
          console.error(`Skipping hash checking for ${relPath} due to error:`, hashErr.message);
          // If hashing fails, we safely assume unmodified to avoid crash/unnecessary backup failure
          unchanged.push(file);
        }
      } else {
        unchanged.push(file);
      }
    }
  }

  // Check for deleted files
  for (const relPath in stateFiles) {
    if (ig.ignores(relPath) || ig.ignores(relPath + '/')) {
      continue;
    }
    if (!localFilesMap[relPath]) {
      deleted.push({
        relativePath: relPath,
        driveFileId: stateFiles[relPath].driveFileId,
        size: stateFiles[relPath].size,
        type: 'file'
      });
    }
  }

  // Detect Renames/Moves
  const renamed = [];
  const finalAdded = [];
  const finalDeleted = [...deleted];

  for (const addFile of added) {
    try {
      const currentHash = await getFileHash(addFile.fullPath);
      const delMatchIdx = finalDeleted.findIndex(delFile => delFile.size === addFile.size && stateFiles[delFile.relativePath]?.hash === currentHash);
      
      if (delMatchIdx !== -1) {
        const delFile = finalDeleted[delMatchIdx];
        renamed.push({
          oldPath: delFile.relativePath,
          newPath: addFile.relativePath,
          driveFileId: delFile.driveFileId,
          size: addFile.size
        });
        finalDeleted.splice(delMatchIdx, 1);
      } else {
        finalAdded.push(addFile);
      }
    } catch (hashErr) {
      console.error(`Skipping rename detection for ${addFile.relativePath} due to error:`, hashErr.message);
      finalAdded.push(addFile);
    }
  }

  // --- FOLDER CHANGES ---
  const addedFolders = [];
  const modifiedFolders = [];
  
  const fileChanges = [...finalAdded, ...modified, ...finalDeleted, ...renamed];

  for (const folder of folderList) {
    if (!state.folders || !state.folders[folder]) {
      addedFolders.push({
        relativePath: folder,
        type: 'folder',
        changeType: 'add'
      });
    } else {
      const prefix = folder.endsWith('/') ? folder : folder + '/';
      const hasPending = fileChanges.some(item => {
        const itemPath = item.relativePath || item.path || item.newPath || item.oldPath;
        return itemPath && itemPath.startsWith(prefix);
      });
      
      if (hasPending) {
        modifiedFolders.push({
          relativePath: folder,
          type: 'folder',
          changeType: 'modify'
        });
      }
    }
  }

  const deletedFolders = [];
  if (state.folders) {
    for (const folder in state.folders) {
      if (ig.ignores(folder) || ig.ignores(folder + '/')) {
        continue;
      }
      const localFullPath = path.join(rootDir, folder);
      if (!fs.existsSync(localFullPath)) {
        deletedFolders.push({
          relativePath: folder,
          driveFileId: state.folders[folder],
          type: 'folder',
          changeType: 'delete'
        });
      }
    }
  }

  // --- DETECT FOLDER RENAMES ---
  const renamedFolders = [];
  const remainingAddedFolders = [];
  const remainingDeletedFolders = [];

  if (renamed.length > 0) {
    const folderRenameCandidates = new Map();
    
    for (const fileRename of renamed) {
      const oldDir = path.dirname(fileRename.oldPath).replace(/\\/g, '/');
      const newDir = path.dirname(fileRename.newPath).replace(/\\/g, '/');
      
      if (oldDir !== '.' && newDir !== '.' && oldDir !== newDir) {
        if (!folderRenameCandidates.has(oldDir)) {
          folderRenameCandidates.set(oldDir, new Map());
        }
        const targetMap = folderRenameCandidates.get(oldDir);
        targetMap.set(newDir, (targetMap.get(newDir) || 0) + 1);
      }
    }
    
    const matchedOldDirs = new Set();
    const matchedNewDirs = new Set();

    for (const [oldDir, targetMap] of folderRenameCandidates.entries()) {
      let bestNewDir = null;
      let maxCount = 0;
      for (const [newDir, count] of targetMap.entries()) {
        if (count > maxCount) {
          maxCount = count;
          bestNewDir = newDir;
        }
      }
      
      if (bestNewDir) {
        const delIdx = deletedFolders.findIndex(f => f.relativePath === oldDir);
        const addIdx = addedFolders.findIndex(f => f.relativePath === bestNewDir);
        
        if (delIdx !== -1 && addIdx !== -1) {
          renamedFolders.push({
            oldPath: oldDir,
            newPath: bestNewDir,
            driveFileId: deletedFolders[delIdx].driveFileId,
            type: 'folder',
            changeType: 'rename'
          });
          matchedOldDirs.add(oldDir);
          matchedNewDirs.add(bestNewDir);
        }
      }
    }

    for (const folder of addedFolders) {
      if (!matchedNewDirs.has(folder.relativePath)) {
        remainingAddedFolders.push(folder);
      }
    }
    for (const folder of deletedFolders) {
      if (!matchedOldDirs.has(folder.relativePath)) {
        remainingDeletedFolders.push(folder);
      }
    }
  } else {
    remainingAddedFolders.push(...addedFolders);
    remainingDeletedFolders.push(...deletedFolders);
  }

  const allAdded = [...finalAdded, ...remainingAddedFolders];
  const allDeleted = [...finalDeleted, ...remainingDeletedFolders];
  const allModified = [...modified, ...modifiedFolders];

  // --- DASHBOARD STATISTICS ---
  const extensionStats = {};
  for (const file of fileList) {
    const ext = path.extname(file.relativePath).toLowerCase() || 'no-extension';
    extensionStats[ext] = (extensionStats[ext] || 0) + 1;
  }

  const driveFiles = state.files || {};
  const driveFoldersCount = state.folders ? Object.keys(state.folders).length : 0;
  const driveExtensionStats = {};
  let driveExistsLocallyCount = 0;
  let driveDeletedLocallyCount = 0;
  let driveEditedCount = 0;

  for (const relPath in driveFiles) {
    if (ig.ignores(relPath) || ig.ignores(relPath + '/')) {
      continue;
    }
    const stateFile = driveFiles[relPath];
    const ext = path.extname(relPath).toLowerCase() || 'no-extension';
    driveExtensionStats[ext] = (driveExtensionStats[ext] || 0) + 1;

    const localFile = localFilesMap[relPath];
    if (localFile) {
      driveExistsLocallyCount++;
      if (localFile.size !== stateFile.size || Math.abs(localFile.mtime - stateFile.mtime) > 1000) {
        driveEditedCount++;
      }
    } else {
      driveDeletedLocallyCount++;
    }
  }

  const localUnchangedFolders = folderList.length - addedFolders.length - modifiedFolders.length;
  const localUnchangedFiles = unchanged.length;

  const driveSafeFolders = driveFoldersCount - deletedFolders.length - modifiedFolders.length;
  const driveSafeFiles = driveExistsLocallyCount - driveEditedCount;

  if (stateModified) {
    saveState(state);
  }

  return {
    success: true,
    totalFoldersCount: folderList.length,
    extensionStats,
    localFiles: fileList.map(f => ({ relativePath: f.relativePath, size: f.size, type: 'file' })),
    localFolders: folderList.map(f => ({ relativePath: f, type: 'folder' })),
    localSummary: {
      totalFolders: folderList.length,
      totalFiles: fileList.length,
      extensionStats,
      statusGroups: {
        backedUp: {
          folders: localUnchangedFolders,
          files: localUnchangedFiles
        },
        notBackedUp: {
          folders: remainingAddedFolders.length,
          files: finalAdded.length
        },
        edited: {
          folders: modifiedFolders.length,
          files: modified.length
        },
        unprotected: {
          folders: remainingAddedFolders.length + modifiedFolders.length,
          files: finalAdded.length + modified.length
        }
      }
    },
    driveSummary: {
      totalFolders: driveFoldersCount,
      totalFiles: Object.keys(driveFiles).length,
      extensionStats: driveExtensionStats,
      statusGroups: {
        existsLocally: {
          folders: driveSafeFolders,
          files: driveSafeFiles
        },
        deletedLocally: {
          folders: remainingDeletedFolders.length,
          files: driveDeletedLocallyCount
        },
        edited: {
          folders: modifiedFolders.length,
          files: driveEditedCount
        },
        unprotected: {
          folders: remainingDeletedFolders.length + modifiedFolders.length,
          files: driveDeletedLocallyCount + driveEditedCount
        }
      }
    },
    summary: {
      added: allAdded.length,
      modified: allModified.length,
      deleted: allDeleted.length,
      renamed: renamed.length + renamedFolders.length,
      unchanged: unchanged.length
    },
    changes: {
      added: allAdded,
      modified: allModified,
      deleted: allDeleted,
      renamed: [...renamed, ...renamedFolders]
    }
  };
}

module.exports = {
  scanDirectory,
  compareWorkspace
};

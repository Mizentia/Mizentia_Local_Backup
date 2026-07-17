const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getWorkspaceRoot, loadConfig, loadState, saveState, getIgnoreFilter } = require('../lib/config');
const { getDriveClient, driveManager } = require('../lib/driveManager');

// Perform Restore
router.post('/', async (req, res) => {
  const { targetPath, selections } = req.body; // targetPath or selections array
  
  if (!targetPath && (!selections || selections.length === 0)) {
    return res.status(400).json({ success: false, error: 'No restore target path specified.' });
  }

  try {
    const config = loadConfig();
    const state = loadState();
    const drive = getDriveClient(config);

    const stateFiles = state.files || {};
    const filesToRestore = [];

    const pathsToProcess = selections || [targetPath];

    for (const p of pathsToProcess) {
      if (stateFiles[p]) {
        filesToRestore.push({
          relativePath: p,
          driveFileId: stateFiles[p].driveFileId
        });
      } else {
        const prefix = p.endsWith('/') ? p : p + '/';
        for (const relPath in stateFiles) {
          if (relPath.startsWith(prefix)) {
            if (!filesToRestore.some(f => f.relativePath === relPath)) {
              filesToRestore.push({
                relativePath: relPath,
                driveFileId: stateFiles[relPath].driveFileId
              });
            }
          }
        }
      }
    }

    const targetLabel = targetPath || (selections && selections.length > 0 ? `${selections.length} selected items` : 'unknown path');

    if (filesToRestore.length === 0) {
      return res.status(404).json({ success: false, error: `No backup record found for target: ${targetLabel}` });
    }

    console.log(`Restoring ${filesToRestore.length} files under: ${targetLabel}...`);
    const results = {
      success: [],
      failed: []
    };

    const ig = getIgnoreFilter();

    for (const item of filesToRestore) {
      if (ig.ignores(item.relativePath) || ig.ignores(item.relativePath + '/')) {
        console.log(`Skipping restore for ignored file: ${item.relativePath}`);
        continue;
      }

      const localFullPath = path.join(getWorkspaceRoot(), item.relativePath);
      try {
        await driveManager.downloadFile(drive, item.driveFileId, localFullPath, config);
        
        const fileStats = fs.statSync(localFullPath);
        state.files[item.relativePath].mtime = fileStats.mtimeMs;
        state.files[item.relativePath].size = fileStats.size;
        
        results.success.push(item.relativePath);
      } catch (err) {
        console.error(`Failed to restore ${item.relativePath}:`, err);
        results.failed.push({
          path: item.relativePath,
          error: err.message
        });
      }
    }

    saveState(state);

    res.json({
      success: true,
      results
    });

  } catch (e) {
    console.error('Restore failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

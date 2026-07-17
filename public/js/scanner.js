let activeScanEventSource = null;
let lastScanProgress = { percent: 5, text: 'ধাপ ১: স্ক্যানার কানেকশন এস্টাবলিশ করা হচ্ছে...' };
let isScanMinimized = false;

BackupApp.scanner.scan = async function(silent = false, useMiniWidget = false) {
  BackupApp.utils.logToConsole('Scanning local project workspace for modifications...', 'info');
  
  const logoIcon = document.querySelector('.logo-icon svg');
  if (logoIcon) logoIcon.classList.add('sync-icon-anim');

  if (BackupApp.state.isServerless) {
    if (!BackupApp.state.sourceDirHandle) {
      if (!silent) {
        BackupApp.utils.showToast('দয়া করে প্রথমে লোকাল প্রজেক্ট ডিরেক্টরি সিলেক্ট করুন!', 'warning');
        if (BackupApp.elements.btnBrowserSelectFolder) {
          BackupApp.elements.btnBrowserSelectFolder.click();
        }
      }
      if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
      return;
    }

    // Verify directory permissions
    try {
      let permission = await BackupApp.state.sourceDirHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        BackupApp.utils.logToConsole('Requesting permission to access workspace folder...', 'info');
        permission = await BackupApp.state.sourceDirHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          BackupApp.utils.showToast('লোকাল ফোল্ডার ব্যবহারের অনুমতি দেওয়া হয়নি!', 'error');
          if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
          return;
        }
      }
    } catch (e) {
      BackupApp.utils.logToConsole(`Error verifying folder permissions: ${e.message}`, 'error');
      if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
      return;
    }

    isScanMinimized = useMiniWidget;
    const handleProgressUpdate = (percent, text) => {
      lastScanProgress = { percent, text };
      if (isScanMinimized) {
        if (BackupApp.elements.miniScanWidget) BackupApp.elements.miniScanWidget.style.display = 'block';
        if (BackupApp.elements.miniScanBar) BackupApp.elements.miniScanBar.style.width = `${percent}%`;
        if (BackupApp.elements.miniScanPath) BackupApp.elements.miniScanPath.textContent = text.replace(/\n/g, ' - ');
        BackupApp.utils.hideLoadingModal();
      } else {
        if (BackupApp.elements.miniScanWidget) BackupApp.elements.miniScanWidget.style.display = 'none';
        BackupApp.utils.showLoadingModal('প্রজেক্ট স্ক্যান করা হচ্ছে...', 'আপনার লোকাল ফাইল স্ক্যান করা হচ্ছে।');
        if (BackupApp.elements.btnModalMinimize) BackupApp.elements.btnModalMinimize.style.display = 'flex';
        BackupApp.utils.updateLoadingProgress(percent, text);
      }
    };

    handleProgressUpdate(15, 'ধাপ ১: লোকাল ফাইল তালিকা ট্রাভার্স করা হচ্ছে...');

    try {
      const files = [];
      async function traverse(handle, relPath = '') {
        for await (const entry of handle.values()) {
          const entryPath = relPath ? `${relPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            files.push({
              name: entry.name,
              relativePath: entryPath,
              size: file.size,
              mtime: file.lastModified,
              handle: entry
            });
          } else if (entry.kind === 'folder') {
            await traverse(entry, entryPath);
          }
        }
      }
      
      await traverse(BackupApp.state.sourceDirHandle);
      
      handleProgressUpdate(70, 'ধাপ ২: ফাইলসমূহ ব্যাকআপ সূচীর সাথে তুলনা করা হচ্ছে...');

      const backupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
      const backedFiles = backupState.files || {};

      const changes = { added: [], modified: [], deleted: [], renamed: [] };
      const localFilesMap = new Map();

      files.forEach(f => {
        localFilesMap.set(f.relativePath, f);
        const backed = backedFiles[f.relativePath];
        if (!backed) {
          changes.added.push(f);
        } else if (backed.size !== f.size || Math.abs(backed.mtime - f.mtime) > 2000) {
          changes.modified.push(f);
        }
      });

      Object.keys(backedFiles).forEach(path => {
        if (!localFilesMap.has(path)) {
          changes.deleted.push({ relativePath: path, size: backedFiles[path].size, type: 'file' });
        }
      });

      const summary = {
        added: changes.added.length,
        modified: changes.modified.length,
        deleted: changes.deleted.length,
        renamed: changes.renamed.length
      };

      const extensionStats = {};
      files.forEach(f => {
        const ext = '.' + f.name.split('.').pop();
        extensionStats[ext] = (extensionStats[ext] || 0) + 1;
      });

      const localSummary = {
        totalFiles: files.length,
        totalFolders: 0,
        statusGroups: {
          backedUp: { folders: 0, files: files.length - changes.added.length - changes.modified.length },
          edited: { folders: 0, files: changes.modified.length },
          notBackedUp: { folders: 0, files: changes.added.length }
        },
        extensionStats
      };

      const driveSummary = {
        totalFiles: Object.keys(backedFiles).length,
        totalFolders: 0,
        statusGroups: {
          existsLocally: { folders: 0, files: Object.keys(backedFiles).length - changes.deleted.length },
          deletedLocally: { folders: 0, files: changes.deleted.length },
          edited: { folders: 0, files: changes.modified.length }
        },
        extensionStats: {}
      };

      const scanResults = {
        success: true,
        summary,
        changes,
        localSummary,
        driveSummary
      };

      BackupApp.state.scanResults = scanResults;
      
      handleProgressUpdate(100, 'স্ক্যান সম্পন্ন! ফলাফল প্রস্তুত করা হচ্ছে... (১০০%)');
      
      setTimeout(() => {
        if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
        BackupApp.utils.hideLoadingModal();
        if (BackupApp.elements.miniScanWidget) BackupApp.elements.miniScanWidget.style.display = 'none';
        if (BackupApp.elements.btnModalMinimize) BackupApp.elements.btnModalMinimize.style.display = 'none';
        
        BackupApp.utils.logToConsole(`Browser Scan completed. Found ${summary.added} new, ${summary.modified} modified, ${summary.deleted} deleted.`, 'success');
        
        BackupApp.dashboard.updateStats(summary);
        BackupApp.scanner.updateUI(scanResults);
      }, 600);

    } catch (e) {
      if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
      BackupApp.utils.hideLoadingModal();
      BackupApp.utils.logToConsole(`Browser Scan failed: ${e.message}`, 'error');
    }
    return;
  }

  if (silent) {
    try {
      const response = await fetch('/api/scan');
      const data = await response.json();
      BackupApp.state.scanResults = data;
      
      if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
      if (!data.success) throw new Error(data.error);

      const { summary } = data;
      BackupApp.utils.logToConsole(`Silent scan completed. Found ${summary.added} new, ${summary.modified} modified, ${summary.deleted} deleted.`, 'success');

      BackupApp.dashboard.updateStats(summary);
      BackupApp.scanner.updateUI(data);
    } catch (e) {
      if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
      BackupApp.utils.logToConsole(`Silent Scan failed: ${e.message}`, 'error');
    }
    return;
  }

  isScanMinimized = useMiniWidget;
  
  const handleProgressUpdate = (percent, text) => {
    lastScanProgress = { percent, text };
    if (isScanMinimized) {
      BackupApp.elements.miniScanWidget.style.display = 'block';
      BackupApp.elements.miniScanBar.style.width = `${percent}%`;
      BackupApp.elements.miniScanPath.textContent = text.replace(/\n/g, ' - ');
      BackupApp.utils.hideLoadingModal();
    } else {
      BackupApp.elements.miniScanWidget.style.display = 'none';
      BackupApp.utils.showLoadingModal('প্রজেক্ট স্ক্যান করা হচ্ছে...', 'আপনাদের লোকাল ফাইলের সাথে পূর্ববর্তী ব্যাকআপ তুলনা করা হচ্ছে।');
      BackupApp.elements.btnModalMinimize.style.display = 'flex';
      BackupApp.utils.updateLoadingProgress(percent, text);
    }
  };

  handleProgressUpdate(5, 'ধাপ ১: স্ক্যানার কানেকশন এস্টাবলিশ করা হচ্ছে...');

  if (activeScanEventSource) {
    activeScanEventSource.close();
  }

  try {
    activeScanEventSource = new EventSource('/api/scan/stream');
    
    activeScanEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        const percent = Math.min(95, Math.floor(5 + (data.scannedCount / (data.scannedCount + 400)) * 90));
        
        let truncatePath = data.currentPath;
        if (truncatePath.length > 50) {
          truncatePath = '...' + truncatePath.slice(-47);
        }
        
        handleProgressUpdate(percent, `ধাপ ২: ফাইল বিশ্লেষণ - ${data.scannedCount} টি ফাইল (${percent}%)\n${truncatePath}`);
      } 
      
      else if (data.type === 'complete') {
        if (activeScanEventSource) {
          activeScanEventSource.close();
          activeScanEventSource = null;
        }
        BackupApp.state.scanResults = data.results;
        
        handleProgressUpdate(100, 'স্ক্যান সম্পন্ন! ফলাফল প্রস্তুত করা হচ্ছে... (১০০%)');
        
        setTimeout(() => {
          if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
          BackupApp.utils.hideLoadingModal();
          BackupApp.elements.miniScanWidget.style.display = 'none';
          BackupApp.elements.btnModalMinimize.style.display = 'none';
          
          const { summary } = data.results;
          BackupApp.utils.logToConsole(`Scan completed. Found ${summary.added} new, ${summary.modified} modified, ${summary.deleted} deleted, ${summary.renamed} renamed.`, 'success');
          
          BackupApp.dashboard.updateStats(summary);
          BackupApp.scanner.updateUI(data.results);
        }, 600);
      } 
      
      else if (data.type === 'error') {
        throw new Error(data.error);
      }
    };

    activeScanEventSource.onerror = (e) => {
      if (activeScanEventSource) {
        activeScanEventSource.close();
        activeScanEventSource = null;
      }
      if (!BackupApp.state.scanResults) {
        throw new Error('সার্ভার কানেকশন বিচ্ছিন্ন হয়েছে বা স্ক্যানিং প্রক্রিয়া বাধাগ্রস্ত হয়েছে।');
      }
    };

  } catch (e) {
    if (logoIcon) logoIcon.classList.remove('sync-icon-anim');
    BackupApp.utils.hideLoadingModal();
    BackupApp.elements.miniScanWidget.style.display = 'none';
    BackupApp.elements.btnModalMinimize.style.display = 'none';
    BackupApp.utils.logToConsole(`Scan failed: ${e.message}`, 'error');
    BackupApp.utils.showToast('স্ক্যান ব্যর্থ হয়েছে!', 'error');
  }
};

BackupApp.scanner.updateUI = function(data) {
  const { summary, changes, localSummary, driveSummary } = data;
  
  if (localSummary && BackupApp.elements.statLocalFoldersCount) {
    const totalLocal = (localSummary.totalFolders || 0) + (localSummary.totalFiles || 0);
    BackupApp.elements.statLocalFoldersCount.textContent = `${totalLocal} টি (${localSummary.totalFolders || 0} টি ফোল্ডার, ${localSummary.totalFiles || 0} টি ফাইল)`;

    const b = localSummary.statusGroups.backedUp;
    BackupApp.elements.statLocalUnchanged.textContent = `${b.folders + b.files} টি (${b.folders}ফো, ${b.files}ফা)`;

    const m = localSummary.statusGroups.edited;
    BackupApp.elements.statLocalModified.textContent = `${m.folders + m.files} টি (${m.folders}ফো, ${m.files}ফা)`;

    const n = localSummary.statusGroups.notBackedUp;
    BackupApp.elements.statLocalNew.textContent = `${n.folders + n.files} টি (${n.folders}ফো, ${n.files}ফা)`;

    BackupApp.scanner.renderExtensionList(BackupApp.elements.statLocalExtensionList, localSummary.extensionStats);
  }
  
  if (driveSummary && BackupApp.elements.statDriveFoldersCount) {
    const totalDrive = (driveSummary.totalFolders || 0) + (driveSummary.totalFiles || 0);
    BackupApp.elements.statDriveFoldersCount.textContent = `${totalDrive} টি (${driveSummary.totalFolders || 0} টি ফোল্ডার, ${driveSummary.totalFiles || 0} টি ফাইল)`;

    const e = driveSummary.statusGroups.existsLocally;
    BackupApp.elements.statDriveExists.textContent = `${e.folders + e.files} টি (${e.folders}ফো, ${e.files}ফা)`;

    const d = driveSummary.statusGroups.deletedLocally;
    BackupApp.elements.statDriveMissing.textContent = `${d.folders + d.files} টি (${d.folders}ফো, ${d.files}ফা)`;

    const m = driveSummary.statusGroups.edited;
    BackupApp.elements.statDriveModified.textContent = `${m.folders + m.files} টি (${m.folders}ফো, ${m.files}ফা)`;

    BackupApp.scanner.renderExtensionList(BackupApp.elements.statDriveExtensionList, driveSummary.extensionStats);
  }

  BackupApp.elements.scanSummaryBar.style.display = 'flex';
  BackupApp.elements.summaryAddCount.textContent = `${summary.added} Added`;
  BackupApp.elements.summaryModifyCount.textContent = `${summary.modified} Modified`;
  BackupApp.elements.summaryDeleteCount.textContent = `${summary.deleted} Deleted`;
  BackupApp.elements.summaryRenameCount.textContent = `${summary.renamed} Renamed`;

  const total = summary.added + summary.modified + summary.deleted + summary.renamed;
  if (total === 0) {
    BackupApp.elements.summaryTotalText.textContent = 'প্রজেক্ট সম্পূর্ণ আপ-টু-ডেট!';
    BackupApp.elements.selectAllCheckbox.checked = false;
    BackupApp.elements.selectAllCheckbox.disabled = true;
    BackupApp.elements.scannerFooter.style.display = 'none';
    
    BackupApp.elements.scanTreeBody.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h3>সব ফাইল আপ-টু-ডেট আছে</h3>
        <p>আপনার ডিরেক্টরিতে নতুন কোনো ফাইল পরিবর্তন পাওয়া যায়নি। সবকিছু গুগল ড্রাইভে সুরক্ষিত রয়েছে।</p>
      </div>
    `;
    return;
  }

  BackupApp.elements.summaryTotalText.textContent = `মোট ${total} টি পরিবর্তন পাওয়া গেছে।`;
  BackupApp.elements.selectAllCheckbox.disabled = false;
  BackupApp.elements.selectAllCheckbox.checked = false;
  BackupApp.state.selectedItems.clear();
  BackupApp.scanner.updateSelectedCounter();
  
  if (typeof BackupApp.scanner.renderTree === 'function') {
    BackupApp.scanner.renderTree(changes);
  }
};

BackupApp.scanner.renderExtensionList = function(container, stats) {
  if (!container) return;
  container.innerHTML = '';
  if (!stats || Object.keys(stats).length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; margin-top: 15px; font-size: 0.8rem;">কোন বিবরণ নেই</div>`;
    return;
  }
  const sortedExtensions = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  sortedExtensions.forEach(([ext, count]) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justify = 'space-between';
    row.style.alignItems = 'center';
    row.style.background = 'rgba(255,255,255,0.03)';
    row.style.padding = '4px 8px';
    row.style.borderRadius = '6px';
    row.style.border = '1px solid rgba(255,255,255,0.05)';
    row.style.fontSize = '0.8rem';

    const extName = document.createElement('span');
    extName.style.fontFamily = 'monospace';
    extName.style.fontWeight = 'bold';
    extName.style.color = 'var(--text-indigo)';
    extName.textContent = ext;

    const extCount = document.createElement('span');
    extCount.style.fontWeight = '600';
    extCount.style.color = 'var(--text-light)';
    extCount.textContent = `${count} টি ফাইল`;

    row.appendChild(extName);
    row.appendChild(extCount);
    container.appendChild(row);
  });
};

BackupApp.scanner.init = function() {
  if (BackupApp.elements.btnScannerScan) {
    BackupApp.elements.btnScannerScan.addEventListener('click', () => BackupApp.scanner.scan(false, false));
  }
  if (BackupApp.elements.btnScannerScanEmpty) {
    BackupApp.elements.btnScannerScanEmpty.addEventListener('click', () => BackupApp.scanner.scan(false, false));
  }

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      BackupApp.state.currentFilter = btn.getAttribute('data-filter');
      
      if (BackupApp.state.scanResults && typeof BackupApp.scanner.renderTree === 'function') {
        BackupApp.scanner.renderTree(BackupApp.state.scanResults.changes);
      }
    });
  });

  if (BackupApp.elements.selectAllCheckbox) {
    BackupApp.elements.selectAllCheckbox.addEventListener('change', () => {
      const isChecked = BackupApp.elements.selectAllCheckbox.checked;
      const allCheckboxes = BackupApp.elements.scanTreeBody.querySelectorAll('input[type="checkbox"]');
      
      allCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) {
          BackupApp.state.selectedItems.add(cb.dataset.path);
        } else {
          BackupApp.state.selectedItems.delete(cb.dataset.path);
        }
      });
      
      BackupApp.scanner.updateSelectedCounter();
    });
  }

  if (BackupApp.elements.btnExecuteBackup) {
    BackupApp.elements.btnExecuteBackup.addEventListener('click', async () => {
      if (!BackupApp.state.scanResults) return;

      const itemsToBackup = [];
      let totalBytes = 0;
      let processedBytes = 0;
      
      BackupApp.state.scanResults.changes.added.forEach(f => {
        if (BackupApp.state.selectedItems.has(f.relativePath)) {
          itemsToBackup.push({ type: 'add', path: f.relativePath, size: f.size || 0, nodeType: f.type || 'file' });
          totalBytes += f.size || 0;
        }
      });
      BackupApp.state.scanResults.changes.modified.forEach(f => {
        if (BackupApp.state.selectedItems.has(f.relativePath)) {
          itemsToBackup.push({ type: 'modify', path: f.relativePath, size: f.size || 0, nodeType: f.type || 'file' });
          totalBytes += f.size || 0;
        }
      });
      BackupApp.state.scanResults.changes.deleted.forEach(f => {
        if (BackupApp.state.selectedItems.has(f.relativePath)) {
          itemsToBackup.push({ type: 'delete', path: f.relativePath, size: 0, nodeType: f.type || 'file' });
        }
      });
      BackupApp.state.scanResults.changes.renamed.forEach(f => {
        if (BackupApp.state.selectedItems.has(f.newPath)) {
          itemsToBackup.push({ 
            type: 'rename', 
            oldPath: f.oldPath, 
            newPath: f.newPath,
            driveFileId: f.driveFileId,
            size: 0
          });
        }
      });

      if (itemsToBackup.length === 0) {
        BackupApp.utils.showToast('কোন ফাইল ব্যাকআপ করার জন্য সিলেক্ট করা হয়নি!', 'warning');
        return;
      }

      BackupApp.utils.logToConsole(`User confirmed backup. Processing ${itemsToBackup.length} uploads/updates...`, 'info');
      BackupApp.utils.showLoadingModal('গুগল ড্রাইভে ব্যাকআপ নেওয়া হচ্ছে...', 'ফাইলগুলো ক্রমানুসারে আপলোড করা হচ্ছে, দয়া করে ব্রাউজার উইন্ডোটি চালু রাখুন।');

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < itemsToBackup.length; i++) {
        const item = itemsToBackup[i];
        const filename = item.path || item.newPath;
        const percent = Math.round((i / itemsToBackup.length) * 100);
        
        let progressText = `আপলোড করা হচ্ছে (${i + 1}/${itemsToBackup.length}): ${filename}`;
        if (totalBytes > 0 && (item.type === 'add' || item.type === 'modify')) {
          progressText += ` [${BackupApp.utils.formatBytes(processedBytes)} / ${BackupApp.utils.formatBytes(totalBytes)}]`;
        }
        progressText += ` (${percent}%)`;
        
        BackupApp.utils.updateLoadingProgress(percent, progressText);

        try {
          let backupSuccess = false;
          let errMsg = '';
          
          if (BackupApp.state.isServerless) {
            const config = BackupApp.state.systemStatus;

            async function getFileHandleByPath(rootHandle, path) {
              const parts = path.split('/');
              const fileName = parts.pop();
              let dir = rootHandle;
              for (const sub of parts) {
                dir = await dir.getDirectoryHandle(sub);
              }
              return await dir.getFileHandle(fileName);
            }

            if (config.connectionType === 'local_drive') {
              if (!BackupApp.state.destDirHandle) {
                throw new Error('গন্তব্য ফোল্ডার সিলেক্ট করা নেই! সেটিংস এ যান এবং সংযোগ পরীক্ষা করুন।');
              }
              let destPermission = await BackupApp.state.destDirHandle.queryPermission({ mode: 'readwrite' });
              if (destPermission !== 'granted') {
                destPermission = await BackupApp.state.destDirHandle.requestPermission({ mode: 'readwrite' });
                if (destPermission !== 'granted') {
                  throw new Error('গন্তব্য ফোল্ডার ব্যবহারের অনুমতি দেওয়া হয়নি!');
                }
              }
              try {
                const srcFileHandle = await getFileHandleByPath(BackupApp.state.sourceDirHandle, item.path || item.newPath);
                const file = await srcFileHandle.getFile();

                const parts = (item.path || item.newPath).split('/');
                const fileName = parts.pop();
                let dir = BackupApp.state.destDirHandle;
                for (const sub of parts) {
                  dir = await dir.getDirectoryHandle(sub, { create: true });
                }
                const destFileHandle = await dir.getFileHandle(fileName, { create: true });
                const writable = await destFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                backupSuccess = true;
              } catch (e) {
                errMsg = e.message;
              }
            } else {
              await new Promise(r => setTimeout(r, 200));
              backupSuccess = true;
            }

            if (backupSuccess) {
              const backupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
              if (!backupState.files) backupState.files = {};
              
              if (item.type === 'delete') {
                delete backupState.files[item.path];
              } else {
                backupState.files[item.path || item.newPath] = { size: item.size, mtime: Date.now() };
              }
              backupState.lastBackupTime = Date.now();
              localStorage.setItem('mizentia_backup_state', JSON.stringify(backupState));
            }
          }

          let data = { success: backupSuccess, error: errMsg };
          
          if (!BackupApp.state.isServerless) {
            const response = await fetch('/api/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ selections: [item] })
            });
            data = await response.json();
          }

          if (data.success || (data.results && data.results.success.length > 0)) {
            successCount++;
            BackupApp.utils.logToConsole(`Successfully backed up: ${item.path || item.newPath}`, 'success');
          } else {
            failCount++;
            const err = data.error || data.results?.failed[0]?.error || 'Unknown error';
            BackupApp.utils.logToConsole(`Failed backup for ${item.path || item.newPath}: ${err}`, 'error');
          }
        } catch (e) {
          failCount++;
          BackupApp.utils.logToConsole(`Error backing up ${item.path || item.newPath}: ${e.message}`, 'error');
        }

        processedBytes += item.size || 0;
      }

      const summaryText = `${successCount} টি ফাইল সফলভাবে গুগল ড্রাইভে ব্যাকআপ হয়েছে।` + 
                          (failCount > 0 ? ` ${failCount} টি ফাইল ব্যর্থ হয়েছে।` : '');
      
      BackupApp.utils.showLoadingComplete('ব্যাকআপ সম্পন্ন!', summaryText);
      BackupApp.utils.showToast(summaryText, failCount === 0 ? 'success' : 'warning');
      BackupApp.scanner.scan();
    });
  }

  if (BackupApp.elements.btnModalMinimize) {
    BackupApp.elements.btnModalMinimize.addEventListener('click', () => {
      BackupApp.scanner.scan(false, true);
    });
  }

  if (BackupApp.elements.btnMiniMaximize) {
    BackupApp.elements.btnMiniMaximize.addEventListener('click', () => {
      BackupApp.elements.miniScanWidget.style.display = 'none';
      isScanMinimized = false;
      BackupApp.utils.showLoadingModal('প্রজেক্ট স্ক্যান করা হচ্ছে...', 'আপনার লোকাল ফাইলের সাথে পূর্ববর্তী ব্যাকআপ তুলনা করা হচ্ছে।');
      BackupApp.elements.btnModalMinimize.style.display = 'flex';
      BackupApp.utils.updateLoadingProgress(lastScanProgress.percent, lastScanProgress.text);
    });
  }
};

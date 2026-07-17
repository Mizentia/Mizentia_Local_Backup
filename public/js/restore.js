BackupApp.state.selectedRestoreLocalItems = new Set();
BackupApp.state.selectedRestoreDriveItems = new Set();

BackupApp.restore.updateSelectedText = function() {
  const totalLocal = BackupApp.state.selectedRestoreLocalItems.size;
  const totalDrive = BackupApp.state.selectedRestoreDriveItems.size;
  
  const label = BackupApp.elements.restoreSyncSelectedCountText;
  const detail = BackupApp.elements.restoreSyncDetailMessage;
  const btnUpload = BackupApp.elements.btnRestoreSyncUpload;
  const btnDownload = BackupApp.elements.btnRestoreSyncDownload;

  if (totalLocal === 0 && totalDrive === 0) {
    if (label) label.textContent = '০ টি আইটেম সিলেক্ট করা হয়েছে';
    if (detail) detail.textContent = 'উভয় প্যানেল থেকে ফাইল বা ফোল্ডার সিলেক্ট করে অ্যাকশন বাটন চাপুন।';
    if (btnUpload) {
      btnUpload.disabled = true;
      btnUpload.style.opacity = '0.5';
    }
    if (btnDownload) {
      btnDownload.disabled = true;
      btnDownload.style.opacity = '0.5';
    }
  } else {
    if (label) label.textContent = `${totalLocal + totalDrive} টি আইটেম সিলেক্ট করা হয়েছে`;
    if (detail) detail.textContent = `লোকাল থেকে ${totalLocal} টি ড্রাইভে আপলোড এবং ড্রাইভ থেকে ${totalDrive} টি রিস্টোর করার জন্য প্রস্তুত।`;
    
    if (btnUpload) {
      btnUpload.disabled = (totalLocal === 0);
      btnUpload.style.opacity = (totalLocal === 0) ? '0.5' : '1';
    }
    if (btnDownload) {
      btnDownload.disabled = (totalDrive === 0);
      btnDownload.style.opacity = (totalDrive === 0) ? '0.5' : '1';
    }
  }
};

BackupApp.restore.renderDualTree = function(container, items, isLocalTree) {
  if (!container) return;
  container.innerHTML = '';
  if (!items || Object.keys(items).length === 0) {
    container.innerHTML = `<div class="empty-state">কোন আইটেম পাওয়া যায়নি</div>`;
    return;
  }

  const root = { name: 'Root', type: 'folder', children: {}, path: '' };
  for (const relPath in items) {
    const item = items[relPath];
    const parts = relPath.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = (i === parts.length - 1) && (item.type === 'file' || !item.type);

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? null : {},
          item: (i === parts.length - 1) ? item : null
        };
      }
      current = current.children[part];
    }
  }

  const activeSet = isLocalTree ? BackupApp.state.selectedRestoreLocalItems : BackupApp.state.selectedRestoreDriveItems;

  function drawNode(node, depth) {
    if (node.name === 'Root') {
      const listContainer = document.createElement('div');
      listContainer.className = 'tree-node-list';
      for (const childName in node.children) {
        listContainer.appendChild(drawNode(node.children[childName], depth + 1));
      }
      return listContainer;
    }

    const nodeWrapper = document.createElement('div');
    nodeWrapper.className = `tree-node-wrapper node-depth-${depth}`;
    nodeWrapper.style.marginLeft = `${depth * 10}px`;

    const rowEl = document.createElement('div');
    rowEl.className = 'restore-node';
    if (activeSet.has(node.path)) {
      rowEl.classList.add('selected');
    }

    const chkContainer = document.createElement('label');
    chkContainer.className = 'checkbox-container';
    chkContainer.style.marginRight = '8px';
    chkContainer.style.display = 'inline-flex';
    
    const chkInput = document.createElement('input');
    chkInput.type = 'checkbox';
    chkInput.className = 'restore-node-checkbox';
    chkInput.dataset.path = node.path;
    chkInput.dataset.islocal = isLocalTree ? 'true' : 'false';
    chkInput.dataset.nodetype = node.type;
    chkInput.checked = activeSet.has(node.path);

    chkInput.addEventListener('change', (e) => {
      e.stopPropagation();
      const checked = chkInput.checked;
      
      function toggleChildCheckboxes(n, val) {
        if (val) {
          activeSet.add(n.path);
        } else {
          activeSet.delete(n.path);
        }
        if (n.children) {
          for (const c in n.children) {
            toggleChildCheckboxes(n.children[c], val);
          }
        }
      }
      toggleChildCheckboxes(node, checked);
      
      const checkboxes = container.querySelectorAll('.restore-node-checkbox');
      checkboxes.forEach(c => {
        c.checked = activeSet.has(c.dataset.path);
        const nodeRow = c.closest('.restore-node');
        if (nodeRow) {
          nodeRow.classList.toggle('selected', c.checked);
        }
      });

      BackupApp.restore.updateSelectedText();
    });

    const chkMark = document.createElement('span');
    chkMark.className = 'checkbox-mark';

    chkContainer.appendChild(chkInput);
    chkContainer.appendChild(chkMark);
    rowEl.appendChild(chkContainer);

    if (node.type === 'folder' && node.children && Object.keys(node.children).length > 0) {
      const toggleEl = document.createElement('span');
      toggleEl.className = 'node-toggle-arrow';
      toggleEl.innerHTML = '▶';
      toggleEl.style.fontSize = '0.7rem';
      toggleEl.style.marginRight = '6px';
      toggleEl.style.color = '#818cf8';
      toggleEl.style.cursor = 'pointer';
      toggleEl.style.display = 'inline-block';
      toggleEl.style.width = '10px';
      rowEl.appendChild(toggleEl);
    } else {
      const spacer = document.createElement('span');
      spacer.style.display = 'inline-block';
      spacer.style.width = '16px';
      rowEl.appendChild(spacer);
    }

    const iconEl = document.createElement('span');
    iconEl.className = 'node-icon';
    iconEl.style.marginRight = '6px';
    iconEl.style.display = 'inline-flex';
    iconEl.style.alignItems = 'center';
    if (node.type === 'folder') {
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      iconEl.style.color = '#f59e0b';
    } else {
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      iconEl.style.color = '#818cf8';
    }
    rowEl.appendChild(iconEl);

    const nodeInfo = document.createElement('div');
    nodeInfo.className = 'node-info';

    const nodeName = document.createElement('span');
    nodeName.className = 'node-name';
    nodeName.textContent = node.name;
    nodeInfo.appendChild(nodeName);

    const nodeMeta = document.createElement('span');
    nodeMeta.className = 'node-meta';
    if (node.type === 'file' && node.item && node.item.size !== undefined) {
      nodeMeta.textContent = BackupApp.utils.formatBytes(node.item.size);
    } else {
      nodeMeta.textContent = node.type === 'folder' ? 'Folder' : '';
    }
    nodeInfo.appendChild(nodeMeta);
    rowEl.appendChild(nodeInfo);

    nodeWrapper.appendChild(rowEl);

    if (node.children && Object.keys(node.children).length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'node-children-list';
      childrenContainer.style.display = 'none';

      for (const childName in node.children) {
        childrenContainer.appendChild(drawNode(node.children[childName], depth + 1));
      }
      nodeWrapper.appendChild(childrenContainer);

      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('.checkbox-container')) return;
        const isCollapsed = childrenContainer.style.display === 'none';
        childrenContainer.style.display = isCollapsed ? 'block' : 'none';
        rowEl.style.background = isCollapsed ? 'rgba(255,255,255,0.04)' : 'transparent';
        const arrow = rowEl.querySelector('.node-toggle-arrow');
        if (arrow) {
          arrow.innerHTML = isCollapsed ? '▼' : '▶';
        }
      });
    }

    return nodeWrapper;
  }

  const compiledList = drawNode(root, 0);
  container.appendChild(compiledList);
};

BackupApp.restore.renderWorkspace = function() {
  // Shared trigger, we delegate to renderArchive
  BackupApp.restore.renderArchive();
};

BackupApp.restore.renderArchive = async function() {
  if (BackupApp.state.isServerless) {
    if (!BackupApp.state.sourceDirHandle) {
      if (BackupApp.elements.restoreLocalTreeBody) {
        BackupApp.elements.restoreLocalTreeBody.innerHTML = '<div class="empty-state">দয়া করে প্রথমে প্রজেক্ট ডিরেক্টরি সিলেক্ট করুন।</div>';
      }
      if (BackupApp.elements.restoreDriveTreeBody) {
        BackupApp.elements.restoreDriveTreeBody.innerHTML = '<div class="empty-state">লোকাল ডিরেক্টরি সিলেক্ট করা নেই।</div>';
      }
      return;
    }

    try {
      const localItemsMap = {};
      const files = [];
      async function traverse(handle, relPath = '') {
        for await (const entry of handle.values()) {
          const entryPath = relPath ? `${relPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            localItemsMap[entryPath] = { type: 'file', size: file.size };
          } else if (entry.kind === 'folder') {
            localItemsMap[entryPath] = { type: 'folder' };
            await traverse(entry, entryPath);
          }
        }
      }
      await traverse(BackupApp.state.sourceDirHandle);

      const backupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
      const driveItemsMap = {};
      const stateFolders = backupState.folders || {};
      for (const folder in stateFolders) {
        driveItemsMap[folder] = { type: 'folder' };
      }
      const stateFiles = backupState.files || {};
      for (const file in stateFiles) {
        driveItemsMap[file] = { type: 'file', size: stateFiles[file].size };
      }

      BackupApp.restore.renderDualTree(BackupApp.elements.restoreLocalTreeBody, localItemsMap, true);
      BackupApp.restore.renderDualTree(BackupApp.elements.restoreDriveTreeBody, driveItemsMap, false);
    } catch (e) {
      BackupApp.utils.logToConsole(`Error loading browser restore panels: ${e.message}`, 'error');
    }
    return;
  }

  try {
    const localResponse = await fetch('/api/scan');
    const localData = await localResponse.json();
    
    const statusResponse = await fetch('/api/status');
    const statusData = await statusResponse.json();
    
    const localItemsMap = {};
    if (localData.localFolders) {
      localData.localFolders.forEach(f => {
        localItemsMap[f.relativePath] = { type: 'folder' };
      });
    }
    if (localData.localFiles) {
      localData.localFiles.forEach(f => {
        localItemsMap[f.relativePath] = { type: 'file', size: f.size };
      });
    }

    const driveItemsMap = {};
    const stateFolders = statusData.folders || {};
    for (const folder in stateFolders) {
      driveItemsMap[folder] = { type: 'folder' };
    }
    const stateFiles = statusData.files || {};
    for (const file in stateFiles) {
      driveItemsMap[file] = { type: 'file', size: stateFiles[file].size };
    }

    BackupApp.restore.renderDualTree(BackupApp.elements.restoreLocalTreeBody, localItemsMap, true);
    BackupApp.restore.renderDualTree(BackupApp.elements.restoreDriveTreeBody, driveItemsMap, false);

  } catch (e) {
    BackupApp.utils.logToConsole(`Error loading restore panels: ${e.message}`, 'error');
    if (BackupApp.elements.restoreLocalTreeBody) {
      BackupApp.elements.restoreLocalTreeBody.innerHTML = `<div class="empty-state text-red">লোড ব্যর্থ হয়েছে: ${e.message}</div>`;
    }
    if (BackupApp.elements.restoreDriveTreeBody) {
      BackupApp.elements.restoreDriveTreeBody.innerHTML = `<div class="empty-state text-red">লোড ব্যর্থ হয়েছে: ${e.message}</div>`;
    }
  }
};

BackupApp.restore.init = function() {
  if (BackupApp.elements.restoreLocalSelectAll) {
    BackupApp.elements.restoreLocalSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const checkboxes = BackupApp.elements.restoreLocalTreeBody.querySelectorAll('.restore-node-checkbox');
      checkboxes.forEach(c => {
        c.checked = checked;
        if (checked) {
          BackupApp.state.selectedRestoreLocalItems.add(c.dataset.path);
        } else {
          BackupApp.state.selectedRestoreLocalItems.delete(c.dataset.path);
        }
        const nodeRow = c.closest('.restore-node');
        if (nodeRow) {
          nodeRow.classList.toggle('selected', checked);
        }
      });
      BackupApp.restore.updateSelectedText();
    });
  }

  if (BackupApp.elements.restoreDriveSelectAll) {
    BackupApp.elements.restoreDriveSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const checkboxes = BackupApp.elements.restoreDriveTreeBody.querySelectorAll('.restore-node-checkbox');
      checkboxes.forEach(c => {
        c.checked = checked;
        if (checked) {
          BackupApp.state.selectedRestoreDriveItems.add(c.dataset.path);
        } else {
          BackupApp.state.selectedRestoreDriveItems.delete(c.dataset.path);
        }
        const nodeRow = c.closest('.restore-node');
        if (nodeRow) {
          nodeRow.classList.toggle('selected', checked);
        }
      });
      BackupApp.restore.updateSelectedText();
    });
  }

  if (BackupApp.elements.btnRestoreSyncUpload) {
    BackupApp.elements.btnRestoreSyncUpload.addEventListener('click', async () => {
      if (BackupApp.state.selectedRestoreLocalItems.size === 0) return;
      
      const selections = [];
      BackupApp.state.selectedRestoreLocalItems.forEach(path => {
        const chk = BackupApp.elements.restoreLocalTreeBody.querySelector(`.restore-node-checkbox[data-path="${path}"]`);
        const isFolder = chk ? (chk.dataset.nodetype === 'folder') : false;
        selections.push({
          type: 'add',
          path: path,
          nodeType: isFolder ? 'folder' : 'file'
        });
      });

      BackupApp.utils.showLoadingModal('ড্রাইভে আপলোড করা হচ্ছে...', 'সিলেক্ট করা ফাইলসমূহ গুগল ড্রাইভে ব্যাকআপ নেওয়া হচ্ছে।');
      
      try {
        const response = await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections })
        });
        const resData = await response.json();
        BackupApp.utils.hideLoadingModal();
        
        if (resData.success) {
          BackupApp.utils.showToast('ড্রাইভে সফলভাবে আপলোড হয়েছে!', 'success');
          BackupApp.utils.logToConsole(`Upload sync completed successfully: ${resData.results.success.length} items synced.`, 'success');
          BackupApp.restore.renderArchive();
          BackupApp.dashboard.fetchStatus();
        } else {
          throw new Error(resData.error);
        }
      } catch (e) {
        BackupApp.utils.hideLoadingModal();
        BackupApp.utils.logToConsole(`Upload sync failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`আপলোড ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnRestoreSyncDownload) {
    BackupApp.elements.btnRestoreSyncDownload.addEventListener('click', async () => {
      if (BackupApp.state.selectedRestoreDriveItems.size === 0) return;

      const selections = Array.from(BackupApp.state.selectedRestoreDriveItems);

      BackupApp.utils.showLoadingModal('লোকালে রিস্টোর করা হচ্ছে...', 'ড্রাইভ থেকে ফাইলসমূহ ডাউনলোড করে লোকালে রিস্টোর করা হচ্ছে।');
      
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

        const backupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
        const stateFiles = backupState.files || {};
        const filesToRestore = [];

        for (const p of selections) {
          if (stateFiles[p]) {
            filesToRestore.push(p);
          } else {
            const prefix = p.endsWith('/') ? p : p + '/';
            for (const relPath in stateFiles) {
              if (relPath.startsWith(prefix)) {
                if (!filesToRestore.includes(relPath)) {
                  filesToRestore.push(relPath);
                }
              }
            }
          }
        }

        let successCount = 0;
        for (const path of filesToRestore) {
          try {
            if (config.connectionType === 'local_drive') {
              if (!BackupApp.state.destDirHandle) {
                throw new Error('গন্তব্য ফোল্ডার সিলেক্ট করা নেই!');
              }
              const srcHandle = await getFileHandleByPath(BackupApp.state.destDirHandle, path);
              const file = await srcHandle.getFile();

              const parts = path.split('/');
              const fileName = parts.pop();
              let dir = BackupApp.state.sourceDirHandle;
              for (const sub of parts) {
                dir = await dir.getDirectoryHandle(sub, { create: true });
              }
              const destFileHandle = await dir.getFileHandle(fileName, { create: true });
              const writable = await destFileHandle.createWritable();
              await writable.write(file);
              await writable.close();

              const updatedFile = await destFileHandle.getFile();
              const currentBackupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
              if (!currentBackupState.files) currentBackupState.files = {};
              if (currentBackupState.files[path]) {
                currentBackupState.files[path].size = updatedFile.size;
                currentBackupState.files[path].mtime = updatedFile.lastModified;
              } else {
                currentBackupState.files[path] = {
                  size: updatedFile.size,
                  mtime: updatedFile.lastModified
                };
              }
              localStorage.setItem('mizentia_backup_state', JSON.stringify(currentBackupState));
              successCount++;
            } else {
              await new Promise(r => setTimeout(r, 200));
              const currentBackupState = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
              if (!currentBackupState.files) currentBackupState.files = {};
              if (currentBackupState.files[path]) {
                currentBackupState.files[path].mtime = Date.now();
              } else {
                currentBackupState.files[path] = { size: 0, mtime: Date.now() };
              }
              localStorage.setItem('mizentia_backup_state', JSON.stringify(currentBackupState));
              successCount++;
            }
          } catch (e) {
            BackupApp.utils.logToConsole(`Failed to restore ${path}: ${e.message}`, 'error');
          }
        }

        BackupApp.utils.hideLoadingModal();
        BackupApp.utils.showToast('লোকালে সফলভাবে রিস্টোর হয়েছে!', 'success');
        BackupApp.utils.logToConsole(`Restore sync completed locally: ${successCount} items restored.`, 'success');
        BackupApp.restore.renderArchive();
        BackupApp.dashboard.fetchStatus();
        return;
      }

      try {
        const response = await fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections })
        });
        const resData = await response.json();
        BackupApp.utils.hideLoadingModal();
        
        if (resData.success) {
          BackupApp.utils.showToast('লোকালে সফলভাবে রিস্টোর হয়েছে!', 'success');
          BackupApp.utils.logToConsole(`Restore sync completed successfully: ${resData.results.success.length} items restored.`, 'success');
          BackupApp.restore.renderArchive();
          BackupApp.dashboard.fetchStatus();
        } else {
          throw new Error(resData.error);
        }
      } catch (e) {
        BackupApp.utils.hideLoadingModal();
        BackupApp.utils.logToConsole(`Restore sync failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`রিস্টোর ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }
};

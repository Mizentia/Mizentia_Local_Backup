BackupApp.dashboard.fetchStatus = async function() {
  if (BackupApp.state.isServerless) {
    const config = JSON.parse(localStorage.getItem('mizentia_backup_config') || '{"connectionType":"simulation","driveFolderId":"","localDrivePath":""}');
    const state = JSON.parse(localStorage.getItem('mizentia_backup_state') || '{"files":{},"folders":{}}');
    
    const data = {
      connectionType: config.connectionType || 'simulation',
      isConnected: true,
      accountEmail: config.connectionType === 'simulation' ? 'Simulation Mode' : (config.connectionType === 'local_drive' ? `Local Destination` : 'Cloud Target'),
      driveFolderId: config.driveFolderId || '',
      localDrivePath: config.localDrivePath || '',
      localWorkspaceRoot: BackupApp.state.sourceDirHandle ? BackupApp.state.sourceDirHandle.name : 'কোনো ফোল্ডার সিলেক্ট করা নেই',
      defaultWorkspaceRoot: '',
      workspaceName: BackupApp.state.sourceDirHandle ? BackupApp.state.sourceDirHandle.name : 'Not Configured',
      lastBackupTime: state.lastBackupTime || null,
      fileCount: Object.keys(state.files || {}).length,
      folderCount: Object.keys(state.folders || {}).length,
      files: state.files || {},
      folders: state.folders || {}
    };

    BackupApp.state.systemStatus = data;
    
    const pill = BackupApp.elements.sidebarStatusPill;
    const txt = BackupApp.elements.sidebarStatusText;
    if (pill && txt) {
      pill.className = 'status-pill status-sim';
      txt.textContent = 'ব্রাউজার ইঞ্জিন মোড';
    }

    const totalBackupItems = (data.fileCount || 0) + (data.folderCount || 0);
    if (BackupApp.elements.statBackupCount) {
      BackupApp.elements.statBackupCount.textContent = `${totalBackupItems} টি (${data.folderCount || 0} টি ফোল্ডার, ${data.fileCount || 0} টি ফাইল)`;
    }
    if (BackupApp.elements.statLastBackup) {
      BackupApp.elements.statLastBackup.textContent = BackupApp.utils.formatTime(data.lastBackupTime);
    }
    if (BackupApp.elements.statWorkspace) {
      BackupApp.elements.statWorkspace.textContent = data.workspaceName;
    }

    if (typeof BackupApp.settings.updateUI === 'function') {
      BackupApp.settings.updateUI(data);
    }
    return data;
  }

  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    BackupApp.state.systemStatus = data;

    const pill = BackupApp.elements.sidebarStatusPill;
    const txt = BackupApp.elements.sidebarStatusText;
    
    if (pill && txt) {
      pill.className = 'status-pill';
      if (data.connectionType === 'simulation') {
        pill.classList.add('status-sim');
        txt.textContent = 'সিমুলেশন মোড';
      } else if (data.connectionType === 'local_drive') {
        if (data.isConnected) {
          pill.classList.add('status-sa');
          txt.textContent = 'ডেস্কটপ ড্রাইভ সিঙ্ক';
        } else {
          pill.classList.add('status-disconnected');
          txt.textContent = 'ড্রাইভ পাথ অনুপস্থিত';
        }
      } else if (data.isConnected) {
        pill.classList.add('status-sa');
        txt.textContent = 'ড্রাইভ সংযুক্ত';
      } else {
        pill.classList.add('status-disconnected');
        txt.textContent = 'ড্রাইভ অফলাইন';
      }
    }

    const totalBackupItems = (data.fileCount || 0) + (data.folderCount || 0);
    if (BackupApp.elements.statBackupCount) {
      BackupApp.elements.statBackupCount.textContent = `${totalBackupItems} টি (${data.folderCount || 0} টি ফোল্ডার, ${data.fileCount || 0} টি ফাইল)`;
    }
    if (BackupApp.elements.statLastBackup) {
      BackupApp.elements.statLastBackup.textContent = BackupApp.utils.formatTime(data.lastBackupTime);
    }
    if (BackupApp.elements.statWorkspace) {
      BackupApp.elements.statWorkspace.textContent = data.workspaceName || 'Mizentia All Project';
    }

    if (typeof BackupApp.settings.updateUI === 'function') {
      BackupApp.settings.updateUI(data);
    }

    return data;
  } catch (e) {
    BackupApp.utils.logToConsole(`Error fetching system status: ${e.message}`, 'error');
  }
};

BackupApp.dashboard.updateStats = function(summary) {
  let foldersCount = 0;
  let filesCount = 0;

  if (BackupApp.state.scanResults && BackupApp.state.scanResults.changes) {
    const allChanges = [
      ...(BackupApp.state.scanResults.changes.added || []),
      ...(BackupApp.state.scanResults.changes.modified || []),
      ...(BackupApp.state.scanResults.changes.deleted || []),
      ...(BackupApp.state.scanResults.changes.renamed || [])
    ];
    allChanges.forEach(item => {
      if (item.type === 'folder' || item.nodeType === 'folder') {
        foldersCount++;
      } else {
        filesCount++;
      }
    });
  } else {
    filesCount = (summary.added || 0) + (summary.modified || 0) + (summary.deleted || 0) + (summary.renamed || 0);
  }

  const totalChanges = foldersCount + filesCount;
  if (BackupApp.elements.statPendingChanges) {
    if (totalChanges === 0) {
      BackupApp.elements.statPendingChanges.textContent = '০ টি আইটেম';
      BackupApp.elements.statPendingChanges.className = 'stat-value';
    } else {
      BackupApp.elements.statPendingChanges.textContent = `${totalChanges} টি (${foldersCount} টি ফোল্ডার, ${filesCount} টি ফাইল)`;
      BackupApp.elements.statPendingChanges.className = 'stat-value text-amber';
    }
  }
};

BackupApp.dashboard.init = function() {
  BackupApp.utils.setBengaliGreeting();

  if (BackupApp.elements.btnSubTabLocal) {
    BackupApp.elements.btnSubTabLocal.addEventListener('click', () => {
      BackupApp.elements.btnSubTabLocal.classList.add('active');
      BackupApp.elements.btnSubTabDrive.classList.remove('active');
      BackupApp.elements.subTabLocalView.style.display = 'flex';
      BackupApp.elements.subTabDriveView.style.display = 'none';
    });
  }

  if (BackupApp.elements.btnSubTabDrive) {
    BackupApp.elements.btnSubTabDrive.addEventListener('click', () => {
      BackupApp.elements.btnSubTabDrive.classList.add('active');
      BackupApp.elements.btnSubTabLocal.classList.remove('active');
      BackupApp.elements.subTabLocalView.style.display = 'none';
      BackupApp.elements.subTabDriveView.style.display = 'flex';
    });
  }

  if (BackupApp.elements.btnClearLogs) {
    BackupApp.elements.btnClearLogs.addEventListener('click', () => {
      BackupApp.elements.consoleLogs.innerHTML = '';
      BackupApp.utils.logToConsole('Console log cleared.', 'info');
    });
  }

  if (BackupApp.elements.btnDashboardScan) {
    BackupApp.elements.btnDashboardScan.addEventListener('click', () => {
      BackupApp.tabs.switchTab('scanner');
      if (typeof BackupApp.scanner.scan === 'function') {
        BackupApp.scanner.scan(false, false);
      }
    });
  }

  BackupApp.dashboard.fetchStatus();
  setInterval(() => {
    BackupApp.dashboard.fetchStatus();
  }, 30000);
};

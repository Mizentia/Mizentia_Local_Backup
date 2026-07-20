window.BackupApp = {
  state: {
    systemStatus: null,
    scanResults: null,
    selectedItems: new Set(),
    currentFilter: 'all',
    heartbeatInterval: null,
    heartbeatStart: null,
    isServerless: false,
    sourceDirHandle: null,
    destDirHandle: null
  },
  elements: {},
  utils: {},
  tabs: {},
  dashboard: {},
  scanner: {},
  restore: {},
  ignore: {},
  settings: {},
  git: {}
};

BackupApp.utils.cacheElements = function() {
  const ids = [
    'sidebarStatusPill', 'sidebarStatusText', 'welcomeGreeting', 'statWorkspace',
    'statBackupCount', 'statPendingChanges', 'statLastBackup', 'consoleLogs',
    'btnClearLogs', 'btnDashboardScan', 'btnSubTabLocal', 'btnSubTabDrive',
    'subTabLocalView', 'subTabDriveView', 'statLocalFoldersCount', 'statLocalUnchanged',
    'statLocalModified', 'statLocalNew', 'statLocalExtensionList', 'statDriveFoldersCount',
    'statDriveExists', 'statDriveMissing', 'statDriveModified', 'statDriveExtensionList',
    'miniScanWidget', 'miniScanBar', 'miniScanPath', 'btnMiniMaximize', 'btnModalMinimize',
    'btnScannerScan', 'btnScannerScanEmpty', 'scanSummaryBar', 'summaryAddCount',
    'summaryModifyCount', 'summaryDeleteCount', 'summaryRenameCount', 'summaryTotalText',
    'scanTreeBody', 'selectAllCheckbox', 'scannerFooter', 'selectedCountText',
    'btnExecuteBackup', 'restoreLocalTreeBody', 'restoreDriveTreeBody', 'restoreLocalSelectAll',
    'restoreDriveSelectAll', 'restoreSyncSelectedCountText', 'restoreSyncDetailMessage',
    'btnRestoreSyncUpload', 'btnRestoreSyncDownload', 'ignoreRulesTextarea', 'btnSaveIgnore',
    'gitSetupArea', 'gitInitWrapper', 'gitActionsArea', 'gitCommitMessage',
    'btnGitStatus', 'btnGitPush', 'gitTerminalBranch', 'gitConsoleLogs', 'gitConsoleWrapper',
    'githubAccountModal', 'gitAccountLabel', 'gitAccountToken', 'btnCancelGitAccountModal', 'btnConfirmGitAccount',
    'gitAccountSelector', 'btnOpenAddAccountModal', 'gitActiveAccountCard', 'gitAccountAvatar', 'gitAccountUsername', 'btnDeleteGitAccount',
    'btnCopyGitToken', 'btnShowGitToken', 'viewGitTokenModal', 'viewGitTokenInput', 'btnModalCopyGitToken', 'btnCloseViewGitTokenModal',
    'gitRepoConfigArea', 'gitRepoSelector', 'gitBranchSelector',
    'gitLocalPathDropdown', 'gitLocalPathInput',
    'gitPushModeArea', 'btnEditGitIgnore', 'gitIgnoreTextareaWrapper', 'gitIgnoreTextarea', 'btnSaveGitIgnore', 'gitForcePush',
    'loadingModal', 'modalHeading', 'modalSubtext', 'modalProgressBar',
    'modalProgressDetail', 'modalActions', 'btnModalClose', 'btnSaveConfig',
    'btnTestConnection', 'localWorkspaceRoot', 'driveFolderId', 'localDrivePath',
    'saKeyJson', 'oauthClientId', 'oauthClientSecret', 'oauthRedirectUri',
    'oauthActionWrapper', 'btnStartOAuth', 'saConfigFields', 'localDriveFields',
    'oauthConfigFields', 'targetFolderIdField', 'testConnResult', 'ignoreOptionsModal',
    'selectedIgnorePathText', 'specificPathExampleText', 'globalPatternExampleText',
    'btnCancelIgnoreModal', 'btnConfirmAddIgnore', 'ignoreWorkspaceBrowser', 'activeRulesList',
    'btnCancelIgnoreChanges', 'sidebarGitInfo', 'sidebarGitRepoText',
    'browserModeBanner', 'btnBrowserSelectFolder', 'browserModeBannerText',
    'btnSelectSettingsWorkspace', 'btnSelectSettingsLocalDrive'
  ];
  
  ids.forEach(id => {
    BackupApp.elements[id] = document.getElementById(id);
  });
};

BackupApp.utils.loadTemplates = async function() {
  const tabs = ['dashboard', 'scanner', 'restore', 'ignore', 'instructions', 'settings'];
  for (const tab of tabs) {
    const container = document.getElementById(`tab-${tab}`);
    if (container) {
      const response = await fetch(`templates/${tab}.html?v=1.0.5`);
      const html = await response.text();
      container.innerHTML = html;
    }
  }
};

BackupApp.utils.setBengaliGreeting = function() {
  const now = new Date();
  const hours = now.getHours();
  let greeting = 'স্বাগতম, মিজেনশিয়া এডমিন!';
  
  if (hours >= 5 && hours < 12) greeting = '🎯 শুভ সকাল, মিজেনশিয়া এডমিন!';
  else if (hours >= 12 && hours < 16) greeting = '☀️ শুভ দুপুর, মিজেনশিয়া এডমিন!';
  else if (hours >= 16 && hours < 18) greeting = '🌅 শুভ বিকেল, মিজেনশিয়া এডমিন!';
  else if (hours >= 18 && hours < 20) greeting = '🌇 শুভ সন্ধ্যা, মিজেনশিয়া এডমিন!';
  else greeting = '🌙 শুভ রাত্রি, মিজেনশিয়া এডমিন!';
  
  if (BackupApp.elements.welcomeGreeting) {
    BackupApp.elements.welcomeGreeting.innerText = greeting;
  }
};

BackupApp.utils.logToConsole = function(message, type = 'info') {
  if (!BackupApp.elements.consoleLogs) return;
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
  BackupApp.elements.consoleLogs.appendChild(line);
  BackupApp.elements.consoleLogs.scrollTop = BackupApp.elements.consoleLogs.scrollHeight;
};

BackupApp.utils.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  if (type === 'success') {
    icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (type === 'error') {
    icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'warning') {
    icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 22 22 22"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }
  
  toast.innerHTML = `${icon}<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastEnter 0.3s ease-in reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

BackupApp.utils.formatTime = function(isoString) {
  if (!isoString) return 'কখনো না (Never)';
  return new Date(isoString).toLocaleString('bn-BD');
};

BackupApp.utils.formatBytes = function(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

BackupApp.utils.showLoadingModal = function(heading, subtext) {
  if (!BackupApp.elements.loadingModal) return;
  BackupApp.elements.modalHeading.innerText = heading;
  BackupApp.elements.modalSubtext.innerText = subtext;
  BackupApp.elements.modalProgressBar.style.width = '0%';
  BackupApp.elements.modalProgressDetail.innerText = '';
  BackupApp.elements.modalActions.style.display = 'none';
  BackupApp.elements.loadingModal.style.display = 'flex';
  if (BackupApp.elements.btnModalMinimize) BackupApp.elements.btnModalMinimize.style.display = 'none';
  BackupApp.utils.startHeartbeatMonitor();
};

BackupApp.utils.updateLoadingProgress = function(percent, detail) {
  if (BackupApp.elements.modalProgressBar) {
    BackupApp.elements.modalProgressBar.style.width = `${percent}%`;
  }
  if (BackupApp.elements.modalProgressDetail) {
    BackupApp.elements.modalProgressDetail.innerText = detail;
  }
};

BackupApp.utils.showLoadingComplete = function(heading, subtext) {
  if (!BackupApp.elements.loadingModal) return;
  BackupApp.elements.modalHeading.innerText = heading;
  BackupApp.elements.modalSubtext.innerText = subtext;
  BackupApp.elements.modalProgressBar.style.width = '100%';
  BackupApp.elements.modalActions.style.display = 'block';
  BackupApp.utils.stopHeartbeatMonitor();
};

BackupApp.utils.hideLoadingModal = function() {
  if (BackupApp.elements.loadingModal) {
    BackupApp.elements.loadingModal.style.display = 'none';
  }
  BackupApp.utils.stopHeartbeatMonitor();
};

BackupApp.utils.startHeartbeatMonitor = function() {
  BackupApp.utils.stopHeartbeatMonitor();
  BackupApp.state.heartbeatStart = Date.now();
  const dot = document.getElementById('modalHeartbeatDot');
  const msText = document.getElementById('modalHeartbeatMs');
  const labelText = document.getElementById('modalHeartbeatText');
  
  if (!dot) return;
  
  dot.style.background = '#22c55e';
  dot.style.boxShadow = '0 0 8px #22c55e';
  labelText.innerText = 'সিস্টেম স্পন্দন: সচল (Live)';
  
  BackupApp.state.heartbeatInterval = setInterval(() => {
    const elapsed = Date.now() - BackupApp.state.heartbeatStart;
    msText.innerText = `${elapsed}ms`;
    dot.style.transform = dot.style.transform === 'scale(1.2)' ? 'scale(1)' : 'scale(1.2)';
  }, 100);
};

BackupApp.utils.stopHeartbeatMonitor = function() {
  if (BackupApp.state.heartbeatInterval) {
    clearInterval(BackupApp.state.heartbeatInterval);
    BackupApp.state.heartbeatInterval = null;
  }
  const dot = document.getElementById('modalHeartbeatDot');
  if (dot) {
    dot.style.transform = 'scale(1)';
  }
};

BackupApp.utils.openDB = function() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MizentiaBackupDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

BackupApp.utils.saveHandle = async function(key, handle) {
  try {
    const db = await BackupApp.utils.openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, key);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) {
    console.error('IndexedDB save failed:', e);
  }
};

BackupApp.utils.loadHandle = async function(key) {
  try {
    const db = await BackupApp.utils.openDB();
    const tx = db.transaction('handles', 'readonly');
    const request = tx.objectStore('handles').get(key);
    return new Promise((resolve) => {
      request.onsuccess = (e) => resolve(e.target.result);
    });
  } catch (e) {
    console.error('IndexedDB load failed:', e);
    return null;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch and load all tab templates from templates folder
  try {
    await BackupApp.utils.loadTemplates();
  } catch (e) {
    console.error('Failed to load tab templates:', e);
  }

  // 2. Cache all DOM elements
  BackupApp.utils.cacheElements();

  // 3. Initial System boot checks (Run before sub-module initialization)
  let isServerless = false;
  try {
    const ping = await fetch('/api/status');
    if (!ping.ok) isServerless = true;
  } catch (e) {
    isServerless = true;
  }

  if (isServerless) {
    BackupApp.state.isServerless = true;
    BackupApp.utils.logToConsole('Local backend server offline. Running in Serverless Browser Mode.', 'warning');
    
    // Load saved handles from IndexedDB
    try {
      const savedSourceHandle = await BackupApp.utils.loadHandle('sourceDirHandle');
      if (savedSourceHandle) {
        BackupApp.state.sourceDirHandle = savedSourceHandle;
        if (BackupApp.elements.browserModeBannerText) {
          BackupApp.elements.browserModeBannerText.innerHTML = `সক্রিয় ফোল্ডার: <strong style="color:var(--text-cyan);">${savedSourceHandle.name}</strong>`;
        }
        if (BackupApp.elements.btnBrowserSelectFolder) {
          BackupApp.elements.btnBrowserSelectFolder.textContent = 'চেঞ্জ করুন';
        }
      }
      const savedDestHandle = await BackupApp.utils.loadHandle('destDirHandle');
      if (savedDestHandle) {
        BackupApp.state.destDirHandle = savedDestHandle;
      }
    } catch (e) {
      console.error('Error loading saved directory handles:', e);
    }

    if (BackupApp.elements.browserModeBanner) {
      BackupApp.elements.browserModeBanner.style.display = 'flex';
    }
    if (BackupApp.elements.btnBrowserSelectFolder) {
      BackupApp.elements.btnBrowserSelectFolder.addEventListener('click', async () => {
        try {
          const handle = await window.showDirectoryPicker();
          BackupApp.state.sourceDirHandle = handle;
          await BackupApp.utils.saveHandle('sourceDirHandle', handle);
          if (BackupApp.elements.browserModeBannerText) {
            BackupApp.elements.browserModeBannerText.innerHTML = `সক্রিয় ফোল্ডার: <strong style="color:var(--text-cyan);">${handle.name}</strong>`;
          }
          if (BackupApp.elements.btnBrowserSelectFolder) {
            BackupApp.elements.btnBrowserSelectFolder.textContent = 'চেঞ্জ করুন';
          }
          BackupApp.utils.logToConsole(`Source workspace directory selected: ${handle.name}`, 'success');
          BackupApp.dashboard.fetchStatus();
        } catch (err) {
          BackupApp.utils.logToConsole(`Error selecting workspace folder: ${err.message}`, 'error');
        }
      });
    }
  }

  // 4. Initialize all sub-modules (with correct isServerless state!)
  BackupApp.tabs.init();
  BackupApp.dashboard.init();
  BackupApp.scanner.init();
  BackupApp.restore.init();
  BackupApp.ignore.init();
  BackupApp.settings.init();
  BackupApp.git.init();

  BackupApp.dashboard.fetchStatus().then(() => {
    BackupApp.utils.logToConsole('Local Backup system state initialized.', 'success');
    
    // Start background scan silently or full auto-scan on browser boot
    if (typeof BackupApp.scanner.scan === 'function') {
      if (BackupApp.state.isServerless) {
        if (BackupApp.state.sourceDirHandle) {
          BackupApp.scanner.scan(false, false, true); // passes isBoot = true
        }
      } else {
        BackupApp.scanner.scan(false, true);
      }
    }
    
    // Check initial git repository status
    if (typeof BackupApp.git.checkStatus === 'function') {
      BackupApp.git.checkStatus();
    }
  });
});

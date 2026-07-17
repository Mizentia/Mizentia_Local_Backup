BackupApp.tabs.switchTab = function(tabId) {
  const tabBtns = document.querySelectorAll('.nav-item');
  const tabs = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  tabs.forEach(tab => {
    if (tab.id === `tab-${tabId}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Custom action triggers on tab changes
  if (tabId === 'ignore') {
    if (typeof BackupApp.ignore.loadRules === 'function') {
      BackupApp.ignore.loadRules();
    }
    if (typeof BackupApp.ignore.loadWorkspaceBrowser === 'function') {
      BackupApp.ignore.loadWorkspaceBrowser();
    }
  } else if (tabId === 'restore') {
    if (typeof BackupApp.restore.renderWorkspace === 'function') {
      BackupApp.restore.renderWorkspace();
    }
    if (typeof BackupApp.restore.renderArchive === 'function') {
      BackupApp.restore.renderArchive();
    }
  }
};

BackupApp.tabs.init = function() {
  const tabBtns = document.querySelectorAll('.nav-item');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute('data-tab');
      window.location.hash = tabId;
      BackupApp.tabs.switchTab(tabId);
    });
  });

  // Handle initial page load hash
  const initialHash = window.location.hash.substring(1);
  const validTabs = ['dashboard', 'scanner', 'restore', 'ignore', 'instructions', 'settings'];
  if (initialHash && validTabs.includes(initialHash)) {
    BackupApp.tabs.switchTab(initialHash);
  } else {
    BackupApp.tabs.switchTab('dashboard');
  }

  // Handle browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash && validTabs.includes(hash)) {
      BackupApp.tabs.switchTab(hash);
    }
  });
};

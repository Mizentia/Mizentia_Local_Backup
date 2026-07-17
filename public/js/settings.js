BackupApp.settings.updateUI = function(config) {
  const radio = document.querySelector(`input[name="connectionType"][value="${config.connectionType}"]`);
  const connectionOptions = document.querySelectorAll('.connection-type-option');
  if (radio) {
    radio.checked = true;
    connectionOptions.forEach(opt => opt.classList.remove('active'));
    const parentOpt = radio.closest('.connection-type-option');
    if (parentOpt) parentOpt.classList.add('active');
  }

  if (BackupApp.elements.driveFolderId) BackupApp.elements.driveFolderId.value = config.driveFolderId || '';
  if (BackupApp.elements.localDrivePath) BackupApp.elements.localDrivePath.value = config.localDrivePath || '';
  if (BackupApp.elements.localWorkspaceRoot) BackupApp.elements.localWorkspaceRoot.value = config.localWorkspaceRoot || '';
  
  if (BackupApp.elements.localDriveFields) BackupApp.elements.localDriveFields.style.display = 'none';
  if (BackupApp.elements.saConfigFields) BackupApp.elements.saConfigFields.style.display = 'none';
  if (BackupApp.elements.oauthConfigFields) BackupApp.elements.oauthConfigFields.style.display = 'none';
  if (BackupApp.elements.targetFolderIdField) BackupApp.elements.targetFolderIdField.style.display = 'none';

  if (config.connectionType === 'service_account') {
    if (BackupApp.elements.targetFolderIdField) BackupApp.elements.targetFolderIdField.style.display = 'block';
    if (BackupApp.elements.saConfigFields) BackupApp.elements.saConfigFields.style.display = 'block';
    if (config.serviceAccount && BackupApp.elements.saKeyJson) {
      BackupApp.elements.saKeyJson.value = typeof config.serviceAccount === 'string'
        ? config.serviceAccount
        : JSON.stringify(config.serviceAccount, null, 2);
    }
  } else if (config.connectionType === 'oauth2') {
    if (BackupApp.elements.targetFolderIdField) BackupApp.elements.targetFolderIdField.style.display = 'block';
    if (BackupApp.elements.oauthConfigFields) BackupApp.elements.oauthConfigFields.style.display = 'block';
    if (BackupApp.elements.oauthClientId) BackupApp.elements.oauthClientId.value = config.oauth2.client_id || '';
    if (BackupApp.elements.oauthClientSecret) BackupApp.elements.oauthClientSecret.value = config.oauth2.client_secret || '';
    
    const successWrapper = document.getElementById('oauthStatusSuccess');
    if (BackupApp.elements.oauthActionWrapper) {
      if (config.oauth2.tokens) {
        if (successWrapper) successWrapper.style.display = 'block';
        BackupApp.elements.oauthActionWrapper.style.display = 'none';
      } else {
        if (successWrapper) successWrapper.style.display = 'none';
        BackupApp.elements.oauthActionWrapper.style.display = 'block';
      }
    }
  } else if (config.connectionType === 'local_drive') {
    if (BackupApp.elements.localDriveFields) BackupApp.elements.localDriveFields.style.display = 'block';
  }
};

BackupApp.settings.init = function() {
  const connectionRadios = document.querySelectorAll('input[name="connectionType"]');
  const connectionOptions = document.querySelectorAll('.connection-type-option');
  
  connectionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        connectionOptions.forEach(opt => opt.classList.remove('active'));
        radio.closest('.connection-type-option').classList.add('active');
        
        const val = radio.value;
        if (BackupApp.elements.targetFolderIdField) {
          BackupApp.elements.targetFolderIdField.style.display = (val === 'service_account' || val === 'oauth2') ? 'block' : 'none';
        }
        if (BackupApp.elements.localDriveFields) {
          BackupApp.elements.localDriveFields.style.display = val === 'local_drive' ? 'block' : 'none';
        }
        if (BackupApp.elements.saConfigFields) {
          BackupApp.elements.saConfigFields.style.display = val === 'service_account' ? 'block' : 'none';
        }
        if (BackupApp.elements.oauthConfigFields) {
          BackupApp.elements.oauthConfigFields.style.display = val === 'oauth2' ? 'block' : 'none';
        }
      }
    });
  });

  const saveBtn = BackupApp.elements.btnSaveConfig || BackupApp.elements.btnSaveSettings;
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const connectionType = document.querySelector('input[name="connectionType"]:checked').value;
      const folderId = BackupApp.elements.driveFolderId.value.trim();
      const localPathVal = BackupApp.elements.localDrivePath.value.trim();
      const localWorkspaceVal = BackupApp.elements.localWorkspaceRoot.value.trim();

      const payload = {
        connectionType,
        driveFolderId: folderId,
        localDrivePath: localPathVal,
        localWorkspaceRoot: localWorkspaceVal
      };

      if (connectionType === 'local_drive') {
        if (!localPathVal) {
          BackupApp.utils.showToast('লোকাল গুগল ড্রাইভ পাথ প্রোভাইড করুন!', 'warning');
          return;
        }
      } else if (connectionType === 'service_account') {
        const saVal = BackupApp.elements.saKeyJson.value.trim();
        if (!saVal) {
          BackupApp.utils.showToast('সার্ভিস অ্যাকাউন্ট JSON কী প্রোভাইড করুন!', 'warning');
          return;
        }
        try {
          payload.serviceAccount = JSON.parse(saVal);
        } catch (e) {
          BackupApp.utils.showToast('ভুল JSON ফরম্যাট! সঠিক সার্ভিস অ্যাকাউন্ট কী পেস্ট করুন।', 'error');
          return;
        }
      } else if (connectionType === 'oauth2') {
        const clientId = BackupApp.elements.oauthClientId.value.trim();
        const clientSecret = BackupApp.elements.oauthClientSecret.value.trim();
        
        if (!clientId || !clientSecret) {
          BackupApp.utils.showToast('OAuth2 ক্লায়েন্ট আইডি ও সিক্রেট প্রোভাইড করুন!', 'warning');
          return;
        }

        payload.oauth2 = {
          ...BackupApp.state.systemStatus?.oauth2,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: 'http://localhost:3000/api/gdrive/callback'
        };
      }

      if (BackupApp.state.isServerless) {
        BackupApp.utils.logToConsole('Saving configuration locally to browser localStorage...', 'info');
        localStorage.setItem('mizentia_backup_config', JSON.stringify(payload));
        BackupApp.utils.logToConsole('Settings saved locally.', 'success');
        BackupApp.utils.showToast('সেটিংস সফলভাবে সেভ হয়েছে!', 'success');
        BackupApp.dashboard.fetchStatus();
        if (typeof BackupApp.ignore.loadRules === 'function') {
          BackupApp.ignore.loadRules();
        }
        return;
      }

      BackupApp.utils.logToConsole('Saving config parameters to disk...', 'info');

      try {
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
          BackupApp.utils.logToConsole('Settings saved successfully.', 'success');
          BackupApp.utils.showToast('সেটিংস সফলভাবে সেভ হয়েছে!', 'success');
          BackupApp.dashboard.fetchStatus();
          if (typeof BackupApp.ignore.loadRules === 'function') {
            BackupApp.ignore.loadRules();
          }
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.utils.logToConsole(`Failed to save config: ${e.message}`, 'error');
        BackupApp.utils.showToast(`সেটিংস সেভ করতে সমস্যা হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnTestConnection) {
    BackupApp.elements.btnTestConnection.addEventListener('click', async () => {
      const connectionType = document.querySelector('input[name="connectionType"]:checked').value;
      const folderId = BackupApp.elements.driveFolderId.value.trim();
      const localPathVal = BackupApp.elements.localDrivePath.value.trim();

      const payload = {
        connectionType,
        driveFolderId: folderId,
        localDrivePath: localPathVal
      };

      if (connectionType === 'local_drive') {
        if (!localPathVal) {
          BackupApp.utils.showToast('লোকাল গুগল ড্রাইভ পাথ পূরণ করুন!', 'warning');
          return;
        }
      } else if (connectionType === 'service_account') {
        const saVal = BackupApp.elements.saKeyJson.value.trim();
        if (!saVal) {
          BackupApp.utils.showToast('সার্ভিস অ্যাকাউন্ট JSON কী পূরণ করুন!', 'warning');
          return;
        }
        try {
          payload.serviceAccount = JSON.parse(saVal);
        } catch (e) {
          BackupApp.utils.showToast('ভুল JSON ফরম্যাট!', 'error');
          return;
        }
      } else if (connectionType === 'oauth2') {
        if (!BackupApp.state.systemStatus?.oauth2?.tokens) {
          BackupApp.utils.showToast('প্রথমে গুগল অ্যাকাউন্ট কানেক্ট করে অথেন্টিকেশন করুন!', 'warning');
          return;
        }
        payload.oauth2 = BackupApp.state.systemStatus.oauth2;
      }

      if (BackupApp.state.isServerless) {
        BackupApp.utils.logToConsole('Testing client-side connection parameters...', 'info');
        if (connectionType === 'local_drive') {
          try {
            BackupApp.utils.logToConsole('Prompting for destination folder permission...', 'info');
            const handle = await window.showDirectoryPicker();
            BackupApp.state.destDirHandle = handle;
            BackupApp.utils.logToConsole(`Successfully connected to local folder: ${handle.name}`, 'success');
            BackupApp.utils.showToast(`সংযোগ সফল হয়েছে! ফোল্ডার: ${handle.name}`, 'success');
          } catch (e) {
            BackupApp.utils.logToConsole(`Folder access denied: ${e.message}`, 'error');
            BackupApp.utils.showToast('সংযোগ ব্যর্থ হয়েছে!', 'error');
          }
        } else {
          BackupApp.utils.logToConsole('Simulation Connection Test Succeeded!', 'success');
          BackupApp.utils.showToast('সংযোগ সফল হয়েছে (Simulation)!', 'success');
        }
        return;
      }

      BackupApp.utils.logToConsole('Testing connection with Google Drive api server...', 'info');
      BackupApp.utils.showToast('সংযোগ পরীক্ষা করা হচ্ছে...', 'info');

      try {
        const response = await fetch('/api/config/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
          BackupApp.utils.logToConsole(`Connection Test Success: ${data.message}`, 'success');
          BackupApp.utils.showToast(data.message, 'success');
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.utils.logToConsole(`Connection Test Failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`সংযোগ ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnStartOAuth) {
    BackupApp.elements.btnStartOAuth.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/gdrive/auth-url');
        const data = await response.json();
        if (data.success && data.url) {
          BackupApp.utils.logToConsole('Redirecting user to Google OAuth consent screen...', 'info');
          window.open(data.url, '_blank', 'width=600,height=700');
        } else {
          throw new Error(data.error || 'Client ID/Secret missing');
        }
      } catch (e) {
        BackupApp.utils.showToast(`অথেন্টিকেশন উইন্ডো খুলতে পারেনি: ${e.message}`, 'error');
      }
    });
  }

  const btnSetDefaultWorkspace = document.getElementById('btnSetDefaultWorkspace');
  if (btnSetDefaultWorkspace) {
    btnSetDefaultWorkspace.addEventListener('click', () => {
      if (BackupApp.state.systemStatus && BackupApp.elements.localWorkspaceRoot) {
        BackupApp.elements.localWorkspaceRoot.value = BackupApp.state.systemStatus.defaultWorkspaceRoot || '';
        BackupApp.utils.showToast('ডিফল্ট প্রজেক্ট ডিরেক্টরি পাথ সেট করা হয়েছে। সংরক্ষণের জন্য সেভ করুন।', 'info');
      }
    });
  }

  const btnSelectSettingsWorkspace = document.getElementById('btnSelectSettingsWorkspace');
  if (btnSelectSettingsWorkspace) {
    btnSelectSettingsWorkspace.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker();
        BackupApp.state.sourceDirHandle = handle;
        if (BackupApp.elements.localWorkspaceRoot) {
          BackupApp.elements.localWorkspaceRoot.value = handle.name;
        }
        if (BackupApp.elements.browserModeBannerText) {
          BackupApp.elements.browserModeBannerText.innerHTML = `সক্রিয় ফোল্ডার: <strong style="color:var(--text-cyan);">${handle.name}</strong>`;
        }
        if (BackupApp.elements.btnBrowserSelectFolder) {
          BackupApp.elements.btnBrowserSelectFolder.textContent = 'চেঞ্জ করুন';
        }
        BackupApp.utils.showToast(`ফোল্ডার সিলেক্ট করা হয়েছে: ${handle.name}`, 'success');
      } catch (err) {
        BackupApp.utils.logToConsole(`Error selecting workspace: ${err.message}`, 'error');
      }
    });
  }

  const btnSelectSettingsLocalDrive = document.getElementById('btnSelectSettingsLocalDrive');
  if (btnSelectSettingsLocalDrive) {
    btnSelectSettingsLocalDrive.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker();
        BackupApp.state.destDirHandle = handle;
        if (BackupApp.elements.localDrivePath) {
          BackupApp.elements.localDrivePath.value = handle.name;
        }
        BackupApp.utils.showToast(`ব্যাকআপ গন্তব্য ফোল্ডার সিলেক্ট করা হয়েছে: ${handle.name}`, 'success');
      } catch (err) {
        BackupApp.utils.logToConsole(`Error selecting backup destination: ${err.message}`, 'error');
      }
    });
  }
};

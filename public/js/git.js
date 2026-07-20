BackupApp.git.appendLog = function(line, type = 'normal') {
  if (!BackupApp.elements.gitConsoleLogs) return;
  const lineEl = document.createElement('div');
  lineEl.className = 'log-line';
  
  if (type === 'error') {
    lineEl.style.color = '#ef4444';
    lineEl.textContent = `[ERROR] ${line}`;
  } else if (type === 'success') {
    lineEl.style.color = '#10b981';
    lineEl.textContent = `[SUCCESS] ${line}`;
  } else if (type === 'info') {
    lineEl.style.color = '#60a5fa';
    lineEl.textContent = `[INFO] ${line}`;
  } else {
    lineEl.style.color = '#c5c6c7';
    lineEl.textContent = line;
  }
  
  BackupApp.elements.gitConsoleLogs.appendChild(lineEl);
  BackupApp.elements.gitConsoleLogs.scrollTop = BackupApp.elements.gitConsoleLogs.scrollHeight;
};

BackupApp.git.checkStatus = async function() {
  BackupApp.git.appendLog('Checking local Git status...', 'info');
  
  if (BackupApp.state.isServerless) {
    BackupApp.git.appendLog('Running in Serverless Browser Mode. Local Git CLI disabled.', 'info');
    if (BackupApp.elements.gitSetupArea) BackupApp.elements.gitSetupArea.style.display = 'none';
    if (BackupApp.elements.btnGitPush) BackupApp.elements.btnGitPush.disabled = false;
    return;
  }

  try {
    const response = await fetch('/api/github/status');
    const data = await response.json();
    
    if (!data.success) {
      if (data.reason === 'git_not_installed') {
        BackupApp.git.appendLog(data.message, 'error');
        if (BackupApp.elements.gitTerminalBranch) BackupApp.elements.gitTerminalBranch.textContent = 'Git not installed';
        return;
      }
      throw new Error(data.error || data.message);
    }
    
    if (!data.isRepo) {
      BackupApp.git.appendLog(data.message, 'error');
      if (BackupApp.elements.gitTerminalBranch) BackupApp.elements.gitTerminalBranch.textContent = 'Not a Git Repo';
      if (BackupApp.elements.gitSetupArea) BackupApp.elements.gitSetupArea.style.display = 'flex';
      if (BackupApp.elements.gitInitWrapper) BackupApp.elements.gitInitWrapper.style.display = 'flex';
      return;
    }
    
    if (BackupApp.elements.gitSetupArea) BackupApp.elements.gitSetupArea.style.display = 'none';
    if (BackupApp.elements.gitInitWrapper) BackupApp.elements.gitInitWrapper.style.display = 'none';

    BackupApp.git.currentLocalBranch = data.branch;
    BackupApp.git.updateTerminalBranchHeader();
    BackupApp.git.appendLog(`Local repository is active on branch: ${data.branch}`, 'success');
    
    if (data.changes && data.changes.length > 0) {
      BackupApp.git.appendLog('Local changes detected:', 'info');
      data.changes.forEach(change => BackupApp.git.appendLog(`  ${change}`));
    } else {
      BackupApp.git.appendLog('Working tree clean (no uncommitted local changes).', 'info');
    }
  } catch (e) {
    BackupApp.git.appendLog(`Failed to retrieve Git status: ${e.message}`, 'error');
  }
};

BackupApp.git.loadAccounts = async function() {
  try {
    const response = await fetch('/api/github/accounts');
    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    BackupApp.state.githubAccounts = data.accounts || [];
    
    const selector = BackupApp.elements.gitAccountSelector;
    if (selector) {
      selector.innerHTML = '<option value="">-- অ্যাকাউন্ট সিলেক্ট করুন --</option>';
      BackupApp.state.githubAccounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.label} (${acc.username})`;
        selector.appendChild(opt);
      });

      if (data.selectedAccountId) {
        selector.value = data.selectedAccountId;
        await BackupApp.git.onAccountChange(data.selectedAccountId, data.selectedRepo, data.selectedBranch);
      } else {
        BackupApp.git.updateActiveAccountUI(null);
      }
    }
  } catch (e) {
    console.error('Error loading GitHub accounts:', e);
    BackupApp.git.appendLog(`Failed to load GitHub accounts: ${e.message}`, 'error');
  }
};

BackupApp.git.updateActiveAccountUI = function(account) {
  const card = BackupApp.elements.gitActiveAccountCard;
  const avatar = BackupApp.elements.gitAccountAvatar;
  const username = BackupApp.elements.gitAccountUsername;
  const pushBtn = BackupApp.elements.btnGitPush;

  if (account) {
    if (username) username.textContent = account.username;
    if (avatar) avatar.src = account.avatarUrl;
    if (card) card.style.display = 'flex';
    if (pushBtn) pushBtn.disabled = false;
  } else {
    if (card) card.style.display = 'none';
    if (pushBtn) pushBtn.disabled = true;
    
    if (BackupApp.elements.gitRepoSelector) {
      BackupApp.elements.gitRepoSelector.innerHTML = '<option value="">-- রিপোজিটরি লোড করতে আগে অ্যাকাউন্ট সিলেক্ট করুন --</option>';
    }
    if (BackupApp.elements.gitBranchSelector) {
      BackupApp.elements.gitBranchSelector.innerHTML = '<option value="">-- ব্রাঞ্চ লোড করতে আগে রিপোজিটরি সিলেক্ট করুন --</option>';
    }
  }
};

BackupApp.git.onAccountChange = async function(accountId, restoreRepo = '', restoreBranch = '') {
  BackupApp.git.updateActiveAccountUI(null);
  if (!accountId) return;

  const account = BackupApp.state.githubAccounts.find(acc => acc.id === accountId);
  if (!account) return;

  BackupApp.git.updateActiveAccountUI(account);

  try {
    const repoSelector = BackupApp.elements.gitRepoSelector;
    if (repoSelector) {
      repoSelector.innerHTML = '<option value="">-- রিপোজিটরি লোড হচ্ছে... --</option>';
    }

    const response = await fetch(`/api/github/repos?accountId=${accountId}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    if (repoSelector) {
      repoSelector.innerHTML = '<option value="">-- রিপোজিটরি সিলেক্ট করুন --</option>';
      data.repos.forEach(repo => {
        const opt = document.createElement('option');
        opt.value = repo.fullName;
        opt.textContent = repo.name;
        repoSelector.appendChild(opt);
      });

      if (restoreRepo) {
        repoSelector.value = restoreRepo;
        await BackupApp.git.onRepoChange(accountId, restoreRepo, restoreBranch);
      }
    }
  } catch (e) {
    console.error('Error loading repos:', e);
    BackupApp.git.appendLog(`Failed to load repositories: ${e.message}`, 'error');
  }
};

BackupApp.git.onRepoChange = async function(accountId, repoFullName, restoreBranch = '') {
  if (!accountId || !repoFullName) {
    if (BackupApp.elements.gitBranchSelector) {
      BackupApp.elements.gitBranchSelector.innerHTML = '<option value="">-- ব্রাঞ্চ লোড করতে আগে রিপোজিটরি সিলেক্ট করুন --</option>';
    }
    return;
  }

  try {
    const branchSelector = BackupApp.elements.gitBranchSelector;
    if (branchSelector) {
      branchSelector.innerHTML = '<option value="">-- ব্রাঞ্চ লোড হচ্ছে... --</option>';
    }

    const response = await fetch(`/api/github/branches?accountId=${accountId}&repoName=${repoFullName}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    if (branchSelector) {
      branchSelector.innerHTML = '<option value="">-- ব্রাঞ্চ সিলেক্ট করুন --</option>';
      data.branches.forEach(br => {
        const opt = document.createElement('option');
        opt.value = br;
        opt.textContent = br;
        branchSelector.appendChild(opt);
      });

      if (restoreBranch) {
        branchSelector.value = restoreBranch;
      }
      BackupApp.git.updateTerminalBranchHeader();
    }
  } catch (e) {
    console.error('Error loading branches:', e);
    BackupApp.git.appendLog(`Failed to load branches: ${e.message}`, 'error');
  }
};

BackupApp.git.saveCurrentSelection = async function() {
  const accountId = BackupApp.elements.gitAccountSelector?.value || '';
  const repo = BackupApp.elements.gitRepoSelector?.value || '';
  const branch = BackupApp.elements.gitBranchSelector?.value || '';

  try {
    await fetch('/api/github/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, repo, branch })
    });
  } catch (e) {
    console.error('Error saving GitHub selection:', e);
  }
};

BackupApp.git.loadGitIgnoreRules = async function() {
  try {
    const response = await fetch('/api/github/gitignore');
    const data = await response.json();
    if (data.success && BackupApp.elements.gitIgnoreTextarea) {
      BackupApp.elements.gitIgnoreTextarea.value = data.rules || '';
    }
  } catch (e) {
    console.error('Error loading gitignore rules:', e);
  }
};

BackupApp.git.saveGitIgnoreRules = async function() {
  const rules = BackupApp.elements.gitIgnoreTextarea?.value || '';
  try {
    const response = await fetch('/api/github/gitignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    });
    const data = await response.json();
    if (data.success) {
      BackupApp.utils.showToast('গিটহাব ইগনোর রুলস সংরক্ষণ করা হয়েছে!', 'success');
      if (BackupApp.elements.gitIgnoreTextareaWrapper) {
        BackupApp.elements.gitIgnoreTextareaWrapper.style.display = 'none';
      }
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    BackupApp.utils.showToast(`রুলস সংরক্ষণ ব্যর্থ হয়েছে: ${e.message}`, 'error');
  }
};

BackupApp.git.updatePushModeUI = function() {
  const selectedMode = document.querySelector('input[name="gitPushMode"]:checked')?.value || 'project';
  const ignoreArea = BackupApp.elements.gitIgnoreSettingsArea;
  if (ignoreArea) {
    if (selectedMode === 'project') {
      ignoreArea.style.display = 'block';
    } else {
      ignoreArea.style.display = 'none';
    }
  }
};

BackupApp.git.updateTerminalBranchHeader = function(localBranch = '') {
  const local = localBranch || BackupApp.git.currentLocalBranch || 'unknown';
  const target = BackupApp.elements.gitBranchSelector?.value || 'none';
  if (BackupApp.elements.gitTerminalBranch) {
    BackupApp.elements.gitTerminalBranch.textContent = `Local: ${local} ➔ Target: ${target}`;
  }
};

BackupApp.git.simulateProgress = function(steps, durationMs) {
  let currentStep = 0;
  const intervalTime = durationMs / steps.length;
  
  if (BackupApp.git.progressInterval) {
    clearInterval(BackupApp.git.progressInterval);
  }
  
  const runStep = () => {
    if (currentStep < steps.length) {
      const step = steps[currentStep];
      BackupApp.utils.updateLoadingProgress(step.percent, step.text);
      currentStep++;
    } else {
      clearInterval(BackupApp.git.progressInterval);
    }
  };
  
  runStep();
  BackupApp.git.progressInterval = setInterval(runStep, intervalTime);
};

BackupApp.git.init = function() {
  BackupApp.git.loadAccounts();
  BackupApp.git.loadGitIgnoreRules();

  // Wire up push mode toggles
  const modeRadios = document.querySelectorAll('input[name="gitPushMode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      BackupApp.git.updatePushModeUI();
    });
  });
  BackupApp.git.updatePushModeUI();

  // Wire up Edit GitIgnore button
  if (BackupApp.elements.btnEditGitIgnore) {
    BackupApp.elements.btnEditGitIgnore.addEventListener('click', () => {
      const wrapper = BackupApp.elements.gitIgnoreTextareaWrapper;
      if (wrapper) {
        if (wrapper.style.display === 'none' || !wrapper.style.display) {
          wrapper.style.display = 'flex';
        } else {
          wrapper.style.display = 'none';
        }
      }
    });
  }

  // Wire up Save GitIgnore button
  if (BackupApp.elements.btnSaveGitIgnore) {
    BackupApp.elements.btnSaveGitIgnore.addEventListener('click', () => {
      BackupApp.git.saveGitIgnoreRules();
    });
  }

  if (BackupApp.elements.btnOpenAddAccountModal) {
    BackupApp.elements.btnOpenAddAccountModal.addEventListener('click', () => {
      if (BackupApp.elements.githubAccountModal) {
        BackupApp.elements.githubAccountModal.style.display = 'flex';
      }
    });
  }

  if (BackupApp.elements.btnCancelGitAccountModal) {
    BackupApp.elements.btnCancelGitAccountModal.addEventListener('click', () => {
      if (BackupApp.elements.githubAccountModal) {
        BackupApp.elements.githubAccountModal.style.display = 'none';
      }
      if (BackupApp.elements.gitAccountLabel) BackupApp.elements.gitAccountLabel.value = '';
      if (BackupApp.elements.gitAccountToken) BackupApp.elements.gitAccountToken.value = '';
    });
  }

  if (BackupApp.elements.btnConfirmGitAccount) {
    BackupApp.elements.btnConfirmGitAccount.addEventListener('click', async () => {
      const label = BackupApp.elements.gitAccountLabel.value.trim();
      const token = BackupApp.elements.gitAccountToken.value.trim();

      if (!label || !token) {
        BackupApp.utils.showToast('লেবেল এবং টোকেন উভয়ই আবশ্যক!', 'warning');
        return;
      }

      BackupApp.utils.showLoadingModal('গিটহাব অ্যাকাউন্ট ভেরিফাই করা হচ্ছে...', 'গিটহাব এপিআই-এর সাথে সংযোগ স্থাপন করা হচ্ছে, অপেক্ষা করুন।');
      try {
        const response = await fetch('/api/github/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, label })
        });
        const data = await response.json();
        
        BackupApp.utils.hideLoadingModal();
        if (data.success) {
          BackupApp.utils.showToast('সফলভাবে গিটহাব অ্যাকাউন্ট যুক্ত করা হয়েছে!', 'success');
          if (BackupApp.elements.githubAccountModal) {
            BackupApp.elements.githubAccountModal.style.display = 'none';
          }
          BackupApp.elements.gitAccountLabel.value = '';
          BackupApp.elements.gitAccountToken.value = '';
          await BackupApp.git.loadAccounts();
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.utils.hideLoadingModal();
        BackupApp.utils.showToast(e.message, 'error');
      }
    });
  }

  if (BackupApp.elements.gitAccountSelector) {
    BackupApp.elements.gitAccountSelector.addEventListener('change', async () => {
      const val = BackupApp.elements.gitAccountSelector.value;
      await BackupApp.git.onAccountChange(val);
      await BackupApp.git.saveCurrentSelection();
    });
  }

  if (BackupApp.elements.gitRepoSelector) {
    BackupApp.elements.gitRepoSelector.addEventListener('change', async () => {
      const accountId = BackupApp.elements.gitAccountSelector?.value || '';
      const repoFullName = BackupApp.elements.gitRepoSelector.value;
      await BackupApp.git.onRepoChange(accountId, repoFullName);
      await BackupApp.git.saveCurrentSelection();
    });
  }

  if (BackupApp.elements.gitBranchSelector) {
    BackupApp.elements.gitBranchSelector.addEventListener('change', async () => {
      await BackupApp.git.saveCurrentSelection();
      BackupApp.git.updateTerminalBranchHeader();
    });
  }

  if (BackupApp.elements.btnDeleteGitAccount) {
    BackupApp.elements.btnDeleteGitAccount.addEventListener('click', async () => {
      const accountId = BackupApp.elements.gitAccountSelector?.value;
      if (!accountId) return;

      const confirmDelete = confirm('আপনি কি নিশ্চিত যে এই গিটহাব অ্যাকাউন্টটি ডিলিট করতে চান?');
      if (!confirmDelete) return;

      try {
        const response = await fetch(`/api/github/accounts/${accountId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
          BackupApp.utils.showToast('অ্যাকাউন্টটি সফলভাবে ডিলিট করা হয়েছে!', 'success');
          await BackupApp.git.loadAccounts();
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.utils.showToast(`ডিলিট করতে সমস্যা হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnGitInit) {
    BackupApp.elements.btnGitInit.addEventListener('click', async () => {
      BackupApp.git.appendLog('Initializing Git repository...', 'info');
      BackupApp.utils.showLoadingModal('গিট রিপোজিটরি ইনিশিয়েলাইজ করা হচ্ছে...', 'রিপোজিটরি কনফিগার করা হচ্ছে, অপেক্ষা করুন।');
      const progressSteps = [
        { percent: 20, text: 'রিপোজিটরি কনফিগারেশন চেক করা হচ্ছে...' },
        { percent: 50, text: 'গিট রিপোজিটরি ইনিশিয়েলাইজ করা হচ্ছে (git init)...' },
        { percent: 80, text: '.gitignore রুলস ফাইল তৈরি করা হচ্ছে...' }
      ];
      BackupApp.git.simulateProgress(progressSteps, 1500);
      try {
        const response = await fetch('/api/github/init', { method: 'POST' });
        const data = await response.json();
        
        if (BackupApp.git.progressInterval) clearInterval(BackupApp.git.progressInterval);
        BackupApp.utils.hideLoadingModal();

        if (data.success) {
          BackupApp.git.appendLog(data.message, 'success');
          BackupApp.utils.showToast('গিট রিপোজিটরি সফলভাবে ইনিশিয়েলাইজ হয়েছে!', 'success');
          BackupApp.git.checkStatus();
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        if (BackupApp.git.progressInterval) clearInterval(BackupApp.git.progressInterval);
        BackupApp.utils.hideLoadingModal();
        BackupApp.git.appendLog(`Git initialization failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`গিট ইনিশিয়েলাইজ ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnGitPush) {
    BackupApp.elements.btnGitPush.addEventListener('click', async () => {
      const commitMessage = BackupApp.elements.gitCommitMessage.value.trim();
      const accountId = BackupApp.elements.gitAccountSelector?.value || '';
      const repoFullName = BackupApp.elements.gitRepoSelector?.value || '';
      const branchName = BackupApp.elements.gitBranchSelector?.value || '';

      if (!accountId || !repoFullName || !branchName) {
        BackupApp.utils.showToast('দয়া করে অ্যাকাউন্ট, রিপোজিটরি এবং ব্রাঞ্চ নির্বাচন করুন!', 'warning');
        return;
      }

      BackupApp.git.appendLog('Starting staging, committing and pushing changes...', 'info');
      BackupApp.elements.btnGitPush.disabled = true;
      if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = true;

      BackupApp.utils.showLoadingModal('গিটহাবে কোড পুশ করা হচ্ছে...', 'আপনার পরিবর্তনসমূহ গিটহাবে আপলোড হচ্ছে, অপেক্ষা করুন।');
      
      const progressSteps = [
        { percent: 15, text: 'গিট কনফিগারেশন যাচাই করা হচ্ছে...' },
        { percent: 35, text: 'ফাইলগুলো ইনডেক্স করা হচ্ছে (git add)...' },
        { percent: 55, text: 'পরিবর্তনসমূহ কমিট করা হচ্ছে (git commit)...' },
        { percent: 75, text: 'গিটহাবে রিমোট আপলোড করা হচ্ছে (git push)...' },
        { percent: 90, text: 'গিটহাব থেকে রেসপন্স যাচাই করা হচ্ছে...' }
      ];
      BackupApp.git.simulateProgress(progressSteps, 5000);

      const pushMode = document.querySelector('input[name="gitPushMode"]:checked')?.value || 'project';
      const forcePush = BackupApp.elements.gitForcePush?.checked || false;

      try {
        const response = await fetch('/api/github/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commitMessage, accountId, repoFullName, branchName, pushMode, forcePush })
        });
        const data = await response.json();
        
        if (BackupApp.git.progressInterval) clearInterval(BackupApp.git.progressInterval);
        BackupApp.utils.hideLoadingModal();
        
        if (data.logs) {
          data.logs.forEach(log => {
            if (log.toLowerCase().includes('failed') || log.toLowerCase().includes('error')) {
              BackupApp.git.appendLog(log, 'error');
            } else if (log.toLowerCase().includes('successfully') || log.toLowerCase().includes('succeeded')) {
              BackupApp.git.appendLog(log, 'success');
            } else {
              BackupApp.git.appendLog(log);
            }
          });
        }
        
        if (data.success) {
          BackupApp.utils.showToast('গিটহাবে সফলভাবে পুশ সম্পন্ন হয়েছে!', 'success');
          BackupApp.elements.gitCommitMessage.value = '';
        } else {
          BackupApp.utils.showToast('গিটহাব পুশ ব্যর্থ হয়েছে। লগ উইন্ডো চেক করুন।', 'error');
        }
      } catch (e) {
        if (BackupApp.git.progressInterval) clearInterval(BackupApp.git.progressInterval);
        BackupApp.utils.hideLoadingModal();
        BackupApp.git.appendLog(`Git push action failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`গিটহাব পুশ একশন ব্যর্থ: ${e.message}`, 'error');
      } finally {
        BackupApp.elements.btnGitPush.disabled = false;
        if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
        BackupApp.git.checkStatus();
      }
    });
  }

  if (BackupApp.elements.btnGitStatus) {
    BackupApp.elements.btnGitStatus.addEventListener('click', BackupApp.git.checkStatus);
  }
};

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
  if (!BackupApp.elements.gitSetupArea) return;
  BackupApp.elements.gitSetupArea.style.display = 'none';
  BackupApp.elements.gitInitWrapper.style.display = 'none';
  BackupApp.elements.gitRemoteWrapper.style.display = 'none';
  if (BackupApp.elements.btnGitPush) BackupApp.elements.btnGitPush.disabled = true;
  
  BackupApp.git.appendLog('Checking local Git status...', 'info');
  
  if (BackupApp.state.isServerless) {
    const gitConfig = JSON.parse(localStorage.getItem('mizentia_backup_git_config') || '{"remoteUrl":"","branch":"main"}');
    if (!gitConfig.remoteUrl) {
      BackupApp.git.appendLog('No remote GitHub repository URL configured.', 'error');
      BackupApp.elements.gitSetupArea.style.display = 'flex';
      BackupApp.elements.gitRemoteWrapper.style.display = 'flex';
      if (BackupApp.elements.sidebarGitInfo) {
        BackupApp.elements.sidebarGitInfo.style.display = 'none';
      }
      return;
    }

    if (BackupApp.elements.gitTerminalBranch) {
      BackupApp.elements.gitTerminalBranch.textContent = `Branch: ${gitConfig.branch || 'main'}`;
    }
    BackupApp.git.appendLog(`GitHub remote configured: ${gitConfig.remoteUrl}`, 'success');

    if (BackupApp.elements.btnGitPush) BackupApp.elements.btnGitPush.disabled = false;
    if (BackupApp.elements.gitRemoteUrlInput) BackupApp.elements.gitRemoteUrlInput.value = gitConfig.remoteUrl;

    if (BackupApp.elements.sidebarGitInfo) {
      BackupApp.elements.sidebarGitInfo.style.display = 'block';
    }
    if (BackupApp.elements.sidebarGitRepoText) {
      let repoLabel = gitConfig.remoteUrl;
      const match = gitConfig.remoteUrl.match(/github\.com[\/:][^\/]+\/[^\/]+(?:\.git)?/i);
      if (match) {
        repoLabel = match[0].replace('github.com/', '').replace('github.com:', '').replace('.git', '');
      }
      BackupApp.elements.sidebarGitRepoText.textContent = repoLabel;
    }
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
      BackupApp.elements.gitSetupArea.style.display = 'flex';
      BackupApp.elements.gitInitWrapper.style.display = 'flex';
      if (BackupApp.elements.sidebarGitInfo) {
        BackupApp.elements.sidebarGitInfo.style.display = 'none';
      }
      return;
    }
    
    if (BackupApp.elements.gitTerminalBranch) BackupApp.elements.gitTerminalBranch.textContent = `Branch: ${data.branch}`;
    BackupApp.git.appendLog(`Local repository is active on branch: ${data.branch}`, 'success');
    
    if (data.remoteUrl) {
      BackupApp.git.appendLog(`Remote repository configured: ${data.remoteUrl}`, 'info');
      if (BackupApp.elements.btnGitPush) BackupApp.elements.btnGitPush.disabled = false;
      if (BackupApp.elements.gitRemoteUrlInput) BackupApp.elements.gitRemoteUrlInput.value = data.remoteUrl;
      
      if (BackupApp.elements.sidebarGitInfo) {
        BackupApp.elements.sidebarGitInfo.style.display = 'block';
      }
      if (BackupApp.elements.sidebarGitRepoText) {
        let repoLabel = data.remoteUrl;
        const match = data.remoteUrl.match(/github\.com[\/:][^\/]+\/[^\/]+(?:\.git)?/i);
        if (match) {
          repoLabel = match[0].replace('github.com/', '').replace('github.com:', '').replace('.git', '');
        }
        BackupApp.elements.sidebarGitRepoText.textContent = repoLabel;
      }
    } else {
      BackupApp.git.appendLog('No remote GitHub repository URL configured.', 'error');
      BackupApp.elements.gitSetupArea.style.display = 'flex';
      BackupApp.elements.gitRemoteWrapper.style.display = 'flex';
      
      if (BackupApp.elements.sidebarGitInfo) {
        BackupApp.elements.sidebarGitInfo.style.display = 'none';
      }
    }
    
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

BackupApp.git.init = function() {
  if (BackupApp.elements.btnGitInit) {
    BackupApp.elements.btnGitInit.addEventListener('click', async () => {
      BackupApp.git.appendLog('Initializing Git repository...', 'info');
      try {
        const response = await fetch('/api/github/init', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
          BackupApp.git.appendLog(data.message, 'success');
          BackupApp.utils.showToast('গিট রিপোজিটরি সফলভাবে ইনিশিয়েলাইজ হয়েছে!', 'success');
          BackupApp.git.checkStatus();
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.git.appendLog(`Git initialization failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`গিট ইনিশিয়েলাইজ ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnGitSetRemote) {
    BackupApp.elements.btnGitSetRemote.addEventListener('click', async () => {
      const remoteUrl = BackupApp.elements.gitRemoteUrlInput.value.trim();
      if (!remoteUrl) {
        BackupApp.utils.showToast('গিটহাব রিপোজিটরি URL প্রবেশ করুন!', 'warning');
        return;
      }
      
      if (BackupApp.state.isServerless) {
        const gitConfig = {
          remoteUrl,
          branch: 'main'
        };
        localStorage.setItem('mizentia_backup_git_config', JSON.stringify(gitConfig));
        BackupApp.git.appendLog('GitHub remote configured locally in browser.', 'success');
        BackupApp.utils.showToast('রিমোট URL সফলভাবে কনফিগার করা হয়েছে!', 'success');
        BackupApp.git.checkStatus();
        return;
      }

      BackupApp.git.appendLog(`Configuring remote origin: ${remoteUrl}`, 'info');
      try {
        const response = await fetch('/api/github/remote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteUrl })
        });
        const data = await response.json();
        if (data.success) {
          BackupApp.git.appendLog(data.message, 'success');
          BackupApp.utils.showToast('রিমোট URL সফলভাবে কনফিগার করা হয়েছে!', 'success');
          BackupApp.git.checkStatus();
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        BackupApp.git.appendLog(`Failed to configure remote URL: ${e.message}`, 'error');
        BackupApp.utils.showToast(`রিমোট কনফিগারেশন ব্যর্থ হয়েছে: ${e.message}`, 'error');
      }
    });
  }

  if (BackupApp.elements.btnGitPush) {
    BackupApp.elements.btnGitPush.addEventListener('click', async () => {
      const commitMessage = BackupApp.elements.gitCommitMessage.value.trim();
      
      if (BackupApp.state.isServerless) {
        BackupApp.git.appendLog('Starting browser-based GitHub Contents push...', 'info');
        
        const gitConfig = JSON.parse(localStorage.getItem('mizentia_backup_git_config') || '{}');
        const pat = prompt("আপনার GitHub Personal Access Token (PAT) প্রবেশ করুন:");
        if (!pat) {
          BackupApp.git.appendLog('GitHub Access Token cannot be empty.', 'error');
          BackupApp.elements.btnGitPush.disabled = false;
          if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
          return;
        }

        if (!gitConfig.remoteUrl) {
          BackupApp.git.appendLog('Remote repository URL not configured.', 'error');
          BackupApp.elements.btnGitPush.disabled = false;
          if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
          return;
        }

        let repo = '';
        const match = gitConfig.remoteUrl.match(/github\.com[\/:][^\/]+\/[^\/]+(?:\.git)?/i);
        if (match) {
          repo = match[0].replace('github.com/', '').replace('github.com:', '').replace('.git', '');
        }

        if (!repo) {
          BackupApp.git.appendLog('Invalid GitHub remote URL.', 'error');
          BackupApp.elements.btnGitPush.disabled = false;
          if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
          return;
        }

        const branch = gitConfig.branch || 'main';

        try {
          if (!BackupApp.state.sourceDirHandle) {
            throw new Error('লোকাল প্রজেক্ট ফোল্ডার সিলেক্ট করা নেই! মেইন ড্যাশবোর্ড থেকে সিলেক্ট করুন।');
          }

          BackupApp.git.appendLog('Scanning local project workspace files...', 'info');
          const files = [];
          async function traverse(handle, relPath = '') {
            for await (const entry of handle.values()) {
              const entryPath = relPath ? `${relPath}/${entry.name}` : entry.name;
              if (entry.kind === 'file') {
                const file = await entry.getFile();
                files.push({ path: entryPath, handle: entry });
              } else if (entry.kind === 'folder') {
                await traverse(entry, entryPath);
              }
            }
          }
          await traverse(BackupApp.state.sourceDirHandle);
          BackupApp.git.appendLog(`Found ${files.length} files to commit/push.`, 'info');

          let successCount = 0;
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            BackupApp.git.appendLog(`Pushing file (${i + 1}/${files.length}): ${f.path}...`, 'info');

            const file = await f.handle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let j = 0; j < uint8.byteLength; j++) {
              binary += String.fromCharCode(uint8[j]);
            }
            const base64Content = window.btoa(binary);

            const url = `https://api.github.com/repos/${repo}/contents/${f.path}?ref=${branch}`;
            
            let sha = null;
            try {
              const checkRes = await fetch(url, {
                headers: { 'Authorization': `Bearer ${pat}` }
              });
              if (checkRes.ok) {
                const fileInfo = await checkRes.json();
                sha = fileInfo.sha;
              }
            } catch (err) {}

            const payload = {
              message: commitMessage || `Auto-commit via browser engine`,
              content: base64Content,
              branch: branch
            };
            if (sha) payload.sha = sha;

            const uploadRes = await fetch(url, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${pat}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
              },
              body: JSON.stringify(payload)
            });

            if (uploadRes.ok) {
              successCount++;
              BackupApp.git.appendLog(`File pushed: ${f.path}`, 'success');
            } else {
              const err = await uploadRes.json();
              BackupApp.git.appendLog(`Failed to push ${f.path}: ${err.message}`, 'error');
            }
          }

          BackupApp.git.appendLog(`Push completed successfully: ${successCount}/${files.length} files updated.`, 'success');
          BackupApp.utils.showToast('গিটহাবে সফলভাবে পুশ সম্পন্ন হয়েছে!', 'success');
        } catch (e) {
          BackupApp.git.appendLog(`Git push action failed: ${e.message}`, 'error');
          BackupApp.utils.showToast(`গিটহাব পুশ একশন ব্যর্থ: ${e.message}`, 'error');
        } finally {
          if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
          BackupApp.git.checkStatus();
        }
        return;
      }

      BackupApp.git.appendLog('Starting staging, committing and pushing changes...', 'info');
      BackupApp.elements.btnGitPush.disabled = true;
      if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = true;
      
      try {
        const response = await fetch('/api/github/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commitMessage })
        });
        const data = await response.json();
        
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
        BackupApp.git.appendLog(`Git push action failed: ${e.message}`, 'error');
        BackupApp.utils.showToast(`গিটহাব পুশ একশন ব্যর্থ: ${e.message}`, 'error');
      } finally {
        if (BackupApp.elements.btnGitStatus) BackupApp.elements.btnGitStatus.disabled = false;
        BackupApp.git.checkStatus();
      }
    });
  }

  if (BackupApp.elements.btnGitStatus) {
    BackupApp.elements.btnGitStatus.addEventListener('click', BackupApp.git.checkStatus);
  }
};

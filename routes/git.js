const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const https = require('https');
const { BACKUP_SYSTEM_DIR, loadConfig, saveConfig, getIgnoreFilePath } = require('../lib/config');

function runGitCommand(args, cwd) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never'
    };
    execFile('git', args, { cwd, env }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        code: error ? error.code : 0,
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : ''
      });
    });
  });
}

function githubApiRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Mizentia-Local-Backup-System',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Get saved accounts list
router.get('/accounts', (req, res) => {
  try {
    const config = loadConfig();
    const accounts = (config.githubAccounts || []).map(acc => ({
      id: acc.id,
      label: acc.label,
      username: acc.username,
      avatarUrl: acc.avatarUrl
    }));
    res.json({
      success: true,
      accounts,
      selectedAccountId: config.selectedGithubAccountId || '',
      selectedRepo: config.selectedGithubRepo || '',
      selectedBranch: config.selectedGithubBranch || ''
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add new account via PAT
router.post('/accounts', async (req, res) => {
  const { token, label } = req.body;
  if (!token || !label) {
    return res.status(400).json({ success: false, error: 'Token and label are required.' });
  }

  try {
    const userProfile = await githubApiRequest('GET', '/user', token);
    const config = loadConfig();
    config.githubAccounts = config.githubAccounts || [];

    const newAccount = {
      id: 'github-acc-' + Date.now(),
      label: label,
      token: token,
      username: userProfile.login,
      avatarUrl: userProfile.avatar_url
    };

    config.githubAccounts.push(newAccount);
    if (!config.selectedGithubAccountId) {
      config.selectedGithubAccountId = newAccount.id;
    }
    saveConfig(config);

    res.json({
      success: true,
      account: {
        id: newAccount.id,
        label: newAccount.label,
        username: newAccount.username,
        avatarUrl: newAccount.avatarUrl
      }
    });
  } catch (e) {
    console.error('Error adding GitHub account:', e);
    res.status(400).json({ success: false, error: 'টোকেনটি অবৈধ বা গিটহাব এপিআই রিকোয়েস্ট ব্যর্থ হয়েছে।' });
  }
});

// Delete a saved account
router.delete('/accounts/:id', (req, res) => {
  const { id } = req.params;
  try {
    const config = loadConfig();
    config.githubAccounts = config.githubAccounts || [];
    config.githubAccounts = config.githubAccounts.filter(acc => acc.id !== id);
    
    if (config.selectedGithubAccountId === id) {
      config.selectedGithubAccountId = config.githubAccounts.length > 0 ? config.githubAccounts[0].id : '';
      config.selectedGithubRepo = '';
      config.selectedGithubBranch = '';
    }
    saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Save selected settings config
router.post('/config', (req, res) => {
  const { accountId, repo, branch } = req.body;
  try {
    const config = loadConfig();
    config.selectedGithubAccountId = accountId;
    config.selectedGithubRepo = repo;
    config.selectedGithubBranch = branch;
    saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// List repos for an account
router.get('/repos', async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Account ID is required.' });
  }

  try {
    const config = loadConfig();
    const account = (config.githubAccounts || []).find(acc => acc.id === accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    const repos = await githubApiRequest('GET', '/user/repos?per_page=100&type=owner', account.token);
    const repoList = repos.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch
    }));

    res.json({ success: true, repos: repoList });
  } catch (e) {
    console.error('Error fetching repos:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// List branches for a repo
router.get('/branches', async (req, res) => {
  const { accountId, repoName } = req.query;
  if (!accountId || !repoName) {
    return res.status(400).json({ success: false, error: 'Account ID and repoName are required.' });
  }

  try {
    const config = loadConfig();
    const account = (config.githubAccounts || []).find(acc => acc.id === accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    const branches = await githubApiRequest('GET', `/repos/${repoName}/branches?per_page=100`, account.token);
    const branchList = branches.map(br => br.name);

    res.json({ success: true, branches: branchList });
  } catch (e) {
    console.error('Error fetching branches:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Git Status Check
router.get('/status', async (req, res) => {
  const cwd = BACKUP_SYSTEM_DIR;
  try {
    const gitInstalled = await runGitCommand(['--version'], cwd);
    if (!gitInstalled.success) {
      return res.json({
        success: false,
        reason: 'git_not_installed',
        message: 'পিসিতে Git ইনস্টল করা নেই। অনুগ্রহ করে Git ইনস্টল করুন।'
      });
    }

    const isRepo = fs.existsSync(path.join(cwd, '.git'));
    if (!isRepo) {
      return res.json({
        success: true,
        isRepo: false,
        message: 'এই ফোল্ডারে গিট রিপোজিটরি ইনিশিয়েলাইজ করা নেই।'
      });
    }

    const branchRes = await runGitCommand(['branch', '--show-current'], cwd);
    const branchName = branchRes.stdout || 'main';

    const remoteRes = await runGitCommand(['remote', '-v'], cwd);
    let remoteUrl = '';
    if (remoteRes.success && remoteRes.stdout) {
      const match = remoteRes.stdout.match(/origin\s+(.+)\s+\(push\)/);
      if (match) remoteUrl = match[1];
    }

    const statusRes = await runGitCommand(['status', '--short'], cwd);
    const changes = statusRes.stdout ? statusRes.stdout.split('\n') : [];

    res.json({
      success: true,
      isRepo: true,
      branch: branchName,
      remoteUrl,
      changes,
      message: 'গিট রিপোজিটরি সচল আছে।'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Initialize Git Repository
router.post('/init', async (req, res) => {
  const cwd = BACKUP_SYSTEM_DIR;
  try {
    const gitignorePath = path.join(cwd, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const gitignoreContent = [
        'node_modules/',
        'config.json',
        'state.json',
        '.tmp.driveupload/',
        '.tmp.drivedownload/',
        'Thumbs.db',
        '.DS_Store'
      ].join('\n');
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
    }

    const initRes = await runGitCommand(['init'], cwd);
    if (!initRes.success) {
      return res.status(500).json({ success: false, error: initRes.stderr || 'Git init failed.' });
    }

    await runGitCommand(['branch', '-M', 'main'], cwd);

    res.json({ success: true, message: 'সফলভাবে গিট রিপোজিটরি ইনিশিয়েলাইজ করা হয়েছে!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Set GitHub Remote URL
router.post('/remote', async (req, res) => {
  const { remoteUrl } = req.body;
  const cwd = BACKUP_SYSTEM_DIR;
  if (!remoteUrl) {
    return res.status(400).json({ success: false, error: 'Remote URL is required' });
  }

  try {
    const checkRemote = await runGitCommand(['remote', 'get-url', 'origin'], cwd);
    let remoteRes;
    if (checkRemote.success) {
      remoteRes = await runGitCommand(['remote', 'set-url', 'origin', remoteUrl], cwd);
    } else {
      remoteRes = await runGitCommand(['remote', 'add', 'origin', remoteUrl], cwd);
    }

    if (!remoteRes.success) {
      return res.status(500).json({ success: false, error: remoteRes.stderr || 'Failed to configure remote URL.' });
    }

    res.json({ success: true, message: 'সফলভাবে গিট রিমোট রিপোজিটরি সেট করা হয়েছে!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Commit and Push to GitHub using Token Auth
router.post('/push', async (req, res) => {
  const { commitMessage, accountId, repoFullName, branchName, pushMode, forcePush } = req.body;
  const cwd = BACKUP_SYSTEM_DIR;
  const message = commitMessage || `Auto-update: ${new Date().toLocaleString()}`;

  try {
    const logs = [];
    const config = loadConfig();
    
    let activeToken = null;
    let repoUrl = null;

    if (accountId && repoFullName) {
      const account = (config.githubAccounts || []).find(acc => acc.id === accountId);
      if (account) {
        activeToken = account.token;
        repoUrl = `https://${account.token}@github.com/${repoFullName}.git`;
        logs.push(`Configuring push for repository: ${repoFullName} (Account: ${account.username})`);
      }
    }

    let oldRemoteUrl = null;
    if (repoUrl) {
      const checkRemote = await runGitCommand(['remote', 'get-url', 'origin'], cwd);
      if (checkRemote.success) {
        oldRemoteUrl = checkRemote.stdout;
        await runGitCommand(['remote', 'set-url', 'origin', repoUrl], cwd);
      } else {
        await runGitCommand(['remote', 'add', 'origin', repoUrl], cwd);
      }
    }

    // Configure .gitignore based on selected pushMode
    const mode = pushMode || 'project';
    const gitignorePath = path.join(cwd, '.gitignore');
    if (mode === 'project') {
      const gitIgnoreRules = config.githubIgnoreRules || '';
      fs.writeFileSync(gitignorePath, gitIgnoreRules, 'utf8');
      logs.push(`Applied GitHub Project Mode ignore rules (.gitignore).`);
    } else {
      const backupIgnorePath = getIgnoreFilePath();
      let storageRules = '';
      if (fs.existsSync(backupIgnorePath)) {
        storageRules = fs.readFileSync(backupIgnorePath, 'utf8');
      } else {
        storageRules = 'node_modules/\nconfig.json\nstate.json\n.tmp.driveupload/\n.tmp.drivedownload/\nThumbs.db\n.DS_Store';
      }
      fs.writeFileSync(gitignorePath, storageRules, 'utf8');
      logs.push(`Applied System Storage Mode ignore rules (copied from .backupignore to .gitignore).`);
    }

    logs.push('> git add .');
    const addRes = await runGitCommand(['add', '.'], cwd);
    if (!addRes.success) {
      logs.push(`Error staging files: ${addRes.stderr}`);
      if (oldRemoteUrl) await runGitCommand(['remote', 'set-url', 'origin', oldRemoteUrl], cwd);
      return res.json({ success: false, logs });
    }
    logs.push('Staged all changes successfully.');

    logs.push(`> git commit -m "${message}"`);
    const commitRes = await runGitCommand(['commit', '-m', message], cwd);
    if (!commitRes.success) {
      if (commitRes.stdout.includes('nothing to commit') || commitRes.stderr.includes('nothing to commit') || commitRes.stdout.includes('clean') || commitRes.stderr.includes('clean')) {
        logs.push('Nothing to commit, working tree clean.');
      } else {
        logs.push(`Error committing files: ${commitRes.stderr || commitRes.stdout}`);
        if (oldRemoteUrl) await runGitCommand(['remote', 'set-url', 'origin', oldRemoteUrl], cwd);
        return res.json({ success: false, logs });
      }
    } else {
      logs.push(commitRes.stdout);
    }

    let targetBranch = branchName;
    if (!targetBranch) {
      const branchRes = await runGitCommand(['branch', '--show-current'], cwd);
      targetBranch = branchRes.stdout || 'main';
    }

    const currentBranchRes = await runGitCommand(['branch', '--show-current'], cwd);
    const currentLocalBranch = currentBranchRes.stdout || 'main';

    const pushArgs = forcePush ? 
      ['push', '-f', 'origin', `${currentLocalBranch}:${targetBranch}`] : 
      ['push', 'origin', `${currentLocalBranch}:${targetBranch}`];

    logs.push(`> git push ${forcePush ? '-f ' : ''}origin ${currentLocalBranch}:${targetBranch}`);
    const pushRes = await runGitCommand(pushArgs, cwd);
    
    if (pushRes.stdout) logs.push(pushRes.stdout);
    if (pushRes.stderr) {
      let filteredStderr = pushRes.stderr;
      if (activeToken) {
        filteredStderr = filteredStderr.replace(new RegExp(activeToken, 'g'), '****');
      }
      logs.push(filteredStderr);
    }

    if (repoUrl && repoFullName) {
      const cleanRemoteUrl = `https://github.com/${repoFullName}.git`;
      await runGitCommand(['remote', 'set-url', 'origin', cleanRemoteUrl], cwd);
    } else if (oldRemoteUrl) {
      await runGitCommand(['remote', 'set-url', 'origin', oldRemoteUrl], cwd);
    }

    if (!pushRes.success) {
      logs.push(`Push failed with exit code: ${pushRes.code}`);
      return res.json({ success: false, logs });
    }

    logs.push(`Push to GitHub completed successfully! (Target: ${repoFullName || 'origin'} / ${targetBranch})`);
    res.json({ success: true, logs });

  } catch (e) {
    console.error('Git push error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get GitHub gitignore rules
router.get('/gitignore', (req, res) => {
  try {
    const config = loadConfig();
    const rules = config.githubIgnoreRules || '';
    res.json({ success: true, rules });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Save GitHub gitignore rules
router.post('/gitignore', (req, res) => {
  const { rules } = req.body;
  try {
    const config = loadConfig();
    config.githubIgnoreRules = rules;
    saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

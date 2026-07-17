const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { BACKUP_SYSTEM_DIR } = require('../lib/config');

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

// Commit and Push to GitHub
router.post('/push', async (req, res) => {
  const { commitMessage } = req.body;
  const cwd = BACKUP_SYSTEM_DIR;
  const message = commitMessage || `Auto-update: ${new Date().toLocaleString()}`;

  try {
    const logs = [];

    logs.push('> git add .');
    const addRes = await runGitCommand(['add', '.'], cwd);
    if (!addRes.success) {
      logs.push(`Error staging files: ${addRes.stderr}`);
      return res.json({ success: false, logs });
    }
    logs.push('Staged all changes successfully.');

    logs.push(`> git commit -m "${message}"`);
    const commitRes = await runGitCommand(['commit', '-m', message], cwd);
    if (!commitRes.success) {
      if (commitRes.stdout.includes('nothing to commit') || commitRes.stderr.includes('nothing to commit')) {
        logs.push('Nothing to commit, working tree clean.');
      } else {
        logs.push(`Error committing files: ${commitRes.stderr || commitRes.stdout}`);
        return res.json({ success: false, logs });
      }
    } else {
      logs.push(commitRes.stdout);
    }

    const branchRes = await runGitCommand(['branch', '--show-current'], cwd);
    const branchName = branchRes.stdout || 'main';

    logs.push(`> git push origin ${branchName}`);
    const pushRes = await runGitCommand(['push', 'origin', branchName], cwd);
    
    if (pushRes.stdout) logs.push(pushRes.stdout);
    if (pushRes.stderr) logs.push(pushRes.stderr);

    if (!pushRes.success) {
      logs.push(`Push failed with exit code: ${pushRes.code}`);
      return res.json({ success: false, logs });
    }

    logs.push('Push to GitHub completed successfully!');
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { 
  getWorkspaceRoot, 
  loadConfig, 
  saveConfig, 
  loadState, 
  getIgnoreFilePath, 
  BACKUP_SYSTEM_DIR 
} = require('../lib/config');
const { getDriveClient } = require('../lib/driveManager');

// Get current system and Drive status
router.get('/status', (req, res) => {
  const config = loadConfig();
  const state = loadState();
  
  let isConnected = false;
  let accountEmail = '';
  
  if (config.connectionType === 'simulation') {
    isConnected = true;
    accountEmail = 'Simulation Mode (Local Cache)';
  } else if (config.connectionType === 'local_drive' && config.localDrivePath) {
    isConnected = fs.existsSync(config.localDrivePath);
    accountEmail = `Google Drive Desktop (${config.localDrivePath})`;
  } else if (config.connectionType === 'service_account' && config.serviceAccount) {
    try {
      const creds = typeof config.serviceAccount === 'string' ? JSON.parse(config.serviceAccount) : config.serviceAccount;
      isConnected = true;
      accountEmail = creds.client_email || 'Service Account';
    } catch (e) {
      isConnected = false;
    }
  } else if (config.connectionType === 'oauth2' && config.oauth2 && config.oauth2.tokens) {
    isConnected = true;
    accountEmail = 'OAuth2 Authenticated User';
  }

  res.json({
    connectionType: config.connectionType,
    isConnected,
    accountEmail,
    driveFolderId: config.driveFolderId,
    localDrivePath: config.localDrivePath || '',
    localWorkspaceRoot: config.localWorkspaceRoot || '',
    defaultWorkspaceRoot: path.resolve(BACKUP_SYSTEM_DIR, '..'),
    workspaceName: path.basename(getWorkspaceRoot()),
    lastBackupTime: state.lastBackupTime,
    fileCount: Object.keys(state.files || {}).length,
    folderCount: Object.keys(state.folders || {}).length,
    files: state.files || {}
  });
});

// List workspace files/folders dynamically with ignore checking and safety checks
router.get('/workspace/list', async (req, res) => {
  const relativeSubpath = req.query.path || '';
  try {
    const targetDir = path.resolve(getWorkspaceRoot(), relativeSubpath);
    
    // Security check: path must be inside WORKSPACE_ROOT (case-insensitive on Windows)
    const root = getWorkspaceRoot();
    const isSafe = process.platform === 'win32'
      ? (targetDir.toLowerCase() === root.toLowerCase() || targetDir.toLowerCase().startsWith(root.toLowerCase() + path.sep))
      : (targetDir === root || targetDir.startsWith(root + path.sep));
      
    if (!isSafe) {
      return res.status(403).json({ success: false, error: 'অ্যাক্সেস প্রত্যাখ্যান করা হয়েছে: আপনি প্রজেক্ট ডিরেক্টরির বাইরে যেতে পারবেন না।' });
    }

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ success: false, error: 'ফোল্ডারটি পাওয়া যায়নি।' });
    }

    const stat = await fs.promises.stat(targetDir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'অনুরোধকৃত পথটি ফোল্ডার নয়।' });
    }

    const items = await fs.promises.readdir(targetDir, { withFileTypes: true });
    // Dynamically loading ignore filter from config to prevent circular dependencies
    const { getIgnoreFilter } = require('../lib/config');
    const ig = getIgnoreFilter();

    const resultItems = [];
    for (const item of items) {
      const fullPath = path.join(targetDir, item.name);
      const relPath = path.relative(getWorkspaceRoot(), fullPath).replace(/\\/g, '/');
      const isIgnored = ig.ignores(relPath) || ig.ignores(relPath + '/');

      resultItems.push({
        name: item.name,
        relativePath: relPath,
        type: item.isDirectory() ? 'folder' : 'file',
        isIgnored
      });
    }

    resultItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      path: relativeSubpath,
      items: resultItems
    });

  } catch (e) {
    console.error('Workspace list error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get Ignore Rules
router.get('/ignore', (req, res) => {
  const ignorePath = getIgnoreFilePath();
  if (fs.existsSync(ignorePath)) {
    const content = fs.readFileSync(ignorePath, 'utf8');
    res.json({ success: true, content });
  } else {
    res.json({ success: true, content: '' });
  }
});

// Update Ignore Rules
router.post('/ignore', (req, res) => {
  const { content } = req.body;
  try {
    const ignorePath = getIgnoreFilePath();
    fs.writeFileSync(ignorePath, content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update Settings / Config
router.post('/config', (req, res) => {
  const newConfig = req.body;
  try {
    const currentConfig = loadConfig();
    
    if (newConfig.localWorkspaceRoot) {
      const newRoot = path.resolve(newConfig.localWorkspaceRoot);
      if (!fs.existsSync(newRoot)) {
        return res.status(400).json({ success: false, error: `নতুন প্রজেক্ট ডিরেক্টরি পাথটি পাওয়া যায়নি: "${newRoot}"` });
      }
    }

    const updatedConfig = {
      ...currentConfig,
      ...newConfig
    };
    saveConfig(updatedConfig);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Verify Google Drive connection with supplied config
router.post('/config/test', async (req, res) => {
  const testConfig = req.body;
  try {
    if (testConfig.connectionType === 'simulation') {
      return res.json({ success: true, message: 'Simulation mode is always active and doesn\'t require Google account verification.' });
    }

    if (testConfig.connectionType === 'local_drive') {
      if (!testConfig.localDrivePath) {
        throw new Error('লোকাল ড্রাইভ পাথ খালি হতে পারে না।');
      }
      if (!fs.existsSync(testConfig.localDrivePath)) {
        throw new Error(`পাথটি পাওয়া যায়নি: "${testConfig.localDrivePath}"। অনুগ্রহ করে নিশ্চিত করুন যে গুগল ড্রাইভ ডেস্কটপ অ্যাপ চালু আছে এবং এই ড্রাইভ বা ফোল্ডারটি মাউন্ট করা আছে।`);
      }
      const folderName = path.basename(getWorkspaceRoot());
      const backupRoot = path.join(testConfig.localDrivePath, folderName);
      if (!fs.existsSync(backupRoot)) {
        console.log(`Creating backup root folder: ${backupRoot}`);
        fs.mkdirSync(backupRoot, { recursive: true });
      }
      return res.json({
        success: true,
        message: `সফলভাবে ড্রাইভ পাথের সাথে সংযুক্ত হয়েছে! ব্যাকআপ রুট ফোল্ডার: "${backupRoot}"`
      });
    }

    const drive = getDriveClient(testConfig);
    const folderId = testConfig.driveFolderId || 'root';
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType'
    });

    res.json({
      success: true,
      message: `Successfully connected to Google Drive! Target folder: "${response.data.name}"`
    });

  } catch (e) {
    console.error('Connection test failed:', e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// Google Drive OAuth2 callback handlers
router.get('/gdrive/auth-url', (req, res) => {
  const config = loadConfig();
  if (config.connectionType !== 'oauth2' || !config.oauth2.client_id || !config.oauth2.client_secret) {
    return res.status(400).json({ success: false, error: 'OAuth2 Client ID and Client Secret are not configured in settings.' });
  }

  const oauth2Client = new google.auth.OAuth2(
    config.oauth2.client_id,
    config.oauth2.client_secret,
    config.oauth2.redirect_uri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent'
  });

  res.json({ success: true, url: authUrl });
});

// Handle OAuth Redirect
router.get('/gdrive/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.send('Authentication code is missing in callback. Please try again.');
  }

  try {
    const config = loadConfig();
    const oauth2Client = new google.auth.OAuth2(
      config.oauth2.client_id,
      config.oauth2.client_secret,
      config.oauth2.redirect_uri
    );

    const { tokens } = await oauth2Client.getToken(code);
    config.oauth2.tokens = tokens;
    saveConfig(config);

    res.send(`
      <html>
        <head>
          <title>Mizentia Backup - Connected</title>
          <style>
            body { font-family: sans-serif; background: #0b0c10; color: #c5c6c7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1f2833; border-radius: 12px; padding: 30px; text-align: center; max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
            h2 { color: #66fcf1; margin-top: 0; }
            button { background: #66fcf1; border: none; padding: 10px 20px; border-radius: 4px; color: #0b0c10; font-weight: bold; cursor: pointer; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google Drive Connected!</h2>
            <p>Authentication was successful. You can close this window now and return to the backup dashboard.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);

  } catch (e) {
    console.error('Error exchanging code for tokens:', e);
    res.status(500).send(`Authentication failed: ${e.message}`);
  }
});

module.exports = router;

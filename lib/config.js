const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ignore = require('ignore');

const BACKUP_SYSTEM_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(BACKUP_SYSTEM_DIR, 'config.json');
const STATE_FILE = path.join(BACKUP_SYSTEM_DIR, 'state.json');

function getWorkspaceRoot() {
  const config = loadConfig();
  if (config.localWorkspaceRoot) {
    return path.resolve(config.localWorkspaceRoot);
  }
  return path.resolve(BACKUP_SYSTEM_DIR, '..');
}

function getIgnoreFilePath() {
  return path.join(BACKUP_SYSTEM_DIR, '.backupignore');
}

function getUploadTempDir() {
  const dir = path.join(getWorkspaceRoot(), '.tmp.driveupload');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDownloadTempDir() {
  const dir = path.join(getWorkspaceRoot(), '.tmp.drivedownload');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Load Configuration
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return {
        connectionType: 'simulation',
        driveFolderId: '',
        localDrivePath: '',
        serviceAccount: null,
        oauth2: {
          client_id: '',
          client_secret: '',
          redirect_uri: 'http://localhost:3000/api/gdrive/callback',
          tokens: null
        },
        ...config
      };
    } catch (e) {
      console.error('Error parsing config file:', e);
    }
  }
  return {
    connectionType: 'simulation',
    driveFolderId: '',
    localDrivePath: '',
    serviceAccount: null,
    oauth2: {
      client_id: '',
      client_secret: '',
      redirect_uri: 'http://localhost:3000/api/gdrive/callback',
      tokens: null
    }
  };
}

// Get local backup root path when local_drive type is used
function getLocalDriveBackupRoot(config) {
  if (config.connectionType !== 'local_drive' || !config.localDrivePath) {
    return null;
  }
  const folderName = path.basename(getWorkspaceRoot());
  return path.join(config.localDrivePath, folderName);
}

// Save Configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Load Backup State (Local index of backed up files)
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      console.error('Error parsing state file:', e);
    }
  }
  return {
    lastBackupTime: null,
    files: {},
    folders: {}
  };
}

// Save Backup State
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Calculate SHA-256 content hash of a file
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

// Get ignore filter based on .backupignore
function getIgnoreFilter() {
  const ig = ignore();
  
  // ALWAYS ignore backup system internal folders to prevent recursive loops
  ig.add([
    '**/Mizentia_Local_Backup/state.json',
    '**/Mizentia_Local_Backup/config.json',
    '**/Mizentia_Local_Backup/node_modules/',
    '.tmp.drivedownload/',
    '.tmp.driveupload/',
    '**/.tmp.drivedownload/',
    '**/.tmp.driveupload/',
    '**/.git/',
    '**/.next/',
    '**/dist/',
    '**/build/',
    'Thumbs.db',
    '.DS_Store'
  ]);

  const ignorePath = getIgnoreFilePath();
  if (fs.existsSync(ignorePath)) {
    const content = fs.readFileSync(ignorePath, 'utf8');
    ig.add(content);
  }
  
  return ig;
}

module.exports = {
  BACKUP_SYSTEM_DIR,
  CONFIG_FILE,
  STATE_FILE,
  getWorkspaceRoot,
  getIgnoreFilePath,
  getUploadTempDir,
  getDownloadTempDir,
  loadConfig,
  saveConfig,
  loadState,
  saveState,
  getFileHash,
  getIgnoreFilter,
  getLocalDriveBackupRoot
};

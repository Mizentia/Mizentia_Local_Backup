const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Import routers
const scanRouter = require('./routes/scan');
const backupRouter = require('./routes/backup');
const restoreRouter = require('./routes/restore');
const gitRouter = require('./routes/git');
const settingsRouter = require('./routes/settings');

// Mount routes
app.use('/api/scan', scanRouter);
app.use('/api/backup', backupRouter);
app.use('/api/restore', restoreRouter);
app.use('/api/github', gitRouter);
app.use('/api', settingsRouter); // mounts /api/status, /api/config, /api/config/test, /api/gdrive/*, /api/ignore, /api/workspace/list

app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(` Mizentia Local Backup Server running on port ${PORT}`);
  console.log(` Access dashboard at: http://localhost:${PORT}`);
  console.log(`================================================`);
});

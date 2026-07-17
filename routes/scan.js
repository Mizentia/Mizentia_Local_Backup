const express = require('express');
const router = express.Router();
const { getWorkspaceRoot, loadConfig, loadState, getIgnoreFilter } = require('../lib/config');
const { compareWorkspace } = require('../lib/scanner');

// Scan workspace with real-time Server-Sent Events progress streaming
router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  try {
    const config = loadConfig();
    const state = loadState();
    const ig = getIgnoreFilter();

    let scannedCount = 0;
    let lastProgressTime = Date.now();

    const reportProgress = (currentPath) => {
      scannedCount++;
      const now = Date.now();
      if (now - lastProgressTime > 150) {
        lastProgressTime = now;
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          scannedCount,
          currentPath
        })}\n\n`);
      }
    };

    console.log('Streaming directories scan under:', getWorkspaceRoot());
    const results = await compareWorkspace(getWorkspaceRoot(), state, ig, reportProgress);

    clearInterval(keepAlive);
    res.write(`data: ${JSON.stringify({ type: 'complete', results })}\n\n`);
    res.end();

  } catch (e) {
    console.error('SSE Scan failed:', e);
    clearInterval(keepAlive);
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

// Scan the workspace to identify changes
router.get('/', async (req, res) => {
  try {
    const config = loadConfig();
    const state = loadState();
    const ig = getIgnoreFilter();

    console.log('Scanning directories under:', getWorkspaceRoot());
    const results = await compareWorkspace(getWorkspaceRoot(), state, ig);
    res.json(results);

  } catch (e) {
    console.error('Scan failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

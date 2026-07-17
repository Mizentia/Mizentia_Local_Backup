const { spawn, exec } = require('child_process');
const os = require('os');
const path = require('path');

// Detect local IPv4 address
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

const localIP = getLocalIP();

console.log('Resolving Local Network IP configuration...');
console.log(`Resolved IP: ${localIP}`);

// Spawn the node server.js process
const serverProcess = spawn('node', ['server.js'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
  cwd: __dirname
});

// Helper function to rewrite output
const rewriteOutput = (data) => {
  let outputStr = data.toString();
  // Replace instances of localhost:3000 or 127.0.0.1:3000 with the resolved local IP
  outputStr = outputStr.replace(/localhost:3000/g, `${localIP}:3000`);
  return outputStr;
};

// Stream filtered stdout
serverProcess.stdout.on('data', (data) => {
  process.stdout.write(rewriteOutput(data));
});

// Stream filtered stderr
serverProcess.stderr.on('data', (data) => {
  process.stderr.write(rewriteOutput(data));
});

serverProcess.on('close', (code) => {
  process.exit(code);
});

// Auto-open browser with resolved local network IP address
if (process.platform === 'win32') {
  setTimeout(() => {
    exec(`start http://${localIP}:3000`);
  }, 1200);
}

// 轮询本机服务端口,直到 HTTP 200 才打开浏览器。
// 用法: node server/wait-and-open.js [port] [timeoutMs]
const http = require('http');
const { exec } = require('child_process');

const port = Number(process.argv[2] || process.env.PORT || 3000);
const timeoutMs = Number(process.argv[3] || 30000);
const url = `http://localhost:${port}/`;
const start = Date.now();

function ping() {
  const req = http.get(url, { timeout: 1500 }, (res) => {
    res.resume();
    if (res.statusCode && res.statusCode < 500) return open();
    retry();
  });
  req.on('error', retry);
  req.on('timeout', () => { req.destroy(); retry(); });
}

function retry() {
  if (Date.now() - start > timeoutMs) {
    console.error(`[wait-and-open] ${timeoutMs}ms 内未就绪，放弃打开浏览器`);
    process.exit(1);
  }
  setTimeout(ping, 500);
}

function open() {
  // Windows: start "" "url"
  exec(`start "" "${url}"`, { windowsHide: true }, () => process.exit(0));
}

ping();

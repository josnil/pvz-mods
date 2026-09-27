/* ═══════════════════════════════════════════════════════════════
   _drive_verify.js — 起静态服务 + 跑真机验证（同一进程，避免
   http.server 不跨 Bash 调用存活的坑）

   用法：
     node _drive_verify.js _verify_interaction.js
     node _drive_verify.js _verify_cloud.js
   ═══════════════════════════════════════════════════════════════ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NODE = process.execPath;
const target = process.argv[2] || '_verify_interaction.js';
const PORT = Number(process.env.PORT || 8791);

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 ' + p);
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(f).pipe(res);
});

srv.listen(PORT, '127.0.0.1', () => {
  const env = Object.assign({}, process.env, {
    BASE: 'http://127.0.0.1:' + PORT,
    SHOT: path.join(ROOT, '_shots'),
  });
  // ⚠️ 用 spawn(stdio:'inherit') 而不是 execFileSync：
  //    本机 execFileSync 跑 "node <脚本文件>" 会静默失败（rc=1、零输出），
  //    与已知的 "node <file> → 127" 同族。spawn + inherit 能拿到真实输出与退出码。
  const child = spawn(NODE, [path.join(ROOT, target)], {
    cwd: ROOT, env, stdio: 'inherit',
  });
  child.on('exit', (code, sig) => {
    srv.close();
    if (sig) console.error('child killed by signal ' + sig);
    process.exitCode = code === null ? 1 : code;
  });
  child.on('error', (e) => {
    console.error('spawn error: ' + e.message);
    srv.close();
    process.exitCode = 1;
  });
});

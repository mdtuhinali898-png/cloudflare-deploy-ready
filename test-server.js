const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const dir = 'd:/Sms new/frontend/ucc/';
const mimes = {
  'html': 'text/html',
  'css': 'text/css',
  'js': 'application/javascript',
  'json': 'application/json',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'ico': 'image/x-icon',
  'svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  let fpath;
  if (parsed.pathname === '/') {
    fpath = path.join(dir, 'index.html');
  } else {
    fpath = path.join(dir, parsed.pathname.replace(/^\//, ''));
  }
  const ext = path.extname(fpath).substring(1) || 'html';
  if (fs.existsSync(fpath) && fs.statSync(fpath).isFile()) {
    res.setHeader('Content-Type', (mimes[ext] || 'text/plain') + ';charset=UTF-8');
    fs.createReadStream(fpath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found: ' + parsed.pathname);
  }
});

server.listen(8088, '127.0.0.1', () => console.log('Server running at http://127.0.0.1:8088/'));

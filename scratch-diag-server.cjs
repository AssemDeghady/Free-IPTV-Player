const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('[TV-DIAG]', JSON.stringify(data, null, 2));
        fs.appendFileSync('tv-diag.log', new Date().toISOString() + ' ' + body + '\n');
      } catch (e) {
        console.log('[TV-RAW]', body);
        fs.appendFileSync('tv-diag.log', new Date().toISOString() + ' ' + body + '\n');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (req.method === 'GET') {
    if (req.url.startsWith('/ping') || req.url.includes('?')) {
      const idx = req.url.indexOf('?');
      const query = idx !== -1 ? req.url.substring(idx + 1) : '';
      const params = new URLSearchParams(query);
      const rawData = params.get('d') || query;
      console.log('[TV-GET-BEACON]', rawData);
      fs.appendFileSync('tv-diag.log', new Date().toISOString() + ' GET ' + rawData + '\n');
    }
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    // 1x1 transparent gif
    res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    return;
  }
});

server.listen(8888, '0.0.0.0', () => {
  console.log('Diagnostic telemetry server listening on 0.0.0.0:8888');
});

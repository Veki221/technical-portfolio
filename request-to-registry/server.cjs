const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const assets = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/form.js': ['form.js', 'text/javascript'],
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readApplication(request) {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    if (body.length <= 4096) body += chunk;
  }
  if (body.length > 4096) return null;

  try {
    const { name, topic, loseConfirmation } = JSON.parse(body) ?? {};
    if (typeof name !== 'string' || typeof topic !== 'string') return null;
    const application = { name: name.trim(), topic: topic.trim() };
    if (!application.name || application.name.length > 80 || !application.topic || application.topic.length > 160) return null;
    return { application, loseConfirmation: loseConfirmation === true };
  } catch {
    return null;
  }
}

function createServer() {
  const records = new Map();

  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/api/requests') {
        return json(response, 200, [...records.values()]);
      }
      if (request.method === 'POST' && request.url === '/api/requests') {
        const key = request.headers['idempotency-key'];
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
          return json(response, 415, { error: 'json_required' });
        }
        const data = await readApplication(request);
        if (!data || typeof key !== 'string' || !/^[\w-]{1,80}$/.test(key)) {
          return json(response, 400, { error: 'invalid_application' });
        }

        const { application, loseConfirmation } = data;
        const existing = records.get(key);
        if (existing) {
          if (existing.name !== application.name || existing.topic !== application.topic) {
            return json(response, 409, { error: 'key_already_used' });
          }
          return json(response, 200, { record: existing, duplicate: true });
        }

        const id = 'REQ-' + String(records.size + 1).padStart(3, '0');
        const record = { id, ...application };
        records.set(key, record);
        if (loseConfirmation) return json(response, 503, { error: 'confirmation_unavailable' });
        return json(response, 201, { record, duplicate: false });
      }

      if (request.method === 'GET' && Object.hasOwn(assets, request.url)) {
        const [file, mime] = assets[request.url];
        const contents = await readFile(path.join(__dirname, file));
        response.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
        return response.end(contents);
      }
      json(response, 404, { error: 'not_found' });
    } catch {
      if (!response.headersSent) json(response, 500, { error: 'server_error' });
      else response.end();
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  createServer().listen(8766, '127.0.0.1', () => {
    console.log('http://127.0.0.1:8766');
  });
}

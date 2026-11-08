const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { test } = require('node:test');
const { createServer } = require('./server.cjs');

async function start(t) {
  const server = createServer().listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const key = randomUUID();
  const payload = { name: 'Тестовый клиент', topic: 'Исправить шаблон сайта' };
  return {
    send: (changes = {}, loseConfirmation = false) => fetch(base + '/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ ...payload, ...changes, loseConfirmation }),
    }),
    records: async () => {
      const response = await fetch(base + '/api/requests');
      assert.equal(response.status, 200);
      return response.json();
    },
  };
}

test('a valid application creates one record', async t => {
  const api = await start(t);
  const response = await api.send();
  assert.equal(response.status, 201);
  const { record, duplicate } = await response.json();
  assert.equal(duplicate, false);
  assert.deepEqual(record, { id: 'REQ-001', name: 'Тестовый клиент', topic: 'Исправить шаблон сайта' });
  assert.deepEqual(await api.records(), [record]);
});

test('two submissions with the same key keep one record', async t => {
  const api = await start(t);
  const responses = await Promise.all([api.send(), api.send()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(bodies[0].record, bodies[1].record);
  assert.equal(bodies.find(body => body.duplicate).record.id, 'REQ-001');
  assert.deepEqual(await api.records(), [bodies[0].record]);
});

test('retry after a 503 returns the saved record without a duplicate', async t => {
  const api = await start(t);
  const failed = await api.send({}, true);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error, 'confirmation_unavailable');
  const [saved] = await api.records();
  assert.equal(saved.id, 'REQ-001');

  const retry = await api.send({}, true);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { record: saved, duplicate: true });
  assert.deepEqual(await api.records(), [saved]);
});

test('changing the payload for an existing key returns 409', async t => {
  const api = await start(t);
  assert.equal((await api.send()).status, 201);
  const changed = await api.send({ topic: 'Другая задача' });
  assert.equal(changed.status, 409);
  assert.equal((await api.records())[0].topic, 'Исправить шаблон сайта');
  assert.equal((await api.records()).length, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');

// Minimal D1 stand-in backed by an in-memory SQLite database.
function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    run: async () => ({meta: {changes: Number(sql.prepare(query).run(...args).changes)}}),
    first: async () => sql.prepare(query).get(...args) ?? null
  });
  return {prepare: query => statement(query), batch: async list => { for (const s of list) await s.run(); }, exec: query => sql.exec(query)};
}

async function server(ROOMS = fakeD1()) {
  const {onRequestPost} = await import('../functions/api/room.js');
  const id = crypto.randomUUID();
  return async (key, action, fields = {}) => {
    const request = new Request('http://localhost/api/room', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id, key, action, ...fields})
    });
    const response = await onRequestPost({request, env: {ROOMS}});
    return {status: response.status, ...await response.json()};
  };
}

test('seats, turns and stale versions are enforced', async () => {
  const call = await server(), host = crypto.randomUUID(), guest = crypto.randomUUID();
  assert.equal((await call(guest, 'join')).status, 404);
  assert.equal((await call(host, 'create')).seat, 0);
  assert.equal((await call(host, 'play', {kind:'move', r:7, c:4, version:0})).status, 409);
  assert.equal((await call(guest, 'join')).seat, 1);
  assert.equal((await call(crypto.randomUUID(), 'join')).status, 403);
  assert.equal((await call(guest, 'play', {kind:'move', r:1, c:4, version:0})).status, 409);
  assert.equal((await call(host, 'play', {kind:'move', r:7, c:4, version:0})).version, 1);
  assert.equal((await call(host, 'play', {kind:'move', r:6, c:4, version:0})).status, 409);
  assert.equal((await call(guest, 'play', {kind:'x', r:0, c:0, version:1})).status, 422);
  assert.deepEqual((await call(guest, 'play', {kind:'h', r:3, c:3, version:1})).game.stock, [10,9]);
  assert.equal((await call(host, 'dance')).status, 400);
});

test('a finished game can be restarted by either player', async () => {
  const call = await server(), host = crypto.randomUUID(), guest = crypto.randomUUID();
  await call(host, 'create');
  await call(guest, 'join');
  assert.equal((await call(guest, 'restart', {version:0})).status, 422);
  // 朱 walks straight up column 4 while 藍 steps aside and spends walls far away.
  const guestTurns = [{kind:'move', r:0, c:3}, ...[[0,0],[2,0],[4,0],[6,0],[0,7],[2,7]].map(([r,c]) => ({kind:'v', r, c}))];
  let version = 0;
  for (let r = 7; r >= 0; r--) {
    version = (await call(host, 'play', {kind:'move', r, c:4, version})).version;
    if (r) version = (await call(guest, 'play', {...guestTurns[7 - r], version})).version;
  }
  const finished = await call(host, 'sync');
  assert.equal(finished.game.winner, 0);
  const restarted = await call(guest, 'restart', {version});
  assert.equal(restarted.version, version + 1);
  assert.deepEqual(restarted.game, {pieces:[[8,4],[0,4]], stock:[10,10], walls:[], turn:0, winner:null, moves:0});
  assert.equal((await call(host, 'play', {kind:'move', r:7, c:4, version:version + 1})).status, 200);
});

test('players see each other\'s names', async () => {
  const call = await server(), host = crypto.randomUUID(), guest = crypto.randomUUID();
  assert.deepEqual((await call(host, 'create', {name: '  けいいち  '})).names, ['けいいち', '']);
  assert.deepEqual((await call(guest, 'join', {name: 'あおい\u0007'})).names, ['けいいち', 'あおい']);
  // A blank name keeps the stored one; a long name is cut to 12 characters.
  assert.deepEqual((await call(host, 'sync', {name: ''})).names, ['けいいち', 'あおい']);
  assert.deepEqual((await call(guest, 'sync', {name: '🍓'.repeat(20)})).names, ['けいいち', '🍓'.repeat(12)]);
});

test('rooms tables from before names get the new columns', async () => {
  const ROOMS = fakeD1();
  ROOMS.exec('CREATE TABLE rooms (id TEXT PRIMARY KEY, host TEXT NOT NULL, guest TEXT, game TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL)');
  const call = await server(ROOMS), host = crypto.randomUUID();
  assert.deepEqual((await call(host, 'create', {name: '朱の人'})).names, ['朱の人', '']);
});

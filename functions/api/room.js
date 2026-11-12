import rules from '../../rules.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const lifetime = 24 * 60 * 60 * 1000;
const respond = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});

// Run once per database so join/sync work even before any room was created.
const schemas = new WeakMap();
function ensureSchema(db) {
  if (!schemas.has(db)) schemas.set(db, db.prepare('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, host TEXT NOT NULL, guest TEXT, game TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL)').run()
    // Names and last-seen times came later, so tables made before them need the columns added.
    .then(() => Promise.all(['host_name TEXT', 'guest_name TEXT', 'host_seen INTEGER', 'guest_seen INTEGER'].map(column => db.prepare(`ALTER TABLE rooms ADD COLUMN ${column}`).run()
      .catch(error => { if (!/duplicate column/i.test(error.message)) throw error; }))))
    .catch(error => { schemas.delete(db); throw error; }));
  return schemas.get(db);
}
// Up to 12 characters without control characters; anything else counts as no name.
const cleanName = name => typeof name === 'string' ? [...name.replace(/\p{C}/gu, '').trim()].slice(0, 12).join('') : '';

export async function onRequestPost({ request, env }) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return respond({ error: 'JSON形式で送信してください。' }, 415);
  }
  const body = await request.json().catch(() => null);
  if (!body || !uuid.test(body.id) || !uuid.test(body.key)) {
    return respond({ error: '部屋の情報が正しくありません。' }, 400);
  }
  const { id, key, action } = body;
  if (!['create', 'join', 'sync', 'play', 'restart'].includes(action)) {
    return respond({ error: '操作が正しくありません。' }, 400);
  }
  const db = env.ROOMS;
  const now = Date.now();
  await ensureSchema(db);
  if (action === 'create') {
    await db.batch([
      db.prepare('DELETE FROM rooms WHERE expires <= ?').bind(now),
      db.prepare('INSERT OR IGNORE INTO rooms(id, host, game, expires) VALUES(?,?,?,?)')
        .bind(id, key, JSON.stringify(rules.start()), now + lifetime)
    ]);
  }
  if (action === 'join') {
    await db.prepare('UPDATE rooms SET guest = ? WHERE id = ? AND guest IS NULL AND host != ? AND expires > ?')
      .bind(key, id, key, now).run();
  }
  const room = await db.prepare('SELECT * FROM rooms WHERE id = ? AND expires > ?').bind(id, now).first();
  if (!room) return respond({ error: '部屋が見つからないか、有効期限が切れています。' }, 404);
  const seat = room.host === key ? 0 : room.guest === key ? 1 : -1;
  if (seat < 0) return respond({ error: 'この部屋には既に2人が参加しています。招待リンクで入れるのは1人だけで、先に開いた端末が参加者になります。' }, 403);
  // Every request shows the player is still connected; a blank name keeps the stored one.
  const side = seat ? 'guest' : 'host', name = cleanName(body.name) || room[side + '_name'] || null;
  await db.prepare(`UPDATE rooms SET ${side}_seen = ?, ${side}_name = ? WHERE id = ?`).bind(now, name, id).run();
  Object.assign(room, { [side + '_seen']: now, [side + '_name']: name });
  let game = JSON.parse(room.game), version = room.version;
  if (action === 'play' || action === 'restart') {
    if (!room.guest || body.version !== room.version) {
      return respond({ error: '盤面が変わりました。最新の状態に更新します。' }, 409);
    }
    if (action === 'play') {
      if (seat !== game.turn) return respond({ error: '相手の手番です。' }, 409);
      const legal = body.kind === 'move' ? rules.move(game, body.r, body.c)
        : rules.wall(game, body.r, body.c, body.kind);
      if (!legal) return respond({ error: 'そこには指せません。' }, 422);
    } else {
      if (game.winner === null) return respond({ error: '対局が終わってから再戦できます。' }, 422);
      game = rules.start();
    }
    const result = await db.prepare('UPDATE rooms SET game = ?, version = version + 1, expires = ? WHERE id = ? AND version = ?')
      .bind(JSON.stringify(game), now + lifetime, id, room.version).run();
    if (!result.meta.changes) return respond({ error: '盤面が変わりました。最新の状態に更新します。' }, 409);
    version++;
  }
  // Seconds since each player last reached the server, or null if they never have.
  const seen = [room.host_seen, room.guest_seen].map(time => time ? Math.round((now - time) / 1000) : null);
  return respond({ game, seat, ready: Boolean(room.guest), version, names: [room.host_name || '', room.guest_name || ''], seen });
}

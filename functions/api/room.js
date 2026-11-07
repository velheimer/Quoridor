import rules from '../../rules.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const lifetime = 24 * 60 * 60 * 1000;
const respond = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return respond({ error: 'JSON形式で送信してください。' }, 415);
  }
  const body = await request.json().catch(() => null);
  if (!body || !uuid.test(body.id) || !uuid.test(body.key)) {
    return respond({ error: '部屋の情報が正しくありません。' }, 400);
  }
  const { id, key, action } = body;
  const db = env.ROOMS;
  const now = Date.now();
  if (action === 'create') {
    await db.prepare('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, host TEXT NOT NULL, guest TEXT, game TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL)').run();
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
  if (seat < 0) return respond({ error: 'この部屋には既に2人が参加しています。' }, 403);
  const game = JSON.parse(room.game);
  if (action === 'play') {
    if (!room.guest || seat !== game.turn || body.version !== room.version) {
      return respond({ error: '手番が変わりました。盤面を更新します。' }, 409);
    }
    const legal = body.kind === 'move' ? rules.move(game, body.r, body.c)
      : rules.wall(game, body.r, body.c, body.kind);
    if (!legal) return respond({ error: 'そこには指せません。' }, 422);
    const result = await db.prepare('UPDATE rooms SET game = ?, version = version + 1, expires = ? WHERE id = ? AND version = ?')
      .bind(JSON.stringify(game), now + lifetime, id, room.version).run();
    if (!result.meta.changes) return respond({ error: '盤面を更新します。' }, 409);
  } else if (!['create', 'join', 'sync'].includes(action)) {
    return respond({ error: '操作が正しくありません。' }, 400);
  }
  return respond({ game, seat, ready: Boolean(room.guest), version: game.moves });
}

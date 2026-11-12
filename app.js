const $ = id => document.getElementById(id);
const names = ['朱','藍'];
const colors = ['red','blue'];
const pitch = 100/8.86, tile = pitch*.86;
let state = Ayaji.start(), mode = 'move', undoStack = [], cpu = '';
const who = i => names[i] + (cpu && i === 1 ? '（CPU）' : room?.names?.[i] ? '（' + room.names[i] + '）' : '');
const cpuThinking = () => Boolean(cpu) && state.turn === 1 && state.winner === null;

let room = null, pending = false, polling;
function canPlay() {
  return room ? room.ready && room.seat === state.turn && !pending : !cpuThinking();
}

function position(el,x,y,w,h) {
  Object.assign(el.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
}
function render() {
  const board = $('board'), legal = Ayaji.targets(state), over = state.winner !== null;
  board.replaceChildren();
  $('status').textContent = over ? who(state.winner)+'の勝ち' : who(state.turn)+'の手番';
  $('count').textContent = over ? state.moves+' 手で終局' : '第 '+(state.moves+1)+' 手';
  if (room) $('restart').hidden = !over || !room.ready;
  $('undo').hidden = Boolean(room);
  $('undo').disabled = !undoStack.length;
  $('stock').innerHTML = names.map((n,i) => '<div class="stockrow"><span class="dot '+colors[i]+'"></span>'+n+'<b>'+state.stock[i]+' 枚</b></div>').join('');
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.disabled = !canPlay() || over || (btn.dataset.mode !== 'move' && !state.stock[state.turn]);
    btn.setAttribute('aria-pressed',btn.dataset.mode===mode);
  }
  $('hint').textContent = over ? '「はじめから」で再戦できます。' : cpuThinking() ? 'CPU が考えています…' : mode==='move' ? '点のあるマスを選ぶと駒が進みます。' : '壁の中心にする交点を選んでください。';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const el = document.createElement('button');
    const target = canPlay() && mode==='move' && legal.some(p => p[0]===r && p[1]===c);
    const player = state.pieces.findIndex(p => p[0]===r && p[1]===c);
    el.className = 'tile'+(target?' legal':'');
    el.disabled = !target;
    el.setAttribute('aria-label',(r+1)+'行 '+(c+1)+'列'+(player<0?'':' '+names[player]+'の駒'));
    position(el,c*pitch,r*pitch,tile,tile);
    if (player>=0) el.innerHTML = '<span class="piece '+colors[player]+'"></span>';
    el.onclick = () => { play('move',r,c); };
    board.append(el);
  }
  for (const w of state.walls) {
    const el = document.createElement('span');
    el.className = 'wall';
    const h = w.d==='h';
    position(el,w.c*pitch+(h?0:tile),w.r*pitch+(h?tile:0),h?pitch+tile:pitch-tile,h?pitch-tile:pitch+tile);
    board.append(el);
  }
  if (canPlay() && !over && mode!=='move') for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const el = document.createElement('button');
    el.className = 'anchor '+mode;
    el.style.left = (c*pitch+(pitch+tile)/2)+'%';
    el.style.top = (r*pitch+(pitch+tile)/2)+'%';
    el.setAttribute('aria-label',(r+1)+'行 '+(c+1)+'列の交点に'+(mode==='h'?'横':'縦')+'壁を置く');
    el.onclick = () => {
      play(mode,r,c);
    };
    board.append(el);
  }
}
for (const btn of document.querySelectorAll('[data-mode]')) btn.onclick = () => {mode=btn.dataset.mode; render();};
function dialog(title,body,confirm) {
  $('dialogTitle').textContent = title;
  $('dialogText').innerHTML = body;
  $('confirm').hidden = !confirm;
  $('close').textContent = confirm ? '続ける' : '閉じる';
  $('dialog').showModal();
}
$('help').onclick = () => dialog('遊び方','<p>向かいの辺を目指します。朱が先手。先に向こう岸のどのマスにでも着いた方が勝ちです。</p><p>自分の手番では、駒を上下左右に1マス進めるか、長さ2マスの壁を1枚置きます。相手が隣なら飛び越えられます。相手の背後が壁か盤の端なら、相手の横に回り込めます。</p><p>壁は各自10枚。壁を重ねたり交差させたり、どちらかの道をすべて塞いだりすることはできません。</p><p>「対戦相手」で CPU を選ぶと、あなたが朱（先手）、CPU が藍を持ちます。</p>',false);
$('restart').onclick = () => dialog('新しい対局', room ? '<p>盤面をリセットして、朱の手番から再戦します。相手の盤面も新しくなります。</p>' : '<p>現在の盤面をリセットして、朱の手番から始めます。</p>',true);
$('close').onclick = () => $('dialog').close();
$('confirm').onclick = () => {
  $('dialog').close();
  if (room) return sendRoom('restart');
  state=Ayaji.start(); undoStack=[]; mode='move'; render();
};
// Only the player's moves are stacked, so one undo also takes back the CPU's reply.
$('undo').onclick = () => { if (undoStack.length) { state = undoStack.pop(); mode = 'move'; render(); } };
$('cpu').onchange = () => { cpu = $('cpu').value; state = Ayaji.start(); undoStack = []; mode = 'move'; render(); };

function cpuTurn() {
  if (!cpuThinking()) return;
  const before = state;
  setTimeout(() => {
    // Skip if the board changed meanwhile (undo, restart or a new opponent).
    if (state !== before) return;
    const a = AyajiAI.choose(state,cpu), next = structuredClone(state);
    if (a && (a.kind === 'move' ? Ayaji.move(next,a.r,a.c) : Ayaji.wall(next,a.r,a.c,a.kind))) state = next;
    render();
  }, 450);
}
render();

async function requestRoom(action, fields = {}) {
  let response;
  try {
    response = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: room.id, key: room.key, action, name: $('playerName').value.trim(), ...fields }),
      signal: AbortSignal.timeout(12000)
    });
  } catch (error) { room.offline = true; showPresence(); throw error; }
  if (!response.headers.get('Content-Type')?.includes('application/json')) { room.offline = true; showPresence(); throw new Error('対戦サーバーに接続できません。'); }
  room.offline = false; room.lastReply = Date.now();
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), {status: response.status});
  return data;
}

function applyRoom(data) {
  const changed = !room.synced || room.version !== data.version || room.ready !== data.ready || String(room.names) !== String(data.names);
  Object.assign(room, {seat: data.seat, ready: data.ready, version: data.version, names: data.names, seen: data.seen, synced: true});
  showPresence();
  state = data.game;
  const rival = 1 - data.seat, rivalName = data.names[rival] ? data.names[rival] + 'さん' : '相手';
  $('roomStatus').textContent = data.ready ? rivalName + '（' + names[rival] + '）と対戦中 · あなたは' + names[data.seat]
    : '招待リンクを相手に送ってください。参加を待っています。';
  if (changed) { mode = 'move'; render(); }
}

// Seats, who is connected, and how this browser's own connection is doing.
function showPresence() {
  const ago = s => s < 60 ? s + '秒前' : s < 3600 ? Math.floor(s/60) + '分前' : Math.floor(s/3600) + '時間前';
  const line = (parts, cls = '') => { const li = document.createElement('li'); li.className = cls; li.append(...parts); return li; };
  const count = room.full ? '2 / 2 人（満員のため入れません）' : room.seat === undefined || room.offline ? '確認中' : 1 + Number(room.ready) + ' / 2 人';
  const rows = [line(['部屋 ' + room.id.slice(0,4) + ' · 参加 ' + count], 'note')];
  if (room.seat !== undefined && !room.full) for (const i of [0,1]) {
    const dot = document.createElement('span'), seen = room.seen?.[i];
    dot.className = 'dot ' + colors[i];
    const label = names[i] + (room.names?.[i] ? ' ' + room.names[i] : '') + (i === room.seat ? '（あなた）' : '');
    const status = i === room.seat ? (room.offline ? '通信できません' : '接続中')
      : room.offline ? '不明'
      : i === 1 && !room.ready ? 'まだ参加していません'
      : seen === null || seen === undefined ? '不明'
      : seen <= 8 ? '接続中' : ago(seen) + 'から応答なし';
    const b = document.createElement('b'); b.textContent = status; b.className = status === '接続中' ? 'ok' : '';
    rows.push(line([dot, label + ' — ', b]));
  }
  const since = room.lastReply ? ago(Math.round((Date.now() - room.lastReply) / 1000)) : null;
  rows.push(line([room.offline ? 'サーバーにつながりません。再試行しています' + (since ? '（最後の成功：' + since + '）' : '') + '。'
    : since ? 'サーバーと通信できています（' + since + 'に確認）。' : 'サーバーに接続しています…'], 'note'));
  $('presence').replaceChildren(...rows);
}

async function syncRoom(action = 'sync') {
  if (pending || !room) return;
  pending = true;
  try {
    const data = await requestRoom(action);
    pending = false;
    applyRoom(data);
    room.initial = 'sync';
  } catch (error) {
    $('roomStatus').textContent = error.status ? error.message : '通信を再試行しています…';
    room.synced = false;
    room.ready = false;
    room.full = error.status === 403;
    showPresence();
    render();
    if ([403,404].includes(error.status)) clearInterval(polling);
  } finally { pending = false; }
}

async function play(kind, r, c) {
  if (!canPlay()) return;
  // Try the move on a copy first; offline it becomes the new state, online the server's answer does.
  const trial = structuredClone(state);
  const legal = kind === 'move' ? Ayaji.move(trial,r,c) : Ayaji.wall(trial,r,c,kind);
  if (!legal) { $('hint').textContent = 'ここには置けません。壁とゴールへの道を確認してください。'; return; }
  if (!room) { undoStack.push(state); state = trial; mode = 'move'; render(); cpuTurn(); return; }
  await sendRoom('play', {kind,r,c});
}

async function sendRoom(action, fields = {}) {
  pending = true;
  render();
  try {
    const data = await requestRoom(action, {...fields, version: room.version});
    pending = false;
    applyRoom(data);
  } catch (error) {
    $('roomStatus').textContent = error.status ? error.message : '通信を確認しています…';
    if (error.status !== 422) { room.ready = false; room.synced = false; }
  } finally { pending = false; render(); }
}

function enterRoom(id, creating) {
  const storage = 'ayaji-room-' + id;
  let key = localStorage.getItem(storage);
  if (!key) { key = crypto.randomUUID(); localStorage.setItem(storage,key); }
  room = {id,key,ready:false,initial:creating ? 'create' : 'join'};
  location.hash = 'room=' + id;
  $('createRoom').hidden = $('restart').hidden = $('opponent').hidden = true;
  cpu = '';
  $('roomTools').hidden = false;
  $('invite').value = location.href;
  $('roomStatus').textContent = '対戦ルームに接続中…';
  showPresence();
  state = Ayaji.start(); mode = 'move'; render();
  syncRoom(room.initial);
  polling = setInterval(() => { if (!document.hidden) syncRoom(room.initial); }, 2500);
}

$('playerName').value = localStorage.getItem('ayaji-name') || '';
$('playerName').onchange = () => { localStorage.setItem('ayaji-name', $('playerName').value.trim()); if (room) syncRoom(); };
$('createRoom').onclick = () => enterRoom(crypto.randomUUID(),true);
$('leaveRoom').onclick = () => { history.replaceState(null, '', location.href.split('#')[0]); location.reload(); };
$('copyInvite').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); $('copyInvite').textContent = 'コピーしました'; }
  catch { $('invite').select(); }
};
const invitation = /^#room=([a-f0-9-]{36})$/.exec(location.hash);
if (invitation) enterRoom(invitation[1],false);
// Pasting an invite into an already open tab only changes the hash, so reload to join.
addEventListener('hashchange', () => { if (!room || location.hash !== '#room=' + room.id) location.reload(); });

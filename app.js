const $ = id => document.getElementById(id);
const names = ['朱','藍'];
const colors = ['red','blue'];
const pitch = 100/8.86, tile = pitch*.86;
let state = Ayaji.start(), mode = 'move';

let room = null, pending = false, polling;
function canPlay() {
  return !room || (room.ready && room.seat === state.turn && !pending);
}

function position(el,x,y,w,h) {
  Object.assign(el.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
}
function render() {
  const board = $('board'), legal = Ayaji.targets(state), over = state.winner !== null;
  board.replaceChildren();
  $('status').textContent = over ? names[state.winner]+'の勝ち' : names[state.turn]+'の手番';
  $('count').textContent = over ? state.moves+' 手で終局' : '第 '+(state.moves+1)+' 手';
  if (room) $('restart').hidden = !over || !room.ready;
  $('stock').innerHTML = names.map((n,i) => '<div class="stockrow"><span class="dot '+colors[i]+'"></span>'+n+'<b>'+state.stock[i]+' 枚</b></div>').join('');
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.disabled = !canPlay() || over || (btn.dataset.mode !== 'move' && !state.stock[state.turn]);
    btn.setAttribute('aria-pressed',btn.dataset.mode===mode);
  }
  $('hint').textContent = over ? '「はじめから」で再戦できます。' : mode==='move' ? '点のあるマスを選ぶと駒が進みます。' : '壁の中心にする交点を選んでください。';
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
$('help').onclick = () => dialog('遊び方','<p>向かいの辺を目指します。朱が先手。先に向こう岸のどのマスにでも着いた方が勝ちです。</p><p>自分の手番では、駒を上下左右に1マス進めるか、長さ2マスの壁を1枚置きます。相手が隣なら飛び越えられます。相手の背後が壁か盤の端なら、相手の横に回り込めます。</p><p>壁は各自10枚。壁を重ねたり交差させたり、どちらかの道をすべて塞いだりすることはできません。</p>',false);
$('restart').onclick = () => dialog('新しい対局', room ? '<p>盤面をリセットして、朱の手番から再戦します。相手の盤面も新しくなります。</p>' : '<p>現在の盤面をリセットして、朱の手番から始めます。</p>',true);
$('close').onclick = () => $('dialog').close();
$('confirm').onclick = () => {
  $('dialog').close();
  if (room) return sendRoom('restart');
  state=Ayaji.start(); mode='move'; render();
};
render();

async function requestRoom(action, fields = {}) {
  const response = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: room.id, key: room.key, action, ...fields }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('対戦サーバーに接続できません。');
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), {status: response.status});
  return data;
}

function applyRoom(data) {
  const changed = !room.synced || room.version !== data.version || room.ready !== data.ready;
  Object.assign(room, {seat: data.seat, ready: data.ready, version: data.version, synced: true});
  state = data.game;
  $('roomStatus').textContent = data.ready ? 'オンライン対戦 · あなたは' + names[data.seat]
    : '招待リンクを相手に送ってください。参加を待っています。';
  if (changed) { mode = 'move'; render(); }
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
    render();
    if ([403,404].includes(error.status)) clearInterval(polling);
  } finally { pending = false; }
}

async function play(kind, r, c) {
  if (!canPlay()) return;
  // Online, try the move on a copy first; the server's answer replaces the state.
  const trial = room ? structuredClone(state) : state;
  const legal = kind === 'move' ? Ayaji.move(trial,r,c) : Ayaji.wall(trial,r,c,kind);
  if (!legal) { $('hint').textContent = 'ここには置けません。壁とゴールへの道を確認してください。'; return; }
  if (!room) { mode = 'move'; render(); return; }
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
  $('createRoom').hidden = $('restart').hidden = true;
  $('roomTools').hidden = false;
  $('invite').value = location.href;
  $('roomStatus').textContent = '対戦ルームに接続中…';
  state = Ayaji.start(); mode = 'move'; render();
  syncRoom(room.initial);
  polling = setInterval(() => { if (!document.hidden) syncRoom(room.initial); }, 2500);
}

$('createRoom').onclick = () => enterRoom(crypto.randomUUID(),true);
$('leaveRoom').onclick = () => { history.replaceState(null, '', location.href.split('#')[0]); location.reload(); };
$('copyInvite').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); $('copyInvite').textContent = 'コピーしました'; }
  catch { $('invite').select(); }
};
const invitation = /^#room=([a-f0-9-]{36})$/.exec(location.hash);
if (invitation) enterRoom(invitation[1],false);

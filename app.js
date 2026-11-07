const $ = id => document.getElementById(id);
const names = ['朱','藍'];
const colors = ['red','blue'];
const pitch = 100/8.86, tile = pitch*.86;
let state = Ayaji.start(), mode = 'move';

function position(el,x,y,w,h) {
  Object.assign(el.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
}
function render() {
  const board = $('board'), legal = Ayaji.targets(state), over = state.winner !== null;
  board.replaceChildren();
  $('status').textContent = over ? names[state.winner]+'の勝ち' : names[state.turn]+'の手番';
  $('count').textContent = over ? state.moves+' 手で終局' : '第 '+(state.moves+1)+' 手';
  $('stock').innerHTML = names.map((n,i) => '<div class="stockrow"><span class="dot '+colors[i]+'"></span>'+n+'<b>'+state.stock[i]+' 枚</b></div>').join('');
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.disabled = over || (btn.dataset.mode !== 'move' && !state.stock[state.turn]);
    btn.setAttribute('aria-pressed',btn.dataset.mode===mode);
  }
  $('hint').textContent = over ? '「はじめから」で再戦できます。' : mode==='move' ? '点のあるマスを選ぶと駒が進みます。' : '壁の中心にする交点を選んでください。';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const el = document.createElement('button');
    const target = mode==='move' && legal.some(p => p[0]===r && p[1]===c);
    const player = state.pieces.findIndex(p => p[0]===r && p[1]===c);
    el.className = 'tile'+(target?' legal':'');
    el.disabled = !target;
    el.setAttribute('aria-label',(r+1)+'行 '+(c+1)+'列'+(player<0?'':' '+names[player]+'の駒'));
    position(el,c*pitch,r*pitch,tile,tile);
    if (player>=0) el.innerHTML = '<span class="piece '+colors[player]+'"></span>';
    el.onclick = () => { if (Ayaji.move(state,r,c)) render(); };
    board.append(el);
  }
  for (const w of state.walls) {
    const el = document.createElement('span');
    el.className = 'wall';
    const h = w.d==='h';
    position(el,w.c*pitch+(h?0:tile),w.r*pitch+(h?tile:0),h?pitch+tile:pitch-tile,h?pitch-tile:pitch+tile);
    board.append(el);
  }
  if (!over && mode!=='move') for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const el = document.createElement('button');
    el.className = 'anchor '+mode;
    el.style.left = (c*pitch+(pitch+tile)/2)+'%';
    el.style.top = (r*pitch+(pitch+tile)/2)+'%';
    el.setAttribute('aria-label',(r+1)+'行 '+(c+1)+'列の交点に'+(mode==='h'?'横':'縦')+'壁を置く');
    el.onclick = () => {
      if (Ayaji.wall(state,r,c,mode)) { mode='move'; render(); }
      else $('hint').textContent = 'ここには置けません。壁の重なり・交差と、両者のゴールへの道を確認してください。';
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
$('help').onclick = () => dialog('遊び方','<p>同じ端末で向かいの辺を目指します。朱が先手。先に向こう岸のどのマスにでも着いた方が勝ちです。</p><p>自分の手番では、駒を上下左右に1マス進めるか、長さ2マスの壁を1枚置きます。相手が隣なら飛び越えられます。相手の背後が壁か盤の端なら、相手の横に回り込めます。</p><p>壁は各自10枚。壁を重ねたり交差させたり、どちらかの道をすべて塞いだりすることはできません。</p>',false);
$('restart').onclick = () => dialog('新しい対局','<p>現在の盤面をリセットして、朱の手番から始めます。</p>',true);
$('close').onclick = () => $('dialog').close();
$('confirm').onclick = () => {state=Ayaji.start(); mode='move'; $('dialog').close(); render();};
render();

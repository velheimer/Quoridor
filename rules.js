const Ayaji = (() => {
  const directions = [[1,0], [-1,0], [0,1], [0,-1]];
  const inside = ([r,c]) => r >= 0 && r < 9 && c >= 0 && c < 9;
  const same = (a,b) => a[0] === b[0] && a[1] === b[1];
  const start = () => ({pieces:[[8,4],[0,4]], stock:[10,10], walls:[], turn:0, winner:null, moves:0});
  const goal = player => player === 0 ? 0 : 8;

  function open(walls, a, b) {
    if (!inside(b)) return false;
    const [r,c] = a;
    return !walls.some(w => r !== b[0]
      ? w.d === 'h' && w.r === Math.min(r,b[0]) && (w.c === c || w.c + 1 === c)
      : w.d === 'v' && w.c === Math.min(c,b[1]) && (w.r === r || w.r + 1 === r));
  }

  function targets(s) {
    if (s.winner !== null) return [];
    const [r,c] = s.pieces[s.turn];
    const other = s.pieces[1-s.turn];
    const result = [];
    for (const [dr,dc] of directions) {
      const next = [r+dr,c+dc];
      if (!open(s.walls,[r,c],next)) continue;
      if (!same(next,other)) { result.push(next); continue; }
      const jump = [next[0]+dr,next[1]+dc];
      if (open(s.walls,next,jump)) result.push(jump);
      else for (const sign of [-1,1]) {
        const side = [next[0]+dc*sign,next[1]+dr*sign];
        if (open(s.walls,next,side)) result.push(side);
      }
    }
    return result;
  }

  // Shortest route to the goal edge ignoring the other pawn, from the pawn to the goal; null if sealed.
  function path(s,player,walls = s.walls) {
    const queue = [s.pieces[player]];
    const from = new Map([[queue[0].join(','),null]]);
    for (let i=0;i<queue.length;i++) {
      const [r,c] = queue[i];
      if (r === goal(player)) {
        const route = [];
        for (let p = queue[i]; p; p = from.get(p.join(','))) route.unshift(p);
        return route;
      }
      for (const [dr,dc] of directions) {
        const next = [r+dr,c+dc], key = next.join(',');
        if (!from.has(key) && open(walls,[r,c],next)) {
          from.set(key,queue[i]); queue.push(next);
        }
      }
    }
    return null;
  }

  function move(s,r,c) {
    if (!targets(s).some(p => same(p,[r,c]))) return false;
    s.pieces[s.turn] = [r,c];
    s.moves++;
    if (r === goal(s.turn)) s.winner = s.turn;
    else s.turn = 1-s.turn;
    return true;
  }

  function wall(s,r,c,d) {
    if (s.winner !== null || !s.stock[s.turn] || !Number.isInteger(r) || !Number.isInteger(c) ||
        r<0 || c<0 || r>7 || c>7 || !['h','v'].includes(d)) return false;
    if (s.walls.some(w => (w.r===r && w.c===c) || (d===w.d &&
        (d==='h' ? w.r===r && Math.abs(w.c-c)<2 : w.c===c && Math.abs(w.r-r)<2)))) return false;
    const walls = [...s.walls,{r,c,d}];
    if (![0,1].every(player => path(s,player,walls))) return false;
    s.walls = walls;
    s.stock[s.turn]--; s.moves++; s.turn = 1-s.turn;
    return true;
  }
  return {start,targets,move,wall,path};
})();

// CPU opponent. Kept in this file because the Pages build only publishes the existing files.
const AyajiAI = (() => {
  const rules = Ayaji;
  const pick = list => list[Math.floor(Math.random()*list.length)];

  function play(s,a) {
    const next = structuredClone(s);
    return (a.kind === 'move' ? rules.move(next,a.r,a.c) : rules.wall(next,a.r,a.c,a.kind)) ? next : null;
  }
  const steps = s => rules.targets(s).map(([r,c]) => ({kind:'move',r,c}));

  // Walls that cut an edge of the player's current shortest route.
  function blockers(s,player) {
    if (!s.stock[s.turn]) return [];
    const route = rules.path(s,player), result = [];
    for (let i=1;i<route.length;i++) {
      const [[r1,c1],[r2,c2]] = [route[i-1],route[i]];
      const spots = r1 !== r2 ? [[Math.min(r1,r2),c1,'h'],[Math.min(r1,r2),c1-1,'h']]
        : [[r1,Math.min(c1,c2),'v'],[r1-1,Math.min(c1,c2),'v']];
      for (const [r,c,kind] of spots) if (r>=0 && r<8 && c>=0 && c<8) result.push({kind,r,c});
    }
    return result;
  }

  // Legal actions with their resulting states: every pawn step plus walls on the opponent's route.
  function options(s) {
    return [...steps(s),...blockers(s,1-s.turn)].map(a => ({a,next:play(s,a)})).filter(o => o.next);
  }

  // Positive when `me` is closer to their goal than the opponent, plus `keep` per wall held in reserve.
  function score(s,me,keep = .2) {
    if (s.winner !== null) return s.winner === me ? 1000 : -1000;
    const mine = rules.path(s,me).length, theirs = rules.path(s,1-me).length;
    // Whoever is to move and one step from the goal wins next turn.
    if (s.turn === me && mine === 2) return 900;
    if (s.turn !== me && theirs === 2) return -900;
    return theirs - mine + keep*(s.stock[me]-s.stock[1-me]);
  }

  function best(list,value) {
    let top = -Infinity, ties = [];
    for (const o of list) {
      const v = value(o);
      if (v > top) { top = v; ties = [o]; } else if (v === top) ties.push(o);
    }
    return pick(ties);
  }

  function easy(s) {
    const moves = steps(s).map(a => ({a,next:play(s,a)}));
    const walls = blockers(s,1-s.turn).map(a => ({a,next:play(s,a)})).filter(o => o.next);
    const roll = Math.random();
    if (walls.length && roll < .1) return pick(walls);
    if (roll < .35) return pick(moves);
    return best(moves,o => -rules.path(o.next,s.turn).length);
  }

  function normal(s) {
    return best(options(s),o => score(o.next,s.turn));
  }

  // Two plies, blending our gain with the opponent's most damaging reply so that a
  // pessimistic search still makes progress. Hard also values walls kept for the endgame.
  function hard(s) {
    const me = s.turn, keep = 1.5;
    return best(options(s),o => {
      const now = score(o.next,me,keep);
      if (o.next.winner !== null) return now;
      const replies = options(o.next);
      return now + (replies.length ? Math.min(...replies.map(r => score(r.next,me,keep))) : now);
    });
  }

  const levels = {easy,normal,hard};
  function choose(s,level) {
    const choice = s.winner === null && (levels[level] || normal)(s);
    if (choice) return choice.a;
    // Pawn boxed in by the other pawn: any legal wall will do.
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) for (const kind of ['h','v'])
      if (play(s,{kind,r,c})) return {kind,r,c};
    return null;
  }
  return {choose};
})();
if (typeof module !== 'undefined') module.exports = Object.assign(Ayaji,{AI:AyajiAI});

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
if (typeof module !== 'undefined') module.exports = Ayaji;

const test = require('node:test');
const assert = require('node:assert/strict');
const {start,targets,move,wall} = require('../rules');

test('opening, illegal moves and alternating turns', () => {
  const s = start();
  assert.equal(targets(s).length,3);
  assert.equal(move(s,6,4),false);
  assert.equal(move(s,7,4),true);
  assert.equal(s.turn,1);
});
test('jump and blocked-jump detour', () => {
  const s = start();
  s.pieces = [[4,4],[3,4]];
  assert.ok(targets(s).some(([r,c]) => r===2 && c===4));
  s.walls = [{r:2,c:4,d:'h'}];
  for (const col of [3,5]) assert.ok(targets(s).some(([r,c]) => r===3 && c===col));
  assert.ok(!targets(s).some(([r]) => r===2));
});
test('walls cannot overlap, cross or seal the last path', () => {
  const s = start();
  assert.ok(wall(s,7,4,'h'));
  const snapshot = JSON.stringify(s);
  for (const [r,c,d] of [[7,4,'v'],[7,5,'h']]) assert.equal(wall(s,r,c,d),false);
  assert.equal(JSON.stringify(s),snapshot);

});
test('a wall that traps a corner pawn is rejected', () => {
  const s = start();
  s.pieces[0] = [8,8];
  assert.ok(wall(s,7,7,'h'));
  assert.equal(wall(s,7,6,'v'),false);
  assert.deepEqual(s.stock,[9,10]);
});
test('reaching the far edge ends play', () => {
  const s = start();
  s.pieces = [[1,2],[3,4]];
  assert.ok(move(s,0,2));
  assert.equal(s.winner,0);
  assert.equal(move(s,1,2),false);
  assert.equal(wall(s,4,4,'v'),false);
});

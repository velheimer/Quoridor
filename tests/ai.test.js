const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../rules');
const {choose} = rules.AI;

const apply = (s,a) => a.kind === 'move' ? rules.move(s,a.r,a.c) : rules.wall(s,a.r,a.c,a.kind);

function game(first,second) {
  const s = rules.start(), levels = [first,second];
  while (s.winner === null && s.moves < 400) assert.ok(apply(s,choose(s,levels[s.turn])));
  return s;
}

test('every level answers with a legal action', () => {
  for (const level of ['easy','normal','hard']) {
    for (let i=0;i<20;i++) assert.ok(apply(rules.start(),choose(rules.start(),level)));
  }
});

test('normal and hard take a winning step', () => {
  for (const level of ['normal','hard']) {
    const s = rules.start();
    s.pieces = [[1,4],[5,0]];
    assert.deepEqual(choose(s,level),{kind:'move',r:0,c:4});
  }
});

test('normal and hard wall off an opponent about to win', () => {
  for (const level of ['normal','hard']) {
    const s = rules.start();
    s.pieces = [[1,4],[4,0]];
    s.turn = 1;
    const a = choose(s,level);
    assert.notEqual(a.kind,'move');
    assert.ok(apply(s,a));
    assert.ok(rules.path(s,0).length > 2);
  }
});

test('games finish and stronger levels beat weaker ones', t => {
  // Seeded random numbers keep the tie-breaks, and so the results, the same on every run.
  let seed = 20261111;
  t.mock.method(Math,'random',() => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  });
  const wins = (strong,weak,rounds) => {
    let count = 0;
    for (let i=0;i<rounds;i++) {
      // Alternate who moves first so the first-move advantage cancels out.
      const s = i % 2 ? game(weak,strong) : game(strong,weak);
      assert.notEqual(s.winner,null);
      if (s.winner === (i % 2 ? 1 : 0)) count++;
    }
    return count;
  };
  assert.ok(wins('normal','easy',10) >= 9);
  assert.ok(wins('hard','easy',10) >= 9);
  assert.ok(wins('hard','normal',20) >= 12);
});

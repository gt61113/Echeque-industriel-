/* ===== MOTEUR D'ÉCHECS ===== */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
function fromFEN(fen) {
  const [pl, tn, ca, ep] = fen.split(' ');
  const board = new Array(64).fill(null);
  pl.split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') f += +ch;
      else { board[(7 - i) * 8 + f] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); f++; }
    }
  });
  const c = ca || '';
  return {
    board, turn: tn || 'w',
    castle: { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') },
    ep: (ep && ep !== '-') ? (ep.charCodeAt(0) - 97) + (+ep[1] - 1) * 8 : -1,
    half: 0
  };
}
function newState() { return fromFEN(START_FEN); }

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const KG = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const DG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const OR = [[1,0],[-1,0],[0,1],[0,-1]];

function attacked(b, sq, by) {
  const f = sq & 7, r = sq >> 3;
  const dir = by === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const ff = f + df, rr = r + dir;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === by + 'P') return true;
  }
  for (const [df, dr] of KN) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === by + 'N') return true;
  }
  for (const [df, dr] of KG) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === by + 'K') return true;
  }
  for (const [df, dr] of DG) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === by + 'B' || p === by + 'Q') return true; break; }
      ff += df; rr += dr;
    }
  }
  for (const [df, dr] of OR) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === by + 'R' || p === by + 'Q') return true; break; }
      ff += df; rr += dr;
    }
  }
  return false;
}

function genPseudo(s) {
  const b = s.board, me = s.turn, opp = me === 'w' ? 'b' : 'w', out = [];
  const push = (from, to, flag, promo) => out.push({ from, to, flag: flag || null, promo: !!promo });
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p || p[0] !== me) continue;
    const t = p[1], f = sq & 7, r = sq >> 3;
    if (t === 'P') {
      const dir = me === 'w' ? 1 : -1, start = me === 'w' ? 1 : 6, last = me === 'w' ? 7 : 0, r1 = r + dir;
      if (r1 < 0 || r1 > 7) continue;
      if (!b[r1 * 8 + f]) {
        push(sq, r1 * 8 + f, null, r1 === last);
        if (r === start && !b[(r + 2 * dir) * 8 + f]) push(sq, (r + 2 * dir) * 8 + f, 'double');
      }
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff < 0 || ff > 7) continue;
        const to = r1 * 8 + ff, q = b[to];
        if (q && q[0] === opp) push(sq, to, null, r1 === last);
        else if (!q && to === s.ep) push(sq, to, 'ep');
      }
    } else if (t === 'N' || t === 'K') {
      for (const [df, dr] of (t === 'N' ? KN : KG)) {
        const ff = f + df, rr = r + dr;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const to = rr * 8 + ff, q = b[to];
        if (!q || q[0] === opp) push(sq, to);
      }
      if (t === 'K') {
        const home = me === 'w' ? 4 : 60;
        if (sq === home && !attacked(b, sq, opp)) {
          if (s.castle[me + 'K'] && !b[home + 1] && !b[home + 2] && b[home + 3] === me + 'R' &&
              !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) push(sq, home + 2, 'castleK');
          if (s.castle[me + 'Q'] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === me + 'R' &&
              !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) push(sq, home - 2, 'castleQ');
        }
      }
    } else {
      const dirs = t === 'B' ? DG : t === 'R' ? OR : DG.concat(OR);
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const to = rr * 8 + ff, q = b[to];
          if (!q) push(sq, to);
          else { if (q[0] === opp) push(sq, to); break; }
          ff += df; rr += dr;
        }
      }
    }
  }
  for (const m of out) {
    m.capSq = m.flag === 'ep' ? (m.from >> 3) * 8 + (m.to & 7) : m.to;
    m.cap = b[m.capSq] || null;
  }
  return out;
}

function apply(s, m) {
  const b = s.board.slice(), me = s.turn, p = b[m.from];
  const cap = m.flag === 'ep' ? b[m.capSq] : b[m.to];
  b[m.to] = p; b[m.from] = null;
  if (m.flag === 'ep') b[m.capSq] = null;
  if (m.promo) b[m.to] = me + 'Q';
  if (m.flag === 'castleK') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
  if (m.flag === 'castleQ') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
  const c = Object.assign({}, s.castle);
  if (p[1] === 'K') { c[me + 'K'] = false; c[me + 'Q'] = false; }
  const touch = (q) => { if (q === 0) c.wQ = false; if (q === 7) c.wK = false; if (q === 56) c.bQ = false; if (q === 63) c.bK = false; };
  touch(m.from); touch(m.to);
  return {
    board: b, turn: me === 'w' ? 'b' : 'w', castle: c,
    ep: m.flag === 'double' ? (m.from + m.to) / 2 : -1,
    half: (p[1] === 'P' || cap) ? 0 : s.half + 1
  };
}

function legal(s) {
  const me = s.turn, opp = me === 'w' ? 'b' : 'w';
  return genPseudo(s).filter(m => {
    const n = apply(s, m);
    return !attacked(n.board, n.board.indexOf(me + 'K'), opp);
  });
}
function inCheck(s) {
  const me = s.turn, opp = me === 'w' ? 'b' : 'w';
  return attacked(s.board, s.board.indexOf(me + 'K'), opp);
}
function insufficient(s) {
  const rest = s.board.filter(p => p && p[1] !== 'K');
  return rest.length === 0 || (rest.length === 1 && (rest[0][1] === 'N' || rest[0][1] === 'B'));
}
function status(s) {
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? 'mate' : 'stalemate';
  if (insufficient(s) || s.half >= 100) return 'draw';
  return inCheck(s) ? 'check' : 'ok';
}
function perft(s, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of legal(s)) n += perft(apply(s, m), d - 1);
  return n;
}

/* ===== INTELLIGENCE ARTIFICIELLE ===== */
const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
function evalWhite(s) {
  let sc = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = s.board[sq];
    if (!p) continue;
    const t = p[1], f = sq & 7, r = sq >> 3, w = p[0] === 'w';
    const cen = (3.5 - Math.abs(f - 3.5)) + (3.5 - Math.abs(r - 3.5));
    let v = VAL[t];
    if (t === 'N' || t === 'B') v += cen * 5;
    else if (t === 'P') v += cen * 2 + (w ? r : 7 - r) * 6;
    else if (t === 'Q') v += cen * 1.5;
    else if (t === 'K' && (r === 0 || r === 7) && (f <= 2 || f >= 6)) v += 25;
    sc += w ? v : -v;
  }
  return sc;
}
function evalSide(s) { return s.turn === 'w' ? evalWhite(s) : -evalWhite(s); }
function orderScore(m, s) {
  let v = 0;
  if (m.cap) v += VAL[m.cap[1]] * 10 - VAL[s.board[m.from][1]];
  if (m.promo) v += 800;
  return v;
}
function qsearch(s, alpha, beta, qd, pre) {
  const stand = evalSide(s);
  if (qd === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const ms = (pre || legal(s)).filter(m => m.cap || m.promo);
  ms.sort((a, b) => orderScore(b, s) - orderScore(a, s));
  for (const m of ms) {
    const v = -qsearch(apply(s, m), -beta, -alpha, qd - 1);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function search(s, d, alpha, beta, ply, q) {
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? -90000 + ply : 0;
  if (d === 0) return q ? qsearch(s, alpha, beta, 3, ms) : evalSide(s);
  ms.sort((a, b) => orderScore(b, s) - orderScore(a, s));
  for (const m of ms) {
    const v = -search(apply(s, m), d - 1, -beta, -alpha, ply + 1, q);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
/* niveaux : beginner (au hasard), easy, medium, expert */
function chooseMove(s, diff) {
  const ms = legal(s);
  for (let i = ms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ms[i], ms[j]] = [ms[j], ms[i]]; }
  if (diff === 'beginner') {
    const caps = ms.filter(m => m.cap);
    if (caps.length && Math.random() < .2) return caps[0];
    return ms[0];
  }
  if (diff === 'easy') {
    if (Math.random() < .25) return ms[0];
    let best = null, bv = -Infinity;
    for (const m of ms) {
      const v = -evalSide(apply(s, m)) + (Math.random() - .5) * 700;
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }
  if (diff === 'medium') {
    let best = ms[0], bv = -Infinity;
    for (const m of ms) {
      const v = -search(apply(s, m), 1, -Infinity, Infinity, 1, false) + (Math.random() - .5) * 90;
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }
  ms.sort((a, b) => orderScore(b, s) - orderScore(a, s));
  let best = ms[0], alpha = -Infinity;
  for (const m of ms) {
    const v = -search(apply(s, m), 3, -Infinity, -alpha, 1, true);
    if (v > alpha) { alpha = v; best = m; }
  }
  return best;
}

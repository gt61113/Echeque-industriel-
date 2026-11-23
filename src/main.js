/* ===== PARTIE ===== */
const $ = id => document.getElementById(id);
const G = { mode: 'ai', diff: 'easy', player: 'w', sideOn: 'w', state: null, hist: [], log: [], busy: false, over: false, sel: -1, moves: [], last: null, check: false, thinking: false, gid: 0, inGame: false };
const other = c => c === 'w' ? 'b' : 'w';

function refreshHL() { selSq = G.sel; showHL(G); }
function updateHUD() {
  const t = G.state ? G.state.turn : 'w';
  $('dot').style.background = '#' + TEAM[t].main.toString(16).padStart(6, '0');
  let txt;
  if (G.thinking) txt = 'L’ordinateur réfléchit…';
  else if (G.mode === 'ai') txt = (t === G.player ? 'À toi de jouer' : 'L’ordinateur joue') + ' · ' + TEAM[t].name;
  else if (G.mode === 'online') txt = (t === G.player ? 'À toi de jouer' : 'Tour de l’adversaire') + ' · ' + TEAM[t].name;
  else txt = 'Tour des ' + TEAM[t].name;
  $('turnTxt').textContent = txt;
  $('chk').hidden = !G.check;
  $('btnUndo').hidden = G.mode === 'online';
  $('btnUndo').disabled = G.busy || G.thinking || G.hist.length === 0 || G.over;
  $('btnNew').hidden = G.mode === 'online';
  $('endAgain').hidden = G.mode === 'online';
  updateNet();
}
function setView(kind) {
  const base = (G.mode === 'local' ? G.state.turn : G.player) === 'w' ? 0 : Math.PI;
  cam.tTheta = base + Math.PI * 2 * Math.round((cam.tTheta - base) / (Math.PI * 2));
  cam.tx = 0; cam.tz = 0;
  if (kind === 'top') { cam.tPhi = .12; cam.tR = defaultR() * .95; }
  else { cam.tPhi = .95; cam.tR = defaultR(); }
}
function startGame(mode, opts) {
  AU.init(); AU.apply();
  if (mode !== 'online') netClose();
  G.mode = mode; G.gid++; G.state = newState(); G.hist = []; G.log = []; G.busy = false; G.over = false;
  G.sel = -1; G.moves = []; G.last = null; G.check = false; G.thinking = false; G.inGame = true;
  if (mode === 'online') G.player = opts.player;
  else if (mode === 'ai') G.player = G.sideAI;
  else G.player = 'w';
  syncPieces(G.state); menuSpin = false;
  $('menu').hidden = true; $('hud').hidden = false; $('panel').hidden = true; $('end').hidden = true; $('olModal').hidden = true;
  setView('player'); refreshHL(); updateHUD();
  if (mode === 'ai' && G.player === 'b') setTimeout(aiTurn, 900);
}
function showMenu() {
  G.gid++; G.busy = false; G.thinking = false; G.inGame = false;
  netClose();
  $('menu').hidden = false; $('hud').hidden = true; $('panel').hidden = true; $('end').hidden = true; $('olModal').hidden = true;
  clearPieces(); hl.clear(); syncPieces(newState()); menuSpin = true; cam.tPhi = .85; cam.tR = defaultR() * 1.05;
}
onTap = e => {
  if (!G.inGame || G.busy || G.over || G.thinking) return;
  if (G.mode !== 'local' && G.state.turn !== G.player) return;
  const sq = pickSquare(e); if (sq < 0) return;
  const mv = G.sel >= 0 && G.moves.find(m => m.to === sq);
  if (mv) { playMove(mv, false); return; }
  const p = G.state.board[sq];
  if (p && p[0] === G.state.turn) {
    G.sel = sq; G.moves = legal(G.state).filter(m => m.from === sq);
    AU.sfx('select');
  } else { G.sel = -1; G.moves = []; }
  refreshHL();
};
async function playMove(m, remote) {
  const gid = G.gid, before = G.state, mover = before.turn;
  G.busy = true; G.sel = -1; G.moves = []; G.hist.push({ s: before, last: G.last });
  G.log.push([m.from, m.to]);
  if (G.mode === 'online' && !remote) emitMove();
  refreshHL(); updateHUD();
  await animateMove(before, m);
  if (gid !== G.gid) return;
  G.state = apply(before, m); G.last = { from: m.from, to: m.to };
  if (m.promo) await promote(m, mover);
  if (gid !== G.gid) return;
  const st = status(G.state);
  G.check = st === 'check' || st === 'mate';
  G.busy = false; refreshHL(); updateHUD();
  if (st === 'mate' || st === 'stalemate' || st === 'draw') { endGame(st); return; }
  if (st === 'check') AU.sfx('check');
  if (G.mode === 'local' && settings.autoRot) setView('player');
  if (G.mode === 'ai' && G.state.turn !== G.player) aiTurn();
  if (G.mode === 'online') syncRemote();
}
function aiTurn() {
  const gid = G.gid;
  G.thinking = true; updateHUD();
  setTimeout(() => {
    if (gid !== G.gid) return;
    const m = chooseMove(G.state, G.diff);
    G.thinking = false;
    if (m) playMove(m, false);
  }, 450);
}
function endGame(st) {
  G.over = true; updateHUD();
  const loser = G.state.turn, winner = other(loser);
  let title, text;
  if (st === 'mate') {
    title = 'Échec et mat !';
    text = G.mode === 'local' ? 'Les ' + TEAM[winner].name + ' gagnent la partie.' : (winner === G.player ? 'Bravo, tu as gagné ! ' : 'Dommage, tu as perdu. ') + 'Les ' + TEAM[winner].name + ' l’emportent.';
  } else if (st === 'stalemate') { title = 'Pat'; text = 'Plus aucun coup possible : match nul.'; }
  else { title = 'Match nul'; text = 'Ni l’un ni l’autre ne peut plus gagner.'; }
  const humanWon = st === 'mate' && (G.mode === 'local' || winner === G.player);
  setTimeout(() => {
    if (st === 'mate') AU.sfx(humanWon ? 'win' : 'lose');
    $('endTitle').textContent = title; $('endText').textContent = text; $('end').hidden = false;
  }, 900);
}
function undo() {
  if (G.busy || G.thinking || !G.hist.length || G.over || G.mode === 'online') return;
  let h = G.hist.pop();
  if (G.mode === 'ai' && h.s.turn !== G.player && G.hist.length) h = G.hist.pop();
  G.gid++; G.state = h.s; G.last = h.last; G.sel = -1; G.moves = [];
  G.check = status(G.state) === 'check';
  syncPieces(G.state); refreshHL(); updateHUD(); AU.sfx('select');
  if (G.mode === 'ai' && G.state.turn !== G.player) aiTurn();
}

/* ===== EN LIGNE : connexion directe entre deux téléphones (capacité « room ») ===== */
let ROOM = null;
const NET = { room: null, code: '', role: '', hostColor: 'w', unsubs: [], timer: null, remoteLog: null, t0: 0 };
(async () => {
  try { ROOM = window.claude ? await window.claude.use('room') : null; } catch (e) { ROOM = null; }
  refreshOnlineUI();
})();
function refreshOnlineUI() {
  $('onCreate').disabled = $('onJoin').disabled = !ROOM;
  $('onNote').textContent = ROOM
    ? 'Chacun ouvre ce jeu sur son téléphone. Celui qui crée la partie donne le code à 4 caractères.'
    : 'Le mode en ligne n’est pas disponible ici. Ouvre le jeu depuis Claude, connecté à ton compte.';
}
function makeCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function showOl(title, code, text) {
  $('olTitle').textContent = title; $('olCode').textContent = code; $('olText').textContent = text; $('olModal').hidden = false;
}
async function netOpen(code) {
  netClose();
  const r = await ROOM.join('echecs-' + code.toLowerCase());
  NET.room = r; NET.code = code; NET.remoteLog = null; NET.t0 = Date.now();
  NET.unsubs = [
    r.on('hello', m => { if (m.sameTab || NET.role !== 'host') return; hostStart(); }),
    r.on('sync', m => { if (m.sameTab || NET.role !== 'guest') return; onSync(m.data); }),
    r.on('move', m => { if (m.sameTab) return; if (m.data && Array.isArray(m.data.log)) { NET.remoteLog = m.data.log; syncRemote(); } }),
    r.onPeers(() => updateNet())
  ];
  NET.timer = setInterval(netTick, 2500);
}
function netClose() {
  NET.unsubs.forEach(u => { try { u(); } catch (e) {} }); NET.unsubs = [];
  if (NET.timer) clearInterval(NET.timer); NET.timer = null;
  if (NET.room) { NET.room.leave().catch(() => {}); NET.room = null; }
  NET.role = ''; NET.remoteLog = null;
}
function hostStart() {
  if (!G.inGame || G.mode !== 'online') startGame('online', { player: NET.hostColor });
  NET.room.emit('sync', { hostColor: NET.hostColor, log: G.log }).catch(() => {});
}
function onSync(d) {
  if (!d || (d.hostColor !== 'w' && d.hostColor !== 'b')) return;
  if (!G.inGame || G.mode !== 'online') startGame('online', { player: other(d.hostColor) });
  if (Array.isArray(d.log) && d.log.length > G.log.length) { NET.remoteLog = d.log; syncRemote(); }
}
function emitMove() { if (NET.room) NET.room.emit('move', { log: G.log }).catch(() => {}); }
function netTick() {
  if (!NET.room) return;
  if (NET.role === 'guest' && !(G.inGame && G.mode === 'online')) {
    NET.room.emit('hello', {}).catch(() => {});
    if (Date.now() - NET.t0 > 8000) $('olText').textContent = 'Personne ne répond avec ce code. Vérifie le code, et que l’autre joueur a ouvert la partie.';
  }
  if (G.inGame && G.mode === 'online' && G.log.length && G.state.turn !== G.player && !G.busy) emitMove();
  updateNet();
}
function updateNet() {
  const el = $('net');
  if (G.mode !== 'online' || !G.inGame || !NET.room) { el.hidden = true; return; }
  const others = NET.room.peers().filter(p => !p.sameTab).length;
  el.hidden = false; el.textContent = others ? 'Adversaire connecté' : 'Adversaire absent…'; el.dataset.ok = others ? '1' : '0';
}
function syncRemote() {
  const L = NET.remoteLog;
  if (!L || G.mode !== 'online' || !G.inGame || G.busy || G.over) return;
  const mine = G.log;
  if (L.length <= mine.length) return;
  for (let i = 0; i < mine.length; i++) if (!L[i] || L[i][0] !== mine[i][0] || L[i][1] !== mine[i][1]) return;
  if (L.length === mine.length + 1) {
    const f = L[mine.length][0], t = L[mine.length][1];
    const m = G.state.turn !== G.player && legal(G.state).find(x => x.from === f && x.to === t);
    if (m) playMove(m, true);
  } else rebuildFromLog(L);
}
function rebuildFromLog(L) {
  let s = newState(), last = null; const hist = [];
  for (const mv of L) {
    const m = legal(s).find(x => x.from === mv[0] && x.to === mv[1]);
    if (!m) break;
    hist.push({ s, last }); s = apply(s, m); last = { from: m.from, to: m.to };
  }
  G.gid++; G.state = s; G.hist = hist; G.log = L.slice(0, hist.length); G.last = last; G.sel = -1; G.moves = []; G.busy = false;
  const st = status(s); G.check = st === 'check' || st === 'mate';
  syncPieces(s); refreshHL(); updateHUD();
  if (st === 'mate' || st === 'stalemate' || st === 'draw') endGame(st);
}
async function createOnline() {
  if (!ROOM) return;
  AU.init();
  const code = makeCode();
  try {
    await netOpen(code);
    NET.role = 'host'; NET.hostColor = G.sideOn;
    showOl('Partie créée', code, 'Donne ce code à ton adversaire. La partie démarre quand il rejoint. Tu joueras les ' + TEAM[G.sideOn].name + '.');
  } catch (e) { $('onNote').textContent = 'Impossible de créer la partie (' + (e && e.code ? e.code : 'erreur') + ').'; }
}
async function joinOnline() {
  if (!ROOM) return;
  const code = ($('onCode').value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { $('onNote').textContent = 'Entre le code à 4 caractères.'; return; }
  AU.init();
  try {
    await netOpen(code);
    NET.role = 'guest';
    showOl('Connexion…', code, 'Recherche de la partie…');
    NET.room.emit('hello', {}).catch(() => {});
  } catch (e) { $('onNote').textContent = 'Impossible de rejoindre (' + (e && e.code ? e.code : 'erreur') + ').'; }
}

/* ===== INTERFACE ===== */
const TOGGLES = [
  ['music', 'Musique', 'Ambiance d’atelier'],
  ['sfx', 'Bruitages', 'Chocs, étincelles et éclairs'],
  ['hints', 'Montrer les déplacements', 'Touche une pièce pour voir où elle peut aller'],
  ['autoRot', 'Caméra qui suit le joueur', 'À deux : la vue tourne à chaque tour']
];
function buildToggles(el) {
  el.innerHTML = '';
  for (const [k, l, d] of TOGGLES) {
    const row = document.createElement('label'); row.className = 'tg';
    row.innerHTML = '<span><b>' + l + '</b><small>' + d + '</small></span><input type="checkbox" data-k="' + k + '"><i></i>';
    const inp = row.querySelector('input'); inp.checked = !!settings[k];
    inp.addEventListener('change', () => { settings[k] = inp.checked; saveSettings(); syncToggles(); AU.apply(); if (G.inGame) refreshHL(); });
    el.appendChild(row);
  }
}
function syncToggles() { document.querySelectorAll('input[data-k]').forEach(i => { i.checked = !!settings[i.dataset.k]; }); }
buildToggles($('menuToggles')); buildToggles($('panelToggles'));

const SEGS = [
  ['sky', 'Ciel', 'three', [['day', 'Jour'], ['sunset', 'Coucher'], ['mist', 'Brume']], v => applySky(v)],
  ['fightLen', 'Durée des combats', 'three', [['short', 'Courts'], ['medium', 'Moyens'], ['long', 'Longs']], null]
];
function buildSegs(el) {
  el.innerHTML = '';
  for (const [k, l, cls, opts, cb] of SEGS) {
    const w = document.createElement('div'); w.className = 'segblock';
    w.innerHTML = '<span class="lbl">' + l + '</span><div class="seg ' + cls + '" data-sk="' + k + '">' + opts.map(([v, t]) => '<button type="button" data-v="' + v + '">' + t + '</button>').join('') + '</div>';
    w.querySelector('.seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      settings[k] = b.dataset.v; saveSettings(); syncSegs(); if (cb) cb(b.dataset.v);
    });
    el.appendChild(w);
  }
  syncSegs();
}
function syncSegs() { document.querySelectorAll('[data-sk]').forEach(s => s.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === settings[s.dataset.sk]))); }
buildSegs($('menuSegs')); buildSegs($('panelSegs'));

function seg(id, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset.v);
  });
}
G.sideAI = 'w';
seg('segDiff', v => { G.diff = v; });
seg('segSide', v => { G.sideAI = v; });
seg('segSideOn', v => { G.sideOn = v; });
$('playAI').addEventListener('click', () => startGame('ai'));
$('playLocal').addEventListener('click', () => startGame('local'));
$('onCreate').addEventListener('click', createOnline);
$('onJoin').addEventListener('click', joinOnline);
$('onCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('olCancel').addEventListener('click', () => { netClose(); $('olModal').hidden = true; });
$('btnGear').addEventListener('click', () => { $('panel').hidden = false; });
$('btnResume').addEventListener('click', () => { $('panel').hidden = true; });
$('btnNew').addEventListener('click', () => startGame(G.mode));
$('btnMenu').addEventListener('click', showMenu);
$('btnUndo').addEventListener('click', undo);
$('btnTop').addEventListener('click', () => setView('top'));
$('btnSide').addEventListener('click', () => setView('player'));
$('btnLow').addEventListener('click', () => { cam.tPhi = 1.38; });
$('endAgain').addEventListener('click', () => startGame(G.mode));
$('endMenu').addEventListener('click', showMenu);

/* ===== DÉMARRAGE ===== */
resize();
G.state = newState(); syncPieces(G.state);
cam.r = cam.tR = defaultR() * 1.05; cam.phi = cam.tPhi = .85;
refreshOnlineUI();
requestAnimationFrame(frame);

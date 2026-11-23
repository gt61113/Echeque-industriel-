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

/* ===== CONNEXION DIRECTE : navigateur à navigateur (WebRTC / PeerJS), avec passerelle internet de secours ===== */
const PEERJS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
const PEER_PREFIX = 'echecs-industriels-';
const RELAYS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'], RTOP = 'echecs-industriels/';
const NET = { peer: null, conn: null, code: '', role: '', hostColor: 'w', timer: null, remoteLog: null, t0: 0, gen: 0, via: null, rc: null, rcs: [], ri: 0, lastRx: 0, anyRelay: false, fbTimer: null };
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    let i = 0;
    const one = () => {
      if (i >= PEERJS.length) return rej(new Error('load'));
      const s = document.createElement('script'); s.src = PEERJS[i++];
      s.onload = () => window.Peer ? res() : one(); s.onerror = () => { s.remove(); one(); };
      document.head.appendChild(s);
    };
    one();
  });
}
/* petit client MQTT 3.1.1 (QoS 0) : sert de passerelle quand la liaison directe est impossible */
function mqttClient(url, onMsg) {
  const enc = new TextEncoder(), dec = new TextDecoder(); let ws;
  try { ws = new WebSocket(url, ['mqtt']); } catch (e) { ws = null; }
  const cl = { url, ok: false, dead: !ws, onopen: null, onclose: null };
  if (!ws) { setTimeout(() => cl.onclose && cl.onclose(false), 0); return cl; }
  ws.binaryType = 'arraybuffer'; let buf = new Uint8Array(0), ping = null;
  const cat = (...ps) => { let L = 0; for (const p of ps) L += p.length; const o = new Uint8Array(L); let i = 0; for (const p of ps) { o.set(p, i); i += p.length; } return o; };
  const s16 = s => { const b = enc.encode(s); return cat(new Uint8Array([b.length >> 8, b.length & 255]), b); };
  const pkt = (h, body) => { const len = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0); return cat(new Uint8Array([h]), new Uint8Array(len), body); };
  const send = b => { if (ws.readyState === 1) { try { ws.send(b); } catch (e) {} } };
  ws.onopen = () => send(pkt(0x10, cat(s16('MQTT'), new Uint8Array([4, 2, 0, 60]), s16('ech' + Math.random().toString(36).slice(2, 12)))));
  ws.onmessage = e => {
    buf = cat(buf, new Uint8Array(e.data));
    for (;;) {
      if (buf.length < 2) return;
      let mul = 1, len = 0, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
      if (buf.length < i + len) return;
      const type = buf[0] >> 4, qos = (buf[0] >> 1) & 3, body = buf.subarray(i, i + len); buf = buf.slice(i + len);
      if (type === 2) { if (body[1] === 0) { cl.ok = true; ping = setInterval(() => send(new Uint8Array([0xC0, 0])), 25000); if (cl.onopen) cl.onopen(); } else { try { ws.close(); } catch (x) {} } }
      else if (type === 3) { const tl = (body[0] << 8) | body[1]; let p = 2 + tl; if (qos) p += 2; try { onMsg(dec.decode(body.subarray(2, 2 + tl)), dec.decode(body.subarray(p)), cl); } catch (x) {} }
    }
  };
  ws.onclose = () => { clearInterval(ping); const was = cl.ok; cl.ok = false; cl.dead = true; if (cl.onclose) cl.onclose(was); };
  ws.onerror = () => {};
  cl.sub = t => send(pkt(0x82, cat(new Uint8Array([0, 1]), s16(t), new Uint8Array([0]))));
  cl.pub = (t, s) => { if (cl.ok) send(pkt(0x30, cat(s16(t), enc.encode(s)))); };
  cl.close = () => { cl.onclose = null; send(new Uint8Array([0xE0, 0])); try { ws.close(); } catch (e) {} };
  return cl;
}
const topicFor = side => RTOP + NET.code + '/' + side;
function refreshOnlineUI() {
  $('onCreate').disabled = $('onJoin').disabled = false;
  $('onNote').textContent = 'Chacun ouvre le jeu dans son navigateur. Celui qui crée la partie donne le code à 4 lettres. Liaison directe entre les deux appareils, ou passerelle internet si elle est impossible.';
}
function makeCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function showOl(title, code, text) {
  $('olTitle').textContent = title; $('olCode').textContent = code; $('olText').textContent = text; $('olModal').hidden = false;
}
function netSend(t, data) {
  if (NET.via === 'relay') { const cl = NET.rc; if (cl && cl.ok) cl.pub(topicFor(NET.role === 'host' ? 'g' : 'h'), JSON.stringify({ t, data })); return; }
  try { if (NET.conn && NET.conn.open) NET.conn.send({ t, data }); } catch (e) {}
}
function netUp() {
  if (NET.via === 'relay') return performance.now() - NET.lastRx < 10000;
  return !!(NET.conn && NET.conn.open);
}
function onNetMsg(m) {
  if (!m || typeof m !== 'object') return;
  NET.lastRx = performance.now();
  if (m.t === 'hello' && NET.role === 'host') hostStart();
  else if (m.t === 'sync' && NET.role === 'guest') onSync(m.data);
  else if (m.t === 'move' && m.data && Array.isArray(m.data.log)) { NET.remoteLog = m.data.log; syncRemote(); }
}
function relayIn(t, txt, cl) {
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  if (NET.role === 'host') {
    if (m && m.t === 'hello' && NET.via !== 'direct') { NET.via = 'relay'; NET.rc = cl; }
    else if (NET.via !== 'relay' || NET.rc !== cl) return;
  } else if (NET.role === 'guest') { if (NET.via !== 'relay' || NET.rc !== cl) return; }
  onNetMsg(m);
}
function hostRelays() {
  const g = NET.gen;
  for (const url of RELAYS) {
    const open = () => {
      if (NET.gen !== g || NET.role !== 'host') return;
      const cl = mqttClient(url, relayIn); NET.rcs.push(cl);
      cl.onopen = () => cl.sub(topicFor('h'));
      cl.onclose = () => { NET.rcs = NET.rcs.filter(x => x !== cl); if (NET.gen === g && NET.role === 'host') setTimeout(open, 4000); };
    };
    open();
  }
}
function guestRelay() {
  if (NET.role !== 'guest') return;
  const g = NET.gen;
  if (NET.rc) { NET.rc.close(); NET.rc = null; }
  if (NET.ri >= RELAYS.length) {
    NET.ri = 0;
    if (!G.inGame) $('olText').textContent = NET.anyRelay ? 'Aucune partie trouvée avec ce code. Vérifie le code, et que l’autre joueur a bien créé la partie.' : 'Impossible de joindre internet. Vérifie le Wi-Fi ou les données mobiles, puis réessaie.';
    return;
  }
  const cl = mqttClient(RELAYS[NET.ri], relayIn); NET.rc = cl; NET.via = 'relay'; NET.lastRx = 0;
  const fail = () => { if (NET.gen !== g || NET.rc !== cl || (G.inGame && G.mode === 'online')) return; NET.ri++; guestRelay(); };
  const tm = setTimeout(() => { if (NET.rc === cl && !netUp()) fail(); }, 7000);
  cl.onopen = () => {
    if (NET.gen !== g || NET.rc !== cl) return;
    NET.anyRelay = true; cl.sub(topicFor('g'));
    setTimeout(() => { if (NET.rc === cl) cl.pub(topicFor('h'), JSON.stringify({ t: 'hello', data: {} })); }, 300);
  };
  cl.onclose = () => { clearTimeout(tm); if (NET.gen !== g || NET.rc !== cl) return; if (G.inGame && G.mode === 'online') { NET.rc = null; return; } fail(); };
}
function guestFallback(msg) {
  if (NET.role !== 'guest' || NET.via === 'relay' || netUp()) return;
  $('olText').textContent = msg || 'Liaison directe impossible, passage par la passerelle internet…';
  NET.ri = 0; guestRelay();
}
function bindConn(c, gen) {
  c.on('open', () => {
    if (gen !== NET.gen || (NET.role === 'guest' && NET.via === 'relay')) { try { c.close(); } catch (e) {} return; }
    if (NET.conn && NET.conn !== c) { try { NET.conn.close(); } catch (e) {} }
    NET.conn = c;
    if (NET.role === 'guest') { NET.via = 'direct'; $('olText').textContent = 'Connecté, démarrage…'; netSend('hello', {}); }
    updateNet();
  });
  c.on('data', m => {
    if (NET.conn !== c) return;
    if (NET.role === 'host') { if (m && m.t === 'hello') NET.via = 'direct'; else if (NET.via !== 'direct') return; }
    onNetMsg(m);
  });
  c.on('close', () => { if (NET.conn === c) { NET.conn = null; updateNet(); } });
  c.on('error', () => {});
}
function netClose() {
  NET.gen++;
  if (NET.timer) clearInterval(NET.timer); NET.timer = null;
  if (NET.fbTimer) clearTimeout(NET.fbTimer); NET.fbTimer = null;
  try { if (NET.conn) NET.conn.close(); } catch (e) {}
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  try { if (NET.rc) NET.rc.close(); } catch (e) {}
  NET.rcs.forEach(c => { try { c.close(); } catch (e) {} });
  Object.assign(NET, { peer: null, conn: null, role: '', remoteLog: null, via: null, rc: null, rcs: [], ri: 0, lastRx: 0, anyRelay: false });
}
function hostStart() {
  if (!G.inGame || G.mode !== 'online') startGame('online', { player: NET.hostColor });
  netSend('sync', { hostColor: NET.hostColor, log: G.log });
}
function onSync(d) {
  if (!d || (d.hostColor !== 'w' && d.hostColor !== 'b')) return;
  if (!G.inGame || G.mode !== 'online') startGame('online', { player: other(d.hostColor) });
  if (Array.isArray(d.log) && d.log.length > G.log.length) { NET.remoteLog = d.log; syncRemote(); }
}
function emitMove() { netSend('move', { log: G.log }); }
function netTick() {
  if (!NET.role) return;
  const inG = G.inGame && G.mode === 'online';
  if (NET.role === 'guest') {
    if (NET.via !== 'relay' && !netUp() && NET.peer && NET.peer.open && !NET.peer.destroyed) guestConnect(NET.gen);
    else if (NET.via === 'relay' && NET.rc && NET.rc.ok && !inG) netSend('hello', {});
    else if (NET.via === 'direct' && netUp() && !inG) netSend('hello', {});
    if (!inG && Date.now() - NET.t0 > 25000 && !netUp()) $('olText').textContent = 'Personne ne répond avec ce code. Vérifie le code, et que l’autre joueur a bien créé la partie.';
  }
  if (NET.via === 'relay') netSend('ping', {});
  if (inG && G.log.length && G.state.turn !== G.player && !G.busy) emitMove();
  updateNet();
}
function updateNet() {
  const el = $('net');
  if (G.mode !== 'online' || !G.inGame || !NET.role) { el.hidden = true; return; }
  const ok = netUp();
  el.hidden = false; el.textContent = ok ? 'Adversaire connecté' : 'Adversaire absent…'; el.dataset.ok = ok ? '1' : '0';
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
async function netStart(role, code) {
  AU.init(); netClose(); const gen = NET.gen;
  NET.role = role; NET.code = code; NET.remoteLog = null; NET.t0 = Date.now();
  NET.timer = setInterval(netTick, 2500);
  if (role === 'host') hostRelays();
  else NET.fbTimer = setTimeout(() => { if (gen === NET.gen) guestFallback(); }, 7000);
  try { await loadPeer(); } catch (e) {
    if (role === 'guest') guestFallback('Liaison directe indisponible, passage par la passerelle internet…');
    return true;
  }
  if (gen !== NET.gen) return false;
  return new Promise(res => {
    const peer = role === 'host' ? new Peer(PEER_PREFIX + code, { debug: 0 }) : new Peer({ debug: 0 });
    NET.peer = peer;
    const done = setTimeout(() => res(true), role === 'host' ? 6000 : 0);
    peer.on('open', () => {
      if (gen !== NET.gen) return;
      if (role === 'guest') guestConnect(gen);
      clearTimeout(done); res(true);
    });
    peer.on('connection', c => { if (role === 'host' && gen === NET.gen) bindConn(c, gen); });
    peer.on('disconnected', () => { if (gen === NET.gen && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
    peer.on('error', e => {
      if (gen !== NET.gen) return;
      if (e.type === 'unavailable-id' && role === 'host') { clearTimeout(done); res(false); createOnline(); return; }
      if (role === 'guest' && ['peer-unavailable', 'network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(e.type)) guestFallback(e.type === 'peer-unavailable' ? 'Code inconnu en liaison directe, vérification par la passerelle internet…' : null);
    });
  });
}
function guestConnect(gen) {
  const p = NET.peer; if (!p || p.destroyed || !p.open || gen !== NET.gen || NET.via === 'relay') return;
  const c = p.connect(PEER_PREFIX + NET.code, { reliable: true, serialization: 'json' });
  if (c) bindConn(c, gen);
}
async function createOnline() {
  const code = makeCode();
  NET.hostColor = G.sideOn;
  showOl('Partie créée', code, 'Donne ce code à ton adversaire. La partie démarre quand il rejoint. Tu joueras les ' + TEAM[G.sideOn].name + '.');
  const ok = await netStart('host', code);
  if (ok) { $('olCode').textContent = code; }
}
async function joinOnline() {
  const code = ($('onCode').value || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $('onNote').textContent = 'Entre le code à 4 lettres.'; return; }
  showOl('Connexion…', code, 'Connexion directe en cours…');
  await netStart('guest', code);
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
$('onCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
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

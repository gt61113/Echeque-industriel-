/* ===== ANIMATIONS ===== */
const tweens = [];
const easeIO = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function tween(ms, fn, ease = easeIO) { return new Promise(res => { tweens.push({ t0: performance.now(), ms, fn, ease, res }); }); }
const wait = ms => tween(ms, () => {}, k => k);
const lerp = (a, b, k) => a + (b - a) * k;

const parts = [];
const sparkGeo = new THREE.SphereGeometry(.05, 6, 6), steamGeo = new THREE.SphereGeometry(.2, 8, 8);
function sparks(pos, n, color, spd = 3.5) {
  for (let i = 0; i < n; i++) {
    const m = noRay(new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color })));
    m.position.copy(pos);
    const v = new THREE.Vector3(Math.random() - .5, Math.random() * 1.1 + .3, Math.random() - .5).normalize().multiplyScalar(spd * (.4 + Math.random() * .8));
    scene.add(m); parts.push({ m, v, life: 0, max: .5 + Math.random() * .4, kind: 's' });
  }
}
function steam(pos, n) {
  for (let i = 0; i < n; i++) {
    const m = noRay(new THREE.Mesh(steamGeo, new THREE.MeshBasicMaterial({ color: 0xdfe6ea, transparent: true, opacity: .5, depthWrite: false })));
    m.position.set(pos.x + (Math.random() - .5) * .3, pos.y, pos.z + (Math.random() - .5) * .3);
    m.scale.setScalar(.5);
    scene.add(m); parts.push({ m, v: new THREE.Vector3((Math.random() - .5) * .4, .7 + Math.random() * .6, (Math.random() - .5) * .4), life: 0, max: 1 + Math.random() * .8, kind: 'v' });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt;
    const k = p.life / p.max;
    if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); continue; }
    if (p.kind === 's') { p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(1 - k * .8); }
    else { p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(.5 + k * 2.2); p.m.material.opacity = .5 * (1 - k); }
  }
}
async function arcs(a, b, color) {
  for (let n = 0; n < 4; n++) {
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const p = a.clone().lerp(b, i / 9);
      if (i && i < 9) p.add(new THREE.Vector3((Math.random() - .5) * .4, (Math.random() - .5) * .4, (Math.random() - .5) * .4));
      pts.push(p);
    }
    const l = noRay(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
    scene.add(l); await wait(55); scene.remove(l); l.geometry.dispose(); l.material.dispose();
  }
}
let shake = 0;
function flash(pos, color) {
  flashLight.position.copy(pos); flashLight.color.setHex(color);
  tween(260, k => { flashLight.intensity = 4 * (1 - k); }, k => k);
}
function emis(root, color, v) { root.traverse(o => { if (o.isMesh && o.material.emissive && !o.userData.keepEmis) { if (o.userData.e0 === undefined) { o.userData.e0 = o.material.emissive.getHex(); o.userData.i0 = o.material.emissiveIntensity; } o.material.emissive.setHex(v > 0 ? color : o.userData.e0); o.material.emissiveIntensity = v > 0 ? v : o.userData.i0; } }); }

/* pièces sur le plateau */
const pieceAt = new Map();
const sp = sq => ({ x: (sq & 7) - 3.5, z: 3.5 - (sq >> 3) });
const faceDefault = c => c === 'w' ? Math.PI : 0;
function place(root, sq) { const p = sp(sq); root.position.set(p.x, 0, p.z); root.userData.sq = sq; }
function clearPieces() { for (const r of pieceAt.values()) scene.remove(r); pieceAt.clear(); }
function syncPieces(state) {
  clearPieces();
  state.board.forEach((p, sq) => {
    if (!p) return;
    const r = buildPiece(p[1], p[0]); r.rotation.y = faceDefault(p[0]); place(r, sq);
    scene.add(r); pieceAt.set(sq, r);
  });
}
function turnTo(root, target, ms) {
  const a = root.rotation.y, d = (((target - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return tween(ms, k => { root.rotation.y = a + d * k; });
}
function hop(root, A, B, h, ms) {
  return tween(ms, k => { root.position.x = lerp(A.x, B.x, k); root.position.z = lerp(A.z, B.z, k); root.position.y = Math.sin(k * Math.PI) * h; }).then(() => { root.position.set(B.x, 0, B.z); });
}
/* ===== COMBATS : style selon la pièce, puis au hasard ===== */
const FX = { skip: false, active: false };
const fightScale = () => ({ short: 1, medium: 1.8, long: 3 }[settings.fightLen] || 1.8);
function ft(ms, fn, ease) { const p = tween(ms * fightScale(), fn, ease); tweens[tweens.length - 1].fight = true; return p; }
const pause = ms => ft(ms, () => {}, k => k);
const rnd1 = a => a[Math.floor(Math.random() * a.length)];
window.addEventListener('pointerdown', () => { if (FX.active) FX.skip = true; });
function ring(x, z, color, size) {
  const m = noRay(new THREE.Mesh(new THREE.RingGeometry(.3, .45, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .15, z); scene.add(m);
  tween(650, k => { m.scale.setScalar(1 + k * size); m.material.opacity = .9 * (1 - k); }, k => k).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
}
function skyBolt(vp, color) {
  const ls = [];
  for (let n = 0; n < 3; n++) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const e = i && i < 10 ? .9 : 0; pts.push(new THREE.Vector3(vp.x + (Math.random() - .5) * e + n * .03, 10 - i * (10 - vp.y) / 10, vp.z + (Math.random() - .5) * e)); }
    const l = noRay(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }))); scene.add(l); ls.push(l);
  }
  wait(260).then(() => ls.forEach(l => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); }));
}
function proj(mk, from, to, ms, spin) {
  const m = noRay(mk()); m.position.copy(from); scene.add(m);
  return ft(ms, k => { m.position.lerpVectors(from, to, k); m.position.y += Math.sin(k * Math.PI) * .5; if (spin) { m.rotation.x = k * 18; m.rotation.z = k * 9; } }, k => k).then(() => { scene.remove(m); });
}
async function fight(root, c, V, dir, victim) {
  FX.active = true; FX.skip = false;
  const hint = document.getElementById('skipHint'); if (hint) hint.hidden = false;
  const u = root.userData, vu = victim.userData, t = u.type, arm = u.armR, inner = u.inner, vin = vu.inner;
  const a0 = arm ? arm.rotation.x : 0, ry = root.rotation.y;
  u.busy = vu.busy = true;
  const vp = new THREE.Vector3(V.x, .6, V.z), me = () => new THREE.Vector3(root.position.x, .9, root.position.z);
  const elec = c === 'b', col = elec ? 0x9fe8ff : 0xffc21a;
  const hit = (pw = 1) => {
    shake = .35 * pw;
    if (elec) { AU.sfx('zap'); flash(vp, 0x9fe8ff); sparks(vp, Math.round(26 * pw), 0x9fe8ff, 4.5); }
    else { AU.sfx('clang'); flash(vp, 0xffd27a); sparks(vp, Math.round(28 * pw), 0xffc21a, 4.5); }
    emis(victim, 0xffffff, 1.4);
  };
  const raise = (k, to) => { if (arm) arm.rotation.x = lerp(a0, to, k); inner.rotation.x = -.15 * k; inner.position.z = arm ? 0 : -.1 * k; };
  const smash = async () => {
    AU.sfx('whoosh');
    await ft(340, k => raise(k, -2.7));
    await ft(150, k => { if (arm) arm.rotation.x = lerp(-2.7, -.9, k); inner.rotation.x = lerp(-.15, .22, k); inner.position.z = arm ? 0 : lerp(-.1, .3, k); });
    hit(1); await pause(220);
  };
  const jabs = async () => {
    for (let n = 0; n < 3; n++) {
      AU.sfx('whoosh');
      await ft(110, k => { if (arm) arm.rotation.x = lerp(a0, -1.5, k); inner.position.z = arm ? 0 : .32 * k; inner.rotation.x = .12 * k; });
      hit(n === 2 ? 1.2 : .45);
      await ft(120, k => { if (arm) arm.rotation.x = lerp(-1.5, a0, k); inner.position.z = arm ? 0 : .32 * (1 - k); inner.rotation.x = .12 * (1 - k); });
    }
    await pause(120);
  };
  const jumpSlam = async () => {
    AU.sfx('whoosh');
    await ft(380, k => { root.position.y = Math.sin(k * Math.PI / 2) * 1.7; if (arm) arm.rotation.x = lerp(a0, -2.8, k); inner.rotation.x = -.2 * k; }, k => k);
    await pause(120);
    const sx = root.position.x, sz = root.position.z;
    await ft(150, k => { root.position.y = 1.7 * (1 - k * k); root.position.x = sx + dir.x * .3 * k; root.position.z = sz + dir.z * .3 * k; inner.rotation.x = lerp(-.2, .3, k); }, k => k);
    hit(1.5); ring(V.x, V.z, col, 5); await pause(240);
  };
  const spin = async () => {
    AU.sfx('whoosh');
    await ft(700, k => { root.rotation.y = ry + k * Math.PI * 4; if (arm) arm.rotation.x = lerp(a0, -1.55, Math.min(1, k * 4)); inner.rotation.x = .1 * k; }, k => k * k);
    hit(1.3); await pause(220);
  };
  const ram = async () => {
    const sx = root.position.x, sz = root.position.z;
    await ft(320, k => { root.position.x = sx - dir.x * .35 * k; root.position.z = sz - dir.z * .35 * k; inner.rotation.x = -.3 * k; });
    AU.sfx('whoosh');
    await ft(130, k => { root.position.x = lerp(sx - dir.x * .35, sx + dir.x * .45, k); root.position.z = lerp(sz - dir.z * .35, sz + dir.z * .45, k); inner.rotation.x = lerp(-.3, .35, k); }, k => k);
    hit(1.5); await pause(200);
  };
  const bolt = async () => {
    AU.sfx('charge'); emis(root, 0x66ccff, 1.1);
    await ft(560, k => { if (arm) arm.rotation.x = lerp(a0, -2.9, k); inner.rotation.x = -.1 * k; shake = .05 * k; });
    skyBolt(vp, 0xdff8ff); AU.sfx('thunder'); hit(1.8); ring(V.x, V.z, 0x9fe8ff, 4); emis(root, 0, 0);
    await pause(300);
  };
  const orb = async () => {
    AU.sfx('charge'); emis(root, 0x66ccff, .9);
    const o = noRay(new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xbff3ff }))); scene.add(o);
    await ft(520, k => { const p = me(); o.position.set(p.x, 1.3 + k * .2, p.z); o.scale.setScalar(.3 + k * 1.4); if (arm) arm.rotation.x = lerp(a0, -2.4, k); });
    scene.remove(o); emis(root, 0, 0); AU.sfx('whoosh');
    await proj(() => new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 12), new THREE.MeshBasicMaterial({ color: 0xbff3ff })), new THREE.Vector3(root.position.x, 1.4, root.position.z), vp, 380, false);
    hit(1.4); ring(V.x, V.z, 0x9fe8ff, 3); await pause(200);
  };
  const toss = async () => {
    AU.sfx('whoosh');
    await ft(300, k => { if (arm) arm.rotation.x = lerp(a0, -2.6, k); inner.rotation.x = -.15 * k; });
    ft(150, k => { if (arm) arm.rotation.x = lerp(-2.6, -.6, k); inner.rotation.x = lerp(-.15, .2, k); });
    await proj(() => new THREE.Mesh(new THREE.BoxGeometry(.45, .12, .12), new THREE.MeshBasicMaterial({ color: 0xc9d1d8 })), new THREE.Vector3(root.position.x, 1.2, root.position.z), vp, 420, true);
    hit(1.4); await pause(200);
  };
  const special = () => elec ? rnd1([bolt, orb]) : rnd1([toss, jumpSlam]);
  const POOL = {
    P: [smash, jabs, jumpSlam], B: [smash, spin, special], Q: [spin, special, jabs],
    K: [jumpSlam, special, smash, spin], R: [ram, jumpSlam, smash], N: [smash, jumpSlam, ram, spin]
  };
  await rnd1(POOL[t] || [smash])();
  /* défaite au hasard */
  const resetAtk = ft(380, k => { if (arm) arm.rotation.x = lerp(arm.rotation.x, a0, k); inner.rotation.x *= 1 - k; inner.position.z *= 1 - k; root.position.y *= 1 - k; });
  AU.sfx('boom'); steam(new THREE.Vector3(V.x, .4, V.z), 7);
  const side = rnd1([-1, 1]) * (Math.random() * .8), dx = dir.x * Math.cos(side) - dir.z * Math.sin(side), dz = dir.x * Math.sin(side) + dir.z * Math.cos(side);
  const style = rnd1(['fly', 'launch', 'squash', 'dizzy']);
  const calm = () => emis(victim, 0xffffff, 0);
  let defeat;
  if (style === 'fly') defeat = ft(800, k => {
    victim.position.x = V.x + dx * k * 1.8; victim.position.z = V.z + dz * k * 1.8; victim.position.y = Math.sin(k * Math.PI) * 1.8;
    vin.rotation.z = k * 9; vin.rotation.x = k * 5; victim.scale.setScalar(1 - k * .95); if (k > .15) calm();
  }, k => k);
  else if (style === 'launch') { AU.sfx('pop'); defeat = ft(1000, k => {
    victim.position.y = 9 * k * k; victim.position.x = V.x + dx * k * .6; victim.position.z = V.z + dz * k * .6;
    vin.rotation.y = k * 20; victim.scale.setScalar(1 - k * .7); if (k > .1) calm();
  }, k => k); }
  else if (style === 'squash') defeat = (async () => {
    AU.sfx('squash'); calm();
    await ft(260, k => { vin.scale.y = 1 - k * .88; vin.scale.x = vin.scale.z = 1 + k * .6; });
    sparks(new THREE.Vector3(V.x, .2, V.z), 14, col, 3.5);
    await pause(380);
    await ft(420, k => { victim.scale.setScalar(1 - k); victim.rotation.y += .3; });
  })();
  else defeat = (async () => {
    calm();
    await ft(900, k => { vin.rotation.z = Math.sin(k * 26) * .35 * (1 - k * .4); vin.rotation.x = Math.cos(k * 19) * .18; victim.rotation.y += .25; if (k > .3 && Math.random() < .12) sparks(new THREE.Vector3(V.x, 1.2, V.z), 2, 0xffee88, 1.6); });
    await ft(450, k => { victim.scale.setScalar(1 - k); victim.position.y = -k * .4; });
  })();
  await Promise.all([resetAtk, defeat]);
  sparks(new THREE.Vector3(victim.position.x, .3, victim.position.z), 10, 0xffa040, 3);
  scene.remove(victim);
  if (arm) arm.rotation.x = a0;
  inner.rotation.x = 0; inner.position.z = 0; root.position.y = 0; root.rotation.y = ry; emis(root, 0, 0); u.busy = false;
  FX.active = false; FX.skip = false; if (hint) hint.hidden = true;
}
async function animateMove(s, m) {
  const root = pieceAt.get(m.from), p = s.board[m.from], c = p[0], t = p[1];
  const A = sp(m.from), B = sp(m.to);
  const victim = m.cap ? pieceAt.get(m.capSq) : null;
  const face = Math.atan2(B.x - A.x, B.z - A.z);
  await turnTo(root, face, 170);
  if (victim) {
    const V = sp(m.capSq), dist = Math.hypot(V.x - A.x, V.z - A.z);
    const dir = { x: (V.x - A.x) / dist, z: (V.z - A.z) / dist }, stop = Math.max(0, dist - .85);
    const P = { x: A.x + dir.x * stop, z: A.z + dir.z * stop };
    if (stop > .05) await hop(root, A, P, .2, 300);
    await fight(root, c, V, dir, victim);
    await hop(root, P, B, .22, 260); AU.sfx('move');
    pieceAt.delete(m.capSq);
  } else {
    const ms = t === 'N' ? 560 : 120 + Math.hypot(B.x - A.x, B.z - A.z) * 150;
    await hop(root, A, B, t === 'N' ? .95 : .32, ms); AU.sfx('move');
    steam(new THREE.Vector3(B.x, .1, B.z), 2);
  }
  if (m.flag === 'castleK' || m.flag === 'castleQ') {
    const rf = m.flag === 'castleK' ? m.from + 3 : m.from - 4, rt = m.flag === 'castleK' ? m.from + 1 : m.from - 1;
    const rr = pieceAt.get(rf);
    await hop(rr, sp(rf), sp(rt), .5, 380); AU.sfx('move');
    pieceAt.delete(rf); pieceAt.set(rt, rr); place(rr, rt);
  }
  pieceAt.delete(m.from); pieceAt.set(m.to, root); place(root, m.to);
  await turnTo(root, faceDefault(c), 160);
}
async function promote(m, c) {
  const old = pieceAt.get(m.to), p = sp(m.to);
  scene.remove(old);
  const q = buildPiece('Q', c); q.rotation.y = faceDefault(c); place(q, m.to); scene.add(q); pieceAt.set(m.to, q);
  AU.sfx('pop'); sparks(new THREE.Vector3(p.x, .6, p.z), 24, c === 'w' ? 0xffc21a : 0x9fe8ff, 4);
  await tween(450, k => { q.scale.setScalar(.3 + .7 * Math.min(1, k * 1.3) + Math.sin(k * Math.PI) * .25); });
  q.scale.setScalar(1);
}

/* surbrillances */
const hl = new THREE.Group(); scene.add(hl);
const hlMat = {
  sel: new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: .9 }),
  dot: new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: .85 }),
  cap: new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: .95 }),
  last: new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: .28 }),
  chk: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: .5 })
};
function hlAdd(g, m, sq, y, rx) { const o = noRay(new THREE.Mesh(g, m)); const p = sp(sq); o.position.set(p.x, y, p.z); if (rx) o.rotation.x = -Math.PI / 2; hl.add(o); return o; }
function showHL(G) {
  hl.clear();
  if (!G.state) return;
  if (G.last) [G.last.from, G.last.to].forEach(s => hlAdd(geo('Plane', .96, .96), hlMat.last, s, .012, true));
  if (G.check) hlAdd(geo('Plane', .96, .96), hlMat.chk, G.state.board.indexOf(G.state.turn + 'K'), .013, true);
  if (G.sel >= 0) {
    hlAdd(geo('Ring', .38, .47, 32), hlMat.sel, G.sel, .02, true);
    if (settings.hints) for (const m of G.moves) {
      if (m.cap) hlAdd(geo('Ring', .4, .49, 32), hlMat.cap, m.to, .02, true);
      else hlAdd(geo('Circle', .16, 20), hlMat.dot, m.to, .02, true);
    }
  }
}

/* ===== CAMÉRA LIBRE ===== */
const cam = { theta: 0, phi: .95, r: 13, tTheta: 0, tPhi: .95, tR: 13, x: 0, z: 0, tx: 0, tz: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function defaultR() { return cv.clientWidth / Math.max(1, cv.clientHeight) < .8 ? 17 : 12.5; }
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
function updateCam(dt) {
  const k = Math.min(1, dt * 7);
  cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k;
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const j = shake > .01 ? shake : 0;
  camera.position.set(
    cam.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta) + (Math.random() - .5) * j,
    cam.r * Math.cos(cam.phi) + (Math.random() - .5) * j,
    cam.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta) + (Math.random() - .5) * j);
  camera.lookAt(cam.x, .3, cam.z);
  shake = Math.max(0, shake - dt * 1.4);
}
const ptrs = new Map(); let moved = 0, pinch0 = 0, r0 = 0, lastMid = { x: 0, y: 0 };
function midPoint() { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
let onTap = () => {};
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) moved = 0;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = cam.tR; moved = 99; lastMid = midPoint(); }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 8) { cam.tTheta -= dx * .008; cam.tPhi = clamp(cam.tPhi - dy * .006, .1, 1.5); } }
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    cam.tR = clamp(r0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 6, 26);
    const mid = midPoint(), mx = mid.x - lastMid.x, my = mid.y - lastMid.y; lastMid = mid;
    const k = cam.r * .0013, th = cam.theta;
    cam.tx = clamp(cam.tx - Math.cos(th) * mx * k + (-Math.sin(th)) * my * k, -7, 7);
    cam.tz = clamp(cam.tz + Math.sin(th) * mx * k + (-Math.cos(th)) * my * k, -7, 7);
  }
});
const ptrUp = e => {
  if (!ptrs.has(e.pointerId)) return;
  const single = ptrs.size === 1; ptrs.delete(e.pointerId);
  if (single && moved <= 8 && e.type === 'pointerup') onTap(e);
};
cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('wheel', e => { e.preventDefault(); cam.tR = clamp(cam.tR * Math.exp(e.deltaY * .001), 6, 26); }, { passive: false });

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pickSquare(e) {
  const r = cv.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(tiles.concat([...pieceAt.values()]), true);
  for (const h of hits) { let o = h.object; while (o) { if (o.userData.sq !== undefined) return o.userData.sq; o = o.parent; } }
  return -1;
}

/* ===== BOUCLE ===== */
let lastT = performance.now(), ventT = 0, menuSpin = true, selSq = -1;
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i], k = (FX.skip && t.fight) ? 1 : Math.min(1, (now - t.t0) / t.ms);
    t.fn(t.ease(k));
    if (k >= 1) { tweens.splice(i, 1); t.res(); }
  }
  updateParts(dt);
  gears.forEach(g => { g.g.rotation.y += g.sp * dt; });
  ventT += dt; if (ventT > 3.5) { ventT = 0; vents.forEach(v => steam(v, 3)); }
  const tt = now / 1000;
  pieceAt.forEach((r, sq) => {
    const u = r.userData, i = u.inner;
    if (u.lamps) { const lp = .85 + Math.sin(tt * 3 + u.phase) * .15; u.lamps.forEach(l => { l.sp.material.opacity = lp; l.beam.material.opacity = .12 + lp * .08; }); }
    if (u.busy) return;
    i.scale.y = 1 + Math.sin(tt * 2.2 + u.phase) * .018;
    if (i.rotation.x === 0 || Math.abs(i.rotation.x) < .001) i.rotation.z = Math.sin(tt * 1.4 + u.phase) * .03;
    if (u.armL) u.armL.rotation.x = Math.sin(tt * 1.8 + u.phase) * .12;
    if (u.head) u.head.rotation.y = Math.sin(tt * .8 + u.phase) * .25;
    i.position.y = (sq === selSq && r.position.y < .01) ? Math.abs(Math.sin(tt * 6)) * .1 : 0;
  });
  if (menuSpin) cam.tTheta += dt * .12;
  updateCam(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

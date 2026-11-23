/* ===== SCÈNE 3D ===== */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const cv = renderer.domElement;
cv.style.touchAction = 'none'; cv.style.display = 'block';
stage.appendChild(cv);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3ef);
scene.fog = new THREE.Fog(0xcfe4f6, 32, 120);
const camera = new THREE.PerspectiveCamera(45, 1, .1, 120);

const hemi = new THREE.HemisphereLight(0xe6f2ff, 0xa9b6c2, .95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4de, 1.05);
sun.position.set(6, 13, 7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -.0004;
scene.add(sun);
const warm = new THREE.PointLight(0xff8a2a, 0, 30); warm.position.set(-8, 3, -6); scene.add(warm);
const flashLight = new THREE.PointLight(0xffffff, 0, 8); scene.add(flashLight);

/* petits utilitaires */
const geoCache = {};
function geo(name, ...a) { const k = name + a.join(','); return geoCache[k] || (geoCache[k] = new THREE[name + 'Geometry'](...a)); }
function mat(color, o) { const p = Object.assign({ color, roughness: .8, metalness: .1 }, o || {}); p.metalness = Math.min(p.metalness, .2); p.roughness = Math.max(p.roughness, .8); return new THREE.MeshStandardMaterial(p); }
function mesh(g, m, shadow = true) { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; }
const noRay = o => { o.raycast = () => {}; return o; };

/* textures poussiéreuses et mates (pas de reflets) */
function dusty(base, grime, rivet) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = Math.random() < .45 ? `rgba(255,255,255,${Math.random() * .07})` : `rgba(${grime},${Math.random() * .1})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 20 + Math.random() * 55, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${grime},.12)`); gr.addColorStop(1, `rgba(${grime},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 1;
  for (let i = 0; i < 8; i++) { const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 70, y + (Math.random() - .5) * 70); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 252);
  g.fillStyle = `rgba(${rivet},.45)`;
  [[22, 22], [234, 22], [22, 234], [234, 234]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
function stripes() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffb800'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#16191c';
  for (let i = -128; i < 256; i += 64) { g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 32, 128); g.lineTo(i + 160, 0); g.lineTo(i + 128, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* plateau */
const tiles = [];
const board3d = new THREE.Group(); scene.add(board3d);
{
  const light = mat(0xffffff, { map: dusty('#d2ccbf', '95,80,60', '60,50,40'), metalness: 0, roughness: 1 });
  const dark = mat(0xffffff, { map: dusty('#5d6368', '30,25,20', '20,20,20'), metalness: 0, roughness: 1 });
  for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7, r = sq >> 3;
    const t = mesh(geo('Box', 1, .2, 1), (f + r) % 2 ? light : dark, false);
    t.receiveShadow = true;
    t.position.set(f - 3.5, -.1, 3.5 - r); t.userData.sq = sq;
    board3d.add(t); tiles.push(t);
  }
  const plinth = mesh(geo('Box', 9.8, .5, 9.8), mat(0x3a4046, { metalness: 0, roughness: 1 })); plinth.position.y = -.45; board3d.add(plinth);
  const st = stripes(), steel = mat(0x3d454c, { metalness: 0, roughness: 1 });
  [[0, 4.275, 9.1], [0, -4.275, 9.1], [4.275, 0, 8], [-4.275, 0, 8]].forEach(([x, z, len], i) => {
    const t = st.clone(); t.needsUpdate = true; t.repeat.set(len / 1.1, 1);
    const side = i < 2;
    const m = mat(0xffffff, { map: t, roughness: 1, metalness: 0 });
    const box = mesh(geo('Box', side ? len : .55, .26, side ? .55 : len), [steel, steel, m, steel, steel, steel].map((q, j) => j === 2 ? m : q));
    box.position.set(x, -.07, z); board3d.add(box);
  });
  const rv = mat(0x8d949a, { metalness: 0, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const p = -4.1 + i;
    [[p, 4.275], [p, -4.275]].forEach(([x, z]) => { const r = mesh(geo('Cylinder', .05, .05, .04, 8), rv, false); r.position.set(x, .07, z); board3d.add(r); });
    if (i > 0 && i < 8) [[4.275, p], [-4.275, p]].forEach(([x, z]) => { const r = mesh(geo('Cylinder', .05, .05, .04, 8), rv, false); r.position.set(x, .07, z); board3d.add(r); });
  }
}
/* le plateau flotte : dessous en métal poussiéreux */
{
  const body = mesh(geo('Cylinder', 5.2, 1.6, 2.4, 12), mat(0x4b5258, { roughness: 1, metalness: 0 }));
  body.position.y = -1.9; board3d.add(body);
  const band = mesh(geo('Torus', 5.2, .12, 6, 28), mat(0xffb800, { roughness: 1, metalness: 0 })); band.rotation.x = Math.PI / 2; band.position.y = -.75; board3d.add(band);
  const tip = mesh(geo('Cylinder', 1.2, .6, .9, 10), mat(0x3a4046, { roughness: 1, metalness: 0 })); tip.position.y = -3.5; board3d.add(tip);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, r = mesh(geo('Cylinder', .09, .09, 2.2, 8), mat(0x6b737a, { roughness: 1, metalness: 0 })); r.position.set(Math.cos(a) * 3.1, -1.9, Math.sin(a) * 3.1); r.rotation.set(Math.sin(a) * .35, 0, -Math.cos(a) * .35); board3d.add(r); }
}
/* engrenages, tuyaux, câbles */
const gears = [];
function gearModel(r, teeth, th, color) {
  const g = new THREE.Group(), m = mat(color, { metalness: 0, roughness: 1 });
  g.add(mesh(geo('Cylinder', r, r, th, 32), m));
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * Math.PI * 2, t = mesh(geo('Box', r * .3, th, r * .3), m);
    t.position.set(Math.cos(a) * r * 1.08, 0, Math.sin(a) * r * 1.08); t.rotation.y = -a; g.add(t);
  }
  const hole = mesh(geo('Cylinder', r * .35, r * .35, th * 1.05, 20), mat(0x0d0f11), false); g.add(hole);
  return g;
}
[[-7.4, -7.4, 1.9, 14, 0x59626b, .25], [7.4, -7.2, 1.3, 10, 0x8a6a1a, -.4], [-7.2, 7.4, 1.4, 11, 0x8a6a1a, -.35], [7.6, 7.4, 2, 15, 0x59626b, .22]].forEach(([x, z, r, n, c, sp]) => {
  const g = gearModel(r, n, .4, c); g.position.set(x, -1.2, z); scene.add(g); gears.push({ g, sp });
});
const vents = [];
[[-4.3, -4.3], [4.3, -4.3]].forEach(([x, z]) => {
  const p = mesh(geo('Cylinder', .13, .16, .55, 12), mat(0x59626b, { roughness: 1, metalness: 0 })); p.position.set(x, .3, z); scene.add(p);
  const cap = mesh(geo('Torus', .14, .035, 6, 14), mat(0xffb800, { roughness: 1, metalness: 0 })); cap.rotation.x = Math.PI / 2; cap.position.set(x, .58, z); scene.add(cap);
  vents.push(new THREE.Vector3(x, .65, z));
});

/* ===== CIELS (choix au début de la partie) ===== */
const SKIES = {
  day: { top: '#4a96de', mid: '#8fc3ef', bot: '#e4f1fb', hemiS: 0xe6f2ff, hemiG: 0xa9b6c2, hemiI: .95, sun: 0xfff4de, sunI: 1.05, fog: 0xcfe4f6, cloud: 0xffffff, warm: 0 },
  sunset: { top: '#3c3f8f', mid: '#ff8e60', bot: '#ffd9a8', hemiS: 0xffd9bd, hemiG: 0x7a5565, hemiI: .9, sun: 0xffb472, sunI: 1.0, fog: 0xf6b98f, cloud: 0xffc9a0, warm: .35 },
  mist: { top: '#c9d5df', mid: '#e1e8ee', bot: '#f4f6f8', hemiS: 0xf6f9ff, hemiG: 0xb8c0c8, hemiI: .95, sun: 0xffffff, sunI: .9, fog: 0xe9eef2, cloud: 0xffffff, warm: 0 }
};
function skyTexture(d) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, d.top); gr.addColorStop(.55, d.mid); gr.addColorStop(1, d.bot);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 34 + Math.random() * 60, y = 50 + Math.random() * 30, r = 22 + Math.random() * 22, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
const cloudGroup = new THREE.Group(), cloudMats = [];
{
  const tex = cloudTexture();
  for (let i = 0; i < 40; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: .85, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m), far = i > 24, a = Math.random() * Math.PI * 2, r = far ? 38 + Math.random() * 24 : 11 + Math.random() * 22, w = far ? 20 + Math.random() * 14 : 7 + Math.random() * 9;
    s.position.set(Math.cos(a) * r, far ? -2 + Math.random() * 8 : -9 + Math.random() * 6, Math.sin(a) * r);
    s.scale.set(w, w * .55, 1); noRay(s); cloudGroup.add(s); cloudMats.push(m);
  }
  scene.add(cloudGroup);
}
function applySky(name) {
  const d = SKIES[name] || SKIES.day;
  if (scene.background && scene.background.dispose && scene.background.isTexture) scene.background.dispose();
  scene.background = skyTexture(d);
  scene.fog.color.setHex(d.fog);
  hemi.color.setHex(d.hemiS); hemi.groundColor.setHex(d.hemiG); hemi.intensity = d.hemiI;
  sun.color.setHex(d.sun); sun.intensity = d.sunI;
  warm.intensity = d.warm; warm.color.setHex(0xff9a4a);
  cloudMats.forEach(m => m.color.setHex(d.cloud));
}
applySky(settings.sky);

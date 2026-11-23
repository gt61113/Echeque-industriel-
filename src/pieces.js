/* ===== ÉQUIPES ===== */
const TEAM = {
  w: { name: 'Mécanos', main: 0xf06a1a, dark: 0xb84a0c, pants: 0x3a3f45, accent: 0xffd23a, hat: 0x2f353b, glove: 0x2a2a2a },
  b: { name: 'Électriciens', main: 0x2f6fd6, dark: 0x1d4aa0, pants: 0x1b2f5a, accent: 0xf2f2f2, hat: 0xf4f4f4, glove: 0xffb800 }
};
const SKINS = [0xf9dcc2, 0xf6d3b3, 0xf3cba8, 0xfbe3cf];
const HAIRS = [0x2b1d14, 0x5a3a22, 0x8a6a3a, 0x161616, 0xa8a8a8];
const pick = a => a[Math.floor(Math.random() * a.length)];

/* matériaux partagés pour construire, copiés par pièce après fusion */
const matCache = {};
function pm(color, o) {
  const k = color + '|' + (o ? JSON.stringify(o) : '');
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .55, metalness: .2 }, o || {})));
}
const METAL = { metalness: .85, roughness: .3 };
function put(parent, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
  o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
let _bolt = null;
function boltGeo() {
  if (_bolt) return _bolt;
  const sh = new THREE.Shape();
  sh.moveTo(.08, .34); sh.lineTo(-.13, 0); sh.lineTo(-.01, 0); sh.lineTo(-.09, -.34); sh.lineTo(.14, .06); sh.lineTo(.02, .06); sh.closePath();
  _bolt = new THREE.ExtrudeGeometry(sh, { depth: .08, bevelEnabled: false }); _bolt.translate(0, 0, -.04);
  return _bolt;
}

/* fusionne les petits morceaux d'un groupe : les couleurs passent dans la forme (couleurs de sommets),
   il reste seulement quelques matériaux par pièce (beaucoup plus léger pour le téléphone) */
function matClass(m) {
  if (m.transparent) return 'T' + m.color.getHex() + '|' + m.opacity;
  if (m.emissive && m.emissive.getHex() > 0) return 'E' + m.emissive.getHex() + '|' + m.emissiveIntensity;
  if (m.metalness > .5) return 'M';
  return m.roughness > .65 ? 'R' : 'P';
}
const CLS_PROPS = { M: { roughness: .65, metalness: .25 }, R: { roughness: .95, metalness: 0 }, P: { roughness: .8, metalness: .05 } };
const DUST = new THREE.Color(0xb9ad9a);
function mergeInPlace(group, skip) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), old = [];
  (function walk(o) {
    for (const c of o.children) {
      if (skip && skip.includes(c)) continue;
      if (c.isMesh) {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        const key = matClass(c.material);
        let b = buckets.get(key);
        if (!b) { b = { m: c.material, pos: [], nor: [], uv: [], col: [], n: 0 }; buckets.set(key, b); }
        const cnt = g.attributes.position.count, col = new Float32Array(cnt * 3), mc = c.material.color;
        const dk = key[0] === 'E' || key[0] === 'T' ? 0 : .09;
        for (let i = 0; i < cnt; i++) { col[i * 3] = mc.r + (DUST.r - mc.r) * dk; col[i * 3 + 1] = mc.g + (DUST.g - mc.g) * dk; col[i * 3 + 2] = mc.b + (DUST.b - mc.b) * dk; }
        b.pos.push(g.attributes.position.array); b.nor.push(g.attributes.normal.array);
        b.uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(cnt * 2)); b.col.push(col); b.n += cnt;
        g.dispose(); old.push(c);
      } else walk(c);
    }
  })(group);
  old.forEach(c => c.parent.remove(c));
  buckets.forEach((b, key) => {
    const cat = (arrs, size) => { const out = new Float32Array(b.n * size); let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; } return out; };
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(cat(b.pos, 3), 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(cat(b.nor, 3), 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(cat(b.uv, 2), 2));
    bg.setAttribute('color', new THREE.BufferAttribute(cat(b.col, 3), 3));
    const src = b.m, props = CLS_PROPS[key] || { roughness: src.roughness, metalness: src.metalness };
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, vertexColors: true }, props));
    if (key[0] === 'E') { m.emissive = src.emissive.clone(); m.emissiveIntensity = src.emissiveIntensity; }
    if (key[0] === 'T') { m.transparent = true; m.opacity = src.opacity; m.depthWrite = false; }
    const mesh = new THREE.Mesh(bg, m); mesh.castShadow = key[0] !== 'T'; mesh.receiveShadow = key[0] !== 'T';
    group.add(mesh);
  });
}

/* ===== OUTILS ===== */
function wrenchModel(len, color) {
  const g = new THREE.Group(), m = pm(color, METAL);
  put(g, geo('Box', .06, len, .035), m, 0, len / 2, 0);
  put(g, geo('Torus', .075, .03, 6, 12), m, 0, len + .05, 0);
  put(g, geo('Box', .05, .05, .04), pm(0x1b1d20), 0, len + .13, 0);
  put(g, geo('Cylinder', .04, .04, len * .35, 8), pm(0x15181b), 0, len * .2, 0);
  return g;
}
function screwdriverModel(len, hcolor) {
  const g = new THREE.Group();
  put(g, geo('Cylinder', .045, .04, len * .38, 8), pm(hcolor), 0, len * .19, 0);
  put(g, geo('Torus', .043, .012, 5, 10), pm(0x15181b), 0, len * .2, 0, Math.PI / 2);
  put(g, geo('Cylinder', .013, .013, len * .7, 6), pm(0xb8c2ca, METAL), 0, len * .38 + len * .35, 0);
  put(g, geo('Box', .04, .02, .008), pm(0xb8c2ca, METAL), 0, len * 1.08, 0);
  return g;
}
function hammerModel(len) {
  const g = new THREE.Group();
  put(g, geo('Cylinder', .03, .03, len, 6), pm(0x8a5a2b), 0, len / 2, 0);
  put(g, geo('Box', .22, .12, .12), pm(0x7a858e, METAL), 0, len, 0);
  put(g, geo('Box', .04, .13, .13), pm(0xb8c2ca, METAL), .12, len, 0);
  put(g, geo('Box', .04, .13, .13), pm(0xb8c2ca, METAL), -.12, len, 0);
  return g;
}
function pliers(g, x, y, z) {
  put(g, geo('Box', .02, .08, .014), pm(0xcc2b2b), x - .012, y, z, 0, 0, .12);
  put(g, geo('Box', .02, .08, .014), pm(0xcc2b2b), x + .012, y, z, 0, 0, -.12);
  put(g, geo('Box', .035, .05, .012), pm(0xb8c2ca, METAL), x, y + .06, z);
}

/* ===== PERSONNAGE ===== */
function face(head, hr, o) {
  const skinM = pm(o.skin, { roughness: .8, metalness: 0 });
  put(head, geo('Sphere', hr, 18, 14), skinM);
  [-1, 1].forEach(s => {
    put(head, geo('Sphere', hr * .2, 8, 8), skinM, s * hr * 1.0, 0, 0, 0, 0, 0, .5, 1, .8);
    put(head, geo('Sphere', hr * .17, 8, 8), pm(0xffffff, { metalness: 0, roughness: .3 }), s * hr * .36, hr * .1, hr * .86, 0, 0, 0, 1, 1, .55);
    put(head, geo('Sphere', hr * .09, 8, 8), pm(0x101418, { metalness: 0 }), s * hr * .36, hr * .1, hr * .96);
    put(head, geo('Box', hr * .36, .02, .022), pm(o.hair, { metalness: 0, roughness: .9 }), s * hr * .36, hr * .36, hr * .9, 0, 0, s * .22);
    put(head, geo('Sphere', hr * .13, 6, 6), pm(0xe58a7a, { metalness: 0, transparent: true, opacity: .45 }), s * hr * .6, -hr * .22, hr * .76, 0, 0, 0, 1, .7, .4);
  });
  put(head, geo('Sphere', hr * .15, 8, 8), pm(o.skin - 0x0a0a0a, { metalness: 0, roughness: .8 }), 0, -hr * .02, hr * 1.0);
  if (!o.beard) put(head, geo('Torus', hr * .17, .012, 5, 10, Math.PI), pm(0x5a1a1a, { metalness: 0 }), 0, -hr * .24, hr * .93, 0, 0, Math.PI);
  if (o.mustache) {
    const mm = pm(o.hair, { metalness: 0, roughness: .9 });
    [-1, 1].forEach(s => put(head, geo('Box', hr * .3, .035, .04), mm, s * hr * .15, -hr * .16, hr * .97, 0, 0, s * -.25));
  }
  if (o.beard) put(head, geo('Sphere', hr * .75, 10, 8), pm(0xdedede, { metalness: 0, roughness: .95 }), 0, -hr * .55, hr * .5, 0, 0, 0, 1, .85, .65);
  put(head, geo('Sphere', hr * 1.03, 14, 10, Math.PI, Math.PI, 0, Math.PI * .72), pm(o.hair, { metalness: 0, roughness: .9 }), 0, hr * .02, 0);
}
function hatMech(head, hr, T) {
  const m = pm(T.hat, { roughness: .7 });
  put(head, geo('Sphere', hr * 1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, hr * .2, 0);
  put(head, geo('Box', hr * 1.25, .028, hr * .8), m, 0, hr * .3, hr * 1.02, .14);
  put(head, geo('Torus', hr * 1.05, .02, 5, 18), pm(T.main), 0, hr * .3, 0, Math.PI / 2);
  put(head, geo('Cylinder', .055, .055, .015, 10), pm(T.main, METAL), 0, hr * .62, hr * 1.04, Math.PI / 2);
  put(head, geo('Sphere', .042, 8, 8), pm(0xffee88, { emissive: 0xffdd55, emissiveIntensity: 1.3 }), 0, hr * .62, hr * 1.07);
  [-1, 1].forEach(s => {
    put(head, geo('Cylinder', hr * .2, hr * .2, .03, 10), pm(0xb7e6ff, { transparent: true, opacity: .4, roughness: .1 }), s * hr * .32, hr * .75, hr * .85, Math.PI / 2 - .4);
    put(head, geo('Torus', hr * .2, .014, 5, 10), pm(0x1b1d20), s * hr * .32, hr * .75, hr * .85, Math.PI / 2 - .4);
  });
  put(head, geo('Torus', hr * 1.0, .012, 5, 18), pm(0x1b1d20), 0, hr * .72, 0, Math.PI / 2 - .35);
}
function hatElec(head, hr, T) {
  const m = pm(T.hat, { roughness: .3 });
  put(head, geo('Sphere', hr * 1.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, hr * .2, 0);
  put(head, geo('Cylinder', hr * 1.28, hr * 1.28, .028, 18), m, 0, hr * .22, 0);
  put(head, geo('Box', hr * .8, .04, hr * .55), m, 0, hr * .24, hr * 1.1);
  put(head, geo('Box', .07, .05, hr * 2.1), pm(T.main), 0, hr * 1.3, 0);
  put(head, geo('Box', .07, hr * .5, .05), pm(T.main), 0, hr * 1.05, -hr * .15, .2);
  put(head, geo('Box', .1, .07, .06), pm(0x20252a), 0, hr * .72, hr * 1.1);
  put(head, geo('Sphere', .042, 8, 8), pm(0xffee88, { emissive: 0xffdd55, emissiveIntensity: 1.2 }), 0, hr * .72, hr * 1.16);
  put(head, geo('Torus', hr * 1.05, .012, 5, 18), pm(0x20252a), 0, hr * .6, 0, Math.PI / 2);
  [-1, 1].forEach(s => put(head, geo('Box', hr * .34, hr * .2, .014), pm(0x9fd8ff, { transparent: true, opacity: .35, roughness: .1 }), s * hr * .36, hr * .1, hr * 1.06));
  put(head, geo('Box', hr * .16, .014, .014), pm(0x20252a), 0, hr * .14, hr * 1.06);
}

function human(o) {
  const { h, r, T } = o, mech = T === TEAM.w, y0 = .1, lh = h * .42;
  const g = new THREE.Group();
  const skin = pick(SKINS), hair = pick(HAIRS);
  const legM = pm(T.pants), bootM = pm(0x2a2118, { roughness: .8, metalness: .05 });
  [-1, 1].forEach(s => {
    put(g, geo('Cylinder', r * .27, r * .24, lh, 10), legM, s * r * .36, y0 + lh / 2, 0);
    put(g, geo('Box', r * .46, .075, r * .82), bootM, s * r * .36, y0 + .05, r * .14);
    put(g, geo('Box', r * .48, .022, r * .86), pm(0x111111), s * r * .36, y0 + .012, r * .14);
    put(g, geo('Cylinder', r * .26, r * .26, .06, 10), bootM, s * r * .36, y0 + .1, 0);
    if (mech) put(g, geo('Box', r * .3, .075, .05), pm(0x1c1f22), s * r * .36, y0 + lh * .5, r * .25);
    else put(g, geo('Torus', r * .26, .012, 5, 10), pm(0xeef4ff, { emissive: 0x555555, emissiveIntensity: .5 }), s * r * .36, y0 + .17, 0, Math.PI / 2);
  });
  put(g, geo('Cylinder', r * .8, r * .8, .06, 14), legM, 0, y0 + lh, 0);
  const th = h - lh, ty = y0 + lh + th / 2;
  put(g, geo('Cylinder', r * .74, r * .84, th, 16), pm(T.main, { roughness: .75, metalness: .05 }), 0, ty, 0);
  const fz = r * .78;
  put(g, geo('Box', .012, th - .04, .01), pm(T.dark), 0, ty, fz + .02);
  put(g, geo('Box', r * .42, r * .34, .02), pm(T.dark), r * .3, y0 + h * .82, fz);
  put(g, geo('Cylinder', .008, .008, .07, 5), pm(0x1a1a1a), r * .4, y0 + h * .82 + r * .2, fz + .01);
  put(g, geo('Box', r * .35, r * .22, .012), pm(T.dark), r * .3, y0 + h * .62, fz + .04);
  if (mech) {
    put(g, geo('Cylinder', .05, .05, .014, 10), pm(T.accent, METAL), -r * .3, y0 + h * .82, fz + .02, Math.PI / 2);
    put(g, geo('Cylinder', .026, .026, .018, 6), pm(0x15181b), -r * .3, y0 + h * .82, fz + .03, Math.PI / 2);
    put(g, geo('Box', r * .5, .015, .01), pm(0x15181b), -r * .3, y0 + h * .66, fz + .025);
  } else {
    put(g, boltGeo(), pm(0xffe566, { emissive: 0xffaa00, emissiveIntensity: .8 }), -r * .3, y0 + h * .8, fz + .025, 0, 0, 0, .22, .22, .3);
    [.32, .52].forEach(k => put(g, geo('Torus', r * .8, .016, 5, 16), pm(0xeef4ff, { emissive: 0x666666, emissiveIntensity: .6 }), 0, y0 + lh + th * k, 0, Math.PI / 2));
  }
  put(g, geo('Cylinder', r * .89, r * .89, .05, 16), pm(0x5b3a1e, { roughness: .8 }), 0, y0 + lh + .03, 0);
  put(g, geo('Box', .07, .055, .02), pm(0xffd23a, METAL), 0, y0 + lh + .03, r * .9);
  [[-.9, 0], [.9, 0], [2.3, 0], [-2.3, 0]].forEach(([a]) => put(g, geo('Box', .075, .085, .05), pm(0x6b4526, { roughness: .8 }), Math.sin(a) * r * .93, y0 + lh - .02, Math.cos(a) * r * .93, 0, a, 0));
  if (mech) { put(g, geo('Box', .02, .14, .014), pm(0xc9d1d8, METAL), -r * .98, y0 + lh - .1, r * .3); put(g, geo('Torus', .03, .012, 5, 8), pm(0xc9d1d8, METAL), -r * .98, y0 + lh - .18, r * .3); }
  else { pliers(g, -r * .98, y0 + lh - .12, r * .3); put(g, geo('Torus', .05, .02, 6, 10), pm(0xffb800), r * .98, y0 + lh - .1, -r * .2, 0, Math.PI / 2); }
  put(g, geo('Cylinder', r * .26, r * .3, .06, 10), pm(skin, { roughness: .8, metalness: 0 }), 0, y0 + h + .03, 0);
  put(g, geo('Torus', r * .42, .045, 6, 14), pm(T.dark), 0, y0 + h - .01, 0, Math.PI / 2);

  const hr = r * .62, head = new THREE.Group(); head.position.y = y0 + h + hr * .85; g.add(head);
  face(head, hr, { skin, hair, mustache: o.mustache !== undefined ? o.mustache : Math.random() < .45, beard: o.beard });
  if (o.hat === 'mech') hatMech(head, hr, T); else if (o.hat === 'elec') hatElec(head, hr, T);

  const len = Math.max(.22, h * .52);
  const arms = [-1, 1].map(s => {
    const a = new THREE.Group(); a.position.set(s * r * .92, y0 + h - .07, 0);
    put(a, geo('Sphere', .078, 8, 8), pm(T.main, { roughness: .75 }));
    put(a, geo('Cylinder', .058, .05, len * .78, 8), pm(T.main, { roughness: .75 }), 0, -len * .39, 0);
    put(a, geo('Cylinder', .056, .056, .03, 8), pm(mech ? 0x2f353b : T.accent), 0, -len * .76, 0);
    put(a, geo('Sphere', .07, 8, 8), pm(T.glove, { roughness: .8, metalness: 0 }), 0, -len * .93, 0);
    put(a, geo('Sphere', .032, 6, 6), pm(T.glove, { roughness: .8, metalness: 0 }), s * .04, -len * .88, .045);
    a.rotation.z = s * .12; return a;
  });
  arms.forEach(a => g.add(a));
  const armR = arms[1], armL = arms[0];
  armR.rotation.x = -.3;
  if (o.tool) { const tool = o.tool(); tool.position.y = -len * .93; if (o.toolRot) tool.rotation.set(o.toolRot[0], o.toolRot[1], o.toolRot[2]); else tool.rotation.x = Math.PI - 1.15; armR.add(tool); }
  if (o.cape) {
    put(g, geo('Box', r * 1.6, h * .95, .035), pm(o.cape, { roughness: .8 }), 0, y0 + h * .5, -r * .86, .05);
    put(g, geo('Torus', r * .6, .05, 6, 14, Math.PI * 1.2), pm(o.cape), 0, y0 + h, -r * .1, Math.PI / 2, 0, Math.PI * .4);
  }
  return { g, armR, armL, head, hy: y0 + h + hr * .85, hr, top: y0 + h + hr * 2 };
}

/* ===== LES TOURS : boîte à outils et transformateur, avec visage et petits pieds ===== */
function rookFace(g, y, z, w) {
  [-1, 1].forEach(s => {
    put(g, geo('Sphere', .075, 10, 10), pm(0xffffff, { metalness: 0, roughness: .3 }), s * w, y, z, 0, 0, 0, 1, 1, .6);
    put(g, geo('Sphere', .04, 8, 8), pm(0x101418, { metalness: 0 }), s * w, y, z + .04);
    put(g, geo('Box', .12, .022, .02), pm(0x15181b), s * w, y + .1, z + .03, 0, 0, s * .25);
  });
  put(g, geo('Torus', .08, .014, 5, 10, Math.PI), pm(0x2a0f0f, { metalness: 0 }), 0, y - .1, z + .02, 0, 0, Math.PI);
}
function buildRook(mech, T) {
  const g = new THREE.Group();
  [-1, 1].forEach(s => {
    put(g, geo('Cylinder', .05, .05, .1, 8), pm(T.pants), s * .16, .15, .02);
    put(g, geo('Box', .14, .06, .22), pm(0x2a2118, { roughness: .8 }), s * .16, .13, .07);
    const a = new THREE.Group(); a.position.set(s * (mech ? .36 : .32), .4, .02);
    put(a, geo('Cylinder', .045, .04, .22, 8), pm(T.main), 0, -.1, 0, 0, 0, s * .15);
    put(a, geo('Sphere', .065, 8, 8), pm(T.glove, { metalness: 0 }), s * .03, -.23, 0);
    g.add(a);
  });
  if (mech) {
    const red = pm(0xb7261b, { metalness: .4, roughness: .45 }), dk = pm(0x7a1a12, { metalness: .5 }), st = pm(0xc9d1d8, METAL);
    put(g, geo('Box', .64, .4, .42), red, 0, .36, 0);
    put(g, geo('Box', .67, .06, .45), dk, 0, .59, 0);
    put(g, geo('Torus', .15, .028, 6, 12, Math.PI), st, 0, .62, 0);
    [-1, 1].forEach(s => { put(g, geo('Cylinder', .03, .03, .06, 6), st, s * .15, .62, 0);
      put(g, geo('Box', .07, .1, .02), st, s * .22, .5, .22); put(g, geo('Box', .09, .03, .03), st, s * .22, .56, .22); });
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => put(g, geo('Box', .07, .07, .07), st, sx * .31, .16, sz * .2)));
    put(g, geo('Box', .56, .014, .01), dk, 0, .36, .215);
    put(g, geo('Box', .22, .09, .012), pm(T.accent), 0, .22, .218);
    put(g, geo('Torus', .03, .01, 5, 8), pm(0x15181b), 0, .22, .226);
    rookFace(g, .44, .215, .13);
  } else {
    const body = pm(0x6a7782, { metalness: .7, roughness: .4 }), fin = pm(T.main, { metalness: .5 }), wh = pm(0xf2f2f2, { roughness: .2 });
    put(g, geo('Box', .56, .46, .46), body, 0, .33, 0);
    put(g, geo('Box', .6, .05, .5), pm(0x4a545d, METAL), 0, .58, 0);
    for (let i = -2; i <= 2; i++) [-1, 1].forEach(s => put(g, geo('Box', .06, .36, .3), fin, s * .31, .33, i * .08));
    for (let i = -1; i <= 1; i++) { for (let k = 0; k < 3; k++) put(g, geo('Cylinder', .075 - k * .008, .075 - k * .008, .035, 10), k % 2 ? pm(0x9a6a3a) : wh, i * .17, .66 + k * .045, 0); put(g, geo('Sphere', .03, 6, 6), pm(0xffb800, METAL), i * .17, .8, 0); }
    [-1, 1].forEach(s => { put(g, geo('Cylinder', .1, .1, .012, 3), pm(0xffd23a), s * .31, .52, 0, 0, 0, Math.PI / 2, 1, 1, 1);
      put(g, boltGeo(), pm(0x15181b), s * .318, .51, 0, 0, Math.PI / 2, 0, .22, .22, .3); });
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => put(g, geo('Sphere', .025, 6, 6), pm(0x9aa6af, METAL), sx * .27, .54, sz * .2)));
    put(g, geo('Torus', .06, .02, 6, 10), pm(0x15181b), -.2, .2, .24, 0, 0, 0);
    rookFace(g, .38, .235, .12);
  }
  return g;
}


/* ===== FOU : haute coiffe pointue + outil géant en diagonale ===== */
function hatCone(head, hr, T, mech) {
  const m = pm(T.hat, { roughness: .6 }), H = hr * 3.3, R = hr * 1.12, y0 = hr * .2;
  put(head, geo('Cone', R, H, 16), m, 0, y0 + H / 2, 0);
  put(head, geo('Cylinder', hr * 1.3, hr * 1.3, .028, 18), m, 0, y0, 0);
  [hr * .55, hr * 1.25].forEach(t => put(head, geo('Torus', R * (1 - t / H), .03, 6, 16), pm(T.main, mech ? { metalness: .3 } : { emissive: T.main, emissiveIntensity: .25 }), 0, y0 + t, 0, Math.PI / 2));
  if (mech) {
    put(head, geo('Sphere', .055, 10, 10), pm(0xffc21a, METAL), 0, y0 + H + .02, 0);
    put(head, geo('Cylinder', .06, .06, .016, 10), pm(0xffc21a, METAL), 0, y0 + H * .33, R * (1 - H * .33 / H) + .012, Math.PI / 2);
  } else {
    put(head, geo('Cylinder', .012, .012, .22, 6), pm(0xb8c2ca, METAL), 0, y0 + H + .08, 0);
    put(head, geo('Sphere', .05, 10, 10), pm(0xffee88, { emissive: 0xffcc22, emissiveIntensity: 1.3 }), 0, y0 + H + .2, 0);
    put(head, boltGeo(), pm(0xffe566, { emissive: 0xffaa00, emissiveIntensity: .8 }), 0, y0 + H * .33, R * (1 - .33) + .02, 0, 0, 0, .22, .22, .3);
  }
}
function giantWrench() {
  const g = new THREE.Group(), m = pm(0xc9d1d8, METAL);
  put(g, geo('Box', .085, .8, .05), m, 0, .4, 0);
  put(g, geo('Cylinder', .05, .05, .26, 10), pm(0x15181b), 0, .16, 0);
  put(g, geo('Torus', .13, .055, 8, 14), m, 0, .88, 0);
  put(g, geo('Box', .1, .12, .07), pm(0x2a2f34), 0, 1.0, 0);
  put(g, geo('Box', .085, .06, .06), pm(0xffc21a, METAL), 0, .02, 0);
  return g;
}
function giantDriver() {
  const g = new THREE.Group();
  put(g, geo('Cylinder', .075, .065, .3, 10), pm(0xff6a1a), 0, .15, 0);
  put(g, geo('Torus', .07, .018, 5, 12), pm(0x15181b), 0, .2, 0, Math.PI / 2);
  put(g, geo('Cylinder', .02, .02, .62, 8), pm(0xb8c2ca, METAL), 0, .6, 0);
  put(g, geo('Box', .07, .06, .014), pm(0xb8c2ca, METAL), 0, .93, 0);
  put(g, boltGeo(), pm(0xffe566, { emissive: 0xffaa00, emissiveIntensity: .8 }), 0, .15, .068, 0, 0, 0, .2, .2, .3);
  return g;
}

/* ===== CAVALIER : tête de cheval faite de tuyaux ===== */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function pipeSeg(parent, a, b, r, m) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const o = new THREE.Mesh(geo('Cylinder', r, r, len, 12), m);
  o.position.copy(a).add(b).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
function flange(parent, a, b, t, r, m) {
  const d = new THREE.Vector3().subVectors(b, a).normalize();
  const o = new THREE.Mesh(geo('Torus', r, .035, 6, 14), m);
  o.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  o.castShadow = true; parent.add(o);
}
function buildHorse(mech, T) {
  const g = new THREE.Group(), steel = pm(0xc9d1d8, METAL), dark = pm(0x3a4148, METAL), paint = pm(T.main, { metalness: .35, roughness: .5 }), edge = pm(T.dark, { metalness: .4 });
  put(g, geo('Cylinder', .27, .31, .14, 20), paint, 0, .17, 0);
  put(g, geo('Torus', .29, .03, 6, 20), steel, 0, .24, 0, Math.PI / 2);
  const N = [V3(0, .2, -.02), V3(0, .45, -.2), V3(0, .72, -.18), V3(0, .92, -.02)];
  for (let i = 0; i < 3; i++) { pipeSeg(g, N[i], N[i + 1], .14, paint); flange(g, N[i], N[i + 1], .5, .15, steel); }
  [1, 2].forEach(i => put(g, geo('Sphere', .165, 12, 10), dark, N[i].x, N[i].y, N[i].z));
  [[.3, -.14], [.58, -.2], [.8, -.1]].forEach(([y, z]) => [-1, 1].forEach(s => put(g, geo('Sphere', .022, 6, 6), steel, s * .135, y, z)));
  for (let i = 0; i < 6; i++) {
    const t = i / 5, y = .3 + t * .66, z = -.2 - Math.sin(t * Math.PI) * .12 + (t > .7 ? (t - .7) * .5 : 0);
    put(g, geo('Torus', .07, .028, 6, 12), pm(mech ? (i % 2 ? 0x8a949c : 0xffc21a) : 0xffb800, METAL), 0, y, z - .14, 0, Math.PI / 2);
  }
  if (mech) {
    put(g, geo('Torus', .07, .02, 6, 12), steel, .17, .5, -.1, 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) put(g, geo('Box', .012, .13, .012), steel, .17, .5, -.1, k * Math.PI / 4, 0, 0);
    put(g, geo('Cylinder', .018, .018, .1, 6), steel, .1, .5, -.1, 0, 0, Math.PI / 2);
  } else {
    put(g, boltGeo(), pm(0xffe566, { emissive: 0xffaa00, emissiveIntensity: .9 }), .152, .56, -.08, 0, Math.PI / 2, 0, .35, .35, .4);
    put(g, geo('Torus', .06, .03, 6, 10), pm(0xffb800), -.17, .5, -.1, 0, Math.PI / 2);
  }
  const hd = new THREE.Group(); hd.position.set(0, .92, -.02); g.add(hd);
  const H0 = V3(0, .06, -.1), H1 = V3(0, -.2, .26), H2 = V3(0, -.3, .42);
  put(hd, geo('Sphere', .17, 14, 12), dark, H0.x, H0.y, H0.z);
  pipeSeg(hd, H0, H1, .16, paint); pipeSeg(hd, H1, H2, .115, paint);
  put(hd, geo('Sphere', .12, 12, 10), dark, H2.x, H2.y, H2.z);
  put(hd, geo('Sphere', .15, 12, 10), paint, H1.x, H1.y, H1.z);
  flange(hd, H1, H2, .5, .125, steel); flange(hd, H0, H1, .45, .165, steel);
  [-1, 1].forEach(s => {
    put(hd, geo('Sphere', .028, 6, 6), pm(0x101418), s * .055, -.27, .52);
    put(hd, geo('Cylinder', .075, .075, .03, 14), pm(0xffffff, { roughness: .3, metalness: 0 }), s * .165, -.05, .09, 0, 0, Math.PI / 2);
    put(hd, geo('Torus', .075, .017, 6, 14), steel, s * .18, -.05, .09, 0, Math.PI / 2);
    put(hd, geo('Box', .01, .06, .012), pm(0xcc2b2b, { metalness: 0 }), s * .185, -.03, .09, 0, 0, .5);
    put(hd, geo('Box', .01, .035, .012), pm(0x101418), s * .185, -.07, .09);
    if (mech) {
      put(hd, geo('Box', .035, .26, .022), steel, s * .09, .26, -.15, -.25, 0, s * .12);
      put(hd, geo('Torus', .05, .02, 6, 10), steel, s * .105, .4, -.2, -.25, 0, 0);
    } else {
      for (let k = 0; k < 3; k++) put(hd, geo('Cylinder', .06 - k * .008, .06 - k * .008, .03, 10), k % 2 ? pm(0x9a6a3a) : pm(0xf2f2f2, { roughness: .2 }), s * .09, .2 + k * .05, -.14);
      put(hd, geo('Sphere', .025, 6, 6), pm(0xffee88, { emissive: 0xffcc22, emissiveIntensity: 1.3 }), s * .09, .36, -.14);
    }
  });
  put(hd, geo('Torus', .12, .02, 6, 14), pm(0x5b3a1e, { roughness: .8 }), 0, -.245, .34, Math.PI / 2 - .7);
  return { g, head: hd };
}

/* ===== LAMPE DE CASQUE : halo + faisceau ===== */
let _halo = null;
function haloTex() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,248,200,1)'); gr.addColorStop(.25, 'rgba(255,220,120,.6)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_halo = new THREE.CanvasTexture(c));
}
function addLamp(root, head, x, y, z, k) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .95 }));
  sp.position.set(x, y, z); sp.scale.set(.5 * k, .5 * k, 1); sp.raycast = () => {}; head.add(sp);
  const bg = new THREE.ConeGeometry(.2 * k, .75 * k, 14, 1, true); bg.translate(0, -.375 * k, 0); bg.rotateX(-Math.PI / 2 + .35);
  const bm = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(bg, bm); beam.position.set(x, y, z); beam.raycast = () => {}; head.add(beam);
  (root.userData.lamps = root.userData.lamps || []).push({ sp, beam });
}

/* ===== CONSTRUCTION DES PIÈCES ===== */
function buildPiece(type, c) {
  const T = TEAM[c], root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const mech = c === 'w', hat = mech ? 'mech' : 'elec';
  put(inner, geo('Cylinder', .4, .44, .1, 22), pm(0x2a2f34, { metalness: .75, roughness: .4 }), 0, .05, 0);
  put(inner, geo('Torus', .4, .026, 8, 28), pm(T.main, { emissive: T.main, emissiveIntensity: .4 }), 0, .1, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; put(inner, geo('Box', .035, .02, .035), pm(0x59626b, METAL), Math.cos(a) * .435, .06, Math.sin(a) * .435, 0, -a, 0); }
  const small = () => mech ? wrenchModel(.28, 0xc9d1d8) : screwdriverModel(.34, 0xffb800);
  const big = () => mech ? hammerModel(.5) : screwdriverModel(.62, 0xff6a1a);
  let H = null;
  if (type === 'P') H = human({ h: .38, r: .2, T, hat, tool: small });
  if (type === 'N') { const hs = buildHorse(mech, T); H = { g: hs.g, armR: null, armL: null, head: hs.head }; }
  if (type === 'B') {
    H = human({ h: .64, r: .22, T, hat: 'none', tool: mech ? giantWrench : giantDriver, toolRot: [-.2, 0, -.5] });
    hatCone(H.head, H.hr, T, mech);
  }
  if (type === 'Q') {
    H = human({
      h: .78, r: .25, T, hat, mustache: false,
      cape: mech ? 0x8a3a0c : 0x14316b,
      tool: mech ? () => wrenchModel(.5, 0xffc21a) : () => { const g = new THREE.Group(); put(g, geo('Cylinder', .02, .02, .5, 6), pm(0x8899aa, METAL), 0, .25, 0); put(g, geo('Sphere', .1, 12, 12), pm(0x9fe8ff, { emissive: 0x44ccff, emissiveIntensity: 1.5 }), 0, .56, 0); return g; }
    });
    const cy = H.hy + H.hr * 1.15, gold = pm(0xffc21a, { metalness: .85, roughness: .3 });
    if (mech) {
      put(H.head, geo('Cylinder', .17, .17, .07, 16), gold, 0, H.hr * 1.15, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put(H.head, geo('Box', .06, .1, .06), gold, Math.cos(a) * .18, H.hr * 1.15 + .07, Math.sin(a) * .18, 0, -a, 0); }
    } else {
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; put(H.head, geo('Cone', .045, .26, 6), pm(0xffee88, { emissive: 0xffaa00, emissiveIntensity: 1 }), Math.cos(a) * .16, H.hr * 1.15 + .14, Math.sin(a) * .16); }
    }
    [-1, 1].forEach(s => put(H.g, geo('Sphere', .12, 8, 8), gold, s * .26, .1 + .75, 0, 0, 0, 0, 1, .6, 1));
    put(H.g, geo('Torus', .1, .016, 6, 14), gold, 0, .1 + .72, .21, Math.PI / 2 - .3);
  }
  if (type === 'K') {
    H = human({
      h: .9, r: .27, T, hat, mustache: true, beard: true,
      cape: mech ? 0x8a3a0c : 0x14316b,
      tool: mech ? () => hammerModel(.62) : () => screwdriverModel(.72, 0xff6a1a)
    });
    const gold = pm(0xffc21a, { metalness: .9, roughness: .28 });
    [-1, 1].forEach(s => put(H.g, geo('Sphere', .14, 8, 8), gold, s * .28, .1 + .88, 0, 0, 0, 0, 1, .6, 1));
    put(H.g, geo('Torus', .12, .018, 6, 14), gold, 0, .1 + .84, .24, Math.PI / 2 - .3);
    const cy = H.hr * 1.1;
    if (mech) {
      put(H.head, geo('Box', .09, .46, .06), gold, 0, cy + .3, 0);
      put(H.head, geo('Torus', .13, .05, 8, 16), gold, 0, cy + .62, 0);
      put(H.head, geo('Box', .06, .12, .07), pm(0x15181b), 0, cy + .72, 0);
    } else {
      put(H.head, boltGeo(), pm(0xffee88, { emissive: 0xffaa00, emissiveIntensity: 1.1 }), 0, cy + .42, 0, 0, 0, 0, 1, 1, 1);
    }
  }
  if (type === 'R') { H = { g: buildRook(mech, T), armR: null, armL: null, head: null }; }
  inner.add(H.g);
  root.updateMatrixWorld(true);
  const subs = [H.head, H.armR, H.armL].filter(Boolean);
  subs.forEach(s => mergeInPlace(s, null));
  mergeInPlace(inner, subs);
  root.userData = { inner, armR: H.armR, armL: H.armL, type, color: c, phase: Math.random() * 6.28, head: H.head };
  if (H.head) {
    const hr = H.hr || .2, k = type === 'P' ? .8 : 1;
    if (type === 'N') addLamp(root, H.head, 0, .12, .36, .9);
    else if (type === 'B') addLamp(root, H.head, 0, hr * .95, hr * 1.0, k);
    else addLamp(root, H.head, 0, hr * .72, hr * 1.17, k);
  }
  return root;
}

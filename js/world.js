// world.js — ehitab OpenStreetMapi andmetest 3D Tartu: majad, teed, jõgi, pargid, puud, poodide sildid
window.TB = window.TB || {};
(function (TB) {
  'use strict';
  const W = TB.World = {};
  const TILE = 700;
  const RW = { motorway: 22, trunk: 18, primary: 13, secondary: 12, tertiary: 10, unclassified: 7, residential: 7, living_street: 6, service: 4.5, road: 6, busway: 7,
    motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 7, pedestrian: 6, footway: 2.6, cycleway: 2.8, path: 2, track: 3, steps: 2, bridleway: 2 };
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'road', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'service']);
  const CLASS = h => (h === 'motorway' || h === 'trunk') ? 'hwy' : (h === 'primary' || h === 'secondary') ? 'main' : (h === 'tertiary' || h === 'residential' || h === 'unclassified' || h === 'road' || h === 'busway' || /_link$/.test(h)) ? 'street' : (h === 'service' || h === 'living_street') ? 'plain' : (h === 'track') ? 'gravel' : 'paving';
  const ROADY = { hwy: 0.13, main: 0.12, street: 0.11, plain: 0.10, gravel: 0.09, paving: 0.085 };

  // ---------- abifunktsioonid ----------
  function canvasTex(renderer, w, h, draw, rx, ry) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.encoding = THREE.sRGBEncoding; return t;
  }
  function noise(x, w, h, base, amp, n) { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { const v = (Math.random() - .5) * amp; x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; const s = 1 + Math.random() * 2.5; x.fillRect(Math.random() * w, Math.random() * h, s, s); } }
  function roadTex(renderer, cls) {
    return canvasTex(renderer, 128, 512, (x, w, h) => {
      if (cls === 'paving') { noise(x, w, h, '#8f8a84', 0.10, 2500); x.strokeStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < h; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } return; }
      if (cls === 'gravel') { noise(x, w, h, '#9a8a6a', 0.25, 5000); return; }
      noise(x, w, h, '#45474c', 0.10, 3500);
      if (cls === 'plain') return;
      x.fillStyle = '#e8e8e0'; x.fillRect(4, 0, 3, h); x.fillRect(w - 7, 0, 3, h);
      if (cls === 'hwy') { x.fillStyle = '#e8e8e0'; for (let y = 0; y < h; y += 128) { x.fillRect(w * 0.25 - 1, y, 3, 60); x.fillRect(w * 0.5 - 1, y, 3, 60); x.fillRect(w * 0.75 - 1, y, 3, 60); } }
      else if (cls === 'main') { x.fillRect(w / 2 - 2, 0, 4, h); }
      else { for (let y = 0; y < h; y += 128) x.fillRect(w / 2 - 2, y, 4, 64); }
    });
  }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
  function ringArea(g) { let a = 0; for (let i = 0; i < g.length - 2; i += 2) a += g[i] * g[i + 3] - g[i + 2] * g[i + 1]; return a / 2; }
  function closed(g) { return g.length >= 8 && Math.abs(g[0] - g[g.length - 2]) < 0.05 && Math.abs(g[1] - g[g.length - 1]) < 0.05; }
  function pip(g, x, z) { let ins = false; for (let i = 0, j = g.length - 2; i < g.length; j = i, i += 2) { const xi = g[i], zi = g[i + 1], xj = g[j], zj = g[j + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins; } return ins; }
  W.pip = pip;
  function tri(outer, holes) { // tagastab indeksid; rõngad ilma kordusotsata
    const toV = g => { const a = []; const n = closed(g) ? g.length - 2 : g.length; for (let i = 0; i < n; i += 2)a.push(new THREE.Vector2(g[i], g[i + 1])); return a; };
    const c = toV(outer), hs = (holes || []).map(toV);
    try { return { pts: c.concat(...hs), idx: THREE.ShapeUtils.triangulateShape(c, hs) }; } catch (e) { return { pts: c, idx: [] }; }
  }
  // dünaamiline puhver
  class Buf {
    constructor(withColor, withWin) { this.p = []; this.n = []; this.uv = []; this.c = withColor ? [] : null; this.w = withWin ? [] : null; this.i = []; this.v = 0; }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      if (this.w) g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.w, 1));
      g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      g.computeBoundingSphere(); return g;
    }
  }
  const tiles = new Map();
  function tileOf(x, z) { const k = Math.floor(x / TILE) + ',' + Math.floor(z / TILE); let t = tiles.get(k); if (!t) { t = { k, cx: (Math.floor(x / TILE) + 0.5) * TILE, cz: (Math.floor(z / TILE) + 0.5) * TILE, bufs: {}, meshes: [] }; tiles.set(k, t); } return t; }
  function tbuf(t, name, col, win) { return t.bufs[name] || (t.bufs[name] = new Buf(col, win)); }

  // ---------- ruudustikud kiireteks päringuteks ----------
  const G = 40; const segGrid = new Map(); const bGrid = new Map(); const wGrid = new Map();
  const key = (i, j) => i * 100003 + j;
  function gridAdd(grid, minx, minz, maxx, maxz, obj) { for (let i = Math.floor(minx / G); i <= Math.floor(maxx / G); i++)for (let j = Math.floor(minz / G); j <= Math.floor(maxz / G); j++) { const k = key(i, j); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(obj); } }
  function segDist(ax, az, bx, bz, x, z) { const vx = bx - ax, vz = bz - az, wx = x - ax, wz = z - az; let t = (vx * wx + vz * wz) / (vx * vx + vz * vz || 1); t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(wx - vx * t, wz - vz * t); }
  W.nearestRoad = function (x, z, carOnly) {
    const a = segGrid.get(key(Math.floor(x / G), Math.floor(z / G))); let best = 1e9, br = null, bi = 0;
    if (a) for (const s of a) { const r = s.r; if (carOnly && !r.car) continue; const g = r.g, i = s.i; const d = segDist(g[i], g[i + 1], g[i + 2], g[i + 3], x, z) - r.w / 2; if (d < best) { best = d; br = r; bi = i; } }
    return { d: best, road: br, i: bi };
  };
  W.buildingAt = function (x, z) { const a = bGrid.get(key(Math.floor(x / G), Math.floor(z / G))); if (!a) return null; for (const b of a) { if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue; if (pip(b.g, x, z)) return b; } return null; };
  W.waterAt = function (x, z) { const a = wGrid.get(key(Math.floor(x / G), Math.floor(z / G))); if (!a) return false; for (const b of a) { if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue; if (pip(b.g, x, z)) { let inHole = false; for (const h of b.holes) if (pip(h, x, z)) inHole = true; if (!inHole) return true; } } return false; };
  function bbox(g) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < g.length; i += 2) { if (g[i] < a) a = g[i]; if (g[i] > c) c = g[i]; if (g[i + 1] < b) b = g[i + 1]; if (g[i + 1] > d) d = g[i + 1]; } return { minx: a, minz: b, maxx: c, maxz: d }; }

  // ---------- hoone värvid ja kõrgused ----------
  const PASTEL = [0xf2e3b3, 0xe9d4a6, 0xd9b38c, 0xf1e8d6, 0xe7c9a9, 0xcfe0c3, 0xf3d9c8, 0xd8c3a5, 0xe8e4dc, 0xc9d6df, 0xf0d78c];
  const MODERN = [0xd0d4d8, 0xb8bec6, 0x9aa4ad, 0xe2e2dc, 0x8e9aa6, 0xc4b8a8, 0x6f7b85, 0xdedad2];
  const PANEL = [0xcdc6b8, 0xbfb8a8, 0xd8d2c4, 0xb4ad9e, 0xc8c0b0];
  const ROOFS = [0x8a3b2a, 0x4a4a50, 0x6b2f24, 0x3d4a5a, 0x5a5a5a, 0x7a4a2a];
  const col = new THREE.Color();
  function parseColor(s, fallback) { if (!s) return fallback; try { col.set(s.replace(/_/g, '')); return col.getHex(); } catch (e) { return fallback; } }
  function buildingStyle(t, id, cx, cz, area) {
    const b = t.building; const lv = parseFloat(t['building:levels']); const h0 = parseFloat(t.height);
    const r = hash(id); const dist = Math.hypot(cx, cz);
    let h, color, win = 1, pitched = false;
    switch (b) {
      case 'house': case 'detached': case 'semidetached_house': case 'terrace': case 'bungalow': case 'farm': h = 6 + r * 2; color = PASTEL[(r * 997 | 0) % PASTEL.length]; pitched = true; break;
      case 'apartments': case 'residential': h = dist > 1200 && area > 500 ? 15 + (r * 3 | 0) * 3 : 10 + r * 6; color = area > 600 ? PANEL[(r * 991 | 0) % PANEL.length] : PASTEL[(r * 991 | 0) % PASTEL.length]; break;
      case 'garage': case 'garages': case 'shed': case 'carport': case 'hut': case 'kiosk': h = 2.6 + r; color = 0x9a9a96; win = 0; break;
      case 'industrial': case 'warehouse': case 'manufacture': case 'hangar': case 'service': h = 7 + r * 5; color = 0xb5b3aa; win = 0.25; break;
      case 'retail': case 'supermarket': case 'commercial': case 'office': h = b === 'office' ? 14 + r * 12 : 7 + r * 5; color = MODERN[(r * 991 | 0) % MODERN.length]; break;
      case 'church': case 'cathedral': case 'chapel': h = 16 + r * 8; color = 0xefe9dc; break;
      case 'university': case 'school': case 'college': case 'kindergarten': case 'public': case 'civic': case 'hospital': h = 11 + r * 6; color = 0xe8d5b0; break;
      case 'roof': h = 4; color = 0x8a8a8a; win = 0; break;
      default: h = area < 120 ? 3.5 + r * 2 : dist < 900 ? 11 + r * 8 : area < 300 ? 6 + r * 3 : 8 + r * 6; color = dist < 1200 ? PASTEL[(r * 991 | 0) % PASTEL.length] : MODERN[(r * 991 | 0) % MODERN.length]; pitched = area < 200 && dist > 1200;
    }
    if (!isNaN(lv)) { h = lv * 3.1 + 1.2; pitched = pitched && lv <= 2; }
    if (!isNaN(h0)) h = h0;
    if (lv > 3) pitched = false;
    color = parseColor(t['building:colour'], color);
    const roof = parseColor(t['roof:colour'], pitched ? ROOFS[(r * 13 | 0) % ROOFS.length] : 0x55575a);
    if (t['roof:shape'] && t['roof:shape'] !== 'flat' && area < 600) pitched = true;
    return { h: Math.max(2.5, Math.min(h, 160)), color, roof, win, pitched };
  }
  function addBuilding(t, id, rings, holes) {
    // rings[0] = välisrõngas
    let outer = rings[0]; if (!closed(outer)) return;
    let area = ringArea(outer); if (Math.abs(area) < 6) return;
    if (area < 0) { const r = []; for (let i = outer.length - 2; i >= 0; i -= 2) r.push(outer[i], outer[i + 1]); outer = r; area = -area; }
    const bb = bbox(outer); const cx = (bb.minx + bb.maxx) / 2, cz = (bb.minz + bb.maxz) / 2;
    const st = buildingStyle(t, id, cx, cz, area);
    const tile = tileOf(cx, cz); const B = tbuf(tile, 'bld', true, true);
    const cr = ((st.color >> 16) & 255) / 255, cg = ((st.color >> 8) & 255) / 255, cb = (st.color & 255) / 255;
    const rr = ((st.roof >> 16) & 255) / 255, rg = ((st.roof >> 8) & 255) / 255, rb = (st.roof & 255) / 255;
    // sRGB -> lineaarne
    const lin = v => Math.pow(v, 2.2);
    const walls = (g, flip) => {
      for (let i = 0; i < g.length - 2; i += 2) {
        let ax = g[i], az = g[i + 1], bx = g[i + 2], bz = g[i + 3]; if (flip) { [ax, bx] = [bx, ax];[az, bz] = [bz, az]; }
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.05) continue;
        const nx = dz / l, nz = -dx / l, v = B.v, h = st.h;
        B.p.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az);
        for (let k = 0; k < 4; k++) { B.n.push(nx, 0, nz); B.c.push(lin(cr), lin(cg), lin(cb)); B.w.push(st.win); }
        B.i.push(v, v + 2, v + 1, v, v + 3, v + 2); B.v += 4;
      }
    };
    walls(outer, false);
    for (const hRing of holes || []) { if (closed(hRing)) walls(hRing, ringArea(hRing) > 0); }
    // katus
    const h = st.h;
    if (st.pitched && outer.length <= 14) {
      // lihtne püramiid/viilkatus: tipp keskele
      const ridge = Math.min(4, 1.2 + Math.sqrt(area) * 0.18);
      let mx = 0, mz = 0, n = 0; for (let i = 0; i < outer.length - 2; i += 2) { mx += outer[i]; mz += outer[i + 1]; n++; } mx /= n; mz /= n;
      for (let i = 0; i < outer.length - 2; i += 2) {
        const ax = outer[i], az = outer[i + 1], bx = outer[i + 2], bz = outer[i + 3];
        const e1x = bx - ax, e1z = bz - az, e2x = mx - ax, e2y = ridge, e2z = mz - az;
        let nx = e1z * e2y - 0 * e2z, ny = 0 * e2x - e1x * e2z + (e1z * e2x - 0) * 0, nz = e1x * e2y - e1z * 0;
        // normaal = e2 x e1 (välja ja üles)
        nx = e2y * e1z - e2z * 0; ny = e2z * e1x - e2x * e1z; nz = e2x * 0 - e2y * e1x;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const v = B.v; B.p.push(ax, h, az, bx, h, bz, mx, h + ridge, mz);
        for (let k = 0; k < 3; k++) { B.n.push(nx, ny, nz); B.c.push(lin(rr), lin(rg), lin(rb)); B.w.push(0); }
        // pind peab vaatama üles/välja
        B.i.push(v, v + 2, v + 1); B.v += 3;
      }
    } else {
      const T = tri(outer, (holes || []).filter(closed));
      const v0 = B.v; for (const p of T.pts) { B.p.push(p.x, h, p.y); B.n.push(0, 1, 0); B.c.push(lin(rr), lin(rg), lin(rb)); B.w.push(0); B.v++; }
      for (const f of T.idx) { // tagame ülespoole suunatuse
        const a = T.pts[f[0]], b = T.pts[f[1]], c = T.pts[f[2]];
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (cross < 0) B.i.push(v0 + f[0], v0 + f[1], v0 + f[2]); else B.i.push(v0 + f[0], v0 + f[2], v0 + f[1]);
      }
    }
    const rec = Object.assign({ g: outer, h: st.h, t, id, cx, cz }, bb);
    gridAdd(bGrid, bb.minx, bb.minz, bb.maxx, bb.maxz, rec);
    W.buildings.push(rec);
  }
  function windowMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.03 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWin;varying float vWin;varying vec3 vWP;varying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin=aWin;vWP=(modelMatrix*vec4(transformed,1.0)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWin;varying vec3 vWP;varying vec3 vWN;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 nn=normalize(vWN); vec2 tg=normalize(vec2(-nn.z,nn.x)+1e-5);
        float u=dot(vWP.xz,tg); vec2 cw=vec2(u,vWP.y)/vec2(3.3,3.1);
        vec2 cl=fract(cw); vec2 cid=floor(cw);
        float wall=step(0.5,1.0-abs(nn.y));
        float win=step(0.22,cl.x)*step(cl.x,0.78)*step(0.28,cl.y)*step(cl.y,0.80)*step(1.8,vWP.y)*wall*step(0.1,vWin);
        float rnd=fract(sin(dot(cid,vec2(12.9898,78.233)))*43758.5453);
        vec3 glass=mix(vec3(0.09,0.12,0.17),vec3(0.38,0.47,0.56),rnd*0.7);
        diffuseColor.rgb=mix(diffuseColor.rgb,glass,win*vWin);
        float plinth=step(vWP.y,0.7)*wall; diffuseColor.rgb*=1.0-plinth*0.3;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.12,win);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.6,win);');
    };
    return m;
  }

  // ---------- teed ----------
  function addRoadRibbon(B, g, w, y, rep) {
    const n = g.length / 2; let d = 0; const v0 = B.v;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 2, b = Math.min(n - 1, i + 1) * 2, x = g[i * 2], z = g[i * 2 + 1];
      let dx = g[b] - g[a], dz = g[b + 1] - g[a + 1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // nurgas laiendame (miter), max 2x
      let k = 1; if (i > 0 && i < n - 1) { const ax = x - g[i * 2 - 2], az = z - g[i * 2 - 1], la = Math.hypot(ax, az) || 1; const cos = (ax / la) * dx + (az / la) * dz; k = Math.min(2, 1 / Math.max(0.5, Math.sqrt((1 + cos) / 2))); }
      const rx = -dz * w / 2 * k, rz = dx * w / 2 * k;
      if (i > 0) d += Math.hypot(x - g[i * 2 - 2], z - g[i * 2 - 1]);
      B.p.push(x - rx, y, z - rz, x + rx, y, z + rz); B.n.push(0, 1, 0, 0, 1, 0); B.uv.push(0, d / rep, 1, d / rep);
      if (i < n - 1) { const q = v0 + i * 2; B.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    B.v += n * 2;
  }
  function addDisc(B, x, z, r, y) { const v0 = B.v; B.p.push(x, y, z); B.n.push(0, 1, 0); B.uv.push(0.5, 0.5); for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2; B.p.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r); B.n.push(0, 1, 0); B.uv.push(0.5, 0.5); } for (let k = 1; k <= 12; k++)B.i.push(v0, v0 + k + 1, v0 + k); B.v += 14; }
  function addPoly(B, outer, holes, y, color) {
    const T = tri(outer, holes); const v0 = B.v;
    for (const p of T.pts) { B.p.push(p.x, y, p.y); B.n.push(0, 1, 0); B.uv.push(p.x / 8, p.y / 8); if (B.c) B.c.push(color[0], color[1], color[2]); B.v++; }
    for (const f of T.idx) { const a = T.pts[f[0]], b = T.pts[f[1]], c = T.pts[f[2]]; const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); if (cr < 0) B.i.push(v0 + f[0], v0 + f[1], v0 + f[2]); else B.i.push(v0 + f[0], v0 + f[2], v0 + f[1]); }
  }
  const AREA = { // [värv, y]
    water: [0x24506b, 0.045], park: [0x4f8a3a, 0.025], garden: [0x568f3e, 0.025], grass: [0x5c9440, 0.022], recreation_ground: [0x5a9240, 0.024], village_green: [0x5c9440, 0.022], meadow: [0x7a9a48, 0.02],
    pitch: [0x3f8f4a, 0.03], stadium: [0x6a8a5a, 0.028], track: [0xa0503a, 0.032], golf_course: [0x5fa04a, 0.024], playground: [0xb0a080, 0.03], sports_centre: [0x8a8a7a, 0.028],
    forest: [0x2f5a2a, 0.021], wood: [0x2f5a2a, 0.021], scrub: [0x4f6f35, 0.021], grassland: [0x6f9a45, 0.02], wetland: [0x4a6a5a, 0.02], heath: [0x7a8a50, 0.02], sand: [0xd8c890, 0.02],
    farmland: [0xa89a5a, 0.012], farmyard: [0x9a8a6a, 0.014], orchard: [0x6a9040, 0.015], allotments: [0x7a9a50, 0.016], cemetery: [0x4f6f40, 0.018],
    industrial: [0x8a8a85, 0.012], retail: [0x9a9a98, 0.013], commercial: [0x9a9894, 0.013], residential: [0x6f8f52, 0.008], construction: [0x8a7a60, 0.014], brownfield: [0x8a7a60, 0.012],
    railway: [0x6a6258, 0.012], parking: [0x55575c, 0.06], greenfield: [0x7a9a48, 0.01], religious: [0x6f8f52, 0.01], education: [0x7a8f60, 0.011], military: [0x7a7a60, 0.01], plant_nursery: [0x6a9040, 0.015], basin: [0x24506b, 0.045], reservoir: [0x24506b, 0.045]
  };
  function areaKind(t) {
    if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
    if (t.amenity === 'parking') return 'parking';
    if (t.leisure && AREA[t.leisure]) return t.leisure;
    if (t.natural && AREA[t.natural]) return t.natural;
    if (t.landuse && AREA[t.landuse]) return t.landuse;
    return null;
  }

  // =================== PEAMINE EHITUS ===================
  W.build = async function (data, scene, renderer, quality, onProgress) {
    W.roads = []; W.buildings = []; W.labels = []; W.areas = []; W.waters = [];
    const tick = async (msg) => { onProgress(msg); await new Promise(r => setTimeout(r, 0)); };
    const tex = {}; ['hwy', 'main', 'street', 'plain', 'gravel', 'paving'].forEach(c => tex[c] = roadTex(renderer, c));
    const roadMats = {}; Object.keys(tex).forEach((c, i) => roadMats[c] = new THREE.MeshStandardMaterial({ map: tex[c], roughness: c === 'paving' ? 0.95 : 0.85, polygonOffset: true, polygonOffsetFactor: -2 - i * 0.1, polygonOffsetUnits: -4 }));
    const capMat = new THREE.MeshStandardMaterial({ color: 0x46484d, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 });
    const bldMat = windowMaterial();
    const areaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f4a66, roughness: 0.12, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 });

    // 1) alad: maakasutus, pargid, vesi
    const areaBuf = new Buf(true, false), waterBuf = new Buf(false, false);
    const lin = h => [Math.pow(((h >> 16) & 255) / 255, 2.2), Math.pow(((h >> 8) & 255) / 255, 2.2), Math.pow((h & 255) / 255, 2.2)];
    const handleArea = (t, outer, inner) => {
      const k = areaKind(t); if (!k) return;
      outer.forEach(o => {
        if (!closed(o)) return;
        const bb = bbox(o); const hs = inner.filter(h => { const b2 = bbox(h); return b2.minx >= bb.minx && b2.maxx <= bb.maxx && b2.minz >= bb.minz && b2.maxz <= bb.maxz; });
        if (k === 'water') { addPoly(waterBuf, o, hs, AREA.water[1]); const rec = Object.assign({ g: o, holes: hs }, bb); gridAdd(wGrid, bb.minx, bb.minz, bb.maxx, bb.maxz, rec); W.waters.push(rec); }
        else { addPoly(areaBuf, o, hs, AREA[k][1], lin(AREA[k][0])); W.areas.push(Object.assign({ k, g: o }, bb)); }
      });
    };
    let n = 0;
    for (const w of data.ways) { if (w.t.building || w.t.highway) continue; if (areaKind(w.t)) handleArea(w.t, [w.g], []); if (++n % 3000 === 0) await tick('Ehitan parke ja jõge… ' + n); }
    for (const r of data.rels) { if (r.t.building) continue; handleArea(r.t, r.outer, r.inner); }
    if (areaBuf.v) { const m = new THREE.Mesh(areaBuf.geo(), areaMat); m.receiveShadow = true; scene.add(m); }
    if (waterBuf.v) { const m = new THREE.Mesh(waterBuf.geo(), waterMat); m.receiveShadow = true; scene.add(m); }
    // jõejooned (kui vett polügoonina pole, nt varukaardil)
    const riverLines = new Buf(false, false);
    for (const w of data.ways) { if (w.t.waterway === 'river' || w.t.waterway === 'canal' || w.t.waterway === 'stream') addRoadRibbon(riverLines, w.g, w.t.waterway === 'stream' ? 3 : w.t.waterway === 'canal' ? 12 : 20, 0.04, 20); }
    if (riverLines.v) scene.add(new THREE.Mesh(riverLines.geo(), waterMat));

    // 2) teed
    await tick('Ehitan tänavaid…');
    const nodeUse = new Map();
    for (const w of data.ways) {
      const h = w.t.highway; if (!h || !RW[h] || w.g.length < 4) continue;
      if (w.t.area === 'yes' && closed(w.g)) { const t = tileOf(w.g[0], w.g[1]); addPoly(tbuf(t, 'r_paving'), w.g, [], ROADY.paving - 0.01); continue; }
      let wd = RW[h]; const lanes = parseInt(w.t.lanes); if (CAR.has(h) && lanes > 0) wd = Math.max(wd, Math.min(lanes, 6) * 3.4 + 1);
      const cls = CLASS(h); const y = ROADY[cls] + (w.t.bridge ? 0.02 : 0);
      // jagame pikad teed plaatideks
      const g = w.g; let start = 0;
      for (let i = 2; i <= g.length; i += 2) {
        const atEnd = i >= g.length - 2;
        const tA = Math.floor(g[start] / TILE) + ',' + Math.floor(g[start + 1] / TILE), tB = atEnd ? null : Math.floor(g[i] / TILE) + ',' + Math.floor(g[i + 1] / TILE);
        if (atEnd || tB !== tA || i - start > 200) {
          const end = atEnd ? g.length : i + 2; const part = g.slice(start, end);
          if (part.length >= 4) addRoadRibbon(tbuf(tileOf(part[0], part[1]), 'r_' + cls), part, wd, y, cls === 'hwy' ? 30 : 20);
          start = i; if (atEnd) break;
        }
      }
      const car = CAR.has(h) && w.t.service !== 'parking_aisle' && w.t.service !== 'driveway';
      const rec = { id: w.id, h, cls, name: w.t.name || w.t.ref || '', g: new Float32Array(g), n: w.n || [], w: wd, car, oneway: w.t.oneway === 'yes' || w.t.junction === 'roundabout' || h === 'motorway', lanes: lanes || 0 };
      const cum = [0]; for (let i = 2; i < g.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(g[i] - g[i - 2], g[i + 1] - g[i - 1])); rec.cum = cum; rec.len = cum[cum.length - 1];
      Object.assign(rec, bbox(g));
      W.roads.push(rec);
      for (let i = 0; i < g.length - 2; i += 2) gridAdd(segGrid, Math.min(g[i], g[i + 2]) - wd / 2, Math.min(g[i + 1], g[i + 3]) - wd / 2, Math.max(g[i], g[i + 2]) + wd / 2, Math.max(g[i + 1], g[i + 3]) + wd / 2, { r: rec, i });
      if (car && rec.n.length) { const ends = [0, rec.n.length - 1]; for (const e of ends) { nodeUse.set(rec.n[e], (nodeUse.get(rec.n[e]) || 0) + 1); } }
      if (car && wd >= 5) { // ristmike "plaastrid"
        for (const e of [0, g.length - 2]) addDisc(tbuf(tileOf(g[e], g[e + 1]), 'cap'), g[e], g[e + 1], wd / 2 * 1.02, ROADY[cls] - 0.006);
      }
    }
    // raudtee
    const railBuf = new Buf(false, false);
    for (const w of data.ways) if (w.t.railway === 'rail' && w.g.length >= 4) addRoadRibbon(railBuf, w.g, 3, 0.07, 10);
    if (railBuf.v) scene.add(new THREE.Mesh(railBuf.geo(), railMat));

    // 3) majad
    let bc = 0; const bTotal = data.ways.filter(w => w.t.building).length + data.rels.filter(r => r.t.building).length;
    for (const w of data.ways) { if (!w.t.building) continue; addBuilding(w.t, w.id, [w.g], []); if (++bc % 1500 === 0) await tick('Ehitan maju… ' + bc + ' / ' + bTotal); }
    for (const r of data.rels) { if (!r.t.building) continue; r.outer.forEach((o, i) => addBuilding(r.t, r.id * 10 + i, [o], r.inner)); }

    // 4) plaadid -> meshid
    await tick('Saadan graafikakaardile…');
    for (const t of tiles.values()) {
      for (const name in t.bufs) {
        const b = t.bufs[name]; if (!b.v) continue;
        let mat; if (name === 'bld') mat = bldMat; else if (name === 'cap') mat = capMat; else mat = roadMats[name.slice(2)];
        const m = new THREE.Mesh(b.geo(), mat); m.receiveShadow = true; m.castShadow = name === 'bld'; scene.add(m); t.meshes.push(m);
      }
      t.bufs = null;
    }

    // 5) puud
    await tick('Istutan puid…');
    const treePts = [];
    const maxTrees = quality === 'high' ? 26000 : 7000;
    for (const p of data.pois) if (p.k === 'tree') treePts.push([p.x, p.z]);
    for (const a of W.areas) {
      const dens = (a.k === 'forest' || a.k === 'wood') ? 1 / 90 : (a.k === 'park' || a.k === 'cemetery' || a.k === 'garden') ? 1 / 260 : (a.k === 'scrub' || a.k === 'wetland') ? 1 / 400 : 0;
      if (!dens) continue; const ar = (a.maxx - a.minx) * (a.maxz - a.minz); const cnt = Math.min(3000, ar * dens);
      for (let i = 0; i < cnt; i++) { const x = a.minx + Math.random() * (a.maxx - a.minx), z = a.minz + Math.random() * (a.maxz - a.minz); if (pip(a.g, x, z)) treePts.push([x, z]); }
    }
    // linnast väljas metsatukad maanteede ümber
    const outside = quality === 'high' ? 4000 : 1200;
    for (let i = 0; i < outside; i++) { const a = Math.random() * 7, rr = 6500 + Math.random() * 30000; const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr; for (let k = 0; k < 7; k++)treePts.push([cx + (Math.random() - .5) * 70, cz + (Math.random() - .5) * 70]); }
    const ok = []; for (const p of treePts) { if (ok.length >= maxTrees) break; if (W.nearestRoad(p[0], p[1]).d > 1.5 && !W.buildingAt(p[0], p[1]) && !W.waterAt(p[0], p[1])) ok.push(p); }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), ok.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), ok.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    ok.forEach(([x, z], i) => {
      const h = 3 + Math.random() * 5, s = 2 + Math.random() * 2.6; q.identity(); m4.compose(v3.set(x, 0, z), q, s3.set(1, h, 1)); trunk.setMatrixAt(i, m4);
      q.setFromEuler(e.set(Math.random(), Math.random() * 6, 0)); m4.compose(v3.set(x, h + s * 0.55, z), q, s3.set(s, s * 1.2, s)); crown.setMatrixAt(i, m4);
      crown.setColorAt(i, c.setHSL(0.22 + Math.random() * 0.1, 0.42 + Math.random() * 0.2, 0.2 + Math.random() * 0.12));
    });
    trunk.castShadow = crown.castShadow = quality === 'high'; scene.add(trunk, crown);

    // 6) poodide ja kohtade sildid
    const seenName = new Set();
    for (const p of data.pois) if (p.name && p.k !== 'tree') { W.labels.push({ x: p.x, z: p.z, name: p.name, k: p.k }); }
    for (const w of data.ways) if (w.t.name && (w.t.shop || w.t.amenity || w.t.tourism) && closed(w.g)) { const bb = bbox(w.g); const b = W.buildingAt((bb.minx + bb.maxx) / 2, (bb.minz + bb.maxz) / 2); W.labels.push({ x: (bb.minx + bb.maxx) / 2, z: (bb.minz + bb.maxz) / 2, name: w.t.name, k: w.t.shop ? 'shop' : w.t.amenity || 'tourism', y: b ? b.h : 0 }); }
    for (const l of W.labels) { if (l.y == null) { const b = W.buildingAt(l.x, l.z); l.y = b ? b.h : 0; } }
    W.stats = { buildings: W.buildings.length, roads: W.roads.length, labels: W.labels.length, trees: ok.length };
    W.tiles = [...tiles.values()];
  };

  // kaugete plaatide peitmine (kiiruse jaoks)
  W.updateVisibility = function (x, z, dist) {
    const d2 = (dist + TILE) * (dist + TILE);
    for (const t of W.tiles) { const v = (t.cx - x) ** 2 + (t.cz - z) ** 2 < d2; for (const m of t.meshes) m.visible = v; }
  };
  W.roadPos = function (r, s) {
    s = Math.max(0, Math.min(r.len - 0.001, s));
    let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m; }
    const g = r.g, ax = g[lo * 2], az = g[lo * 2 + 1], bx = g[hi * 2], bz = g[hi * 2 + 1];
    const t = (s - r.cum[lo]) / ((r.cum[hi] - r.cum[lo]) || 1), dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    return { x: ax + dx * t, z: az + dz * t, fx: dx / l, fz: dz / l, i: lo };
  };
})(window.TB);

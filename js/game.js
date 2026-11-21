// game.js — mängu põhiloogika: ratas, füüsika, kaamera, HUD, minikaart, menüüd
window.TB = window.TB || {};
(function (TB) {
  'use strict';
  const $ = id => document.getElementById(id);
  const W = TB.World, V = TB.Vision, AI = TB.AI;
  const Game = TB.Game = { running: false };
  let QUALITY = 'high', renderer, scene, camera, sun, sky, clouds, worldBuilt = false, mapData = null;
  const VMAX = 300 / 3.6;

  TB.toast = function (t, ms) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', ms || 5000); };

  // ---------- renderer ja taevas ----------
  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: QUALITY === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(QUALITY === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1) * 0.75);
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = QUALITY === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); Game.scene = scene;
    const far = QUALITY === 'high' ? 2600 : 1300; Game.viewDist = far;
    scene.fog = new THREE.Fog(0xbcd3e8, far * 0.15, far);
    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 9000); scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.8));
    sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.castShadow = QUALITY === 'high'; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 600; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vP;void main(){float h=vP.y;vec3 top=vec3(0.18,0.42,0.85);vec3 hor=vec3(0.76,0.85,0.94);vec3 c=mix(hor,top,pow(max(h,0.0),0.55));vec3 s=normalize(vec3(-0.45,0.55,0.35));float sd=max(dot(vP,s),0.0);c+=vec3(1.0,0.9,0.7)*pow(sd,400.0)*3.0+vec3(1.0,0.8,0.5)*pow(sd,8.0)*0.25;if(h<0.0)c=mix(hor,vec3(0.45,0.5,0.45),min(-h*8.0,1.0));gl_FragColor=vec4(c,1.0);}'
    })); sky.renderOrder = -1; scene.add(sky);
    const NC = QUALITY === 'high' ? 200 : 70; clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, emissiveIntensity: 0.35, fog: false }), NC);
    const m4 = new THREE.Matrix4(); let ctr;
    for (let c = 0; c < NC; c++) { if (c % 5 === 0) ctr = { x: (Math.random() - .5) * 12000, z: (Math.random() - .5) * 12000, y: 600 + Math.random() * 300 }; const s = 60 + Math.random() * 120; m4.compose(new THREE.Vector3(ctr.x + (Math.random() - .5) * 300, ctr.y + Math.random() * 40, ctr.z + (Math.random() - .5) * 200), new THREE.Quaternion(), new THREE.Vector3(s * 1.6, s * 0.5, s)); clouds.setMatrixAt(c, m4); }
    scene.add(clouds);
    // maapind
    const gc = document.createElement('canvas'); gc.width = gc.height = 512; const gx = gc.getContext('2d'); gx.fillStyle = '#5a8238'; gx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) { const v = (Math.random() - .5) * 0.18; gx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; gx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(10000, 10000); gt.encoding = THREE.sRGBEncoding; gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  }

  // ---------- e-ratta lenks ----------
  let rig, leverB, leverG, dispTex, dispCtx;
  function buildBike() {
    rig = new THREE.Group(); camera.add(rig); rig.position.set(0, -0.36, -0.62); rig.rotation.x = 0.25;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.7, roughness: 0.35 }), rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 }), orange = new THREE.MeshStandardMaterial({ color: 0xff6b35, metalness: 0.4, roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.78, 12), metal); bar.rotation.z = Math.PI / 2; rig.add(bar);
    for (const sd of [-1, 1]) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 12), rubber); g.rotation.z = Math.PI / 2; g.position.x = sd * 0.33; rig.add(g); }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 10), orange); stem.position.set(0, -0.18, 0.05); stem.rotation.x = -0.3; rig.add(stem);
    leverB = new THREE.Group(); leverB.position.set(0.24, 0, -0.01); const lb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.022), new THREE.MeshStandardMaterial({ color: 0xd01818, metalness: 0.5, roughness: 0.3 })); lb.position.set(0.08, 0, -0.05); leverB.add(lb); rig.add(leverB);
    leverG = new THREE.Group(); leverG.position.set(-0.25, 0, 0); const lg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x22cc55, metalness: 0.4, roughness: 0.3 })); lg.position.set(0, -0.02, -0.04); leverG.add(lg); rig.add(leverG);
    const dc = document.createElement('canvas'); dc.width = 256; dc.height = 128; dispCtx = dc.getContext('2d'); dispTex = new THREE.CanvasTexture(dc); dispTex.encoding = THREE.sRGBEncoding;
    const disp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.012), [metal, metal, metal, metal, new THREE.MeshBasicMaterial({ map: dispTex }), metal]); disp.position.set(0, 0.045, 0); disp.rotation.x = -0.6; rig.add(disp);
    rig.traverse(o => { if (o.isMesh) { o.renderOrder = 10; o.material.fog = false; } });
  }
  function drawDisplay(kmh, bat) {
    const x = dispCtx; x.fillStyle = '#05080c'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#6bf0ff'; x.font = 'bold 64px monospace'; x.textAlign = 'right'; x.fillText(Math.round(kmh), 180, 80);
    x.font = 'bold 20px monospace'; x.fillText('km/h', 245, 80); x.fillStyle = '#333'; x.fillRect(16, 96, 224, 16); x.fillStyle = bat > 20 ? '#3f6' : '#f33'; x.fillRect(16, 96, 224 * bat / 100, 16);
    x.fillStyle = '#ffd23f'; x.textAlign = 'left'; x.font = 'bold 18px monospace'; x.fillText(V.ready() ? (AI.models.brake || AI.models.gas || AI.models.steer ? 'AI' : 'KAAMERA') : 'TURBO 300', 14, 26); dispTex.needsUpdate = true;
  }

  // ---------- sildid (poed, kohad) ----------
  const labelPool = [], texCache = new Map();
  function labelTex(name, k) {
    if (texCache.has(name)) return texCache.get(name);
    if (texCache.size > 400) { for (const t of texCache.values()) t.dispose(); texCache.clear(); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.font = 'bold 44px system-ui,sans-serif';
    const txt = name.length > 22 ? name.slice(0, 21) + '…' : name; const w = Math.min(500, x.measureText(txt).width + 40);
    x.fillStyle = k === 'shop' ? 'rgba(200,40,80,0.85)' : 'rgba(15,20,30,0.8)'; x.beginPath(); if (x.roundRect) x.roundRect((512 - w) / 2, 10, w, 76, 20); else x.rect((512 - w) / 2, 10, w, 76); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 256, 50);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; texCache.set(name, t); return t;
  }
  function initLabels() { for (let i = 0; i < (QUALITY === 'high' ? 40 : 16); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, depthTest: true })); s.scale.set(24, 4.5, 1); s.visible = false; scene.add(s); labelPool.push(s); } }
  function updateLabels() {
    const near = []; for (const l of W.labels) { const d = (l.x - P.x) ** 2 + (l.z - P.z) ** 2; if (d < 260 * 260) near.push([d, l]); }
    near.sort((a, b) => a[0] - b[0]); const used = new Set();
    let j = 0; for (const [, l] of near) { if (j >= labelPool.length) break; if (used.has(l.name + Math.round(l.x / 30))) continue; used.add(l.name + Math.round(l.x / 30)); const s = labelPool[j++]; s.material.map = labelTex(l.name, l.k); s.material.needsUpdate = true; s.position.set(l.x, (l.y || 0) + 5, l.z); s.visible = true; }
    for (; j < labelPool.length; j++) labelPool[j].visible = false;
  }

  // ---------- mängija ----------
  const P = Game.player = { x: 0, z: 0, heading: 0, v: 0, lean: 0, steer: 0, bat: 100, crash: 0, shake: 0, odo: 0 };
  const TELEPORTS = [
    { n: 'Raekoja plats', ll: [58.3801, 26.7224] },
    { n: 'Tallinna maantee – 300 km/h!', ll: [58.4300, 26.6450], hwy: true },
    { n: 'Ihaste', ll: [58.3555, 26.7790] },
    { n: 'Lõunakeskus', ll: [58.3578, 26.6775] },
    { n: 'Annelinn', ll: [58.3715, 26.7620] },
    { n: 'Eesti Rahva Muuseum', ll: [58.3965, 26.7525] },
    { n: 'Riia maantee', ll: [58.3250, 26.6250], hwy: true },
    { n: 'Võru maantee', ll: [58.3150, 26.7600], hwy: true },
    { n: 'Narva maantee', ll: [58.4250, 26.8400], hwy: true },
  ];
  let tpIdx = 0;
  function teleport(t) {
    const p = TB.P(t.ll[0], t.ll[1]); let best = 1e18, br = null, bi = 0;
    for (const r of W.roads) {
      if (!r.car) continue; if (t.hwy && r.cls !== 'hwy' && r.cls !== 'main') continue;
      if (r.maxx < p[0] - 3000 || r.minx > p[0] + 3000 || r.maxz < p[1] - 3000 || r.minz > p[1] + 3000) continue;
      for (let i = 0; i < r.g.length - 2; i += 2) { const d = (r.g[i] - p[0]) ** 2 + (r.g[i + 1] - p[1]) ** 2; if (d < best) { best = d; br = r; bi = i; } }
    }
    if (!br) { P.x = p[0]; P.z = p[1]; }
    else { const dx = br.g[bi + 2] - br.g[bi], dz = br.g[bi + 3] - br.g[bi + 1], l = Math.hypot(dx, dz) || 1; P.x = br.g[bi] - dz / l * br.w * 0.22; P.z = br.g[bi + 1] + dx / l * br.w * 0.22; P.heading = Math.atan2(dx / l, dz / l); }
    P.v = 0; TB.Traffic.reset(); showMsg(t.n); W.updateVisibility(P.x, P.z, Game.viewDist); updateLabels();
  }

  // ---------- sisend ----------
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true; if (!Game.running) return;
    if (e.code === 'KeyT') { tpIdx = (tpIdx + 1) % TELEPORTS.length; teleport(TELEPORTS[tpIdx]); }
    if (e.code === 'KeyR') { tpIdx = 0; P.bat = 100; teleport(TELEPORTS[0]); }
    if (e.code === 'KeyC') openCamSetup();
    if (e.code === 'KeyM') miniZoom = miniZoom === 1 ? 3 : miniZoom === 3 ? 10 : 1;
    if (e.code === 'Escape' || e.code === 'Backspace') { Game.running = false; $('menu').style.display = 'flex'; $('hud').style.display = 'none'; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  function inputs() {
    let gas = 0, brake = 0, steer = 0;
    if (keys.KeyW || keys.ArrowUp) gas = 1; if (keys.KeyS || keys.ArrowDown || keys.Space) brake = 1;
    if (keys.KeyA || keys.ArrowLeft) steer -= 1; if (keys.KeyD || keys.ArrowRight) steer += 1;
    const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) { gas = Math.max(gas, gp.buttons[7] ? gp.buttons[7].value : 0); brake = Math.max(brake, gp.buttons[6] ? gp.buttons[6].value : 0); if (!steer && Math.abs(gp.axes[0]) > 0.15) steer = gp.axes[0]; }
    if (V.ready()) { gas = Math.max(gas, V.val.gas); brake = Math.max(brake, V.val.brake); if (!steer) steer = V.val.steer; }
    return { gas, brake, steer };
  }

  // ---------- füüsika ----------
  let locT = 0;
  function update(dt) {
    const inp = inputs();
    P.steer += (inp.steer - P.steer) * Math.min(1, dt * (V.ready() ? 6 : 4));
    const nr = W.nearestRoad(P.x, P.z), onRoad = nr.d < 1.2, inWater = !onRoad && W.waterAt(P.x, P.z);
    let a = 0; const v = P.v;
    if (P.bat > 0 && inp.gas > 0) { a += inp.gas * (9.5 * (1 - Math.pow(v / (VMAX * 1.1), 3)) + (v < 15 ? 3 : 0)); P.bat = Math.max(0, P.bat - inp.gas * dt * 0.06 * (0.4 + v / VMAX)); }
    a -= inp.brake * 14 * (v > 0 ? 1 : 0); a -= 0.25 + 0.00012 * v * v;
    if (!onRoad) a -= inWater ? 6 + v * 0.3 : 0.6 + v * 0.03;
    P.v = Math.max(0, Math.min(VMAX, P.v + a * dt));
    const yaw = P.steer * (1.6 * 14 / (14 + P.v)) * (P.v > 0.5 ? 1 : P.v * 2); P.heading -= yaw * dt;
    P.lean += (-P.steer * Math.min(1, P.v / 12) * 0.22 - P.lean) * Math.min(1, dt * 5);
    // liikumine alamsammudega (et kiirel sõidul majadest läbi ei läheks)
    const dist = P.v * dt, steps = Math.max(1, Math.ceil(dist / 1.5));
    for (let s = 0; s < steps; s++) {
      const nx = P.x + Math.sin(P.heading) * dist / steps, nz = P.z + Math.cos(P.heading) * dist / steps;
      if (W.buildingAt(nx + Math.sin(P.heading) * 0.6, nz + Math.cos(P.heading) * 0.6)) { if (P.v > 8) crash('BÄNG! Maja!'); P.v = 0; break; }
      P.odo += dist / steps; P.x = nx; P.z = nz;
    }
    for (const c of TB.Traffic.cars) {
      if (!c.r) continue; const dx = P.x - c.x, dz = P.z - c.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const fx = Math.sin(c.ang), fz = Math.cos(c.ang), lz = dx * fx + dz * fz, lx = -dx * fz + dz * fx;
      if (Math.abs(lz) < 2.6 && Math.abs(lx) < 1.3 && (P.v > 3 || c.v > 3)) { crash('KRAHH! Auto!'); P.v *= 0.15; c.v = 0; const sg = Math.sign(lx || 1); P.x += sg * (-fz) * 1.6; P.z += sg * fx * 1.6; }
    }
    P.shake = Math.max(0, P.shake - dt * 2); if (!onRoad) P.shake = Math.max(P.shake, Math.min(0.3, P.v * 0.01));
    if (inWater && Math.random() < dt * 1.5) showMsg('Pläts! Emajõgi 🌊');
    locT -= dt; if (locT < 0) { locT = 0.5; $('loc').textContent = inWater ? 'Emajõgi' : (nr.road && nr.d < 25 ? (nr.road.name || nr.road.h) : 'Tartumaa'); }
    return inp;
  }
  function crash(t) { if (P.crash > 0) return; P.crash = 1.2; P.shake = 1; showMsg(t); sfx(); }
  let msgT = 0; function showMsg(t) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; msgT = 2.2; }

  // ---------- kiirusjooned ----------
  let lines;
  function buildLines() {
    const N = 260, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false })); lines.frustumCulled = false;
    lines.userData.p = []; for (let i = 0; i < N; i++) lines.userData.p.push({ x: (Math.random() - .5) * 16, y: Math.random() * 6 - 1.5, z: -Math.random() * 60 }); camera.add(lines);
  }
  function updateLines(dt) {
    const k = Math.max(0, (P.v - 25) / (VMAX - 25)); lines.material.opacity = k * 0.5; if (k <= 0) return;
    const pos = lines.geometry.attributes.position.array;
    lines.userData.p.forEach((p, i) => { p.z += P.v * dt * 1.2; if (p.z > 0) { p.z = -60; p.x = (Math.random() - .5) * 16; p.y = Math.random() * 6 - 1.5; if (Math.abs(p.x) < 1.2 && Math.abs(p.y) < 0.8) p.x += p.x < 0 ? -2 : 2; } const L = 0.5 + k * 3.5; pos.set([p.x, p.y, p.z, p.x, p.y, p.z - L], i * 6); });
    lines.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- heli ----------
  let AC, motor, motorG, windG;
  function initAudio() {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      motor = AC.createOscillator(); motor.type = 'sawtooth'; motorG = AC.createGain(); motorG.gain.value = 0; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; motor.connect(lp); lp.connect(motorG); motorG.connect(AC.destination); motor.start();
      const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const wind = AC.createBufferSource(); wind.buffer = buf; wind.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6; windG = AC.createGain(); windG.gain.value = 0; wind.connect(bp); bp.connect(windG); windG.connect(AC.destination); wind.start();
    } catch (e) { }
  }
  function updateAudio(inp) { if (!AC) return; const k = P.v / VMAX; motor.frequency.setTargetAtTime(90 + k * 1400, AC.currentTime, 0.05); motorG.gain.setTargetAtTime(Game.running ? 0.015 + inp.gas * 0.05 + k * 0.03 : 0, AC.currentTime, 0.08); windG.gain.setTargetAtTime(Game.running ? Math.min(0.35, k * k * 0.45) : 0, AC.currentTime, 0.1); }
  function sfx() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.setValueAtTime(140, AC.currentTime); o.frequency.exponentialRampToValueAtTime(30, AC.currentTime + 0.5); g.gain.setValueAtTime(0.3, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.6); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.6); }

  // ---------- minikaart ----------
  let miniZoom = 1; const mini = $('mini'), mx = mini.getContext('2d');
  const MCOL = { hwy: '#ffcc33', main: '#ffffff', street: '#d8d8d8', plain: '#a8a8a8', gravel: '#b09a70', paving: '#8a8f80' };
  function drawMini() {
    const S = 240, sc = 0.45 / miniZoom, R = (S / 2) / sc * 1.45;
    mx.save(); mx.fillStyle = '#24361f'; mx.fillRect(0, 0, S, S); mx.translate(S / 2, S / 2); mx.rotate(P.heading + Math.PI); mx.scale(sc, sc); mx.translate(-P.x, -P.z);
    mx.fillStyle = '#3b7fb0'; for (const w of W.waters) { if (w.maxx < P.x - R || w.minx > P.x + R || w.maxz < P.z - R || w.minz > P.z + R) continue; mx.beginPath(); for (let i = 0; i < w.g.length; i += 2) i ? mx.lineTo(w.g[i], w.g[i + 1]) : mx.moveTo(w.g[i], w.g[i + 1]); mx.fill(); }
    if (miniZoom < 5) { mx.fillStyle = '#8c8577'; for (const b of W.buildings) { if (b.maxx < P.x - R || b.minx > P.x + R || b.maxz < P.z - R || b.minz > P.z + R) continue; mx.beginPath(); for (let i = 0; i < b.g.length; i += 2) i ? mx.lineTo(b.g[i], b.g[i + 1]) : mx.moveTo(b.g[i], b.g[i + 1]); mx.fill(); } }
    for (const cls of ['paving', 'gravel', 'plain', 'street', 'main', 'hwy']) {
      if (miniZoom >= 5 && (cls === 'paving' || cls === 'plain' || cls === 'gravel')) continue;
      mx.strokeStyle = MCOL[cls]; mx.lineWidth = Math.max(cls === 'hwy' ? 4 : cls === 'main' ? 3 : 1.5, 0) / sc * (cls === 'paving' ? 0.5 : 1); mx.beginPath();
      for (const r of W.roads) { if (r.cls !== cls || r.maxx < P.x - R || r.minx > P.x + R || r.maxz < P.z - R || r.minz > P.z + R) continue; for (let i = 0; i < r.g.length; i += 2) i ? mx.lineTo(r.g[i], r.g[i + 1]) : mx.moveTo(r.g[i], r.g[i + 1]); }
      mx.stroke();
    }
    mx.fillStyle = '#ff4040'; for (const c of TB.Traffic.cars) if (c.r && Math.abs(c.x - P.x) < R && Math.abs(c.z - P.z) < R) mx.fillRect(c.x - 3 / sc, c.z - 3 / sc, 6 / sc, 6 / sc);
    mx.restore(); mx.fillStyle = '#ffd23f'; mx.beginPath(); mx.moveTo(S / 2, S / 2 - 10); mx.lineTo(S / 2 - 7, S / 2 + 8); mx.lineTo(S / 2 + 7, S / 2 + 8); mx.fill();
  }

  // ---------- laadimine ja ehitus ----------
  function progress(msg) { $('loadbox').style.display = 'block'; $('loadmsg').textContent = msg; const m = /(\d+)\s*\/\s*(\d+)/.exec(msg); if (m) $('loadbar').style.width = (100 * m[1] / m[2]) + '%'; else if (/MB/.test(msg)) $('loadbar').style.width = Math.min(90, parseFloat(msg.match(/([\d.]+) MB/)[1]) * 3) + '%'; }
  async function ensureWorld() {
    if (worldBuilt) return;
    ['btnCam', 'btnKey', 'qLow', 'qHigh'].forEach(i => $(i).disabled = true);
    try {
      mapData = await TB.loadMap(progress);
      $('mapsrc').textContent = mapData.source;
      initRenderer();
      await W.build(mapData, scene, renderer, QUALITY, progress);
      $('mapstats').textContent = `· ${W.stats.buildings} maja, ${W.stats.roads} teed, ${W.stats.labels} poodi/kohta, ${W.stats.trees} puud`;
      TB.Traffic.init(scene, QUALITY); buildBike(); buildLines(); initLabels();
      worldBuilt = true; teleport(TELEPORTS[0]);
      $('loadbox').style.display = 'none';
      if (mapData.fallback) TB.toast('OpenStreetMap ei olnud kättesaadav – kasutan lihtsustatud kaarti. Proovi menüüst „Laadi värske kaart“, kui internet töötab.', 9000);
      requestAnimationFrame(loop);
    } finally { ['btnCam', 'btnKey', 'qLow', 'qHigh'].forEach(i => $(i).disabled = false); $('qLow').disabled = $('qHigh').disabled = worldBuilt; }
  }
  function startGame() {
    if (!AC) initAudio(); else if (AC.resume) AC.resume();
    $('menu').style.display = 'none'; $('camsetup').style.display = 'none'; $('hud').style.display = 'block'; $('cam').style.display = V.ready() ? 'block' : 'none';
    Game.running = true; last = performance.now();
  }
  async function openCamSetup() {
    Game.running = false; $('hud').style.display = 'none';
    if (!(await V.start())) { $('menu').style.display = 'flex'; return; }
    $('menu').style.display = 'none'; $('camsetup').style.display = 'flex'; UI.refreshAI();
    if (!camLoop) { camLoop = true; const f = t => { V.tick(t); if (!worldBuilt || !Game.running) { /* ka menüüs */ } requestAnimationFrame(f); }; requestAnimationFrame(f); }
  }
  let camLoop = false;

  // ---------- AI paneeli UI ----------
  const UI = TB.UI = {};
  UI.refreshAI = function () {
    const box = $('aiControls'); box.innerHTML = '';
    for (const k of ['brake', 'gas', 'steer']) {
      const C = AI.CONTROLS[k], d = document.createElement('div'); d.className = 'aictl';
      const inf = AI.info[k]; d.innerHTML = `<h3>${C.name}<span>${inf ? 'treenitud · täpsus ' + Math.round(inf.acc * 100) + '% · ' + inf.n + ' näidet' : (AI.data[k].length ? AI.data[k].length + ' näidet, treenimata' : 'pole näiteid')}</span></h3>`;
      const row = document.createElement('div'); row.className = 'row'; row.style.margin = '4px 0';
      C.classes.forEach((cl, i) => { const b = document.createElement('button'); b.className = 'rec'; b.textContent = '● ' + cl + ' (' + AI.count(k, i) + ')'; b.onclick = () => { V.sel = k === 'steer' ? 'head' : k; V.startRec(k, i); }; row.appendChild(b); });
      const del = document.createElement('button'); del.className = 'rec'; del.textContent = '🗑'; del.title = 'Kustuta selle juhtimise näited ja mudel'; del.onclick = () => { if (confirm('Kustuta ' + C.name + ' näited ja mudel?')) { AI.clear(k); UI.refreshAI(); } }; row.appendChild(del);
      d.appendChild(row); const pr = document.createElement('div'); pr.className = 'pred'; pr.id = 'pred-' + k; pr.textContent = AI.models[k] ? '…' : 'treenimata'; d.appendChild(pr);
      box.appendChild(d);
    }
  };
  function chart(hist) {
    const c = $('trainchart'), x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.strokeStyle = '#333'; x.strokeRect(0, 0, c.width, c.height);
    const cols = { brake: '#ff5c5c', gas: '#5cff7a', steer: '#ffd23f' };
    for (const k in hist) { const h = hist[k]; if (!h.length) continue; x.strokeStyle = cols[k]; x.lineWidth = 2; x.beginPath(); h.forEach((v, i) => { const px = i / Math.max(1, h.length - 1) * (c.width - 10) + 5, py = c.height - 5 - v * (c.height - 10); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); }
    x.fillStyle = '#aaa'; x.font = '11px sans-serif'; x.fillText('täpsus (valideerimine) 0–100%', 8, 14);
  }
  function bindUI() {
    $('qLow').onclick = () => { QUALITY = 'low'; $('qLow').classList.add('sel'); $('qHigh').classList.remove('sel'); };
    $('qHigh').onclick = () => { QUALITY = 'high'; $('qHigh').classList.add('sel'); $('qLow').classList.remove('sel'); };
    $('btnKey').onclick = async () => { await ensureWorld(); startGame(); };
    $('btnCam').onclick = async () => { await openCamSetup(); ensureWorld(); };
    $('btnGo').onclick = async () => { if (!V.ready()) { TB.toast('Treeni enne AI või tee lihtne kalibreerimine.'); return; } await ensureWorld(); startGame(); };
    $('btnCamBack').onclick = () => { $('camsetup').style.display = 'none'; $('menu').style.display = 'flex'; };
    const selb = { brake: $('rBrake'), gas: $('rGas'), head: $('rHead') };
    for (const k in selb) selb[k].onclick = () => { V.sel = k; for (const j in selb) selb[j].classList.toggle('sel', j === k); };
    $('btnCal').onclick = () => V.startCal();
    $('btnInv').onclick = () => { V.inv *= -1; V.saveSettings(); TB.toast('Rooli suund pööratud.'); };
    $('tabAI').onclick = () => { $('paneAI').style.display = ''; $('paneSimple').style.display = 'none'; $('tabAI').classList.add('sel'); $('tabSimple').classList.remove('sel'); };
    $('tabSimple').onclick = () => { $('paneAI').style.display = 'none'; $('paneSimple').style.display = ''; $('tabSimple').classList.add('sel'); $('tabAI').classList.remove('sel'); };
    $('btnTrain').onclick = async () => {
      if (AI.training) return; AI.training = true; $('btnTrain').disabled = true; const hist = { brake: [], gas: [], steer: [] }; const res = [];
      try {
        for (const k of ['brake', 'gas', 'steer']) {
          if (!AI.data[k].length) continue;
          try { const inf = await AI.train(k, (ep, n, loss, acc) => { hist[k].push(acc); chart(hist); $('trainmsg').textContent = `${AI.CONTROLS[k].name}: epohh ${ep}/${n} · kadu ${loss.toFixed(3)} · täpsus ${Math.round(acc * 100)}%`; }); res.push(AI.CONTROLS[k].name + ' ' + Math.round(inf.acc * 100) + '%'); }
          catch (e) { res.push(e.message); }
        }
        $('trainmsg').textContent = res.length ? 'Valmis: ' + res.join(' · ') + '. Proovi hoobe – ülal näed AI ennustust.' : 'Pole midagi treenida – salvesta enne näiteid.';
      } finally { AI.training = false; $('btnTrain').disabled = false; UI.refreshAI(); }
    };
    $('btnExport').onclick = () => download('tartu-ebike-ai.json', JSON.stringify(AI.exportAll(V.rois)));
    $('fileImport').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const rois = AI.importAll(JSON.parse(await f.text())); if (rois) Object.assign(V.rois, rois); V.snapshotRefs(); V.saveSettings(); await AI.save(); UI.refreshAI(); TB.toast('AI imporditud!'); } catch (err) { TB.toast('Import ebaõnnestus: ' + err.message); } };
    $('btnMapReload').onclick = async () => { if (worldBuilt) { if (!confirm('Kaart laetakse uuesti ja leht värskendatakse. Jätka?')) return; } await TB.idbDel('osm-v2'); try { const d = await TB.loadMap(progress, true); $('mapsrc').textContent = d.source; if (!d.fallback) { TB.toast('Värske kaart salvestatud. Värskendan…'); setTimeout(() => location.reload(), 800); } } catch (e) { TB.toast(e.message); } };
    $('btnMapSave').onclick = async () => { const d = mapData || await TB.idbGet('osm-v2'); if (!d || d.fallback) { TB.toast('Pole päris kaarti salvestada – laadi enne kaart OpenStreetMapist.'); return; } const c = Object.assign({}, d); delete c.source; download('tartu-osm.json', JSON.stringify(c)); };
    V.bindCanvas();
  }
  function download(name, text) { const b = new Blob([text], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  // ---------- põhitsükkel ----------
  let last = performance.now(), dispT = 0, miniT = 0, visT = 0, labT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!camLoop) V.tick(now);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!Game.running) { camera.position.set(P.x, 1.6, P.z); camera.rotation.set(0, P.heading + Math.PI + now * 0.0001, 0, 'YXZ'); sky.position.set(P.x, 0, P.z); renderer.render(scene, camera); updateAudio({ gas: 0 }); return; }
    const inp = update(dt); TB.Traffic.update(dt, P); P.crash = Math.max(0, P.crash - dt);
    const sh = P.shake * 0.06;
    camera.position.set(P.x + (Math.random() - .5) * sh, 1.62 + (Math.random() - .5) * sh + Math.sin(P.odo * 0.9) * 0.01, P.z + (Math.random() - .5) * sh);
    camera.rotation.set(-0.05, P.heading + Math.PI, P.lean, 'YXZ');
    const fov = 72 + Math.min(1, P.v / VMAX) * 26; if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }
    rig.rotation.y = -P.steer * 0.25 * (14 / (14 + P.v)); leverB.rotation.y = inp.brake * 0.35; leverG.rotation.x = -inp.gas * 0.6;
    sun.position.set(P.x - 140, 200, P.z + 100); sun.target.position.set(P.x, 0, P.z); sky.position.set(P.x, 0, P.z); clouds.position.set(P.x * 0.85, 0, P.z * 0.85);
    visT -= dt; if (visT < 0) { visT = 0.4; W.updateVisibility(P.x, P.z, Game.viewDist); }
    labT -= dt; if (labT < 0) { labT = 0.6; updateLabels(); }
    updateLines(dt); updateAudio(inp);
    renderer.render(scene, camera);
    const kmh = P.v * 3.6; $('spd').textContent = Math.round(kmh); $('bGas').style.height = (inp.gas * 100) + '%'; $('bBrake').style.height = (inp.brake * 100) + '%'; $('bBat').style.height = P.bat + '%'; $('steerI').style.left = (127 + P.steer * 120) + 'px';
    dispT -= dt; if (dispT < 0) { dispT = 0.15; drawDisplay(kmh, P.bat); }
    miniT -= dt; if (miniT < 0) { miniT = QUALITY === 'high' ? 0.06 : 0.15; drawMini(); }
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
    if (P.bat <= 0 && Math.random() < dt * 0.4) showMsg('Aku tühi! Vajuta R');
  }

  // ---------- käivitus ----------
  V.loadSettings(); bindUI();
  AI.load().then(rois => { if (rois) Object.assign(V.rois, rois); UI.refreshAI(); });
  TB.idbGet('osm-v2').then(d => { if (d) $('mapsrc').textContent = 'vahemälu (' + (d.created || '').slice(0, 10) + ')'; else $('mapsrc').textContent = 'laetakse esimesel käivitusel (~1–3 min)'; });
  Game.teleport = t => teleport(t); Game.TELEPORTS = TELEPORTS;
})(window.TB);

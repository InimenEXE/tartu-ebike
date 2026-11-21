// vision.js — veebikaamera: kastid (pidur, gaas, pea), lihtne kalibreerimine ja AI treenimise salvestus
window.TB = window.TB || {};
(function (TB) {
  'use strict';
  const $ = id => document.getElementById(id);
  const CW = 160, CH = 120;
  const V = TB.Vision = {
    stream: null, video: null, pc: null, pctx: null, gray: new Float32Array(CW * CH),
    rois: { brake: { x: 112, y: 76, w: 38, h: 32 }, gas: { x: 10, y: 76, w: 38, h: 32 }, head: { x: 50, y: 6, w: 60, h: 58 } },
    ref: {}, d0: { brake: 0, gas: 0 }, d1: { brake: 20, gas: 20 }, headL: -14, inv: 1,
    calibrated: false, val: { brake: 0, gas: 0, steer: 0 }, raw: { brake: 0, gas: 0, shift: 0 }, ai: { brake: null, gas: null, steer: null },
    cal: null, rec: null, sel: 'head', active: false
  };
  const AI = TB.AI;
  V.ready = () => !!(V.active && (V.calibrated || AI.models.brake || AI.models.gas || AI.models.steer));

  V.start = async function () {
    if (V.stream) return true;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      V.video = document.createElement('video'); V.video.playsInline = true; V.video.muted = true; V.video.srcObject = st; await V.video.play();
      V.pc = document.createElement('canvas'); V.pc.width = CW; V.pc.height = CH; V.pctx = V.pc.getContext('2d', { willReadFrequently: true });
      V.stream = st; V.active = true; return true;
    } catch (e) { TB.toast('Kaamerat ei saanud avada: ' + e.message + '. Kontrolli, et kaamera on ühendatud ja brauser lubab seda (vajab https või kohalikku faili).'); return false; }
  };
  function grab() {
    const x = V.pctx; x.save(); x.translate(CW, 0); x.scale(-1, 1); x.drawImage(V.video, 0, 0, CW, CH); x.restore();
    const d = x.getImageData(0, 0, CW, CH).data, g = V.gray; for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
  }
  function clampRoi(r) { r.w = Math.max(8, Math.min(CW, Math.round(r.w))); r.h = Math.max(8, Math.min(CH, Math.round(r.h))); r.x = Math.max(0, Math.min(CW - r.w, Math.round(r.x))); r.y = Math.max(0, Math.min(CH - r.h, Math.round(r.y))); }
  function patch(r) { const p = new Float32Array(r.w * r.h); for (let y = 0; y < r.h; y++)for (let x = 0; x < r.w; x++)p[y * r.w + x] = V.gray[(r.y + y) * CW + r.x + x]; return p; }
  function diffVal(r, ref) { if (!ref || ref.length !== r.w * r.h) return 0; let s = 0; for (let y = 0; y < r.h; y++)for (let x = 0; x < r.w; x++)s += Math.abs(V.gray[(r.y + y) * CW + r.x + x] - ref[y * r.w + x]); return s / (r.w * r.h); }
  function headShift() {
    const r = V.rois.head, ref = V.ref.head; if (!ref || ref.length !== r.w * r.h) return 0; let best = 1e18, bx = 0; const R = Math.round(r.w * 0.7);
    for (let dy = -4; dy <= 4; dy += 2)for (let dx = -R; dx <= R; dx++) {
      let s = 0, n = 0;
      for (let y = 0; y < r.h; y += 3) { const yy = r.y + y + dy; if (yy < 0 || yy >= CH) continue; for (let x = 0; x < r.w; x += 3) { const xx = r.x + x + dx; if (xx < 0 || xx >= CW) { s += 60; n++; continue; } s += Math.abs(V.gray[yy * CW + xx] - ref[y * r.w + x]); n++; } }
      s = s / (n || 1) + Math.abs(dx) * 0.02; if (s < best) { best = s; bx = dx; }
    }
    return bx;
  }
  // AI tunnus: kast -> S×S hall pilt, normaliseeritud (valgusmuutustele vastupidav)
  V.feature = function (k, jitter) {
    const r = V.rois[k === 'steer' ? 'head' : k], S = AI.CONTROLS[k].size, out = new Float32Array(S * S);
    let jx = 0, jy = 0, js = 1; if (jitter) { jx = (Math.random() - .5) * r.w * 0.08; jy = (Math.random() - .5) * r.h * 0.08; js = 1 + (Math.random() - .5) * 0.1; }
    const cx = r.x + r.w / 2 + jx, cy = r.y + r.h / 2 + jy, w = r.w * js, h = r.h * js; let mean = 0;
    for (let y = 0; y < S; y++)for (let x = 0; x < S; x++) {
      // 2x2 alamvalim
      let s = 0; for (let a = 0; a < 2; a++)for (let b = 0; b < 2; b++) { const px = Math.max(0, Math.min(CW - 1, Math.round(cx - w / 2 + (x + 0.25 + a * 0.5) / S * w))), py = Math.max(0, Math.min(CH - 1, Math.round(cy - h / 2 + (y + 0.25 + b * 0.5) / S * h))); s += V.gray[py * CW + px]; }
      out[y * S + x] = s / 4; mean += s / 4;
    }
    mean /= S * S; let sd = 0; for (let i = 0; i < out.length; i++) sd += (out[i] - mean) ** 2; sd = Math.sqrt(sd / out.length);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mean) / (sd + 10);
    return out;
  };
  function snapshotRefs() { for (const k of ['brake', 'gas', 'head']) { clampRoi(V.rois[k]); V.ref[k] = patch(V.rois[k]); } }
  V.snapshotRefs = snapshotRefs;

  let last = 0;
  V.tick = function (now) {
    if (!V.stream || !V.video || V.video.readyState < 2) return;
    if (now - last < 45) return; last = now;
    grab();
    if (!V.ref.head) snapshotRefs();
    V.raw.brake = diffVal(V.rois.brake, V.ref.brake); V.raw.gas = diffVal(V.rois.gas, V.ref.gas); V.raw.shift = headShift();
    // lihtne meetod
    const lv = k => Math.max(0, Math.min(1, (V.raw[k] - V.d0[k]) / Math.max(4, V.d1[k] - V.d0[k]) * 1.15 - 0.08));
    let s = -(V.raw.shift / (V.headL || -14)) * V.inv; s = Math.abs(s) < 0.12 ? 0 : Math.sign(s) * (Math.abs(s) - 0.12) / 0.88; s = Math.max(-1, Math.min(1, s));
    const simple = { brake: lv('brake'), gas: lv('gas'), steer: s };
    // AI meetod (kui mudel on treenitud)
    for (const k of ['brake', 'gas', 'steer']) {
      let v = V.calibrated ? simple[k] : 0;
      if (AI.models[k]) { const p = AI.predict(k, V.feature(k, false)); V.ai[k] = p; v = AI.value(k, p); if (k === 'steer') v *= V.inv; if (k === 'steer' && Math.abs(v) < 0.1) v = 0; }
      V.val[k] += (v - V.val[k]) * 0.55;
    }
    for (const k of ['brake', 'gas']) if (simple[k] < 0.05 && !V.cal && V.ref[k]) { const r = V.rois[k], ref = V.ref[k]; for (let y = 0; y < r.h; y++)for (let x = 0; x < r.w; x++) { const i = y * r.w + x; ref[i] += (V.gray[(r.y + y) * CW + r.x + x] - ref[i]) * 0.01; } }
    if (V.cal) calTick(now);
    if (V.rec) recTick(now);
    draw();
  };

  // ---------- joonistamine ----------
  const COL = { brake: '#ff5c5c', gas: '#5cff7a', head: '#ffd23f' };
  function draw() {
    const targets = []; if ($('camsetup').style.display === 'flex') targets.push($('cv')); if (TB.Game && TB.Game.running && V.ready()) targets.push($('cam'));
    for (const cv of targets) {
      const x = cv.getContext('2d'), s = cv.width / CW; x.drawImage(V.pc, 0, 0, cv.width, cv.height);
      for (const k of ['brake', 'gas', 'head']) {
        const r = V.rois[k]; x.strokeStyle = COL[k]; x.lineWidth = (k === V.sel && cv.id === 'cv') ? 4 : 2;
        const ox = (k === 'head' && !AI.models.steer) ? V.raw.shift * s : 0; x.strokeRect(r.x * s + ox, r.y * s, r.w * s, r.h * s);
        if (k !== 'head') { const v = V.val[k]; x.globalAlpha = 0.35; x.fillStyle = COL[k]; x.fillRect(r.x * s, (r.y + r.h) * s - r.h * s * v, r.w * s, r.h * s * v); x.globalAlpha = 1; }
        x.fillStyle = COL[k]; x.font = `bold ${Math.max(9, Math.round(7 * s))}px sans-serif`; x.fillText({ brake: 'PIDUR', gas: 'GAAS', head: 'PEA' }[k], r.x * s + 3, r.y * s - 4 < 10 ? r.y * s + 14 : r.y * s - 4);
      }
    }
    if ($('camsetup').style.display === 'flex') {
      $('mB').style.width = (V.val.brake * 100) + '%'; $('mG').style.width = (V.val.gas * 100) + '%'; $('mS').style.left = (50 + V.val.steer * 48) + '%';
      for (const k of ['brake', 'gas', 'steer']) { const p = V.ai[k], el = $('pred-' + k); if (el) el.textContent = p ? AI.CONTROLS[k].classes.map((c, i) => c + ' ' + Math.round(p[i] * 100) + '%').join(' · ') : 'treenimata'; }
    }
  }

  // ---------- lihtne kalibreerimine ----------
  const CAL = [
    { t: 'Lase mõlemad hoovad LAHTI ja vaata otse kaamerasse…', d: 3000, k: 'rest' },
    { t: 'Vajuta ja HOIA PIDURIT…', d: 3000, k: 'brake' },
    { t: 'Vajuta ja HOIA KÄIGUVAHETAJAT (gaas)…', d: 3000, k: 'gas' },
    { t: 'KALLUTA PEA VASAKULE ja hoia…', d: 2500, k: 'left' }];
  V.startCal = function () { snapshotRefs(); V.cal = { i: 0, t0: performance.now(), acc: [] }; beep(660); };
  function calTick(now) {
    const c = V.cal, st = CAL[c.i], el = now - c.t0;
    if (el > 600) c.acc.push(st.k === 'left' ? V.raw.shift : st.k === 'rest' ? [V.raw.brake, V.raw.gas] : V.raw[st.k]);
    $('calmsg').textContent = st.t + ' ' + Math.ceil((st.d - el) / 1000);
    if (el >= st.d) {
      const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      if (st.k === 'rest') { V.d0.brake = avg(c.acc.map(a => a[0])); V.d0.gas = avg(c.acc.map(a => a[1])); }
      else if (st.k === 'left') { const s = avg(c.acc); V.headL = Math.abs(s) < 3 ? -14 : s * 0.8; }
      else V.d1[st.k] = Math.max(V.d0[st.k] + 5, avg(c.acc) * 0.85);
      c.i++; c.acc = []; c.t0 = now; beep(c.i >= CAL.length ? 990 : 660);
      if (c.i >= CAL.length) {
        V.cal = null; V.calibrated = true; saveSettings();
        const warn = []; if (V.d1.brake - V.d0.brake < 6) warn.push('pidur'); if (V.d1.gas - V.d0.gas < 6) warn.push('gaas');
        $('calmsg').textContent = warn.length ? 'Valmis, aga ' + warn.join(' ja ') + ' signaal on nõrk – liiguta kast hoova peale või kasuta AI treeningut.' : '✅ Valmis! Proovi hoobe ja pea kallutamist.';
      }
    }
  }

  // ---------- AI näidete salvestamine ----------
  V.startRec = function (k, cls) {
    if (V.rec) return;
    V.rec = { k, cls, t0: performance.now(), phase: 'count', n: 0 };
  };
  function recTick(now) {
    const r = V.rec, el = now - r.t0, name = AI.CONTROLS[r.k].name + ' → ' + AI.CONTROLS[r.k].classes[r.cls].toUpperCase();
    if (r.phase === 'count') {
      const left = Math.ceil((3000 - el) / 1000); $('recmsg').textContent = 'Valmistu: ' + name + ' … ' + left;
      if (r.lastBeep !== left) { r.lastBeep = left; beep(440); }
      if (el >= 3000) { r.phase = 'rec'; r.t0 = now; beep(880); }
    } else {
      $('recmsg').textContent = '● SALVESTAN: ' + name + ' (' + r.n + ')';
      AI.addSample(r.k, V.feature(r.k, true), r.cls); AI.addSample(r.k, V.feature(r.k, true), r.cls); r.n += 2;
      if (r.k === 'steer') { /* ok */ }
      if (el >= 4000) { V.rec = null; beep(990); $('recmsg').textContent = '✅ Salvestatud ' + r.n + ' näidet. Salvesta kõik klassid ja vajuta „Treeni AI“.'; TB.UI.refreshAI(); AI.save(); }
    }
  }
  let actx; function beep(f) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.12); } catch (e) { } }

  // ---------- seaded ----------
  function saveSettings() { try { localStorage.setItem('tb-vision', JSON.stringify({ rois: V.rois, d0: V.d0, d1: V.d1, headL: V.headL, inv: V.inv })); } catch (e) { } }
  V.saveSettings = saveSettings;
  V.loadSettings = function () { try { const o = JSON.parse(localStorage.getItem('tb-vision') || 'null'); if (o) { Object.assign(V.rois, o.rois); V.d0 = o.d0; V.d1 = o.d1; V.headL = o.headL; V.inv = o.inv || 1; } } catch (e) { } };

  // ---------- kastide joonistamine hiire/sõrmega ----------
  V.bindCanvas = function () {
    const cv = $('cv'); let drag = null;
    const pt = e => { const r = cv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [(t.clientX - r.left) / r.width * CW, (t.clientY - r.top) / r.height * CH]; };
    const down = e => { e.preventDefault(); drag = pt(e); };
    const move = e => { if (!drag) return; e.preventDefault(); const p = pt(e), r = V.rois[V.sel]; r.x = Math.min(drag[0], p[0]); r.y = Math.min(drag[1], p[1]); r.w = Math.abs(p[0] - drag[0]); r.h = Math.abs(p[1] - drag[1]); };
    const up = () => {
      if (!drag) return; drag = null; const r = V.rois[V.sel]; if (r.w < 8 || r.h < 8) { r.w = Math.max(r.w, 24); r.h = Math.max(r.h, 24); } clampRoi(r); snapshotRefs(); V.calibrated = false; saveSettings();
      const k = V.sel === 'head' ? 'steer' : V.sel; if (AI.data[k].length) $('calmsg').textContent = 'Kast muudetud. NB! ' + AI.CONTROLS[k].name + ' AI näited tehti vana kastiga – kustuta need ja salvesta uuesti.'; else $('calmsg').textContent = 'Kast muudetud – kalibreeri või treeni AI.';
    };
    cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move); addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); addEventListener('touchend', up);
  };
})(window.TB);

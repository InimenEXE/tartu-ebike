// fallback.js — lihtsustatud Tartu kaart juhuks, kui OpenStreetMap pole kättesaadav (nt internetita)
window.TB = window.TB || {};
(function (TB) {
  'use strict';
  const ROADS = [
    { n: 'Tallinna maantee', h: 'trunk', p: [[58.3868, 26.7158], [58.3940, 26.7050], [58.4010, 26.6930], [58.4100, 26.6780], [58.4200, 26.6600], [58.4400, 26.6300], [58.4800, 26.5800], [58.5400, 26.5000], [58.6000, 26.4300], [58.6600, 26.3500], [58.7200, 26.2600]] },
    { n: 'Riia maantee', h: 'trunk', p: [[58.3770, 26.7190], [58.3720, 26.7130], [58.3650, 26.7000], [58.3570, 26.6850], [58.3500, 26.6700], [58.3300, 26.6300], [58.3000, 26.5800], [58.2600, 26.5200], [58.2100, 26.4500], [58.1600, 26.3800]] },
    { n: 'Narva maantee', h: 'primary', p: [[58.3822, 26.7290], [58.3860, 26.7400], [58.3910, 26.7550], [58.3970, 26.7720], [58.4050, 26.7950], [58.4200, 26.8300], [58.4450, 26.8900], [58.4700, 26.9600], [58.5000, 27.0400]] },
    { n: 'Võru tänav', h: 'primary', p: [[58.3720, 26.7240], [58.3620, 26.7300], [58.3540, 26.7360], [58.3420, 26.7420], [58.3200, 26.7550], [58.2900, 26.7800], [58.2500, 26.8100]] },
    { n: 'Ringtee', h: 'primary', p: [[58.3520, 26.6740], [58.3530, 26.6900], [58.3530, 26.7050], [58.3515, 26.7200], [58.3540, 26.7360], [58.3590, 26.7520], [58.3640, 26.7640], [58.3700, 26.7760]] },
    { n: 'Turu tänav', h: 'secondary', p: [[58.3772, 26.7300], [58.3720, 26.7380], [58.3660, 26.7480], [58.3600, 26.7550]] },
    { n: 'Vabaduse puiestee', h: 'tertiary', p: [[58.3845, 26.7228], [58.3810, 26.7262], [58.3790, 26.7278], [58.3765, 26.7298]] },
    { n: 'Ülikooli tänav', h: 'residential', p: [[58.3835, 26.7212], [58.3810, 26.7205], [58.3790, 26.7210], [58.3765, 26.7200]] },
    { n: 'Kalda tee', h: 'secondary', p: [[58.3810, 26.7390], [58.3760, 26.7480], [58.3700, 26.7600], [58.3640, 26.7700], [58.3590, 26.7800], [58.3540, 26.7950]] },
    { n: 'Sõpruse sild', h: 'secondary', p: [[58.3700, 26.7330], [58.3712, 26.7420], [58.3725, 26.7500], [58.3740, 26.7600], [58.3760, 26.7720]] },
    { n: 'Anne tänav', h: 'secondary', p: [[58.3785, 26.7330], [58.3755, 26.7450], [58.3720, 26.7600], [58.3690, 26.7720], [58.3660, 26.7820]] },
    { n: 'Jaama tänav', h: 'tertiary', p: [[58.3860, 26.7335], [58.3910, 26.7370], [58.3960, 26.7410], [58.4050, 26.7480]] },
    { n: 'Aardla tänav', h: 'tertiary', p: [[58.3650, 26.7000], [58.3610, 26.7120], [58.3590, 26.7230], [58.3570, 26.7320]] },
    { n: 'Tähe tänav', h: 'tertiary', p: [[58.3742, 26.7180], [58.3690, 26.7200], [58.3640, 26.7220], [58.3560, 26.7250]] },
    { n: 'Raadi tee', h: 'residential', p: [[58.3862, 26.7400], [58.3910, 26.7460], [58.3950, 26.7510], [58.3975, 26.7560]] },
    { n: 'Ihaste tee', h: 'tertiary', p: [[58.3600, 26.7550], [58.3580, 26.7650], [58.3560, 26.7760], [58.3545, 26.7900]] },
    { n: 'Puiestee', h: 'tertiary', p: [[58.3880, 26.7240], [58.3920, 26.7300], [58.3950, 26.7330], [58.3985, 26.7350]] },
    { n: 'Kreutzwaldi tänav', h: 'tertiary', p: [[58.3835, 26.7340], [58.3860, 26.7450], [58.3880, 26.7560]] },
    { n: 'Lille tänav', h: 'residential', p: [[58.3700, 26.7000], [58.3740, 26.7060], [58.3770, 26.7120], [58.3790, 26.7175]] },
  ];
  const RIVER = [[58.4060, 26.6600], [58.4020, 26.6800], [58.3985, 26.6960], [58.3945, 26.7080], [58.3890, 26.7170], [58.3845, 26.7232], [58.3812, 26.7262], [58.3780, 26.7292], [58.3740, 26.7340], [58.3705, 26.7410], [58.3670, 26.7500], [58.3625, 26.7610], [58.3575, 26.7720], [58.3530, 26.7850], [58.3500, 26.8050], [58.3480, 26.8300]];

  function densify(ll, step) {
    const pts = ll.map(a => TB.P(a[0], a[1])); const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) out.push(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
    }
    const l = pts[pts.length - 1]; out.push(l[0], l[1]); return out;
  }
  TB.fallbackMap = function () {
    const d = { v: 2, ways: [], rels: [], pois: [], fallback: true };
    let nid = 1;
    ROADS.forEach((r, i) => { const g = densify(r.p, 25); const n = []; for (let k = 0; k < g.length / 2; k++)n.push(nid++); d.ways.push({ id: i + 1, t: { highway: r.h, name: r.n }, g, n }); });
    // jõgi polügoonina
    const c = densify(RIVER, 30), L = [], R = [];
    for (let i = 0; i < c.length; i += 2) {
      const a = Math.max(0, i - 2), b = Math.min(c.length - 2, i + 2); let dx = c[b] - c[a], dz = c[b + 1] - c[a + 1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      L.push(c[i] + dz * 38, c[i + 1] - dx * 38); R.push(c[i] - dz * 38, c[i + 1] + dx * 38);
    }
    const ring = L.slice(); for (let i = R.length - 2; i >= 0; i -= 2) ring.push(R[i], R[i + 1]); ring.push(ring[0], ring[1]);
    d.ways.push({ id: 900, t: { natural: 'water', name: 'Emajõgi' }, g: ring });
    // lihtsad majad teede äärde
    const roadPts = []; d.ways.forEach(w => { if (w.t.highway) for (let i = 0; i < w.g.length; i += 2) roadPts.push(w.g[i], w.g[i + 1]); });
    const near = (x, z, r) => { for (let i = 0; i < roadPts.length; i += 2) { const dx = roadPts[i] - x, dz = roadPts[i + 1] - z; if (dx * dx + dz * dz < r * r) return true; } return false; };
    let id = 1000;
    d.ways.forEach(w => {
      if (!w.t.highway) return;
      for (let i = 2; i < w.g.length - 2; i += 2) {
        const x = w.g[i], z = w.g[i + 1]; if (Math.hypot(x, z) > 5000) continue;
        const dx = w.g[i + 2] - x, dz = w.g[i + 3] - z, l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
        for (const sd of [-1, 1]) {
          if (Math.random() < 0.3) continue;
          const wd = 10 + Math.random() * 18, dp = 9 + Math.random() * 10, off = 14 + dp / 2;
          const cx = x - fz * off * sd, cz = z + fx * off * sd;
          if (near(cx, cz, 13 + dp / 2)) continue;
          const pts = [[-wd / 2, -dp / 2], [wd / 2, -dp / 2], [wd / 2, dp / 2], [-wd / 2, dp / 2], [-wd / 2, -dp / 2]];
          const g = []; pts.forEach(([a, b]) => g.push(cx + a * fx - b * fz, cz + a * fz + b * fx));
          d.ways.push({ id: id++, t: { building: 'yes', 'building:levels': String(1 + (Math.random() * (Math.hypot(x, z) < 1500 ? 5 : 2) | 0)) }, g });
        }
      }
    });
    return d;
  };
})(window.TB);

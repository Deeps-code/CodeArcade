/* =====================================================================
   Wave Survivor: hero artwork (plain Canvas drawing, no images)

   HeroArt.drawBody(g, id)        the hero's body, centered on (0, 0), facing right-ish.
                                  Feet are at about y = +17, the top of the head about y = -21
                                  (hats go higher). Drawn once per hero and cached by the game.
   HeroArt.drawWeapon(g, id, t)   the held weapon, pointing along +x from the hand at (0, 0).
                                  Drawn live so it can swing toward the aim.
   HeroArt.weapon(id)             { kind, melee } info about how the weapon is used
   HeroArt.portrait(id, px)       a portrait canvas for menus and the HUD
   ===================================================================== */
(() => {
  'use strict';
  const TAU = Math.PI * 2;

  // ---------- small drawing helpers ----------
  function rgb(hex) {
    let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // lighten (k > 0) or darken (k < 0) a color
  const sh = (hex, k) => 'rgb(' + rgb(hex).map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))).join(',') + ')';
  const INK = 'rgba(22,14,8,0.9)';   // outline color: keeps the heroes readable on the dark floor
  // vertical light-to-dark gradient for a shaded "volume"
  function vg(g, y0, y1, col, hi = 0.28, lo = -0.38) {
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, sh(col, hi)); gr.addColorStop(1, sh(col, lo)); return gr;
  }
  function rg(g, x, y, r, col) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    gr.addColorStop(0, sh(col, 0.35)); gr.addColorStop(0.65, col); gr.addColorStop(1, sh(col, -0.35)); return gr;
  }
  function shape(g, path, fill, stroke = INK, lw = 1.3) {
    g.beginPath(); path(); g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
  }
  const ell = (g, x, y, rx, ry, rot = 0) => g.ellipse(x, y, rx, ry, rot, 0, TAU);
  function rr(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function star(g, x, y, r1, r2, n, rot = -Math.PI / 2) {
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath();
  }

  // ---------- the shared body: boots, torso or robe, arms, head, face ----------
  function body(g, o) {
    if (o.cape) shape(g, () => { g.moveTo(-9, -5); g.quadraticCurveTo(-16, 8, -14, 17); g.quadraticCurveTo(0, 20, 14, 17); g.quadraticCurveTo(16, 8, 9, -5); g.closePath(); }, vg(g, -5, 18, o.cape, 0.1, -0.5));
    if (!o.robe) for (const s of [-1, 1]) shape(g, () => ell(g, s * 4.4, 15, 3.7, 2.9), vg(g, 12, 18, o.boots || '#3f2a1a'));
    if (o.robe) shape(g, () => { g.moveTo(-8, -4); g.quadraticCurveTo(-12, 7, -13, 16.5); g.quadraticCurveTo(0, 19.5, 13, 16.5); g.quadraticCurveTo(12, 7, 8, -4); g.closePath(); }, vg(g, -4, 18, o.body));
    else shape(g, () => rr(g, -9, -4, 18, 16, 5), vg(g, -4, 12, o.body));
    if (o.robeTrim) { g.strokeStyle = o.robeTrim; g.lineWidth = 2; g.beginPath(); g.moveTo(-12.2, 15.2); g.quadraticCurveTo(0, 18.4, 12.2, 15.2); g.stroke(); g.beginPath(); g.moveTo(0, -1); g.lineTo(0, 17.8); g.stroke(); }
    if (o.belt) { g.fillStyle = o.belt; g.fillRect(o.robe ? -10.5 : -9, 5.5, o.robe ? 21 : 18, 3); g.fillStyle = o.buckle || '#facc15'; g.fillRect(-1.8, 5.2, 3.6, 3.6); }
    for (const s of [-1, 1]) shape(g, () => ell(g, s * 10.3, 1.5, 3.6, 4.6), vg(g, -3, 6, o.sleeve || o.body));
    for (const s of [-1, 1]) shape(g, () => g.arc(s * 10.8, 6.2, 2.5, 0, TAU), o.glove || o.skin);
    if (o.neck) o.neck(g);
    if (o.back) o.back(g);   // things drawn behind the head (hoods, hair)
    shape(g, () => g.arc(0, -11, 9.6, 0, TAU), rg(g, 0, -11, 9.6, o.skin));
    if (o.face !== false) face(g, o);
  }
  function face(g, o) {
    const ey = o.eyeY ?? -10;
    if (o.glowEyes) {
      for (const s of [-1, 1]) { g.fillStyle = o.glowEyes; g.beginPath(); ell(g, s * 3.4, ey, 1.9, 1.3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(s * 3.4, ey, 0.7, 0, TAU); g.fill(); }
      return;
    }
    for (const s of [-1, 1]) {
      g.fillStyle = '#1c1410'; g.beginPath(); ell(g, s * 3.4, ey, 1.5, 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(s * 3.4 + 0.5, ey - 0.8, 0.6, 0, TAU); g.fill();
    }
    if (o.brows) { g.strokeStyle = o.brows; g.lineWidth = 1.4; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 1.6, ey - 2.6); g.lineTo(s * 5, ey - 3.8 + (o.angry ? 1.6 : 0)); g.stroke(); } }
    if (o.blush !== false) { g.fillStyle = 'rgba(244,114,182,0.35)'; for (const s of [-1, 1]) { g.beginPath(); ell(g, s * 5.6, ey + 2.6, 1.8, 1); g.fill(); } }
  }
  const SKIN = '#f2c79a', SKIN2 = '#d9a273', SKIN3 = '#a8714a';

  // ---------- the 17 heroes (+ the druid's bear form) ----------
  const HEROES = {
    warrior: {
      weapon: 'sword', melee: true,
      draw(g) {
        body(g, { skin: SKIN, body: '#b91c1c', sleeve: '#94a3b8', boots: '#4a3424', belt: '#5b3a1e', cape: '#7f1d1d', brows: '#5b3a1e',
          neck(g) { shape(g, () => { g.moveTo(-8, -3); g.lineTo(8, -3); g.lineTo(6.5, 6); g.quadraticCurveTo(0, 9, -6.5, 6); g.closePath(); }, vg(g, -3, 8, '#cbd5e1')); g.fillStyle = '#b91c1c'; g.fillRect(-1.2, -2, 2.4, 7); } });
        // steel helm with a nose guard and a red crest
        shape(g, () => { g.arc(0, -12, 10.4, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(10.4, -9.5); g.lineTo(-10.4, -9.5); g.closePath(); }, vg(g, -23, -9, '#cbd5e1'));
        shape(g, () => rr(g, -1.3, -13, 2.6, 8, 1), '#94a3b8');
        shape(g, () => { g.moveTo(-2.5, -21.5); g.quadraticCurveTo(3, -31, 11, -25); g.quadraticCurveTo(5, -24, 2.5, -20.5); g.closePath(); }, vg(g, -30, -20, '#ef4444'));
      },
    },
    mage: {
      weapon: 'staff', orb: '#c4b5fd', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#6d28d9', robe: true, robeTrim: '#fbbf24', belt: '#3b0764', buckle: '#c4b5fd', glove: SKIN,
          back(g) { shape(g, () => { g.moveTo(-9, -12); g.quadraticCurveTo(-12, -1, -9, 3); g.lineTo(9, 3); g.quadraticCurveTo(12, -1, 9, -12); g.closePath(); }, '#e5e7eb'); } });
        // white beard
        shape(g, () => { g.moveTo(-6, -7); g.quadraticCurveTo(0, 6, 6, -7); g.quadraticCurveTo(0, -4, -6, -7); g.closePath(); }, vg(g, -7, 4, '#f3f4f6'));
        // tall pointed hat with stars and a gold band
        shape(g, () => ell(g, 0, -17.5, 15, 4.5), vg(g, -22, -13, '#5b21b6'));
        shape(g, () => { g.moveTo(-9, -18); g.quadraticCurveTo(-4, -30, 2, -38); g.quadraticCurveTo(10, -36, 13, -31); g.quadraticCurveTo(6, -32, 4.5, -29); g.quadraticCurveTo(7, -24, 9, -18); g.closePath(); }, vg(g, -38, -17, '#7c3aed'));
        g.fillStyle = '#fbbf24'; g.beginPath(); g.moveTo(-9, -18.5); g.quadraticCurveTo(0, -16, 9, -18.5); g.lineTo(8.4, -21.5); g.quadraticCurveTo(0, -19, -8.4, -21.5); g.closePath(); g.fill();
        g.fillStyle = '#fde68a'; g.beginPath(); star(g, -1, -27, 2.4, 1, 5); g.fill(); g.beginPath(); star(g, 4, -33, 1.5, 0.6, 4); g.fill();
      },
    },
    archer: {
      weapon: 'bow', melee: false,
      draw(g) {
        // quiver behind the shoulder
        shape(g, () => rr(g, 3, -16, 6, 16, 2.5), vg(g, -16, 0, '#7c4a24'));
        g.strokeStyle = '#e7e5e4'; g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(4.5 + i * 1.5, -16); g.lineTo(3.5 + i * 2, -21); g.stroke(); }
        g.fillStyle = '#ef4444'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(3.5 + i * 2, -21); g.lineTo(2.3 + i * 2, -23.5); g.lineTo(5 + i * 2, -22.5); g.closePath(); g.fill(); }
        body(g, { skin: SKIN, body: '#15803d', sleeve: '#166534', boots: '#5b3a1e', belt: '#78350f', cape: '#14532d',
          neck(g) { shape(g, () => { g.moveTo(-7, -3); g.lineTo(7, -3); g.lineTo(5, 8); g.lineTo(-5, 8); g.closePath(); }, vg(g, -3, 8, '#92400e')); g.strokeStyle = '#5b3a1e'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, -3); g.lineTo(8, 9); g.stroke(); },
          back(g) { shape(g, () => { g.arc(0, -11, 11.6, Math.PI * 0.8, Math.PI * 2.2); g.quadraticCurveTo(9, 2, 0, 1); g.quadraticCurveTo(-9, 2, -11, -4); g.closePath(); }, vg(g, -23, 2, '#16a34a')); } });
        // hood rim + feather
        shape(g, () => { g.arc(0, -11, 11.4, Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(0, -17, -11, -15.3); g.closePath(); }, vg(g, -23, -14, '#22c55e'));
        shape(g, () => { g.moveTo(7, -19); g.quadraticCurveTo(16, -27, 18, -20); g.quadraticCurveTo(13, -21, 8, -16.5); g.closePath(); }, '#fbbf24');
      },
    },
    guardian: {
      weapon: 'shield', melee: true,
      draw(g) {
        body(g, { skin: '#94a3b8', body: '#1d4ed8', sleeve: '#93c5fd', glove: '#64748b', boots: '#334155', belt: '#1e3a8a', buckle: '#fbbf24', cape: '#1e3a8a', face: false,
          neck(g) { shape(g, () => rr(g, -8.5, -3.5, 17, 11, 4), vg(g, -3, 8, '#bfdbfe')); g.fillStyle = '#fbbf24'; g.beginPath(); star(g, 0, 2, 3.4, 1.4, 4); g.fill(); } });
        // big pauldrons
        for (const s of [-1, 1]) shape(g, () => ell(g, s * 10.5, -2, 5.6, 4.2, s * 0.3), vg(g, -6, 2, '#93c5fd'));
        // great helm with a T visor
        shape(g, () => { g.moveTo(-10, -4); g.lineTo(-10, -15); g.quadraticCurveTo(-10, -23, 0, -23.5); g.quadraticCurveTo(10, -23, 10, -15); g.lineTo(10, -4); g.quadraticCurveTo(0, -1.5, -10, -4); g.closePath(); }, vg(g, -24, -3, '#cbd5e1'));
        g.fillStyle = '#0f172a'; g.fillRect(-7, -13, 14, 2.6); g.fillRect(-1.3, -13, 2.6, 7.5);
        g.fillStyle = 'rgba(147,197,253,0.9)'; g.fillRect(-5.5, -12.4, 3, 1.3); g.fillRect(2.5, -12.4, 3, 1.3);
        shape(g, () => { g.moveTo(-1.5, -23); g.lineTo(0, -27); g.lineTo(1.5, -23); g.closePath(); }, '#fbbf24');
      },
    },
    assassin: {
      weapon: 'daggers', melee: true,
      draw(g) {
        body(g, { skin: '#e8b98f', body: '#1f2937', sleeve: '#111827', glove: '#111827', boots: '#0b0f17', belt: '#7c3aed', buckle: '#a78bfa', glowEyes: '#f87171', eyeY: -11,
          back(g) { shape(g, () => { g.arc(0, -11.5, 11.2, Math.PI * 0.75, Math.PI * 2.25); g.lineTo(6, 2); g.lineTo(-6, 2); g.closePath(); }, vg(g, -23, 2, '#374151')); } });
        // face scarf: only the eyes show
        shape(g, () => { g.moveTo(-9.4, -8.5); g.quadraticCurveTo(0, -6.5, 9.4, -8.5); g.quadraticCurveTo(9, -1.5, 0, 0); g.quadraticCurveTo(-9, -1.5, -9.4, -8.5); g.closePath(); }, vg(g, -9, 0, '#111827'), null);
        shape(g, () => { g.arc(0, -11.5, 11, Math.PI * 1.08, Math.PI * 1.92); g.quadraticCurveTo(0, -14.5, -10.2, -15.6); g.closePath(); }, vg(g, -23, -14, '#4b5563'));
        // scarf tails
        shape(g, () => { g.moveTo(-6, -2); g.quadraticCurveTo(-15, 0, -17, 7); g.quadraticCurveTo(-12, 4, -5, 1); g.closePath(); }, '#7c3aed');
      },
    },
    summoner: {
      weapon: 'wand', orb: '#5eead4', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#0f766e', robe: true, robeTrim: '#99f6e4', belt: '#134e4a', buckle: '#5eead4',
          back(g) { shape(g, () => { g.arc(0, -11, 11.6, Math.PI * 0.8, Math.PI * 2.2); g.quadraticCurveTo(10, 3, 0, 2); g.quadraticCurveTo(-10, 3, -11.2, -4); g.closePath(); }, vg(g, -23, 3, '#115e59')); } });
        shape(g, () => { g.arc(0, -11, 11.3, Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(0, -16.5, -11, -15.2); g.closePath(); }, vg(g, -23, -14, '#14b8a6'));
        // circlet gem and floating runes
        g.fillStyle = '#5eead4'; g.beginPath(); g.moveTo(0, -20); g.lineTo(2.2, -17.5); g.lineTo(0, -15); g.lineTo(-2.2, -17.5); g.closePath(); g.fill();
        g.fillStyle = 'rgba(94,234,212,0.85)'; for (const [x, y] of [[-14, -16], [14, -9], [-13, 6]]) { g.beginPath(); star(g, x, y, 2, 0.8, 4); g.fill(); }
      },
    },
    healer: {
      weapon: 'sunstaff', orb: '#fde68a', melee: false,
      draw(g) {
        // halo
        g.strokeStyle = '#fde047'; g.lineWidth = 2.2; g.beginPath(); ell(g, 0, -29, 8, 2.4); g.stroke();
        g.strokeStyle = 'rgba(254,240,138,0.45)'; g.lineWidth = 4.5; g.beginPath(); ell(g, 0, -29, 8, 2.4); g.stroke();
        body(g, { skin: SKIN, body: '#f8fafc', robe: true, robeTrim: '#eab308', belt: '#ca8a04', buckle: '#fef08a',
          back(g) { shape(g, () => { g.moveTo(-9.5, -13); g.quadraticCurveTo(-12, -2, -8.5, 1); g.lineTo(8.5, 1); g.quadraticCurveTo(12, -2, 9.5, -13); g.closePath(); }, vg(g, -13, 1, '#fcd34d')); } });
        // tall white-and-gold hat with a sun mark
        shape(g, () => { g.moveTo(-8, -16); g.quadraticCurveTo(-8.5, -24, 0, -27.5); g.quadraticCurveTo(8.5, -24, 8, -16); g.quadraticCurveTo(0, -14, -8, -16); g.closePath(); }, vg(g, -28, -15, '#ffffff'));
        g.strokeStyle = '#eab308'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, -16.3); g.quadraticCurveTo(0, -14.2, 8, -16.3); g.stroke();
        g.fillStyle = '#eab308'; g.beginPath(); g.arc(0, -21.5, 2.2, 0, TAU); g.fill();
        g.strokeStyle = '#eab308'; g.lineWidth = 1; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 2.8, -21.5 + Math.sin(a) * 2.8); g.lineTo(Math.cos(a) * 4.2, -21.5 + Math.sin(a) * 4.2); g.stroke(); }
      },
    },
    berserker: {
      weapon: 'axe', melee: true,
      draw(g) {
        body(g, { skin: SKIN2, body: SKIN2, sleeve: SKIN2, boots: '#3f2a1a', belt: '#451a03', buckle: '#a8a29e', brows: '#7c2d12', angry: true,
          neck(g) {
            g.strokeStyle = 'rgba(153,27,27,0.75)'; g.lineWidth = 1.6; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 2, -1); g.lineTo(s * 6, 3); g.lineTo(s * 3, 6); g.stroke(); }
            g.fillStyle = '#57534e'; g.fillRect(-9, 8.5, 18, 4);
          } });
        // fur mantle
        shape(g, () => { g.moveTo(-13, -1); for (let i = 0; i <= 8; i++) { const x = -13 + i * 3.25; g.lineTo(x, i % 2 ? -5.5 : -2); } g.quadraticCurveTo(10, 3, 0, 2); g.quadraticCurveTo(-10, 3, -13, -1); g.closePath(); }, vg(g, -6, 3, '#78716c'));
        // wild red beard + war paint
        shape(g, () => { g.moveTo(-8, -8); g.quadraticCurveTo(-6, 3, 0, 4); g.quadraticCurveTo(6, 3, 8, -8); g.quadraticCurveTo(4, -4, 0, -5.5); g.quadraticCurveTo(-4, -4, -8, -8); g.closePath(); }, vg(g, -8, 4, '#c2410c'));
        g.fillStyle = 'rgba(185,28,28,0.85)'; g.fillRect(-8, -11.3, 16, 1.6);
        // horned iron cap
        shape(g, () => { g.arc(0, -12.5, 9.8, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); }, vg(g, -22, -13, '#57534e'));
        for (const s of [-1, 1]) shape(g, () => { g.moveTo(s * 8, -16); g.quadraticCurveTo(s * 17, -18, s * 16, -29); g.quadraticCurveTo(s * 13, -21, s * 6.5, -19.5); g.closePath(); }, vg(g, -29, -16, '#f5f5f4'));
      },
    },
    paladin: {
      weapon: 'hammer', melee: true,
      draw(g) {
        body(g, { skin: SKIN, body: '#f8fafc', sleeve: '#fcd34d', glove: '#d4a017', boots: '#92400e', belt: '#b45309', cape: '#1d4ed8', face: false,
          neck(g) { g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(0, 3, 3.6, 0, TAU); g.fill(); g.strokeStyle = '#f59e0b'; g.lineWidth = 1.1; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 4.4, 3 + Math.sin(a) * 4.4); g.lineTo(Math.cos(a) * 6, 3 + Math.sin(a) * 6); g.stroke(); } } });
        for (const s of [-1, 1]) shape(g, () => ell(g, s * 10.5, -2, 5, 3.8, s * 0.3), vg(g, -6, 2, '#fcd34d'));
        // golden helm with an open face and small wings
        shape(g, () => { g.moveTo(-10, -5); g.lineTo(-10, -14); g.quadraticCurveTo(-10, -22.5, 0, -23); g.quadraticCurveTo(10, -22.5, 10, -14); g.lineTo(10, -5); g.lineTo(6, -5); g.lineTo(6, -12); g.lineTo(-6, -12); g.lineTo(-6, -5); g.closePath(); }, vg(g, -23, -5, '#fbbf24'));
        shape(g, () => rr(g, -6, -12, 12, 7, 2), rg(g, 0, -9, 6, SKIN), null);
        for (const s of [-1, 1]) { g.fillStyle = '#1c1410'; g.beginPath(); ell(g, s * 2.6, -9, 1.2, 1.6); g.fill(); }
        for (const s of [-1, 1]) shape(g, () => { g.moveTo(s * 9.5, -15); g.quadraticCurveTo(s * 18, -22, s * 17, -27); g.quadraticCurveTo(s * 15, -22, s * 13, -23); g.quadraticCurveTo(s * 14, -19, s * 9.5, -18.5); g.closePath(); }, vg(g, -27, -15, '#ffffff'));
      },
    },
    necromancer: {
      weapon: 'skullstaff', orb: '#a3e635', melee: false,
      draw(g) {
        body(g, { skin: '#e7e5e4', body: '#1c1917', robe: true, robeTrim: '#65a30d', belt: '#3f6212', buckle: '#a3e635', glove: '#d6d3d1', glowEyes: '#a3e635',
          back(g) { shape(g, () => { g.arc(0, -11, 11.8, Math.PI * 0.78, Math.PI * 2.22); g.lineTo(7, 3); g.lineTo(-7, 3); g.closePath(); }, vg(g, -23, 3, '#292524')); } });
        // skull face: dark sockets and teeth
        g.fillStyle = '#1c1917'; for (const s of [-1, 1]) { g.beginPath(); ell(g, s * 3.4, -10, 2.6, 2.9); g.fill(); }
        g.fillStyle = '#a3e635'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 3.4, -10, 1.1, 0, TAU); g.fill(); }
        g.fillStyle = '#1c1917'; g.beginPath(); g.moveTo(0, -7.5); g.lineTo(-1, -5.5); g.lineTo(1, -5.5); g.closePath(); g.fill();
        g.strokeStyle = '#1c1917'; g.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 1.4, -4); g.lineTo(i * 1.4, -2.4); g.stroke(); }
        shape(g, () => { g.arc(0, -11, 11.5, Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(0, -17.5, -11, -15.4); g.closePath(); }, vg(g, -23, -14, '#44403c'));
        g.fillStyle = 'rgba(163,230,53,0.8)'; g.beginPath(); ell(g, 0, -20.3, 3, 1.2); g.fill();
      },
    },
    monk: {
      weapon: 'fists', melee: true,
      draw(g) {
        body(g, { skin: SKIN2, body: '#ea580c', sleeve: '#c2410c', glove: '#f5f5f4', boots: '#44403c', belt: '#292524', buckle: '#292524', brows: '#3f2a1a',
          neck(g) { shape(g, () => { g.moveTo(-9, -4); g.lineTo(0, 7); g.lineTo(9, -4); g.lineTo(5, -4); g.lineTo(0, 2); g.lineTo(-5, -4); g.closePath(); }, '#fbbf24'); g.fillStyle = '#7c2d12'; for (let i = 0; i < 9; i++) { const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7; g.beginPath(); g.arc(Math.cos(a) * 7.5, -4 + Math.sin(a) * 7.5, 1.3, 0, TAU); g.fill(); } } });
        // shaved head shine + red headband with flowing tails
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); ell(g, -3, -17, 3, 1.6, -0.4); g.fill();
        shape(g, () => { g.moveTo(-9.6, -14); g.quadraticCurveTo(0, -17, 9.6, -14); g.lineTo(9.4, -11.6); g.quadraticCurveTo(0, -14.6, -9.4, -11.6); g.closePath(); }, '#dc2626');
        shape(g, () => { g.moveTo(-9, -13); g.quadraticCurveTo(-16, -14, -19, -8); g.quadraticCurveTo(-15, -10, -9, -11); g.closePath(); }, '#dc2626');
        shape(g, () => { g.moveTo(-9, -12); g.quadraticCurveTo(-15, -9, -16, -3); g.quadraticCurveTo(-13, -7, -8.5, -10.5); g.closePath(); }, '#b91c1c');
      },
    },
    pyromancer: {
      weapon: 'flame', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#c2410c', robe: true, robeTrim: '#fbbf24', belt: '#7c2d12', buckle: '#fb923c', brows: '#9a3412', angry: true });
        // hair made of fire
        shape(g, () => { g.moveTo(-10, -11); g.quadraticCurveTo(-13, -22, -6, -21); g.quadraticCurveTo(-8, -30, -1, -27); g.quadraticCurveTo(1, -36, 5, -27); g.quadraticCurveTo(11, -30, 8, -21); g.quadraticCurveTo(14, -20, 10, -11); g.quadraticCurveTo(6, -17, 0, -17.5); g.quadraticCurveTo(-6, -17, -10, -11); g.closePath(); }, vg(g, -34, -11, '#f97316', 0.5, -0.2), '#7c2d12');
        shape(g, () => { g.moveTo(-6, -16); g.quadraticCurveTo(-5, -23, -1, -22); g.quadraticCurveTo(1, -29, 4, -22); g.quadraticCurveTo(8, -22, 6, -16); g.quadraticCurveTo(0, -18, -6, -16); g.closePath(); }, '#fde047', null);
        // ember sparks
        g.fillStyle = '#fde047'; for (const [x, y] of [[-14, -14], [13, -25], [-11, -27]]) { g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill(); }
      },
    },
    gunner: {
      weapon: 'gun', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#475569', sleeve: '#334155', glove: '#1e293b', boots: '#1e293b', belt: '#78350f', buckle: '#fbbf24', brows: '#3f2a1a',
          neck(g) { g.strokeStyle = '#b45309'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-8, -3); g.lineTo(7, 10); g.stroke(); g.fillStyle = '#fbbf24'; for (let i = 0; i < 4; i++) g.fillRect(-6 + i * 3.6, -1.4 + i * 3.1, 1.6, 2.6); } });
        // long coat tails
        shape(g, () => { g.moveTo(-9, 10); g.lineTo(-11, 16); g.lineTo(-3, 13); g.closePath(); }, '#334155');
        shape(g, () => { g.moveTo(9, 10); g.lineTo(11, 16); g.lineTo(3, 13); g.closePath(); }, '#334155');
        // wide hat with goggles on the band
        shape(g, () => ell(g, 0, -17, 15.5, 4.2), vg(g, -21, -13, '#57534e'));
        shape(g, () => { g.moveTo(-8, -17); g.quadraticCurveTo(-8, -27, 0, -26.5); g.quadraticCurveTo(8, -27, 8, -17); g.closePath(); }, vg(g, -27, -17, '#78716c'));
        g.fillStyle = '#44403c'; g.fillRect(-8, -20, 16, 2.4);
        for (const s of [-1, 1]) shape(g, () => g.arc(s * 3.5, -21.5, 2.6, 0, TAU), '#7dd3fc', '#1e293b', 1.6);
      },
    },
    druid: {
      weapon: 'branch', orb: '#86efac', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#65a30d', robe: true, robeTrim: '#a16207', belt: '#713f12', buckle: '#86efac', brows: '#713f12',
          back(g) { shape(g, () => { g.moveTo(-10, -12); g.quadraticCurveTo(-13, -2, -9, 2); g.lineTo(9, 2); g.quadraticCurveTo(13, -2, 10, -12); g.closePath(); }, vg(g, -12, 2, '#92400e')); } });
        // leaf mantle
        for (let i = 0; i < 7; i++) { const x = -12 + i * 4, rot = -0.6 + i * 0.2; shape(g, () => ell(g, x, -2.5 + Math.abs(i - 3) * 0.6, 3.6, 2, rot), i % 2 ? '#22c55e' : '#16a34a', '#14532d', 1); }
        // antler crown
        g.strokeStyle = '#a16207'; g.lineWidth = 2.2; g.lineCap = 'round';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5, -18); g.quadraticCurveTo(s * 9, -25, s * 8, -31); g.moveTo(s * 7.5, -24); g.lineTo(s * 13, -27); g.moveTo(s * 8.4, -28); g.lineTo(s * 4.5, -31); g.stroke(); }
        g.lineCap = 'butt';
        shape(g, () => { g.moveTo(-9.5, -15); g.quadraticCurveTo(0, -19.5, 9.5, -15); g.lineTo(9.3, -13); g.quadraticCurveTo(0, -17, -9.3, -13); g.closePath(); }, '#15803d');
        g.fillStyle = '#f472b6'; g.beginPath(); g.arc(0, -17.4, 1.7, 0, TAU); g.fill();
      },
    },
    engineer: {
      weapon: 'wrench', melee: false,
      draw(g) {
        body(g, { skin: SKIN, body: '#0369a1', sleeve: '#f59e0b', glove: '#78350f', boots: '#3f2a1a', belt: '#78350f', buckle: '#a8a29e', brows: '#3f2a1a',
          neck(g) { g.fillStyle = '#0284c7'; g.fillRect(-6, -3.5, 12, 7); g.fillStyle = '#fbbf24'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 4.5, -1.5, 1.1, 0, TAU); g.fill(); } } });
        // tool pouch
        shape(g, () => rr(g, 4, 7, 6, 5, 1.4), '#92400e');
        // hard hat with a head lamp + goggles
        shape(g, () => { g.moveTo(-11.5, -14.5); g.quadraticCurveTo(-11, -24.5, 0, -25); g.quadraticCurveTo(11, -24.5, 11.5, -14.5); g.closePath(); }, vg(g, -25, -14, '#facc15'));
        shape(g, () => ell(g, 0, -14.6, 12.6, 2), '#eab308');
        g.fillStyle = '#ca8a04'; g.fillRect(-1, -24.5, 2, 9.5);
        shape(g, () => g.arc(0, -19.5, 2.3, 0, TAU), '#fef9c3', '#78350f', 1);
        g.fillStyle = 'rgba(254,249,195,0.25)'; g.beginPath(); g.moveTo(0, -19.5); g.lineTo(-6, -30); g.lineTo(6, -30); g.closePath(); g.fill();
        for (const s of [-1, 1]) shape(g, () => g.arc(s * 3.6, -10, 2.6, 0, TAU), 'rgba(125,211,252,0.55)', '#1e293b', 1.3);
      },
    },
    spearman: {
      weapon: 'spear', melee: true,
      draw(g) {
        // round shield on the back
        shape(g, () => g.arc(-6, 2, 10, 0, TAU), vg(g, -8, 12, '#b45309'));
        g.strokeStyle = '#0e7490'; g.lineWidth = 2; g.beginPath(); g.arc(-6, 2, 7, 0, TAU); g.stroke();
        body(g, { skin: SKIN2, body: '#0e7490', sleeve: '#d97706', glove: '#78350f', boots: '#78350f', belt: '#78350f', buckle: '#fbbf24', brows: '#3f2a1a',
          neck(g) { shape(g, () => rr(g, -8, -3.5, 16, 10, 3), vg(g, -3, 7, '#d97706')); g.strokeStyle = '#92400e'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 1); g.lineTo(6, 1); g.moveTo(-6, 4); g.lineTo(6, 4); g.stroke(); } });
        // bronze helm with cheek guards and a tall crest
        shape(g, () => { g.moveTo(-10, -6); g.lineTo(-10, -14); g.quadraticCurveTo(-10, -22.5, 0, -23); g.quadraticCurveTo(10, -22.5, 10, -14); g.lineTo(10, -6); g.lineTo(6.5, -4.5); g.lineTo(5.5, -12.5); g.lineTo(-5.5, -12.5); g.lineTo(-6.5, -4.5); g.closePath(); }, vg(g, -23, -4, '#f59e0b'));
        shape(g, () => { g.moveTo(-12, -22); g.quadraticCurveTo(0, -36, 12, -22); g.quadraticCurveTo(0, -27, -12, -22); g.closePath(); }, vg(g, -32, -22, '#06b6d4'));
      },
    },
    icemage: {
      weapon: 'icestaff', orb: '#bae6fd', melee: false,
      draw(g) {
        body(g, { skin: '#fde8d8', body: '#7dd3fc', robe: true, robeTrim: '#f0f9ff', belt: '#0c4a6e', buckle: '#e0f2fe', glove: '#fde8d8', brows: '#e0f2fe',
          back(g) { shape(g, () => { g.moveTo(-10, -13); g.quadraticCurveTo(-13, 0, -10, 5); g.lineTo(10, 5); g.quadraticCurveTo(13, 0, 10, -13); g.closePath(); }, vg(g, -13, 5, '#f1f5f9')); } });
        // white fringe + crown of ice crystals
        shape(g, () => { g.moveTo(-9.6, -12); g.quadraticCurveTo(-6, -21.5, 0, -21); g.quadraticCurveTo(6, -21.5, 9.6, -12); g.quadraticCurveTo(5, -16, 0, -14.5); g.quadraticCurveTo(-5, -16, -9.6, -12); g.closePath(); }, vg(g, -21, -12, '#f8fafc'));
        for (const [x, h, w] of [[-7, 7, 2.2], [-3.5, 10, 2.4], [0, 13, 2.8], [3.5, 10, 2.4], [7, 7, 2.2]]) shape(g, () => { g.moveTo(x - w, -18.5); g.lineTo(x, -18.5 - h); g.lineTo(x + w, -18.5); g.closePath(); }, vg(g, -18.5 - h, -18.5, '#bae6fd', 0.6, -0.1), '#0369a1', 1);
      },
    },
    samurai: {
      weapon: 'katana', melee: true,
      draw(g) {
        body(g, { skin: SKIN, body: '#9f1239', sleeve: '#1f2937', glove: '#1f2937', boots: '#1c1917', belt: '#fbbf24', buckle: '#1c1917', brows: '#1c1917', angry: true,
          neck(g) {   // lacquered chest plates
            shape(g, () => rr(g, -8.5, -3.5, 17, 12, 3), vg(g, -3, 9, '#be123c'));
            g.strokeStyle = '#fbbf24'; g.lineWidth = 0.9; for (const y of [0, 3, 6]) { g.beginPath(); g.moveTo(-8, y); g.lineTo(8, y); g.stroke(); }
          } });
        // layered shoulder plates
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) shape(g, () => rr(g, s > 0 ? 7 : -14, -4.5 + i * 3, 7, 3.4, 1), i % 2 ? '#881337' : '#be123c', INK, 0.9);
        // helmet: flared neck guard, dark dome, brim and a golden crescent
        shape(g, () => { g.moveTo(-14.5, -9); g.quadraticCurveTo(-12.5, -14, -9, -15); g.lineTo(9, -15); g.quadraticCurveTo(12.5, -14, 14.5, -9); g.lineTo(10, -11); g.lineTo(-10, -11); g.closePath(); }, vg(g, -15, -9, '#374151'));
        shape(g, () => { g.arc(0, -13.5, 9.8, Math.PI, 0); g.closePath(); }, vg(g, -24, -13, '#1f2937'));
        shape(g, () => rr(g, -10.5, -15, 21, 2.8, 1.2), '#4b5563');
        shape(g, () => { g.moveTo(-13, -30); g.quadraticCurveTo(0, -16, 13, -30); g.quadraticCurveTo(0, -21, -13, -30); g.closePath(); }, vg(g, -30, -19, '#fbbf24', 0.5, -0.2));
        g.fillStyle = '#dc2626'; g.beginPath(); g.arc(0, -20.5, 2, 0, TAU); g.fill();
      },
    },
    bear: {
      weapon: 'claws', melee: true,
      draw(g) {
        for (const s of [-1, 1]) shape(g, () => ell(g, s * 7, 15, 5, 3.6), vg(g, 12, 19, '#5b3a1e'));
        shape(g, () => ell(g, 0, 4, 14.5, 12.5), rg(g, 0, 4, 14, '#8b5a2b'));
        shape(g, () => ell(g, 0, 7, 8, 6.5), vg(g, 1, 13, '#c08a55'), null);
        for (const s of [-1, 1]) { shape(g, () => g.arc(s * 9, -20, 4.4, 0, TAU), '#8b5a2b'); g.fillStyle = '#d8a878'; g.beginPath(); g.arc(s * 9, -20, 2.2, 0, TAU); g.fill(); }
        shape(g, () => ell(g, 0, -11.5, 12, 10.5), rg(g, 0, -11.5, 11.5, '#8b5a2b'));
        shape(g, () => ell(g, 0, -7, 5.5, 4.2), '#d8a878');
        g.fillStyle = '#1c1410'; g.beginPath(); ell(g, 0, -9, 2.4, 1.6); g.fill();
        for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 4.4, -13.5, 1.5, 0, TAU); g.fill(); }
        g.fillStyle = '#fbbf24'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 4.4, -13.5, 0.5, 0, TAU); g.fill(); }
      },
    },
  };

  // ---------- weapons: drawn pointing along +x from the hand at (0, 0) ----------
  function wood(g, x0, x1, w = 2.6, col = '#7c4a24') { shape(g, () => rr(g, x0, -w / 2, x1 - x0, w, w / 2), vg(g, -w / 2, w / 2, col), INK, 1); }
  function orbGlow(g, x, y, r, col, t) {
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6 * pulse);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.6 * pulse, 0, TAU); g.fill();
    shape(g, () => g.arc(x, y, r, 0, TAU), rg(g, x, y, r, col), 'rgba(255,255,255,0.6)', 0.8);
  }
  const WEAPONS = {
    sword(g) {
      shape(g, () => { g.moveTo(5, -2.3); g.lineTo(28, -1.8); g.lineTo(33, 0); g.lineTo(28, 1.8); g.lineTo(5, 2.3); g.closePath(); }, vg(g, -2.3, 2.3, '#e2e8f0', 0.5, -0.3));
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(6, -0.5); g.lineTo(28, -0.4); g.stroke();
      shape(g, () => rr(g, 3, -6, 3, 12, 1.2), vg(g, -6, 6, '#fbbf24'));
      wood(g, -4, 3, 2.6, '#5b3a1e'); shape(g, () => g.arc(-4.5, 0, 2, 0, TAU), '#fbbf24');
    },
    staff(g, t, o) { wood(g, -12, 24); shape(g, () => { g.moveTo(22, -3.5); g.lineTo(28, 0); g.lineTo(22, 3.5); g.closePath(); }, '#fbbf24'); orbGlow(g, 30, 0, 4.2, o.orb, t); },
    bow(g) {
      g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.arc(-4, 0, 14, -1.15, 1.15); g.stroke();
      g.strokeStyle = '#a16207'; g.lineWidth = 2.6; g.beginPath(); g.arc(-4, 0, 14, -1.15, 1.15); g.stroke();
      const ex = -4 + Math.cos(1.15) * 14, ey = Math.sin(1.15) * 14;
      g.strokeStyle = '#f5f5f4'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ex, -ey); g.lineTo(-2, 0); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = '#78350f'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-2, 0); g.lineTo(13, 0); g.stroke();
      g.fillStyle = '#e5e7eb'; g.beginPath(); g.moveTo(16, 0); g.lineTo(12, -2.4); g.lineTo(12, 2.4); g.closePath(); g.fill();
    },
    shield(g) {
      shape(g, () => rr(g, 2, -14, 8, 28, 3.5), vg(g, -14, 14, '#2563eb'));
      g.strokeStyle = '#fbbf24'; g.lineWidth = 1.6; g.beginPath(); rr(g, 3.4, -12.6, 5.2, 25.2, 2.4); g.stroke();
      g.fillStyle = '#fbbf24'; g.beginPath(); star(g, 6, 0, 4, 1.6, 4); g.fill();
    },
    daggers(g) {
      for (const [dy, len] of [[-3, 15], [4, 12]]) {
        shape(g, () => { g.moveTo(3, dy - 1.6); g.lineTo(len, dy); g.lineTo(3, dy + 1.6); g.closePath(); }, vg(g, dy - 1.6, dy + 1.6, '#e5e7eb', 0.5, -0.2), INK, 1);
        shape(g, () => rr(g, 1.5, dy - 3, 1.8, 6, 0.8), '#7c3aed', INK, 0.8);
        wood(g, -3, 1.5, 2, '#1f2937');
      }
    },
    wand(g, t, o) { wood(g, -6, 15, 2.2, '#134e4a'); shape(g, () => { g.moveTo(14, 0); g.lineTo(18, -3.5); g.lineTo(22, 0); g.lineTo(18, 3.5); g.closePath(); }, '#99f6e4'); orbGlow(g, 25, 0, 3, o.orb, t); },
    sunstaff(g, t, o) {
      wood(g, -12, 24, 2.6, '#ca8a04');
      g.strokeStyle = '#fbbf24'; g.lineWidth = 1.8; g.beginPath(); g.arc(29, 0, 5.5, 0, TAU); g.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(29 + Math.cos(a) * 6.5, Math.sin(a) * 6.5); g.lineTo(29 + Math.cos(a) * 9, Math.sin(a) * 9); g.stroke(); }
      orbGlow(g, 29, 0, 2.8, o.orb, t);
    },
    axe(g) {
      wood(g, -8, 26, 3, '#5b3a1e');
      for (const s of [-1, 1]) shape(g, () => { g.moveTo(17, 0); g.quadraticCurveTo(18, s * 5, 15, s * 12); g.quadraticCurveTo(22, s * 10, 27, s * 12); g.quadraticCurveTo(25, s * 5, 25, 0); g.closePath(); }, vg(g, -12, 12, '#d6d3d1', 0.5, -0.3));
      shape(g, () => rr(g, 23, -2.5, 6, 5, 1.5), '#57534e');
    },
    hammer(g) {
      wood(g, -8, 22, 3, '#78350f');
      shape(g, () => rr(g, 19, -8, 11, 16, 2.5), vg(g, -8, 8, '#fbbf24'));
      g.fillStyle = '#fef3c7'; g.beginPath(); star(g, 24.5, 0, 4, 1.6, 4); g.fill();
    },
    skullstaff(g, t, o) {
      wood(g, -12, 22, 2.6, '#292524');
      orbGlow(g, 28, 0, 3.2, o.orb, t);
      shape(g, () => { g.arc(28, 0, 5.4, 0, TAU); }, vg(g, -5, 5, '#e7e5e4'));
      g.fillStyle = '#1c1917'; for (const s of [-1, 1]) { g.beginPath(); g.arc(29, s * 2.2, 1.4, 0, TAU); g.fill(); }
      g.fillStyle = o.orb; for (const s of [-1, 1]) { g.beginPath(); g.arc(29, s * 2.2, 0.6, 0, TAU); g.fill(); }
    },
    fists(g) { shape(g, () => g.arc(5, 0, 4.2, 0, TAU), vg(g, -4, 4, '#f5f5f4')); g.strokeStyle = '#d6d3d1'; g.lineWidth = 0.8; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(3, i * 1.8); g.lineTo(8, i * 1.8); g.stroke(); } },
    flame(g, t) {
      const f = 1 + Math.sin(t * 14) * 0.15;
      const gr = g.createRadialGradient(9, 0, 0, 9, 0, 13 * f); gr.addColorStop(0, 'rgba(255,255,220,0.95)'); gr.addColorStop(0.3, 'rgba(253,186,116,0.85)'); gr.addColorStop(1, 'rgba(234,88,12,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(9, 0, 13 * f, 0, TAU); g.fill();
      shape(g, () => { g.moveTo(4, 0); g.quadraticCurveTo(6, -6 * f, 10, -9 * f); g.quadraticCurveTo(11, -4, 15 * f, -5); g.quadraticCurveTo(14, 4, 9, 5); g.quadraticCurveTo(5, 4, 4, 0); g.closePath(); }, '#fb923c', '#9a3412', 0.8);
      g.fillStyle = '#fef08a'; g.beginPath(); g.arc(9, 0.5, 2.6, 0, TAU); g.fill();
    },
    gun(g) {
      shape(g, () => rr(g, -6, -2.6, 8, 5.2, 1.5), vg(g, -3, 3, '#78350f'));
      shape(g, () => rr(g, 1, -3.2, 17, 6, 1.5), vg(g, -3, 3, '#475569'));
      shape(g, () => rr(g, 17, -1.8, 13, 3.6, 1), vg(g, -2, 2, '#1e293b'));
      g.fillStyle = '#fbbf24'; g.fillRect(6, -3.2, 1.6, 6); g.fillRect(12, -3.2, 1.6, 6);
      shape(g, () => rr(g, 7, 2.5, 3, 5, 1), '#1e293b', INK, 0.8);
    },
    branch(g, t, o) {
      g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(6, 3, 12, -1); g.quadraticCurveTo(20, -4, 26, 1); g.stroke();
      g.strokeStyle = '#92400e'; g.lineWidth = 2.6; g.stroke(); g.lineCap = 'butt';
      for (const [x, y, r] of [[22, -5, 0.4], [27, 4, -0.5], [19, 3, 0.9]]) shape(g, () => ell(g, x, y, 3.8, 1.8, r), '#22c55e', '#14532d', 0.8);
      orbGlow(g, 27, -1, 2.4, o.orb, t);
    },
    wrench(g) {
      wood(g, -6, 20, 3.2, '#94a3b8');
      shape(g, () => { g.moveTo(18, -6); g.lineTo(28, -6); g.lineTo(28, -2); g.lineTo(23, -2); g.lineTo(23, 2); g.lineTo(28, 2); g.lineTo(28, 6); g.lineTo(18, 6); g.closePath(); }, vg(g, -6, 6, '#cbd5e1'));
      g.fillStyle = '#dc2626'; g.fillRect(-6, -1.6, 8, 3.2);
    },
    spear(g) {
      wood(g, -16, 40, 2.6, '#7c4a24');
      shape(g, () => { g.moveTo(38, -3.6); g.lineTo(52, 0); g.lineTo(38, 3.6); g.lineTo(40, 0); g.closePath(); }, vg(g, -4, 4, '#fbbf24', 0.5, -0.2));
      shape(g, () => { g.moveTo(37, 0); g.quadraticCurveTo(33, 5, 28, 6); g.quadraticCurveTo(32, 3, 35, 0); g.closePath(); }, '#06b6d4', null);
    },
    icestaff(g, t, o) {
      wood(g, -12, 22, 2.6, '#e0f2fe');
      for (const [a, l] of [[0, 12], [-0.55, 8], [0.55, 8]]) shape(g, () => { g.save(); g.translate(22, 0); g.rotate(a); g.moveTo(0, -2.5); g.lineTo(l, 0); g.lineTo(0, 2.5); g.restore(); g.closePath(); }, vg(g, -6, 6, '#bae6fd', 0.6, -0.1), '#0369a1', 0.9);
      orbGlow(g, 24, 0, 2.2, o.orb, t);
    },
    katana(g) {
      shape(g, () => { g.moveTo(6, -1.5); g.quadraticCurveTo(22, -3.2, 38, -6); g.lineTo(40.5, -5.2); g.quadraticCurveTo(24, -0.6, 6, 1.5); g.closePath(); }, vg(g, -5, 2, '#f1f5f9', 0.55, -0.2), INK, 1);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(7, -0.6); g.quadraticCurveTo(22, -2.2, 37, -4.9); g.stroke();
      shape(g, () => ell(g, 5, 0, 1.6, 4.4), '#fbbf24', INK, 1);
      shape(g, () => rr(g, -8.5, -1.7, 12.5, 3.4, 1.2), '#1f2937', INK, 1);
      g.strokeStyle = '#e5e7eb'; g.lineWidth = 0.6; for (let x = -7; x < 3; x += 2.4) { g.beginPath(); g.moveTo(x, -1.5); g.lineTo(x + 1.4, 1.5); g.moveTo(x + 1.4, -1.5); g.lineTo(x, 1.5); g.stroke(); }
    },
    claws(g) { g.strokeStyle = '#f5f5f4'; g.lineWidth = 1.6; g.lineCap = 'round'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(4, i * 2.6); g.lineTo(10, i * 3.4); g.stroke(); } g.lineCap = 'butt'; },
  };

  function drawBody(g, id) { (HEROES[id] || HEROES.warrior).draw(g); }
  function drawWeapon(g, id, t = 0) { const h = HEROES[id] || HEROES.warrior; (WEAPONS[h.weapon] || WEAPONS.sword)(g, t, h); }
  const weapon = (id) => { const h = HEROES[id] || HEROES.warrior; return { kind: h.weapon, melee: h.melee }; };

  // a portrait for menus / the HUD: hero with the weapon raised, on a transparent background
  const portraits = {};
  function portrait(id, px = 96) {
    const key = id + ':' + px;
    if (portraits[key]) return portraits[key];
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'), s = px / 60;
    g.scale(s, s); g.translate(30, 39);
    drawBody(g, id);
    g.save(); g.translate(10.8, 5.5); g.rotate(-0.85); g.scale(0.85, 0.85); drawWeapon(g, id, 0.4); g.restore();
    return (portraits[key] = c);
  }

  window.HeroArt = { drawBody, drawWeapon, weapon, portrait, has: (id) => !!HEROES[id] };
})();

/* =====================================================================
   Wave Survivor: skill icons (plain Canvas drawing, no images or emojis)

   SkillIcons.draw(g, id)     draws the icon for skill `id` in a 64x64 box
   SkillIcons.url(id, px)     the icon as an image (data URL), cached
   Some icons reuse the hero weapons from heroes.js (HeroArt.drawWeapon).
   ===================================================================== */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const INK = 'rgba(18,12,6,0.9)';

  // ---------- helpers ----------
  function rgb(hex) { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const sh = (hex, k) => 'rgb(' + rgb(hex).map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))).join(',') + ')';
  const rgba = (hex, a) => 'rgba(' + rgb(hex).join(',') + ',' + a + ')';
  function lin(g, x0, y0, x1, y1, col, hi = 0.4, lo = -0.35) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, sh(col, hi)); gr.addColorStop(1, sh(col, lo)); return gr; }
  function rad(g, x, y, r, col) { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, sh(col, 0.45)); gr.addColorStop(0.7, col); gr.addColorStop(1, sh(col, -0.35)); return gr; }
  function fill(g, path, f, stroke = INK, lw = 2) { g.beginPath(); path(); g.fillStyle = f; g.fill(); if (stroke) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } }
  function line(g, pts, col, lw, outline = true) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
    if (outline) { path(); g.strokeStyle = INK; g.lineWidth = lw + 3; g.stroke(); }
    path(); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
  }
  function arcLine(g, x, y, r, a0, a1, col, lw, outline = true) {
    g.lineCap = 'round';
    if (outline) { g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = INK; g.lineWidth = lw + 3; g.stroke(); }
    g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
  }
  function glow(g, x, y, r, col, a = 0.55) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function star(g, x, y, r1, r2, n, rot = -Math.PI / 2) { for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
  function flame(g, x, y, w, h) { g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 1.1, y - h * 0.5, x - w * 0.2, y - h * 0.65); g.quadraticCurveTo(x - w * 0.35, y - h * 0.9, x, y - h); g.quadraticCurveTo(x + w * 0.9, y - h * 0.6, x + w * 0.6, y - h * 0.35); g.quadraticCurveTo(x + w * 1.1, y - h * 0.2, x + w, y); g.quadraticCurveTo(x, y + w * 0.6, x - w, y); g.closePath(); }
  function fire(g, x, y, w, h) { fill(g, () => flame(g, x, y, w, h), lin(g, 0, y - h, 0, y, '#fde047', 0.3, 0.1)); fill(g, () => flame(g, x, y, w * 0.55, h * 0.6), '#fef9c3', null); }
  function bolt(g, pts, col = '#e9d5ff') { line(g, pts, col, 3.5); line(g, pts, '#ffffff', 1.2, false); }
  // a hero weapon (heroes.js) placed at (x, y), rotated, scaled
  function weapon(g, hero, x, y, rot, s) { if (!window.HeroArt) return; g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); HeroArt.drawWeapon(g, hero, 0.4); g.restore(); }
  function ghost(g, x, y, s, col) {
    fill(g, () => { g.moveTo(x - 11 * s, y + 12 * s); g.lineTo(x - 11 * s, y - 2 * s); g.arc(x, y - 2 * s, 11 * s, Math.PI, 0); g.lineTo(x + 11 * s, y + 12 * s); for (let i = 0; i < 4; i++) g.lineTo(x + 11 * s - (i * 2 + 1) * 2.75 * s, y + (i % 2 ? 12 : 7) * s); g.closePath(); }, rad(g, x, y, 13 * s, col));
    g.fillStyle = '#134e4a'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * 4 * s, y - 2 * s, 2 * s, 3 * s, 0, 0, TAU); g.fill(); }
  }
  function skull(g, x, y, s, col = '#f5f5f4', eye = '#1c1917') {
    fill(g, () => { g.arc(x, y - 2 * s, 12 * s, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(x + 6 * s, y + 12 * s); g.lineTo(x - 6 * s, y + 12 * s); g.closePath(); }, rad(g, x, y, 14 * s, col));
    g.fillStyle = eye; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * 4.6 * s, y - 1 * s, 3.4 * s, 3.8 * s, 0, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(x, y + 3.5 * s); g.lineTo(x - 2 * s, y + 7 * s); g.lineTo(x + 2 * s, y + 7 * s); g.closePath(); g.fill();
  }
  function arrow(g, x0, y0, x1, y1, shaft = '#a16207', head = '#e5e7eb', fl = '#ef4444') {
    const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a), s = Math.sin(a);
    line(g, [[x0, y0], [x1 - c * 6, y1 - s * 6]], shaft, 2.5);
    fill(g, () => { g.moveTo(x1, y1); g.lineTo(x1 - c * 9 - s * 4.5, y1 - s * 9 + c * 4.5); g.lineTo(x1 - c * 9 + s * 4.5, y1 - s * 9 - c * 4.5); g.closePath(); }, head, INK, 1.5);
    fill(g, () => { g.moveTo(x0, y0); g.lineTo(x0 - c * 6 - s * 5, y0 - s * 6 + c * 5); g.lineTo(x0 + c * 3, y0 + s * 3); g.lineTo(x0 - c * 6 + s * 5, y0 - s * 6 - c * 5); g.closePath(); }, fl, INK, 1.2);
  }
  function crack(g, x, y, w) { line(g, [[x - w, y], [x - w * 0.5, y - 3], [x - w * 0.1, y + 2], [x + w * 0.35, y - 2], [x + w, y + 1]], '#57534e', 2.5); line(g, [[x - w * 0.5, y - 3], [x - w * 0.6, y + 5]], '#57534e', 2); line(g, [[x + w * 0.35, y - 2], [x + w * 0.45, y + 6]], '#57534e', 2); }
  function cloud(g, x, y, s, col) { fill(g, () => { g.arc(x - 9 * s, y + 2 * s, 7 * s, Math.PI * 0.5, Math.PI * 1.5); g.arc(x - 2 * s, y - 4 * s, 9 * s, Math.PI, Math.PI * 1.85); g.arc(x + 9 * s, y, 7 * s, Math.PI * 1.3, Math.PI * 0.5); g.closePath(); }, lin(g, 0, y - 13 * s, 0, y + 9 * s, col, 0.3, -0.3)); }

  // ---------- the icons ----------
  const ICONS = {
    // warrior
    whirlwind(g) {
      glow(g, 32, 32, 30, '#e2e8f0', 0.35);
      for (let i = 0; i < 3; i++) arcLine(g, 32, 32, 22 - i * 6, i * 2.1, i * 2.1 + 3.6, i % 2 ? '#94a3b8' : '#e2e8f0', 3.2);
      weapon(g, 'warrior', 20, 44, -0.8, 1.05);
    },
    charge(g) {
      glow(g, 32, 32, 30, '#ef4444', 0.4);
      for (const [y, l] of [[18, 16], [32, 22], [46, 16]]) line(g, [[6, y], [6 + l, y]], '#fca5a5', 3);
      weapon(g, 'warrior', 16, 40, -0.25, 1.15);
    },
    battlecry(g) {
      glow(g, 32, 34, 30, '#f87171', 0.35);
      for (let i = 0; i < 3; i++) arcLine(g, 36, 30, 12 + i * 8, -0.7, 0.7, '#fecaca', 2.5);
      fill(g, () => { g.moveTo(8, 40); g.quadraticCurveTo(14, 18, 34, 22); g.lineTo(37, 38); g.quadraticCurveTo(22, 34, 15, 46); g.closePath(); }, lin(g, 8, 20, 30, 46, '#f5f5f4', 0.2, -0.45));
      fill(g, () => { g.ellipse(35.5, 30, 4, 8.5, -0.15, 0, TAU); }, '#78350f');
      line(g, [[18, 27], [21, 39]], '#b45309', 2.5);
    },
    // mage
    fireball(g) {
      glow(g, 38, 26, 30, '#f97316', 0.55);
      g.save(); g.translate(38, 26); g.rotate(-2.356); fire(g, 0, 6, 13, 42); g.restore();
      fill(g, () => g.arc(38, 26, 11, 0, TAU), rad(g, 38, 26, 12, '#fb923c'));
      fill(g, () => g.arc(36, 24, 5, 0, TAU), '#fef9c3', null);
    },
    chainlightning(g) {
      glow(g, 32, 32, 30, '#a78bfa', 0.5);
      bolt(g, [[8, 10], [24, 26], [18, 32], [34, 44], [30, 50], [54, 58]]);
      bolt(g, [[24, 26], [40, 20], [44, 10]]);
      bolt(g, [[34, 44], [48, 38], [58, 40]]);
      for (const [x, y] of [[24, 26], [34, 44]]) glow(g, x, y, 7, '#ffffff', 0.9);
    },
    blink(g) {
      glow(g, 40, 30, 28, '#8b5cf6', 0.55);
      for (const [x, a] of [[14, 0.25], [24, 0.5]]) { g.globalAlpha = a; fill(g, () => star(g, x, 36, 10, 4, 4), '#c4b5fd', null); g.globalAlpha = 1; }
      fill(g, () => star(g, 42, 30, 18, 6, 4), lin(g, 30, 12, 54, 48, '#ddd6fe', 0.4, -0.3));
      fill(g, () => star(g, 42, 30, 7, 2.5, 4), '#ffffff', null);
    },
    // archer
    volley(g) { glow(g, 32, 32, 30, '#fde68a', 0.45); for (const a of [-0.45, 0, 0.45]) { const c = Math.cos(a - 0.78), s = Math.sin(a - 0.78); arrow(g, 32 - c * 22, 36 - s * 22, 32 + c * 22, 36 + s * 22, '#a16207', '#fbbf24', '#fde68a'); } },
    arrowrain(g) {
      glow(g, 32, 40, 30, '#fde68a', 0.35);
      for (const x of [16, 30, 44]) arrow(g, x + 4, 24, x - 2, 56, '#a16207', '#fbbf24', '#ef4444');
      cloud(g, 32, 18, 1.3, '#94a3b8');
    },
    roll(g) {
      glow(g, 32, 32, 28, '#86efac', 0.45);
      arcLine(g, 32, 32, 18, -2.6, 2.2, '#86efac', 6);
      const a = 2.2, x = 32 + Math.cos(a) * 18, y = 32 + Math.sin(a) * 18;
      fill(g, () => { g.moveTo(x - 9, y - 5); g.lineTo(x + 6, y + 4); g.lineTo(x - 7, y + 11); g.closePath(); }, '#86efac');
      fill(g, () => star(g, 32, 32, 6, 2.5, 4), '#fde68a');
    },
    // guardian
    shieldslam(g) {
      glow(g, 32, 40, 30, '#60a5fa', 0.4); crack(g, 32, 55, 26);
      for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) line(g, [[32 + sd * (17 + i * 5), 52 - i * 2], [32 + sd * (24 + i * 6), 42 - i * 4]], '#bfdbfe', 2.5);
      fill(g, () => { g.moveTo(17, 8); g.lineTo(47, 8); g.lineTo(47, 28); g.quadraticCurveTo(47, 44, 32, 52); g.quadraticCurveTo(17, 44, 17, 28); g.closePath(); }, lin(g, 0, 8, 0, 52, '#2563eb', 0.35, -0.35), INK, 2.2);
      g.strokeStyle = '#fbbf24'; g.lineWidth = 2; g.beginPath(); g.moveTo(20.5, 11.5); g.lineTo(43.5, 11.5); g.lineTo(43.5, 28); g.quadraticCurveTo(43.5, 41, 32, 48); g.quadraticCurveTo(20.5, 41, 20.5, 28); g.closePath(); g.stroke();
      fill(g, () => star(g, 32, 28, 9, 3.5, 4), '#fbbf24', null);
    },
    fortify(g) {
      glow(g, 32, 34, 30, '#60a5fa', 0.4);
      fill(g, () => { g.moveTo(12, 56); g.lineTo(12, 20); for (let i = 0; i < 5; i++) { g.lineTo(12 + i * 10, i % 2 ? 20 : 12); g.lineTo(12 + i * 10 + 10, i % 2 ? 20 : 12); } g.lineTo(52, 56); g.closePath(); }, lin(g, 0, 12, 0, 56, '#94a3b8', 0.3, -0.4));
      g.strokeStyle = 'rgba(30,41,59,0.6)'; g.lineWidth = 1.4;
      for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(12, 28 + r * 8); g.lineTo(52, 28 + r * 8); g.stroke(); for (let c = 0; c < 4; c++) { const x = 12 + c * 10 + (r % 2 ? 5 : 0); g.beginPath(); g.moveTo(x, 20 + r * 8); g.lineTo(x, 28 + r * 8); g.stroke(); } }
      fill(g, () => { g.moveTo(32, 30); g.lineTo(40, 34); g.lineTo(38, 46); g.lineTo(32, 50); g.lineTo(26, 46); g.lineTo(24, 34); g.closePath(); }, '#2563eb', INK, 1.5);
    },
    shieldthrow(g) {
      glow(g, 36, 30, 28, '#60a5fa', 0.45);
      arcLine(g, 30, 34, 22, 2.4, 4.6, '#93c5fd', 2.5);
      fill(g, () => g.arc(38, 28, 14, 0, TAU), rad(g, 38, 28, 15, '#2563eb'), INK, 2.2);
      g.strokeStyle = '#fbbf24'; g.lineWidth = 2.5; g.beginPath(); g.arc(38, 28, 11, 0, TAU); g.stroke();
      fill(g, () => star(g, 38, 28, 6, 2.4, 4), '#fbbf24', null);
    },
    // assassin
    shadowdash(g) {
      glow(g, 32, 32, 30, '#7c3aed', 0.5);
      for (const [dx, a] of [[-16, 0.2], [-8, 0.4]]) { g.globalAlpha = a; weapon(g, 'assassin', 14 + dx, 50, -0.78, 2.6); g.globalAlpha = 1; }
      weapon(g, 'assassin', 14, 50, -0.78, 2.6);
    },
    fanofknives(g) {
      glow(g, 32, 32, 30, '#e5e7eb', 0.35);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU - Math.PI / 2; g.save(); g.translate(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.rotate(a);
        fill(g, () => { g.moveTo(20, 0); g.lineTo(5, -3.5); g.lineTo(5, 3.5); g.closePath(); }, lin(g, 0, -3, 0, 3, '#f1f5f9'), INK, 1.4);
        fill(g, () => g.rect(0, -2.2, 5, 4.4), '#7c3aed', INK, 1.2); g.restore(); }
      fill(g, () => g.arc(32, 32, 4, 0, TAU), '#a78bfa');
    },
    smokebomb(g) {
      for (const [x, y, r] of [[16, 22, 10], [48, 20, 9], [44, 46, 12], [14, 44, 9], [30, 14, 8]]) fill(g, () => g.arc(x, y, r, 0, TAU), 'rgba(148,163,184,0.75)', null);
      fill(g, () => g.arc(32, 36, 14, 0, TAU), rad(g, 32, 36, 15, '#334155'));
      fill(g, () => g.rect(28, 18, 8, 6), '#78716c', INK, 1.5);
      line(g, [[32, 18], [36, 11], [42, 9]], '#a8a29e', 2);
      glow(g, 43, 9, 6, '#fde047', 1);
    },
    // summoner
    spiritcall(g) { glow(g, 32, 32, 30, '#5eead4', 0.5); ghost(g, 18, 40, 0.65, '#99f6e4'); ghost(g, 46, 40, 0.65, '#99f6e4'); ghost(g, 32, 30, 1.05, '#ccfbf1'); },
    spiritburst(g) {
      glow(g, 32, 32, 30, '#5eead4', 0.55);
      g.strokeStyle = '#99f6e4'; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r0 = 19, r1 = i % 2 ? 26 : 30; g.beginPath(); g.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0); g.lineTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1); g.stroke(); }
      ghost(g, 32, 31, 1, '#ccfbf1');
    },
    soullink(g) {
      glow(g, 32, 32, 30, '#5eead4', 0.45);
      for (const [x, y, a] of [[22, 40, -0.8], [42, 24, -0.8]]) { g.save(); g.translate(x, y); g.rotate(a); fill(g, () => { g.ellipse(0, 0, 13, 7.5, 0, 0, TAU); g.ellipse(0, 0, 7.5, 2.5, 0, 0, TAU); }, '#5eead4', INK, 2); g.restore(); }
      for (let i = 0; i < 3; i++) fill(g, () => star(g, 12 + i * 20, 12 + (i % 2) * 40, 4, 1.5, 4), '#ccfbf1', null);
    },
    // cleric
    sanctuary(g) {
      glow(g, 32, 34, 30, '#fde047', 0.5);
      g.strokeStyle = '#fde047'; g.lineWidth = 3; g.beginPath(); g.ellipse(32, 12, 14, 4, 0, 0, TAU); g.stroke();
      fill(g, () => { g.moveTo(32, 54); g.bezierCurveTo(4, 36, 12, 14, 32, 26); g.bezierCurveTo(52, 14, 60, 36, 32, 54); g.closePath(); }, lin(g, 0, 18, 0, 54, '#f472b6', 0.35, -0.3));
      fill(g, () => { g.ellipse(24, 30, 5, 3, -0.6, 0, TAU); }, 'rgba(255,255,255,0.65)', null);
    },
    smite(g) {
      glow(g, 32, 46, 26, '#fef08a', 0.6);
      cloud(g, 32, 14, 1.25, '#fde68a');
      fill(g, () => { g.moveTo(34, 22); g.lineTo(24, 38); g.lineTo(32, 38); g.lineTo(26, 56); g.lineTo(44, 34); g.lineTo(35, 34); g.lineTo(40, 22); g.closePath(); }, lin(g, 0, 22, 0, 56, '#fef08a', 0.5, -0.1));
    },
    divineshield(g) {
      glow(g, 32, 32, 30, '#fde68a', 0.5);
      for (const sd of [-1, 1]) fill(g, () => { g.moveTo(32 + sd * 8, 26); g.quadraticCurveTo(32 + sd * 22, 8, 32 + sd * 30, 14); g.quadraticCurveTo(32 + sd * 26, 22, 32 + sd * 28, 28); g.quadraticCurveTo(32 + sd * 20, 30, 32 + sd * 22, 36); g.quadraticCurveTo(32 + sd * 14, 36, 32 + sd * 10, 40); g.closePath(); }, '#fef3c7', '#a16207', 1.5);
      fill(g, () => { g.moveTo(20, 18); g.lineTo(44, 18); g.lineTo(44, 34); g.quadraticCurveTo(44, 48, 32, 56); g.quadraticCurveTo(20, 48, 20, 34); g.closePath(); }, lin(g, 0, 18, 0, 56, '#fbbf24', 0.4, -0.3));
      fill(g, () => star(g, 32, 34, 8, 3, 4), '#fffbeb', null);
    },
    // berserker
    bloodrage(g) {
      glow(g, 32, 34, 30, '#ef4444', 0.55);
      g.save(); g.globalAlpha = 0.85; fire(g, 18, 54, 8, 26); fire(g, 46, 54, 8, 26); g.restore();
      fill(g, () => { g.moveTo(32, 8); g.bezierCurveTo(44, 26, 48, 34, 46, 42); g.arc(32, 42, 14, 0, Math.PI); g.bezierCurveTo(16, 34, 20, 26, 32, 8); g.closePath(); }, lin(g, 20, 8, 44, 56, '#ef4444', 0.25, -0.45));
      fill(g, () => g.ellipse(26, 38, 3, 6, 0.3, 0, TAU), 'rgba(255,255,255,0.5)', null);
    },
    leapslam(g) {
      glow(g, 32, 44, 28, '#dc2626', 0.45);
      crack(g, 32, 54, 24);
      g.setLineDash([4, 5]); arcLine(g, 32, 50, 22, Math.PI * 1.05, Math.PI * 1.75, '#fecaca', 2, false); g.setLineDash([]);
      weapon(g, 'berserker', 18, 10, 1.05, 1.35);
    },
    execute(g) {
      glow(g, 32, 32, 30, '#dc2626', 0.5);
      arcLine(g, 32, 32, 24, -0.4, 4.2, '#ef4444', 4);
      skull(g, 32, 31, 1.05);
      g.fillStyle = '#ef4444'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(32 + sd * 4.8, 30, 1.6, 0, TAU); g.fill(); }
    },
    // paladin
    holynova(g) {
      glow(g, 32, 32, 30, '#fde68a', 0.6);
      for (let i = 0; i < 2; i++) { g.strokeStyle = rgba('#fde047', 0.8 - i * 0.35); g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 20 + i * 7, 0, TAU); g.stroke(); }
      fill(g, () => star(g, 32, 32, 18, 7, 8), lin(g, 14, 14, 50, 50, '#fde047', 0.5, -0.2));
      fill(g, () => g.arc(32, 32, 6, 0, TAU), '#ffffff', null);
    },
    consecrate(g) {
      glow(g, 32, 40, 30, '#fcd34d', 0.45);
      g.save(); g.translate(32, 42); g.scale(1, 0.45);
      g.strokeStyle = '#fbbf24'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
      g.beginPath(); star(g, 0, 0, 18, 7, 6); g.stroke(); g.restore();
      for (const x of [20, 32, 44]) { const gr = g.createLinearGradient(0, 8, 0, 42); gr.addColorStop(0, 'rgba(254,240,138,0)'); gr.addColorStop(1, 'rgba(254,240,138,0.85)'); g.fillStyle = gr; g.fillRect(x - 3, x === 32 ? 6 : 16, 6, 36 - (x === 32 ? 0 : 10)); }
    },
    judgment(g) {
      glow(g, 32, 32, 30, '#fbbf24', 0.55);
      g.strokeStyle = 'rgba(254,240,138,0.9)'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(40 + Math.cos(a) * 14, 22 + Math.sin(a) * 14); g.lineTo(40 + Math.cos(a) * 22, 22 + Math.sin(a) * 22); g.stroke(); }
      weapon(g, 'paladin', 14, 50, -0.78, 1.35);
    },
    // necromancer
    raisedead(g) {
      glow(g, 32, 46, 28, '#a3e635', 0.55);
      fill(g, () => g.ellipse(32, 52, 22, 6, 0, 0, TAU), '#3f3a36');
      g.fillStyle = '#f5f5f4'; g.strokeStyle = INK; g.lineWidth = 1.5;
      for (const [x, h, a] of [[24, 18, -0.2], [30, 24, -0.05], [36, 23, 0.05], [42, 16, 0.25]]) { g.save(); g.translate(x, 46); g.rotate(a); g.beginPath(); g.rect(-2.2, -h, 4.4, h); g.fill(); g.stroke(); g.beginPath(); g.arc(0, -h, 2.8, 0, TAU); g.fill(); g.stroke(); g.restore(); }
      fill(g, () => { g.moveTo(20, 52); g.quadraticCurveTo(20, 40, 32, 40); g.quadraticCurveTo(46, 40, 46, 52); g.closePath(); }, '#e7e5e4');
      fill(g, () => g.ellipse(32, 54, 18, 4, 0, 0, TAU), '#292524', null);
    },
    bonespear(g) {
      glow(g, 32, 32, 30, '#65a30d', 0.5);
      g.save(); g.translate(32, 32); g.rotate(-0.78);
      fill(g, () => { g.moveTo(28, 0); g.lineTo(14, -6); g.lineTo(-20, -3); g.lineTo(-25, -8); g.lineTo(-30, 0); g.lineTo(-25, 8); g.lineTo(-20, 3); g.lineTo(14, 6); g.closePath(); }, lin(g, 0, -8, 0, 8, '#f5f5f4', 0.3, -0.3));
      g.restore();
    },
    soulsiphon(g) {
      glow(g, 32, 32, 30, '#65a30d', 0.5);
      for (let i = 0; i < 3; i++) { const a = i * (TAU / 3); arcLine(g, 32, 32, 20, a, a + 1.9, '#a3e635', 3); glow(g, 32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 6, '#ecfccb', 1); }
      skull(g, 32, 32, 0.6, '#e7e5e4');
      g.fillStyle = '#a3e635'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(32 + sd * 2.8, 31.4, 1.1, 0, TAU); g.fill(); }
    },
    // monk
    flurry(g) {
      glow(g, 32, 32, 30, '#fdba74', 0.5);
      for (const [x, y, r] of [[18, 20, 6], [46, 18, 5], [48, 46, 6], [16, 46, 5]]) fill(g, () => star(g, x, y, r + 4, r * 0.4, 6), '#fde68a', INK, 1.2);
      for (const [x, y, a] of [[24, 34, -0.3], [38, 30, 0.4]]) { g.save(); g.translate(x, y); g.rotate(a); fill(g, () => { g.ellipse(0, 0, 10, 8, 0, 0, TAU); }, lin(g, 0, -8, 0, 8, '#f5f5f4', 0.2, -0.3)); g.strokeStyle = '#a8a29e'; g.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(2, i * 3.4); g.lineTo(9, i * 3.4); g.stroke(); } g.restore(); }
    },
    palmstrike(g) {
      glow(g, 36, 32, 30, '#fb923c', 0.5);
      for (let i = 0; i < 3; i++) arcLine(g, 22, 32, 30 + i * 6, -0.55, 0.55, '#fed7aa', 2);
      g.save(); g.translate(26, 34); g.rotate(-Math.PI / 2);
      fill(g, () => { g.moveTo(-9, 10); g.lineTo(-9, -4); for (const [x, h] of [[-9, 16], [-4.5, 20], [0, 21], [4.5, 18]]) { g.lineTo(x, -h + 2); g.arc(x + 2.25, -h + 2, 2.25, Math.PI, 0); g.lineTo(x + 4.5, -4); } g.lineTo(9, -2); g.lineTo(14, -10); g.arc(15.5, -8.5, 2.2, Math.PI * 1.25, Math.PI * 0.25); g.lineTo(10, 6); g.quadraticCurveTo(8, 12, 0, 12); g.closePath(); }, lin(g, -10, -20, 10, 12, '#fdba74', 0.3, -0.3));
      g.restore();
    },
    innerpeace(g) {
      glow(g, 32, 34, 30, '#fbcfe8', 0.5);
      for (const [a, col] of [[-1.1, '#f9a8d4'], [1.1, '#f9a8d4'], [-0.55, '#fbcfe8'], [0.55, '#fbcfe8'], [0, '#fdf2f8']]) { g.save(); g.translate(32, 46); g.rotate(a); fill(g, () => { g.moveTo(0, 0); g.quadraticCurveTo(-9, -14, 0, -28); g.quadraticCurveTo(9, -14, 0, 0); g.closePath(); }, col, '#9d174d', 1.5); g.restore(); }
      fill(g, () => g.ellipse(32, 48, 18, 4, 0, 0, TAU), '#4ade80', '#14532d', 1.5);
    },
    // pyromancer
    flamering(g) { glow(g, 32, 32, 30, '#ea580c', 0.55); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.save(); g.translate(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); g.rotate(a + Math.PI / 2); fire(g, 0, 6, 6, 18); g.restore(); } fill(g, () => g.arc(32, 32, 7, 0, TAU), '#fef9c3', null); },
    meteor(g) {
      glow(g, 26, 40, 30, '#f97316', 0.55);
      g.save(); g.translate(26, 40); g.rotate(0.785); fire(g, 0, 6, 14, 44); g.restore();
      fill(g, () => { g.moveTo(14, 38); g.lineTo(20, 28); g.lineTo(32, 27); g.lineTo(38, 36); g.lineTo(35, 48); g.lineTo(22, 51); g.closePath(); }, rad(g, 26, 40, 14, '#57534e'));
      g.fillStyle = '#fb923c'; for (const [x, y] of [[22, 36], [30, 42], [26, 46]]) { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
    },
    firetrail(g) {
      glow(g, 32, 34, 30, '#f97316', 0.4);
      for (const [x, y, a] of [[18, 48, -0.25], [40, 28, -0.25]]) { g.save(); g.translate(x, y); g.rotate(a); fill(g, () => g.ellipse(0, 0, 5.5, 9, 0, 0, TAU), '#7c2d12'); for (let i = 0; i < 4; i++) fill(g, () => g.arc(-4.5 + i * 3, -11.5 + Math.abs(i - 1.5), 1.8, 0, TAU), '#7c2d12', null); g.restore(); }
      fire(g, 22, 44, 6, 18); fire(g, 44, 24, 6, 18); fire(g, 30, 60, 5, 12);
    },
    // gunner
    bulletstorm(g) {
      glow(g, 32, 32, 30, '#e2e8f0', 0.35);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.save(); g.translate(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); g.rotate(a); line(g, [[-12, 0], [-4, 0]], 'rgba(253,230,138,0.8)', 2, false); fill(g, () => { g.moveTo(-4, -3); g.lineTo(3, -3); g.arc(3, 0, 3, -Math.PI / 2, Math.PI / 2); g.lineTo(-4, 3); g.closePath(); }, lin(g, 0, -3, 0, 3, '#fbbf24'), INK, 1.2); g.restore(); }
      glow(g, 32, 32, 9, '#fde047', 1);
    },
    grenade(g) {
      glow(g, 32, 36, 28, '#84cc16', 0.4);
      fill(g, () => g.ellipse(32, 38, 15, 17, 0, 0, TAU), rad(g, 32, 38, 17, '#4d7c0f'));
      g.strokeStyle = 'rgba(26,46,5,0.7)'; g.lineWidth = 1.6; for (const y of [30, 38, 46]) { g.beginPath(); g.moveTo(18, y); g.lineTo(46, y); g.stroke(); } g.beginPath(); g.moveTo(32, 21); g.lineTo(32, 55); g.stroke();
      fill(g, () => g.rect(27, 16, 10, 6), '#a8a29e', INK, 1.5);
      line(g, [[37, 18], [46, 14], [44, 24]], '#d6d3d1', 2);
      fill(g, () => g.arc(28, 14, 4, 0, TAU), 'rgba(0,0,0,0)', '#d6d3d1', 2);
    },
    overdrive(g) {
      glow(g, 32, 32, 30, '#fde047', 0.4);
      fill(g, () => { for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 17 : 22; const a2 = a + TAU / 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); g.lineTo(32 + Math.cos(a2) * r, 32 + Math.sin(a2) * r); } g.closePath(); g.moveTo(39, 32); g.arc(32, 32, 7, 0, TAU, true); }, lin(g, 10, 10, 54, 54, '#94a3b8', 0.4, -0.35));
      fill(g, () => { g.moveTo(36, 4); g.lineTo(24, 30); g.lineTo(32, 30); g.lineTo(26, 58); g.lineTo(42, 26); g.lineTo(34, 26); g.lineTo(40, 4); g.closePath(); }, lin(g, 0, 4, 0, 58, '#fde047', 0.5, -0.1));
    },
    // druid
    entangle(g) {
      glow(g, 32, 32, 30, '#4ade80', 0.45);
      for (const [r, a0] of [[22, 0], [14, 2]]) { arcLine(g, 32, 32, r, a0, a0 + 4.4, '#16a34a', 4); for (let i = 0; i < 5; i++) { const a = a0 + 0.4 + i * 0.85, x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r; fill(g, () => { g.moveTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); g.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.lineTo(x + Math.cos(a + 0.5) * 2, y + Math.sin(a + 0.5) * 2); g.closePath(); }, '#86efac', INK, 1); } }
      for (const [x, y, a] of [[50, 22, 0.5], [16, 44, -0.6]]) fill(g, () => g.ellipse(x, y, 6, 3, a, 0, TAU), '#22c55e', '#14532d', 1.3);
      fill(g, () => g.arc(32, 32, 4, 0, TAU), '#f472b6');
    },
    bearform(g) {
      glow(g, 32, 34, 30, '#a16207', 0.45);
      fill(g, () => g.ellipse(32, 42, 15, 12, 0, 0, TAU), rad(g, 32, 42, 15, '#8b5a2b'));
      for (const [x, y] of [[14, 24], [24, 15], [40, 15], [50, 24]]) fill(g, () => g.ellipse(x, y, 6, 7, 0, 0, TAU), rad(g, x, y, 7, '#8b5a2b'));
      g.fillStyle = '#f5f5f4'; for (const [x, y] of [[14, 17], [24, 8], [40, 8], [50, 17]]) { g.beginPath(); g.moveTo(x - 2, y + 2); g.lineTo(x, y - 3); g.lineTo(x + 2, y + 2); g.closePath(); g.fill(); }
    },
    swarm(g) {
      glow(g, 32, 32, 30, '#facc15', 0.4);
      g.setLineDash([3, 4]); arcLine(g, 32, 34, 18, 3.4, 6.0, '#fde68a', 1.5, false); g.setLineDash([]);
      for (const [x, y, s] of [[20, 40, 0.8], [44, 42, 0.7], [32, 24, 1]]) {
        for (const sd of [-1, 1]) fill(g, () => g.ellipse(x + sd * 4 * s, y - 6 * s, 4.5 * s, 3 * s, sd * 0.5, 0, TAU), 'rgba(224,242,254,0.85)', INK, 1);
        fill(g, () => g.ellipse(x, y, 7 * s, 5.5 * s, 0, 0, TAU), '#facc15', INK, 1.6);
        g.fillStyle = '#1c1917'; for (const dx of [-2, 2]) g.fillRect(x + dx * s - 1 * s, y - 5 * s, 2 * s, 10 * s);
      }
    },
    // engineer
    minefield(g) {
      glow(g, 32, 38, 28, '#ef4444', 0.45);
      g.strokeStyle = INK; g.lineWidth = 3;
      for (let i = 0; i < 5; i++) { const a = Math.PI + (i / 4) * Math.PI; g.beginPath(); g.moveTo(32 + Math.cos(a) * 14, 42 + Math.sin(a) * 14); g.lineTo(32 + Math.cos(a) * 21, 42 + Math.sin(a) * 21); g.stroke(); }
      fill(g, () => { g.arc(32, 42, 15, Math.PI, 0); g.closePath(); }, lin(g, 0, 26, 0, 42, '#64748b', 0.3, -0.4));
      fill(g, () => g.rect(14, 42, 36, 7), '#334155');
      glow(g, 32, 34, 8, '#ef4444', 1); fill(g, () => g.arc(32, 34, 3.5, 0, TAU), '#fca5a5', null);
    },
    overclock(g) {
      glow(g, 32, 32, 30, '#7dd3fc', 0.45);
      fill(g, () => { g.rect(18, 14, 28, 42); }, lin(g, 18, 0, 46, 0, '#0284c7', 0.3, -0.4));
      fill(g, () => g.rect(26, 9, 12, 5), '#94a3b8', INK, 1.5);
      fill(g, () => { g.moveTo(35, 18); g.lineTo(25, 36); g.lineTo(32, 36); g.lineTo(28, 52); g.lineTo(40, 32); g.lineTo(33, 32); g.lineTo(38, 18); g.closePath(); }, '#fde047', INK, 1.5);
    },
    rockets(g) {
      glow(g, 32, 32, 30, '#fb923c', 0.4);
      for (const [x, y, s] of [[18, 48, 0.7], [38, 40, 1]]) { g.save(); g.translate(x, y); g.rotate(-0.78); g.scale(s, s);
        g.save(); g.rotate(-Math.PI / 2); fire(g, 0, -12, 6, 18); g.restore();
        fill(g, () => { g.moveTo(-14, -5); g.lineTo(10, -5); g.quadraticCurveTo(22, 0, 10, 5); g.lineTo(-14, 5); g.closePath(); }, lin(g, 0, -5, 0, 5, '#e2e8f0'), INK, 1.8);
        fill(g, () => { g.moveTo(10, -5); g.quadraticCurveTo(22, 0, 10, 5); g.closePath(); }, '#ef4444', INK, 1.5);
        fill(g, () => { g.moveTo(-14, -5); g.lineTo(-19, -11); g.lineTo(-8, -5); g.moveTo(-14, 5); g.lineTo(-19, 11); g.lineTo(-8, 5); }, '#475569', INK, 1.3);
        g.restore(); }
    },
    // spearman
    sweep(g) { glow(g, 32, 32, 30, '#67e8f9', 0.45); arcLine(g, 32, 32, 24, -0.3, 4.6, '#67e8f9', 4); weapon(g, 'spearman', 10, 52, -0.78, 0.95); },
    vault(g) {
      glow(g, 32, 34, 30, '#67e8f9', 0.4);
      g.setLineDash([4, 5]); arcLine(g, 32, 52, 24, Math.PI * 1.05, Math.PI * 1.95, '#a5f3fc', 2.5, false); g.setLineDash([]);
      fill(g, () => { g.moveTo(56, 52); g.lineTo(47, 44); g.lineTo(58, 42); g.closePath(); }, '#a5f3fc', INK, 1.2);
      weapon(g, 'spearman', 12, 54, -1.1, 0.85);
      fill(g, () => g.rect(6, 54, 52, 4), '#57534e', null);
    },
    lance(g) {
      glow(g, 36, 28, 30, '#67e8f9', 0.55);
      bolt(g, [[14, 50], [22, 38], [18, 34], [30, 24], [28, 20], [40, 12]], '#a5f3fc');
      weapon(g, 'spearman', 6, 58, -0.78, 1.05);
    },
    // ice mage
    iceshards(g) {
      glow(g, 32, 32, 30, '#7dd3fc', 0.45);
      for (const a of [-0.5, 0, 0.5]) { g.save(); g.translate(14, 50); g.rotate(-0.78 + a); fill(g, () => { g.moveTo(44, 0); g.lineTo(24, -6); g.lineTo(10, 0); g.lineTo(24, 6); g.closePath(); }, lin(g, 0, -6, 0, 6, '#e0f2fe', 0.5, -0.2), '#0369a1', 1.6); line(g, [[40, 0], [14, 0]], 'rgba(255,255,255,0.9)', 1, false); g.restore(); }
    },
    blizzard(g) {
      glow(g, 32, 32, 30, '#bae6fd', 0.45);
      for (const [y, l] of [[16, 20], [48, 24]]) arcLine(g, 32, y + 30, 30, -Math.PI / 2 - l / 60, -Math.PI / 2 + l / 60, '#e0f2fe', 2, false);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; const c = Math.cos(a) * 18, s = Math.sin(a) * 18; line(g, [[32 - c, 32 - s], [32 + c, 32 + s]], '#e0f2fe', 3.5); for (const d of [-1, 1]) { const bx = 32 + c * 0.6 * d, by = 32 + s * 0.6 * d, a2 = a + (d > 0 ? 0 : Math.PI); line(g, [[bx + Math.cos(a2 + 2.4) * 6, by + Math.sin(a2 + 2.4) * 6], [bx, by], [bx + Math.cos(a2 - 2.4) * 6, by + Math.sin(a2 - 2.4) * 6]], '#e0f2fe', 2.5); } }
      fill(g, () => g.arc(32, 32, 4, 0, TAU), '#7dd3fc', INK, 1.5);
    },
    frostnova(g) {
      glow(g, 32, 32, 30, '#bae6fd', 0.55);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? 20 : 28; g.save(); g.translate(32, 32); g.rotate(a); fill(g, () => { g.moveTo(r, 0); g.lineTo(6, -5); g.lineTo(6, 5); g.closePath(); }, lin(g, 0, -5, 0, 5, '#e0f2fe', 0.5, -0.15), '#0369a1', 1.5); g.restore(); }
      fill(g, () => star(g, 32, 32, 9, 4, 6), '#ffffff', '#0369a1', 1.2);
    },
  };

  function draw(g, id) {
    const f = ICONS[id];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (f) f(g); else { glow(g, 32, 32, 28, '#fde68a', 0.5); g.beginPath(); star(g, 32, 32, 18, 7, 5); g.fillStyle = '#fde68a'; g.fill(); }
    g.restore();
  }
  const urls = {};
  function url(id, px = 96) {
    const key = id + ':' + px;
    if (urls[key]) return urls[key];
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'); g.scale(px / 64, px / 64); draw(g, id);
    return (urls[key] = c.toDataURL());
  }
  window.SkillIcons = { draw, url, has: (id) => !!ICONS[id] };
})();

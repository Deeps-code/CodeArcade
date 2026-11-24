/* =====================================================================
   Wave Survivor: a top-down wave-survival RPG (plain Canvas, no libraries)

   Layout of this file:
     1. CONFIG          tunable numbers, enemy kinds, wave scaling
     2. CLASSES         the 17 heroes: stats, attack style, ability, passive
     3. UPGRADES        level-up choices
     4. SPRITES         optional images (everything falls back to shapes)
     5. Canvas/helpers
     6. Input           keyboard (WASD / arrows, Space = ability) + touch joystick
     7. Entities        Player, Enemy, Projectile, Minion, Gem, Particle
     8. Combat          damage, crits, status effects, melee / thrust / area
     9. ABILITIES       one function per class ability
    10. WaveManager     spawns waves, scales difficulty, detects "cleared"
    11. Game            state, update, collisions, drawing
    12. UI              hero select, HUD, level up, pause, game over
    13. Main loop

   Adding a class: add an entry to CLASSES (and an ability to ABILITIES).
   Adding an upgrade: add an entry to UPGRADES.
   ===================================================================== */
(() => {
  'use strict';
  const TAU = Math.PI * 2;

  // ===================================================================
  // 1. CONFIG
  // ===================================================================
  const CONFIG = {
    player: { radius: 16, hurtCooldown: 0.5 },
    wave: { breakTime: 2.4, baseCount: 5, countPerWave: 2, spawnInterval: 0.6, minSpawnInterval: 0.12 },
    xp: { magnet: 120 },
  };
  const ENEMY_TYPES = {
    grunt:   { name: 'Grunt',   radius: 14, hp: 24, speed: 85,  damage: 10, color: '#dc2626', fromWave: 1, weight: 6, xp: 1 },
    runner:  { name: 'Runner',  radius: 10, hp: 14, speed: 155, damage: 7,  color: '#ea580c', fromWave: 3, weight: 3, xp: 1 },
    brute:   { name: 'Brute',   radius: 24, hp: 90, speed: 55,  damage: 20, color: '#7c3aed', fromWave: 5, weight: 1.6, xp: 4 },
    spitter: { name: 'Spitter', radius: 13, hp: 30, speed: 70,  damage: 12, color: '#ca8a04', fromWave: 8, weight: 1.4, xp: 2, keepAway: 160 },
  };
  function waveScaling(wave) {
    const n = wave - 1;
    return {
      count: CONFIG.wave.baseCount + n * CONFIG.wave.countPerWave + Math.floor(Math.pow(n, 1.35)),
      hp: 1 + n * 0.14,
      speed: 1 + Math.min(0.9, n * 0.035),
      damage: 1 + n * 0.06,
      spawnInterval: Math.max(CONFIG.wave.minSpawnInterval, CONFIG.wave.spawnInterval * Math.pow(0.93, n)),
    };
  }
  const xpFor = (level) => Math.round(6 + level * 4 + level * level * 0.6);

  // ===================================================================
  // 2. CLASSES
  //    attack.kind: 'melee' (arc swing) | 'thrust' (line) | 'bolt' (projectile) | 'deploy' (turrets)
  //    stats override BASE_STATS; passive flags are read by the combat code.
  // ===================================================================
  const BASE_STATS = { maxHp: 100, speed: 225, damage: 12, cooldown: 0.5, range: 380, armor: 0, crit: 0.05, critMult: 1.7, lifesteal: 0, regen: 0, evasion: 0, block: 0, cdr: 1, minions: 0 };
  const CLASSES = [
    { id: 'warrior', name: 'Warrior', icon: '⚔️', color: '#ef4444', role: 'Melee · AoE',
      desc: 'A sturdy fighter whose wide sword swings cut everything in front of him.',
      stats: { maxHp: 160, speed: 215, damage: 18, cooldown: 0.55, range: 80, armor: 0.12 },
      attack: { kind: 'melee', arc: 2.4 }, passive: { text: 'Tough: takes 12% less damage.' },
      ability: { id: 'whirlwind', name: 'Whirlwind', icon: '🌀', cd: 8, desc: 'Spin for 2.5s, slicing every enemy around you.' } },
    { id: 'mage', name: 'Mage', icon: '🔮', color: '#8b5cf6', role: 'Ranged · Spells',
      desc: 'Hurls arcane bolts from afar. Fragile, but devastating up close to a crowd.',
      stats: { maxHp: 80, speed: 225, damage: 15, cooldown: 0.58, range: 430 },
      attack: { kind: 'bolt', speed: 480, color: '#c4b5fd', size: 6 }, passive: { chainEvery: 4, text: 'Every 4th bolt arcs as chain lightning to 3 more enemies.' },
      ability: { id: 'fireball', name: 'Fireball', icon: '☄️', cd: 7, desc: 'A huge fireball that explodes on impact and sets foes ablaze.' } },
    { id: 'archer', name: 'Archer', icon: '🏹', color: '#22c55e', role: 'Ranged · Fast',
      desc: 'Picks enemies off from far away with a quick, steady bow.',
      stats: { maxHp: 95, speed: 240, damage: 13, cooldown: 0.3, range: 580, crit: 0.12 },
      attack: { kind: 'bolt', speed: 860, color: '#fde68a', size: 4, shape: 'arrow', pierce: 1 }, passive: { text: 'Arrows pierce through one extra enemy.' },
      ability: { id: 'volley', name: 'Arrow Volley', icon: '🎯', cd: 6, desc: 'Fire a fan of 11 arrows at once.' } },
    { id: 'guardian', name: 'Guardian', icon: '🛡️', color: '#3b82f6', role: 'Tank · Control',
      desc: 'An unbreakable wall of steel that pulls the horde onto his shield.',
      stats: { maxHp: 240, speed: 190, damage: 13, cooldown: 0.7, range: 66, armor: 0.4, block: 0.2 },
      attack: { kind: 'melee', arc: 1.8, knock: 2 }, passive: { taunt: 150, text: 'Blocks 20% of hits. Nearby enemies are taunted and slowed.' },
      ability: { id: 'shieldslam', name: 'Shield Slam', icon: '💥', cd: 7, desc: 'Slam the ground: damage, knock back and stun everything near you.' } },
    { id: 'assassin', name: 'Assassin', icon: '🗡️', color: '#94a3b8', role: 'Melee · Crit',
      desc: 'Fast and deadly. Low health, but each strike can be lethal.',
      stats: { maxHp: 85, speed: 300, damage: 15, cooldown: 0.4, range: 56, crit: 0.35, critMult: 2.6 },
      attack: { kind: 'melee', arc: 1.4 }, passive: { text: 'Deadly: 35% chance to crit for huge damage.' },
      ability: { id: 'shadowdash', name: 'Shadow Dash', icon: '💨', cd: 3.5, desc: 'Vanish and strike the nearest enemy from behind for a massive crit.' } },
    { id: 'summoner', name: 'Summoner', icon: '🪄', color: '#14b8a6', role: 'Minions',
      desc: 'Lets loyal spirit familiars do most of the fighting.',
      stats: { maxHp: 100, speed: 225, damage: 9, cooldown: 0.75, range: 360 },
      attack: { kind: 'bolt', speed: 430, color: '#5eead4', size: 5 }, passive: { spirits: 2, text: 'Two spirit familiars fight beside you.' },
      ability: { id: 'spiritcall', name: 'Spirit Call', icon: '👻', cd: 10, desc: 'Summon 3 more spirits for 12 seconds.' } },
    { id: 'healer', name: 'Cleric', icon: '✨', color: '#facc15', role: 'Support · Healing',
      desc: 'Outlasts the horde by healing through the damage.',
      stats: { maxHp: 120, speed: 225, damage: 11, cooldown: 0.55, range: 390, regen: 2.5 },
      attack: { kind: 'bolt', speed: 460, color: '#fef08a', size: 5 }, passive: { text: 'Regenerates 2.5 HP every second.' },
      ability: { id: 'sanctuary', name: 'Sanctuary', icon: '💖', cd: 12, desc: 'Heal 40% of your HP and deal +50% damage for 6s.' } },
    { id: 'berserker', name: 'Berserker', icon: '🪓', color: '#b91c1c', role: 'Melee · Risky',
      desc: 'Reckless and furious. The closer to death, the harder he hits.',
      stats: { maxHp: 140, speed: 235, damage: 19, cooldown: 0.6, range: 74, armor: -0.1, lifesteal: 0.05 },
      attack: { kind: 'melee', arc: 2.1 }, passive: { berserk: true, text: 'The lower your HP, the more damage you deal (up to +160%).' },
      ability: { id: 'bloodrage', name: 'Blood Rage', icon: '🩸', cd: 10, desc: 'Attack more than twice as fast and steal more life for 6s.' } },
    { id: 'paladin', name: 'Paladin', icon: '⚜️', color: '#f59e0b', role: 'Melee · Holy',
      desc: 'A holy knight who heals with every blow of his hammer.',
      stats: { maxHp: 170, speed: 210, damage: 16, cooldown: 0.6, range: 72, armor: 0.2, lifesteal: 0.06 },
      attack: { kind: 'melee', arc: 2.0 }, passive: { text: 'Holy strikes heal you for 6% of the damage dealt.' },
      ability: { id: 'holynova', name: 'Holy Nova', icon: '🌟', cd: 9, desc: 'Burst of holy light: damages enemies around you and heals 25% HP.' } },
    { id: 'necromancer', name: 'Necromancer', icon: '💀', color: '#65a30d', role: 'Minions · Drain',
      desc: 'Drains life from the living and raises the fallen to fight for him.',
      stats: { maxHp: 90, speed: 220, damage: 12, cooldown: 0.6, range: 390 },
      attack: { kind: 'bolt', speed: 440, color: '#a3e635', size: 6, drain: 0.15 }, passive: { raise: 0.3, maxSkeletons: 6, text: 'Bolts drain life. Slain foes may rise as skeletons (up to 6).' },
      ability: { id: 'raisedead', name: 'Raise Dead', icon: '🧟', cd: 11, desc: 'Raise 4 skeleton warriors for 20 seconds.' } },
    { id: 'monk', name: 'Monk', icon: '👊', color: '#f97316', role: 'Melee · Agile',
      desc: 'Lightning-fast fists and an uncanny knack for dodging.',
      stats: { maxHp: 110, speed: 270, damage: 9, cooldown: 0.2, range: 58, evasion: 0.25 },
      attack: { kind: 'melee', arc: 1.5 }, passive: { combo: 3, text: 'Dodges 25% of attacks. Every 3rd strike hits twice as hard.' },
      ability: { id: 'flurry', name: 'Flurry', icon: '🥋', cd: 6, desc: 'A storm of a dozen strikes all around you.' } },
    { id: 'pyromancer', name: 'Pyromancer', icon: '🔥', color: '#ea580c', role: 'Ranged · Burn',
      desc: 'Sets the battlefield on fire. Burning foes keep taking damage.',
      stats: { maxHp: 85, speed: 225, damage: 11, cooldown: 0.55, range: 400 },
      attack: { kind: 'bolt', speed: 460, color: '#fb923c', size: 6, burn: { mult: 0.9, t: 3 } }, passive: { text: 'Fire bolts set enemies burning over time.' },
      ability: { id: 'flamering', name: 'Flame Ring', icon: '🔥', cd: 8, desc: 'Erupt in a ring of fire that badly burns everything around you.' } },
    { id: 'gunner', name: 'Gunner', icon: '🔫', color: '#64748b', role: 'Ranged · Rapid',
      desc: 'Sprays a hail of bullets: weak alone, brutal together.',
      stats: { maxHp: 100, speed: 230, damage: 5.5, cooldown: 0.09, range: 420 },
      attack: { kind: 'bolt', speed: 760, color: '#e2e8f0', size: 3, spread: 0.12 }, passive: { text: 'Rapid fire: a constant stream of bullets.' },
      ability: { id: 'bulletstorm', name: 'Bullet Storm', icon: '💫', cd: 7, desc: 'Three rings of bullets fire in every direction.' } },
    { id: 'druid', name: 'Druid', icon: '🌿', color: '#16a34a', role: 'Nature · Control',
      desc: 'Commands nature: a loyal wolf, and thorns that hold enemies in place.',
      stats: { maxHp: 115, speed: 225, damage: 11, cooldown: 0.6, range: 370 },
      attack: { kind: 'bolt', speed: 440, color: '#86efac', size: 5, rootChance: 0.12 }, passive: { wolves: 1, text: 'A wolf hunts by your side. Thorn bolts can root enemies.' },
      ability: { id: 'entangle', name: 'Entangle', icon: '🌱', cd: 9, desc: 'Roots every enemy near you for 3s and calls a second wolf.' } },
    { id: 'engineer', name: 'Engineer', icon: '🔧', color: '#0ea5e9', role: 'Turrets · Traps',
      desc: 'Never attacks himself: builds turrets that do the shooting.',
      stats: { maxHp: 105, speed: 230, damage: 10, cooldown: 3, range: 330 },
      attack: { kind: 'deploy' }, passive: { maxTurrets: 3, text: 'Builds up to 3 turrets instead of attacking.' },
      ability: { id: 'minefield', name: 'Mine Field', icon: '💣', cd: 8, desc: 'Drop 6 mines around you that explode when enemies step close.' } },
    { id: 'spearman', name: 'Spearman', icon: '🔱', color: '#0891b2', role: 'Melee · Reach',
      desc: 'Keeps the horde at spear\'s length and skewers whole lines of them.',
      stats: { maxHp: 135, speed: 220, damage: 16, cooldown: 0.5, range: 120, armor: 0.08 },
      attack: { kind: 'thrust', width: 22 }, passive: { text: 'Long thrusts pierce every enemy in a line.' },
      ability: { id: 'lance', name: 'Piercing Lance', icon: '⚡', cd: 6, desc: 'A massive thrust that skewers everything across the arena.' } },
    { id: 'icemage', name: 'Ice Mage', icon: '❄️', color: '#38bdf8', role: 'Ranged · Slow',
      desc: 'Chills the horde to a crawl, then freezes it solid.',
      stats: { maxHp: 85, speed: 225, damage: 12, cooldown: 0.55, range: 410 },
      attack: { kind: 'bolt', speed: 470, color: '#bae6fd', size: 6, slow: { k: 0.45, t: 2 } }, passive: { freezeEvery: 5, text: 'Frost bolts slow enemies. Every 5th one freezes solid.' },
      ability: { id: 'frostnova', name: 'Frost Nova', icon: '🧊', cd: 9, desc: 'Freeze every enemy around you for 2.5 seconds.' } },
  ];
  const classById = (id) => CLASSES.find((c) => c.id === id) || CLASSES[0];

  // ===================================================================
  // 3. UPGRADES (level-up choices)
  // ===================================================================
  const UPGRADES = [
    { id: 'might', icon: '💪', name: 'Might', desc: '+15% damage', apply: (s) => { s.damage *= 1.15; } },
    { id: 'haste', icon: '⚡', name: 'Haste', desc: 'Attack 10% faster', apply: (s) => { s.cooldown *= 0.9; } },
    { id: 'vigor', icon: '❤️', name: 'Vigor', desc: '+25 max HP and heal 25', apply: (s, p) => { s.maxHp += 25; p.heal(25); } },
    { id: 'swift', icon: '👟', name: 'Swiftness', desc: '+8% move speed', apply: (s) => { s.speed *= 1.08; } },
    { id: 'keen', icon: '🎯', name: 'Keen Eye', desc: '+6% crit chance', apply: (s) => { s.crit = Math.min(0.9, s.crit + 0.06); } },
    { id: 'brutal', icon: '💥', name: 'Brutality', desc: '+30% crit damage', apply: (s) => { s.critMult += 0.3; } },
    { id: 'focus', icon: '⏳', name: 'Focus', desc: 'Ability recharges 12% faster', apply: (s) => { s.cdr *= 0.88; } },
    { id: 'regen', icon: '🌿', name: 'Regeneration', desc: '+1.2 HP per second', apply: (s) => { s.regen += 1.2; } },
    { id: 'reach', icon: '📏', name: 'Reach', desc: '+12% attack range', apply: (s) => { s.range *= 1.12; } },
    { id: 'tough', icon: '🛡️', name: 'Toughness', desc: 'Take 6% less damage', apply: (s) => { s.armor = Math.min(0.75, s.armor + 0.06); } },
    { id: 'vamp', icon: '🩸', name: 'Vampirism', desc: '+3% life steal', apply: (s) => { s.lifesteal += 0.03; } },
    { id: 'pack', icon: '🐾', name: 'Bigger Pack', desc: '+1 minion / turret', apply: (s) => { s.minions += 1; },
      when: (c) => ['summoner', 'druid', 'necromancer', 'engineer'].includes(c.id) },
  ];

  // ===================================================================
  // 4. SPRITES (optional). Put images in and entities use them instead of shapes, e.g.
  //      SPRITES.warrior = loadImage('img/warrior.png');  SPRITES.grunt = loadImage('img/grunt.png');
  // ===================================================================
  const SPRITES = {};
  function loadImage(src) { const img = new Image(); img.src = src; return img; }   // eslint-disable-line no-unused-vars
  function drawSprite(ctx, key, x, y, r, angle = 0) {
    const img = SPRITES[key];
    if (!img || !img.complete || !img.naturalWidth) return false;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(img, -r, -r, r * 2, r * 2); ctx.restore();
    return true;
  }

  // ===================================================================
  // 5. Canvas & helpers
  // ===================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { w: 0, h: 0, dpr: 1 };
  let floorPattern = null;
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth; view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
    if (game.player) game.player.clampTo(view);
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  function pickWeighted(items) {
    let t = 0; for (const it of items) t += it.weight;
    let r = Math.random() * t;
    for (const it of items) { r -= it.weight; if (r <= 0) return it; }
    return items[items.length - 1];
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // a stone dungeon floor, made once
  function makeFloor() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1c1814'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const v = 24 + ((x * 7 + y * 13) % 5) * 3;
      g.fillStyle = `rgb(${v + 6}, ${v + 2}, ${v - 2})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x * 64 + 2, y * 64 + 59, 60, 3);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x * 64 + 6 + ((i * 23) % 50), y * 64 + 6 + ((i * 37) % 50), 3, 2); }
    }
    floorPattern = ctx.createPattern(c, 'repeat');
  }

  // ===================================================================
  // 6. Input
  // ===================================================================
  const Input = {
    keys: new Set(),
    touch: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    moveVector() {
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      if (this.touch.id !== null) {
        const dx = this.touch.x - this.touch.ox, dy = this.touch.y - this.touch.oy, len = Math.hypot(dx, dy);
        if (len > 6) { const k = Math.min(1, len / 50); x = (dx / len) * k; y = (dy / len) * k; }
      }
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    clear() { this.keys.clear(); this.touch.id = null; UI.hideStick(); },
  };
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); Input.keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); }
    if (game.state === 'playing' && (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'KeyE')) { e.preventDefault(); game.player.useAbility(); }
    if (game.state === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) UI.pickLevelUp(+e.code.slice(-1) - 1);
    if (e.code === 'Enter') { if (game.state === 'menu' || game.state === 'over') startGame(); else if (game.state === 'paused') resume(); }
  });
  window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
  window.addEventListener('blur', () => { Input.clear(); if (game.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || game.state !== 'playing' || Input.touch.id !== null) return;
    Object.assign(Input.touch, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
    UI.showStick(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== Input.touch.id) return;
    Input.touch.x = e.clientX; Input.touch.y = e.clientY;
    UI.moveKnob(e.clientX - Input.touch.ox, e.clientY - Input.touch.oy);
  });
  const endTouch = (e) => { if (e.pointerId === Input.touch.id) { Input.touch.id = null; UI.hideStick(); } };
  window.addEventListener('pointerup', endTouch);
  window.addEventListener('pointercancel', endTouch);

  // ===================================================================
  // 7. Entities
  // ===================================================================
  class Player {
    constructor(cls, x, y) {
      this.cls = cls; this.x = x; this.y = y;
      this.radius = CONFIG.player.radius;
      this.stats = Object.assign({}, BASE_STATS, cls.stats);   // items / upgrades change these
      this.hp = this.stats.maxHp;
      this.level = 1; this.xp = 0; this.xpNext = xpFor(1); this.pendingLevels = 0;
      this.attackTimer = 0.25; this.abilityTimer = 0;   // 0 = ready
      this.hurtTimer = 0; this.aim = 0; this.alive = true;
      this.hits = 0;                 // counts attacks, for "every Nth" passives
      this.buffs = {};               // name -> seconds left
      this.whirl = 0; this.whirlTick = 0; this.flurry = 0; this.flurryTick = 0; this.storm = 0; this.stormTick = 0;
    }
    get dmgMult() {
      let m = 1;
      if (this.buffs.might > 0) m *= 1.5;
      if (this.cls.passive.berserk) m *= 1 + (1 - this.hp / this.stats.maxHp) * 1.6;
      return m;
    }
    get attackCooldown() { return this.stats.cooldown * (this.buffs.rage > 0 ? 0.45 : 1); }
    get lifesteal() { return this.stats.lifesteal + (this.buffs.rage > 0 ? 0.1 : 0); }
    get abilityCooldown() { return this.cls.ability.cd * this.stats.cdr; }
    heal(amount, quiet = false) {
      if (!this.alive || amount <= 0) return;
      const before = this.hp;
      this.hp = Math.min(this.stats.maxHp, this.hp + amount);
      if (!quiet && this.hp - before >= 1) game.floatText(this.x, this.y - 26, '+' + Math.round(this.hp - before), '#4ade80');
    }
    update(dt) {
      const mv = Input.moveVector();
      this.x += mv.x * this.stats.speed * dt; this.y += mv.y * this.stats.speed * dt;
      this.clampTo(view);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      this.abilityTimer = Math.max(0, this.abilityTimer - dt);
      if (this.stats.regen) this.heal(this.stats.regen * dt, true);
      for (const k in this.buffs) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) delete this.buffs[k]; }
      this.updateAbilityEffects(dt);
      this.updateAttack(dt);
    }
    updateAttack(dt) {
      this.attackTimer -= dt;
      if (this.attackTimer > 0) return;
      const a = this.cls.attack;
      if (a.kind === 'deploy') {
        const max = this.cls.passive.maxTurrets + this.stats.minions;
        if (game.minions.filter((m) => m.kind === 'turret').length < max) {
          const ang = rand(0, TAU);
          game.minions.push(new Minion('turret', this.x + Math.cos(ang) * 26, this.y + Math.sin(ang) * 26, { life: 22 }));
          game.burst(this.x, this.y, '#7dd3fc', 8);
          this.attackTimer = this.attackCooldown;
        } else this.attackTimer = 0.3;
        return;
      }
      const melee = a.kind === 'melee' || a.kind === 'thrust';
      const target = game.nearestEnemy(this, melee ? this.stats.range * 1.25 + 14 : this.stats.range);
      if (!target) { this.attackTimer = 0.05; return; }
      this.aim = Math.atan2(target.y - this.y, target.x - this.x);
      this.hits++;
      const P = this.cls.passive, dmg = this.stats.damage;
      if (a.kind === 'melee') {
        const combo = P.combo && this.hits % P.combo === 0;
        Combat.melee(this.x, this.y, this.aim, this.stats.range * (combo ? 1.3 : 1), a.arc, dmg * (combo ? 2 : 1), { knock: a.knock || 1, color: this.cls.color });
      } else if (a.kind === 'thrust') {
        Combat.thrust(this.x, this.y, this.aim, this.stats.range + 20, a.width, dmg, { color: this.cls.color });
      } else {
        const fx = { burn: a.burn ? { dps: dmg * a.burn.mult, t: a.burn.t } : null, slow: a.slow, drain: a.drain };
        if (P.chainEvery && this.hits % P.chainEvery === 0) fx.chain = { count: 3, range: 160, mult: 0.75 };
        if (P.freezeEvery && this.hits % P.freezeEvery === 0) fx.freeze = 1.2;
        if (a.rootChance && Math.random() < a.rootChance) fx.root = 1.5;
        const ang = this.aim + (a.spread ? rand(-a.spread, a.spread) : 0);
        game.projectiles.push(new Projectile(this.x, this.y, ang, { speed: a.speed, dmg, size: a.size, color: a.color, shape: a.shape, pierce: a.pierce || 0, range: this.stats.range, fx }));
      }
      this.attackTimer = this.attackCooldown;
    }
    useAbility() {
      if (this.abilityTimer > 0 || !this.alive) return;
      const fn = ABILITIES[this.cls.ability.id];
      if (!fn) return;
      if (fn(this) === false) return;   // the ability can refuse (e.g. no target)
      this.abilityTimer = this.abilityCooldown;
      UI.flashAbility();
    }
    updateAbilityEffects(dt) {
      if (this.whirl > 0) {
        this.whirl -= dt; this.whirlTick -= dt;
        if (this.whirlTick <= 0) { this.whirlTick = 0.2; Combat.area(this.x, this.y, this.stats.range * 1.3, this.stats.damage * 0.7, { knock: 1 }); }
      }
      if (this.flurry > 0) {
        this.flurry -= dt; this.flurryTick -= dt;
        if (this.flurryTick <= 0) { this.flurryTick = 0.075; Combat.melee(this.x, this.y, rand(0, TAU), this.stats.range * 1.2, 1.6, this.stats.damage * 0.8, { color: this.cls.color }); }
      }
      if (this.storm > 0) {
        this.stormTick -= dt;
        if (this.stormTick <= 0) {
          this.stormTick = 0.18; this.storm--;
          const off = rand(0, TAU);
          for (let i = 0; i < 24; i++) game.projectiles.push(new Projectile(this.x, this.y, off + (i / 24) * TAU, { speed: 640, dmg: this.stats.damage * 1.6, size: 3.5, color: '#f8fafc', range: 420 }));
        }
      }
    }
    clampTo(v) { const m = this.radius + 4; this.x = clamp(this.x, m, v.w - m); this.y = clamp(this.y, m, v.h - m); }
    takeDamage(amount) {
      if (this.hurtTimer > 0 || !this.alive) return false;
      const s = this.stats;
      if (s.evasion && Math.random() < s.evasion) { game.floatText(this.x, this.y - 26, 'DODGE', '#93c5fd'); this.hurtTimer = 0.25; return false; }
      if (s.block && Math.random() < s.block) { game.floatText(this.x, this.y - 26, 'BLOCK', '#bfdbfe'); game.fx.push({ type: 'ring', x: this.x, y: this.y, r0: 18, r1: 30, color: '#93c5fd', t: 0.25, max: 0.25 }); this.hurtTimer = 0.3; return false; }
      const dmg = Math.max(1, Math.round(amount * (1 - s.armor)));
      this.hp = Math.max(0, this.hp - dmg);
      this.hurtTimer = CONFIG.player.hurtCooldown;
      game.shake = 7;
      game.floatText(this.x, this.y - 26, '-' + dmg, '#f87171');
      if (this.hp <= 0) { this.alive = false; game.onPlayerDied(); }
      return true;
    }
    gainXp(v) {
      this.xp += v;
      while (this.xp >= this.xpNext) { this.xp -= this.xpNext; this.level++; this.xpNext = xpFor(this.level); this.pendingLevels++; }
    }
    draw(ctx) {
      if (this.hurtTimer > 0 && Math.floor(this.hurtTimer * 20) % 2 === 0) return;
      const c = this.cls, r = this.radius;
      // auras
      if (c.passive.taunt) { ctx.strokeStyle = 'rgba(96,165,250,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(this.x, this.y, c.passive.taunt, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (this.buffs.rage > 0 || this.buffs.might > 0) {
        const g = ctx.createRadialGradient(this.x, this.y, r * 0.5, this.x, this.y, r * 2.4);
        g.addColorStop(0, this.buffs.rage > 0 ? 'rgba(239,68,68,0.55)' : 'rgba(250,204,21,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.4, 0, TAU); ctx.fill();
      }
      if (this.whirl > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) { const a = game.time * 18 + i * (TAU / 3); ctx.beginPath(); ctx.arc(this.x, this.y, this.stats.range * 1.1, a, a + 0.9); ctx.stroke(); }
      }
      if (drawSprite(ctx, c.id, this.x, this.y, r, this.aim)) return;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.85, r, r * 0.38, 0, 0, TAU); ctx.fill();
      // weapon pointer
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.aim);
      ctx.fillStyle = '#f3e9d2'; ctx.beginPath(); ctx.moveTo(r + 9, 0); ctx.lineTo(r - 1, -5); ctx.lineTo(r - 1, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#d4a62a'; ctx.stroke();
      ctx.font = Math.round(r * 1.05) + 'px system-ui, "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.icon, this.x, this.y + 1);
    }
  }

  class Enemy {
    constructor(typeKey, x, y, scale) {
      const t = ENEMY_TYPES[typeKey];
      this.type = typeKey; this.def = t; this.x = x; this.y = y; this.radius = t.radius;
      this.maxHp = Math.round(t.hp * scale.hp); this.hp = this.maxHp;
      this.speed = t.speed * scale.speed * rand(0.9, 1.1);
      this.damage = Math.round(t.damage * scale.damage);
      this.flash = 0; this.vx = 0; this.vy = 0; this.dead = false; this.wobble = rand(0, TAU);
      // status effects
      this.burn = null; this.burnAcc = 0; this.burnShow = 0; this.slow = null; this.stun = 0; this.frozen = 0; this.root = 0;
    }
    get moveFactor() {
      if (this.stun > 0 || this.root > 0) return 0;
      let f = this.slow ? 1 - this.slow.k : 1;
      const p = game.player;
      if (p && p.cls.passive.taunt && dist2(this, p) < p.cls.passive.taunt ** 2) f *= 0.7;
      return f;
    }
    update(dt, player) {
      // statuses tick down
      if (this.slow) { this.slow.t -= dt; if (this.slow.t <= 0) this.slow = null; }
      this.stun = Math.max(0, this.stun - dt); this.frozen = Math.max(0, this.frozen - dt); this.root = Math.max(0, this.root - dt);
      if (this.burn) {
        this.burn.t -= dt; this.burnAcc += this.burn.dps * dt; this.burnShow -= dt;
        if (this.burnAcc >= 1) { const n = Math.floor(this.burnAcc); this.burnAcc -= n; Combat.damage(this, n, { raw: true, quiet: this.burnShow > 0, color: '#fb923c' }); if (this.burnShow <= 0) this.burnShow = 0.5; }
        if (this.burn && this.burn.t <= 0) this.burn = null;
      }
      const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy) || 1;
      let dir = 1;
      if (this.def.keepAway) {
        dir = d > this.def.keepAway + 20 ? 1 : d < this.def.keepAway - 20 ? -0.6 : 0;
        this.shootTimer = (this.shootTimer ?? rand(1, 2)) - dt;
        if (this.shootTimer <= 0 && d < this.def.keepAway + 140 && this.stun <= 0) {
          this.shootTimer = rand(1.6, 2.4);
          game.enemyShots.push(new Projectile(this.x, this.y, Math.atan2(dy, dx), { hostile: true, speed: 230, dmg: this.damage, size: 6, color: '#facc15', life: 3 }));
        }
      }
      const sp = this.speed * this.moveFactor;
      this.x += ((dx / d) * sp * dir + this.vx) * dt; this.y += ((dy / d) * sp * dir + this.vy) * dt;
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      this.flash = Math.max(0, this.flash - dt);
      if (this.moveFactor > 0) this.wobble += dt * 6;
    }
    draw(ctx, player) {
      if (drawSprite(ctx, this.type, this.x, this.y, this.radius)) return;
      const r = this.radius * (1 + Math.sin(this.wobble) * 0.04);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.frozen > 0 ? '#bae6fd' : this.def.color;
      if (this.type === 'brute') { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(this.x - r, this.y - r, r * 2, r * 2, r * 0.35); else ctx.rect(this.x - r, this.y - r, r * 2, r * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      const a = Math.atan2(player.y - this.y, player.x - this.x), ex = Math.cos(a) * r * 0.3, ey = Math.sin(a) * r * 0.3;
      ctx.fillStyle = '#fef3c7';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(this.x + ex + Math.cos(a + Math.PI / 2) * s * r * 0.32, this.y + ey + Math.sin(a + Math.PI / 2) * s * r * 0.32, Math.max(2, r * 0.17), 0, TAU); ctx.fill(); }
      // status looks
      if (this.burn) { for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#fde047' : '#f97316'; ctx.beginPath(); ctx.arc(this.x + rand(-r, r) * 0.7, this.y - r * 0.4 - rand(0, r * 0.8), rand(1.5, 3), 0, TAU); ctx.fill(); } }
      if (this.slow && this.frozen <= 0) { ctx.strokeStyle = 'rgba(125,211,252,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, r + 3, 0, TAU); ctx.stroke(); }
      if (this.frozen > 0) { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(aa) * (r + 4), this.y + Math.sin(aa) * (r + 4)); } ctx.stroke(); }
      else if (this.stun > 0) { ctx.fillStyle = '#fde047'; for (let i = 0; i < 3; i++) { const aa = game.time * 5 + i * (TAU / 3); ctx.beginPath(); ctx.arc(this.x + Math.cos(aa) * r * 0.8, this.y - r - 4 + Math.sin(aa) * 3, 2.5, 0, TAU); ctx.fill(); } }
      if (this.root > 0) { ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i < 5; i++) { const aa = (i / 5) * TAU + 0.3; ctx.moveTo(this.x + Math.cos(aa) * r, this.y + Math.sin(aa) * r * 0.6 + r * 0.6); ctx.quadraticCurveTo(this.x + Math.cos(aa) * r * 1.5, this.y + r * 0.2, this.x + Math.cos(aa + 0.4) * r * 0.6, this.y - r * 0.2); } ctx.stroke(); }
      if (this.hp < this.maxHp) {
        const w = Math.max(24, r * 2), y = this.y - r - 9;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2, y, w, 4);
        ctx.fillStyle = '#f87171'; ctx.fillRect(this.x - w / 2, y, w * Math.max(0, this.hp / this.maxHp), 4);
      }
    }
  }

  class Projectile {
    constructor(x, y, angle, o) {
      this.x = x; this.y = y; this.angle = angle;
      this.vx = Math.cos(angle) * o.speed; this.vy = Math.sin(angle) * o.speed;
      this.dmg = o.dmg; this.radius = o.size || 5; this.color = o.color || '#fff'; this.shape = o.shape;
      this.hostile = !!o.hostile; this.pierce = o.pierce || 0; this.fx = o.fx || {}; this.explode = o.explode;
      this.life = o.life ?? (o.range ? o.range / o.speed + 0.12 : 1.2);
      this.hitSet = new Set(); this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
      if (this.life <= 0) { if (this.explode) Combat.explode(this); this.dead = true; }
    }
    draw(ctx) {
      if (drawSprite(ctx, this.hostile ? 'enemyShot' : 'shot', this.x, this.y, this.radius, this.angle)) return;
      if (this.shape === 'arrow') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
        ctx.restore(); return;
      }
      ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = this.explode ? 22 : 10;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  // Pets, summons, turrets and mines that fight for you
  const MINION_KINDS = {
    spirit:   { r: 7,  speed: 270, cd: 0.45, reach: 10, mult: 0.75, color: '#5eead4', icon: '' },
    skeleton: { r: 10, speed: 125, cd: 0.7,  reach: 16, mult: 0.7,  color: '#e7e5e4', icon: '☠' },
    wolf:     { r: 11, speed: 215, cd: 0.55, reach: 14, mult: 0.9,  color: '#a8a29e', icon: '🐺' },
    turret:   { r: 12, speed: 0,   cd: 0.45, reach: 330, mult: 0.9, color: '#0ea5e9', icon: '' },
    mine:     { r: 6,  speed: 0,   cd: 0,    reach: 26, mult: 3,    color: '#ef4444', icon: '' },
  };
  class Minion {
    constructor(kind, x, y, o = {}) {
      this.kind = kind; this.def = MINION_KINDS[kind]; this.x = x; this.y = y;
      this.life = o.life ?? Infinity; this.permanent = !isFinite(this.life);
      this.cd = rand(0, 0.3); this.orbit = rand(0, TAU); this.aim = 0; this.dead = false; this.bob = rand(0, TAU);
    }
    update(dt) {
      const p = game.player, d = this.def;
      this.life -= dt; if (this.life <= 0) { this.dead = true; game.burst(this.x, this.y, d.color, 6); return; }
      this.cd -= dt; this.bob += dt * 4;
      if (this.kind === 'mine') {
        const e = game.nearestEnemy(this, d.reach);
        if (e) { Combat.area(this.x, this.y, 90, p.stats.damage * d.mult, { knock: 3 }); game.fx.push({ type: 'boom', x: this.x, y: this.y, r: 90, color: '#f97316', t: 0.35, max: 0.35 }); this.dead = true; }
        return;
      }
      if (this.kind === 'turret') {
        const e = game.nearestEnemy(this, d.reach);
        if (e) { this.aim = Math.atan2(e.y - this.y, e.x - this.x); if (this.cd <= 0) { this.cd = d.cd; game.projectiles.push(new Projectile(this.x, this.y, this.aim, { speed: 600, dmg: p.stats.damage * d.mult, size: 4, color: '#7dd3fc', range: d.reach })); } }
        return;
      }
      // walkers & flyers: chase the nearest enemy near you, otherwise stay close
      const e = game.nearestEnemy(p, 320) && game.nearestEnemy(this, 360);
      let tx, ty;
      if (e) { tx = e.x; ty = e.y; }
      else { this.orbit += dt * (this.kind === 'spirit' ? 2.5 : 0.6); tx = p.x + Math.cos(this.orbit) * 44; ty = p.y + Math.sin(this.orbit) * 44; }
      const dx = tx - this.x, dy = ty - this.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 2) { const st = Math.min(dd, d.speed * dt); this.x += (dx / dd) * st; this.y += (dy / dd) * st; this.aim = Math.atan2(dy, dx); }
      if (e && this.cd <= 0 && Math.hypot(e.x - this.x, e.y - this.y) < e.radius + d.r + d.reach) {
        this.cd = d.cd; Combat.damage(e, p.stats.damage * d.mult, { knockFrom: this, knock: 0.6 });
      }
    }
    draw(ctx) {
      const d = this.def;
      if (drawSprite(ctx, this.kind, this.x, this.y, d.r, this.aim)) return;
      const fade = isFinite(this.life) && this.life < 2 ? 0.4 + 0.6 * (Math.floor(this.life * 8) % 2) : 1;
      ctx.globalAlpha = fade;
      if (this.kind === 'spirit') {
        const y = this.y + Math.sin(this.bob) * 2;
        ctx.fillStyle = d.color; ctx.shadowColor = d.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(this.x, y, d.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(94,234,212,0.35)'; ctx.beginPath(); ctx.arc(this.x - Math.cos(this.aim) * 7, y - Math.sin(this.aim) * 7, d.r * 0.7, 0, TAU); ctx.fill();
      } else if (this.kind === 'turret') {
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(this.x, this.y, d.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.aim); ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, -3, d.r + 6, 6); ctx.restore();
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, TAU); ctx.fill();
      } else if (this.kind === 'mine') {
        ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(this.x, this.y, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = Math.sin(game.time * 10) > 0 ? '#ef4444' : '#7f1d1d'; ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + d.r * 0.8, d.r, d.r * 0.35, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(this.x, this.y, d.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = Math.round(d.r * 1.3) + 'px system-ui, "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1c1917'; ctx.fillText(d.icon, this.x, this.y + 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  class Gem {
    constructor(x, y, value) { this.x = x; this.y = y; this.value = value; this.vx = rand(-60, 60); this.vy = rand(-60, 60); this.dead = false; this.t = 0; }
    update(dt) {
      const p = game.player; this.t += dt;
      this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d < CONFIG.xp.magnet) { const pull = 900 * (1 - d / CONFIG.xp.magnet) + 200; this.vx += (dx / d) * pull * dt; this.vy += (dy / d) * pull * dt; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (d < p.radius + 6) { this.dead = true; p.gainXp(this.value); }
    }
    draw(ctx) {
      const s = this.value >= 4 ? 6 : 4.5, y = this.y + Math.sin(this.t * 5) * 1.5;
      ctx.fillStyle = this.value >= 4 ? '#e879f9' : '#a78bfa'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(this.x, y - s); ctx.lineTo(this.x + s * 0.7, y); ctx.lineTo(this.x, y + s); ctx.lineTo(this.x - s * 0.7, y); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  class Particle {
    constructor(x, y, color) {
      const a = rand(0, TAU), sp = rand(60, 240);
      this.x = x; this.y = y; this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      this.life = rand(0.25, 0.55); this.max = this.life; this.color = color; this.size = rand(2, 4.5);
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.9; this.vy *= 0.9; this.life -= dt; }
    draw(ctx) { ctx.globalAlpha = Math.max(0, this.life / this.max); ctx.fillStyle = this.color; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.globalAlpha = 1; }
  }

  // ===================================================================
  // 8. Combat
  // ===================================================================
  const Combat = {
    // every hit on an enemy goes through here: crits, life steal, status effects, death
    damage(e, amount, o = {}) {
      if (e.dead) return 0;
      const p = game.player;
      let dmg = amount * (o.raw ? 1 : p.dmgMult);
      const crit = !o.raw && (o.crit || Math.random() < p.stats.crit);
      if (crit) dmg *= p.stats.critMult;
      dmg = Math.max(1, Math.round(dmg));
      e.hp -= dmg; e.flash = 0.08;
      if (!o.quiet) game.floatText(e.x + rand(-6, 6), e.y - e.radius - 4, String(dmg), o.color || (crit ? '#fde047' : '#ffffff'), crit);
      const steal = (o.raw ? 0 : p.lifesteal) + (o.drain || 0);
      if (steal > 0) p.heal(dmg * steal, true);
      if (o.knockFrom || o.knockAngle !== undefined) {
        const a = o.knockAngle ?? Math.atan2(e.y - o.knockFrom.y, e.x - o.knockFrom.x), k = (o.knock || 1) * 90 * (14 / e.radius);
        e.vx += Math.cos(a) * k; e.vy += Math.sin(a) * k;
      }
      if (o.burn) e.burn = { dps: Math.max(o.burn.dps, e.burn ? e.burn.dps : 0), t: Math.max(o.burn.t, e.burn ? e.burn.t : 0) };
      if (o.slow) e.slow = { k: o.slow.k, t: o.slow.t };
      if (o.stun) e.stun = Math.max(e.stun, o.stun);
      if (o.freeze) { e.stun = Math.max(e.stun, o.freeze); e.frozen = Math.max(e.frozen, o.freeze); }
      if (o.root) e.root = Math.max(e.root, o.root);
      if (e.hp <= 0) { e.dead = true; game.onEnemyKilled(e); }
      return dmg;
    },
    // a sword-style swing: hits everything in a wedge in front of you
    melee(x, y, angle, radius, arc, dmg, o = {}) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
        if (d > radius + e.radius) continue;
        if (d > e.radius && Math.abs(angDiff(Math.atan2(dy, dx), angle)) > arc / 2) continue;
        this.damage(e, dmg, { knockAngle: Math.atan2(dy, dx), knock: o.knock || 1 });
      }
      game.fx.push({ type: 'slash', x, y, angle, arc, radius, color: o.color || '#fff', t: 0.16, max: 0.16 });
    },
    // a spear thrust: hits everything along a line
    thrust(x, y, angle, length, width, dmg, o = {}) {
      const cx = Math.cos(angle), cy = Math.sin(angle);
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, along = dx * cx + dy * cy, side = Math.abs(-dx * cy + dy * cx);
        if (along < -e.radius || along > length + e.radius || side > width / 2 + e.radius) continue;
        this.damage(e, dmg, { knockAngle: angle, knock: 1.2 });
      }
      game.fx.push({ type: 'beam', x, y, angle, len: length, width, color: o.color || '#e0f2fe', t: 0.16, max: 0.16 });
    },
    // everything within a circle
    area(x, y, radius, dmg, o = {}) {
      for (const e of game.enemies) {
        if (e.dead || (e.x - x) ** 2 + (e.y - y) ** 2 > (radius + e.radius) ** 2) continue;
        this.damage(e, dmg, Object.assign({ knockAngle: Math.atan2(e.y - y, e.x - x) }, o));
      }
    },
    explode(b) {
      const ex = b.explode;
      this.area(b.x, b.y, ex.r, b.dmg * ex.mult, { burn: ex.burn, knock: 2 });
      game.fx.push({ type: 'boom', x: b.x, y: b.y, r: ex.r, color: ex.color || '#f97316', t: 0.4, max: 0.4 });
      game.shake = Math.max(game.shake, 6);
    },
    // lightning that jumps from enemy to enemy
    chain(from, count, range, dmg) {
      const hit = new Set([from]); let cur = from; const pts = [{ x: from.x, y: from.y }];
      for (let i = 0; i < count; i++) {
        let best = null, bd = range * range;
        for (const e of game.enemies) { if (e.dead || hit.has(e)) continue; const d = dist2(e, cur); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        hit.add(best); pts.push({ x: best.x, y: best.y }); this.damage(best, dmg, { color: '#c4b5fd' }); cur = best;
      }
      if (pts.length > 1) game.fx.push({ type: 'bolt', pts, color: '#c4b5fd', t: 0.22, max: 0.22 });
    },
  };

  // ===================================================================
  // 9. ABILITIES (return false to refuse, e.g. when there's no target)
  // ===================================================================
  const ring = (x, y, r1, color, t = 0.45) => game.fx.push({ type: 'ring', x, y, r0: 10, r1, color, t, max: t });
  const ABILITIES = {
    whirlwind(p) { p.whirl = 2.5; p.whirlTick = 0; },
    fireball(p) {
      const t = game.nearestEnemy(p, 600); if (!t) return false;
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 400, dmg: p.stats.damage * 4, size: 13, color: '#f97316', range: 640, explode: { r: 120, mult: 1, burn: { dps: p.stats.damage * 0.8, t: 3 } } }));
    },
    volley(p) {
      const t = game.nearestEnemy(p, 700); const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aim;
      for (let i = 0; i < 11; i++) game.projectiles.push(new Projectile(p.x, p.y, base + (i - 5) * 0.11, { speed: 860, dmg: p.stats.damage * 1.4, size: 4, color: '#fde68a', shape: 'arrow', pierce: 2, range: p.stats.range }));
    },
    shieldslam(p) { Combat.area(p.x, p.y, 160, p.stats.damage * 1.6, { stun: 1.6, knock: 4 }); ring(p.x, p.y, 160, '#60a5fa'); game.shake = 9; },
    shadowdash(p) {
      const t = game.nearestEnemy(p, 440); if (!t) return false;
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      game.fx.push({ type: 'trail', x1: p.x, y1: p.y, x2: t.x + Math.cos(a) * 30, y2: t.y + Math.sin(a) * 30, color: '#94a3b8', t: 0.35, max: 0.35 });
      p.x = t.x + Math.cos(a) * (t.radius + 22); p.y = t.y + Math.sin(a) * (t.radius + 22); p.clampTo(view);
      Combat.damage(t, p.stats.damage * 4, { crit: true });
      Combat.area(p.x, p.y, 70, p.stats.damage * 1.2, {});
      p.hurtTimer = 0.6;
    },
    spiritcall(p) { for (let i = 0; i < 3; i++) game.minions.push(new Minion('spirit', p.x + rand(-20, 20), p.y + rand(-20, 20), { life: 12 })); ring(p.x, p.y, 70, '#5eead4'); },
    sanctuary(p) { p.heal(p.stats.maxHp * 0.4); p.buffs.might = 6; ring(p.x, p.y, 130, '#fde047', 0.6); },
    bloodrage(p) { p.buffs.rage = 6; ring(p.x, p.y, 90, '#ef4444'); },
    holynova(p) { Combat.area(p.x, p.y, 170, p.stats.damage * 2.5, { knock: 2 }); p.heal(p.stats.maxHp * 0.25); ring(p.x, p.y, 170, '#fde68a', 0.5); },
    raisedead(p) { for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; game.minions.push(new Minion('skeleton', p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, { life: 20 })); } ring(p.x, p.y, 80, '#a3e635'); },
    flurry(p) { p.flurry = 0.9; p.flurryTick = 0; },
    flamering(p) { Combat.area(p.x, p.y, 180, p.stats.damage * 1.5, { burn: { dps: p.stats.damage * 1.4, t: 4 } }); game.fx.push({ type: 'boom', x: p.x, y: p.y, r: 180, color: '#ea580c', t: 0.5, max: 0.5 }); game.shake = 8; },
    bulletstorm(p) { p.storm = 3; p.stormTick = 0; },
    entangle(p) { Combat.area(p.x, p.y, 175, p.stats.damage * 1.2, { root: 3 }); ring(p.x, p.y, 175, '#4ade80', 0.55); game.minions.push(new Minion('wolf', p.x, p.y, { life: 12 })); },
    minefield(p) { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; game.minions.push(new Minion('mine', p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, { life: 30 })); } },
    lance(p) {
      const t = game.nearestEnemy(p, 900); const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aim;
      Combat.thrust(p.x, p.y, a, 520, 38, p.stats.damage * 3, { color: '#67e8f9' }); game.shake = 6;
    },
    frostnova(p) { Combat.area(p.x, p.y, 190, p.stats.damage * 1.2, { freeze: 2.5 }); ring(p.x, p.y, 190, '#bae6fd', 0.55); },
  };

  // ===================================================================
  // 10. WaveManager
  // ===================================================================
  class WaveManager {
    constructor() { this.wave = 0; this.queue = 0; this.spawnTimer = 0; this.breakTimer = 0; this.phase = 'idle'; this.scale = null; }
    startWave(n) {
      this.wave = n; this.scale = waveScaling(n); this.queue = this.scale.count;
      this.spawnTimer = 0.4; this.phase = 'spawning';
      UI.banner('WAVE ' + n);
    }
    get remaining() { return this.queue + game.enemies.length; }
    update(dt) {
      if (this.phase === 'spawning') {
        this.spawnTimer -= dt;
        while (this.queue > 0 && this.spawnTimer <= 0) { this.spawnOne(); this.queue--; this.spawnTimer += this.scale.spawnInterval; }
        if (this.queue === 0 && game.enemies.length === 0) {
          this.phase = 'break'; this.breakTimer = CONFIG.wave.breakTime;
          UI.banner('WAVE ' + this.wave + ' CLEARED!', true);
          game.onWaveCleared(this.wave);
        }
      } else if (this.phase === 'break') {
        this.breakTimer -= dt;
        if (this.breakTimer <= 0) this.startWave(this.wave + 1);
      }
    }
    spawnOne() {
      const types = Object.entries(ENEMY_TYPES).filter(([, t]) => this.wave >= t.fromWave).map(([key, t]) => ({ key, weight: t.weight }));
      const { key } = pickWeighted(types);
      const pad = 40, side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = rand(0, view.w); y = -pad; } else if (side === 1) { x = view.w + pad; y = rand(0, view.h); }
      else if (side === 2) { x = rand(0, view.w); y = view.h + pad; } else { x = -pad; y = rand(0, view.h); }
      game.enemies.push(new Enemy(key, x, y, this.scale));
    }
  }

  // ===================================================================
  // 11. Game
  // ===================================================================
  const game = {
    state: 'menu',      // menu | playing | levelup | paused | over
    cls: null, player: null,
    enemies: [], projectiles: [], enemyShots: [], minions: [], gems: [], particles: [], fx: [],
    waves: new WaveManager(), kills: 0, time: 0, shake: 0,

    nearestEnemy(from, range) {
      let best = null, bd = range * range;
      for (const e of this.enemies) { if (e.dead) continue; const d = dist2(e, from); if (d < bd) { bd = d; best = e; } }
      return best;
    },
    burst(x, y, color, n) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color)); },
    floatText(x, y, text, color, big = false) { if (this.fx.length < 400) this.fx.push({ type: 'text', x, y, text, color, big, t: 0.75, max: 0.75 }); },

    // ----- events: hook drops, upgrades and achievements in here -----
    onEnemyKilled(e) {
      this.kills++;
      this.burst(e.x, e.y, e.def.color, 12);
      const v = Math.max(1, Math.round(e.def.xp * (1 + this.waves.wave * 0.04)));
      this.gems.push(new Gem(e.x, e.y, v));
      const P = this.cls.passive;
      if (P.raise && Math.random() < P.raise && this.minions.filter((m) => m.kind === 'skeleton').length < P.maxSkeletons + this.player.stats.minions) {
        this.minions.push(new Minion('skeleton', e.x, e.y, { life: 25 }));
        this.floatText(e.x, e.y - 18, 'RISE!', '#a3e635');
      }
    },
    onWaveCleared() {
      this.player.heal(this.player.stats.maxHp * 0.1);
      for (const g of this.gems) { g.vx = (this.player.x - g.x) * 3; g.vy = (this.player.y - g.y) * 3; }   // pull in leftover XP
    },
    onPlayerDied() {
      this.state = 'over'; Input.clear();
      const wave = this.waves.wave, key = 'survivalBest_' + this.cls.id;
      let best = 0; try { best = Number(localStorage.getItem(key)) || 0; } catch (e) { /* storage blocked */ }
      const isBest = wave > best;
      if (isBest) { try { localStorage.setItem(key, String(wave)); } catch (e) { /* ignore */ } }
      UI.showGameOver(wave, this.kills, this.time, this.player.level, isBest);
    },

    keepPets() {
      const P = this.cls.passive, extra = this.player.stats.minions;
      const want = { spirit: P.spirits ? P.spirits + extra : 0, wolf: P.wolves ? P.wolves + extra : 0 };
      for (const kind of ['spirit', 'wolf']) {
        const have = this.minions.filter((m) => m.kind === kind && m.permanent).length;
        for (let i = have; i < want[kind]; i++) this.minions.push(new Minion(kind, this.player.x + rand(-30, 30), this.player.y + rand(-30, 30)));
      }
    },

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      const p = this.player;
      p.update(dt);
      this.waves.update(dt);
      this.keepPets();
      for (const e of this.enemies) e.update(dt, p);
      this.separate();
      for (const m of this.minions) m.update(dt);
      for (const b of this.projectiles) b.update(dt);
      for (const b of this.enemyShots) b.update(dt);
      for (const g of this.gems) g.update(dt);
      for (const q of this.particles) q.update(dt);
      for (const f of this.fx) { f.t -= dt; if (f.type === 'text') f.y -= 40 * dt; }

      // your shots
      for (const b of this.projectiles) {
        if (b.dead) continue;
        for (const e of this.enemies) {
          if (e.dead || b.hitSet.has(e)) continue;
          if (dist2(b, e) < (b.radius + e.radius) ** 2) {
            b.hitSet.add(e);
            if (b.explode) { Combat.explode(b); b.dead = true; break; }
            Combat.damage(e, b.dmg, Object.assign({ knockAngle: b.angle, knock: 0.6 }, b.fx));
            if (b.fx.chain) Combat.chain(e, b.fx.chain.count, b.fx.chain.range, b.dmg * b.fx.chain.mult);
            this.burst(b.x, b.y, b.color, 3);
            if (b.pierce-- <= 0) { b.dead = true; break; }
          }
        }
      }
      // enemies and their shots hurt you
      for (const e of this.enemies) {
        if (!e.dead && e.stun <= 0 && dist2(e, p) < (e.radius + p.radius) ** 2 && p.takeDamage(e.damage)) {
          const a = Math.atan2(e.y - p.y, e.x - p.x); e.vx += Math.cos(a) * 260; e.vy += Math.sin(a) * 260;
        }
      }
      for (const b of this.enemyShots) if (!b.dead && dist2(b, p) < (b.radius + p.radius) ** 2) { b.dead = true; p.takeDamage(b.dmg); }

      this.enemies = this.enemies.filter((e) => !e.dead);
      this.projectiles = this.projectiles.filter((b) => !b.dead);
      this.enemyShots = this.enemyShots.filter((b) => !b.dead);
      this.minions = this.minions.filter((m) => !m.dead);
      this.gems = this.gems.filter((g) => !g.dead);
      this.particles = this.particles.filter((q) => q.life > 0);
      this.fx = this.fx.filter((f) => f.t > 0);

      if (p.pendingLevels > 0 && this.state === 'playing') UI.showLevelUp();
    },
    separate() {
      const L = this.enemies;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, min = a.radius + b.radius, d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) { const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
      }
    },

    draw() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) : 0;
      ctx.translate(sx, sy);
      drawFloor();
      const p = this.player || { x: view.w / 2, y: view.h / 2 };
      for (const g of this.gems) g.draw(ctx);
      for (const q of this.particles) q.draw(ctx);
      for (const m of this.minions) if (m.kind === 'mine' || m.kind === 'turret') m.draw(ctx);
      for (const e of this.enemies) e.draw(ctx, p);
      for (const m of this.minions) if (m.kind !== 'mine' && m.kind !== 'turret') m.draw(ctx);
      for (const b of this.projectiles) b.draw(ctx);
      for (const b of this.enemyShots) b.draw(ctx);
      if (this.player && this.player.alive) this.player.draw(ctx);
      drawFx();
      if (this.player && this.state !== 'menu' && this.player.hp / this.player.stats.maxHp < 0.3) {
        const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.35, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
        g.addColorStop(0, 'rgba(239,68,68,0)'); g.addColorStop(1, 'rgba(239,68,68,' + (0.25 + Math.sin(this.time * 6) * 0.1) + ')');
        ctx.fillStyle = g; ctx.fillRect(-10, -10, view.w + 20, view.h + 20);
      }
    },
  };

  function drawFloor() {
    if (!floorPattern) makeFloor();
    ctx.fillStyle = floorPattern; ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
    // flickering torch light in the corners
    const fl = 0.85 + Math.sin(game.time * 9) * 0.05 + Math.sin(game.time * 23) * 0.04;
    for (const [cx, cy] of [[0, 0], [view.w, 0], [0, view.h], [view.w, view.h]]) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260 * fl);
      g.addColorStop(0, 'rgba(251, 146, 60, 0.18)'); g.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 270, cy - 270, 540, 540);
    }
    const vg = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
  }
  // visual effects: slashes, rings, explosions, lightning, damage numbers
  function drawFx() {
    for (const f of game.fx) {
      const k = Math.max(0, f.t / f.max);
      ctx.globalAlpha = k;
      if (f.type === 'slash') {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 * k + 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * (0.75 + (1 - k) * 0.25), f.angle - f.arc / 2, f.angle + f.arc / 2); ctx.stroke();
        ctx.strokeStyle = f.color; ctx.lineWidth = 10 * k; ctx.globalAlpha = k * 0.4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 0.6, f.angle - f.arc / 2, f.angle + f.arc / 2); ctx.stroke();
      } else if (f.type === 'beam') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        ctx.fillStyle = f.color; ctx.fillRect(0, -f.width / 2 * k, f.len, f.width * k);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -2, f.len * (1 - k * 0.3), 4); ctx.restore();
      } else if (f.type === 'ring') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 6 * k + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - k), 0, TAU); ctx.stroke();
      } else if (f.type === 'boom') {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, 'rgba(255, 237, 160, 0.9)'); g.addColorStop(0.4, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + (1 - k) * 0.4), 0, TAU); ctx.fill();
      } else if (f.type === 'bolt') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
        ctx.beginPath();
        f.pts.forEach((pt, i) => { if (!i) { ctx.moveTo(pt.x, pt.y); return; } const prev = f.pts[i - 1]; for (let s = 1; s <= 4; s++) { const u = s / 4; ctx.lineTo(prev.x + (pt.x - prev.x) * u + (s < 4 ? rand(-8, 8) : 0), prev.y + (pt.y - prev.y) * u + (s < 4 ? rand(-8, 8) : 0)); } });
        ctx.stroke(); ctx.shadowBlur = 0;
      } else if (f.type === 'trail') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 10 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.type === 'text') {
        ctx.font = (f.big ? '900 20px ' : '800 14px ') + 'system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }

  function startGame() {
    game.cls = classById(UI.selected);
    game.state = 'playing';
    game.player = new Player(game.cls, view.w / 2, view.h / 2);
    game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.particles = []; game.fx = [];
    game.kills = 0; game.time = 0; game.shake = 0;
    game.waves = new WaveManager(); game.waves.startWave(1);
    Input.clear();
    UI.showPlaying();
  }
  function pause() { if (game.state !== 'playing') return; game.state = 'paused'; Input.clear(); UI.showPause(true); }
  function resume() { if (game.state !== 'paused') return; game.state = 'playing'; UI.showPause(false); }
  function toMenu() { game.state = 'menu'; game.player = null; game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.fx = []; UI.showMenu(); }

  // ===================================================================
  // 12. UI
  // ===================================================================
  const $ = (id) => document.getElementById(id);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const UI = {
    selected: 'warrior',
    el: {
      hud: $('hud'), portraitIcon: $('portraitIcon'), lvl: $('lvlText'), heroName: $('heroName'), hpFill: $('hpFill'), hpText: $('hpText'), xpFill: $('xpFill'), buffs: $('buffs'),
      wave: $('waveText'), enemies: $('enemiesText'), kills: $('killsText'), banner: $('banner'),
      menu: $('menu'), pause: $('pauseMenu'), over: $('gameOver'), overStats: $('overStats'), newBest: $('newBest'), levelUp: $('levelUp'),
      ab: $('abilityBtn'), abIcon: $('abIcon'), abCd: $('abCd'), abRing: $('abRing'), abName: $('abName'), stick: $('stick'), knob: $('knob'),
    },
    last: '',
    init() {
      try { this.selected = localStorage.getItem('survivalClass') || 'warrior'; } catch (e) { /* ignore */ }
      if (!CLASSES.some((c) => c.id === this.selected)) this.selected = 'warrior';
      const grid = $('classGrid');
      for (const c of CLASSES) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cc'; b.dataset.id = c.id;
        b.innerHTML = '<span class="dot" style="background:' + c.color + '"></span><span class="bw"></span><div class="ic">' + c.icon + '</div><div class="nm">' + c.name + '</div><div class="rl">' + c.role + '</div>';
        b.addEventListener('click', () => this.selectClass(c.id));
        b.addEventListener('dblclick', () => { this.selectClass(c.id); startGame(); });
        grid.appendChild(b);
      }
      $('howto').innerHTML = isTouch
        ? '<b>Drag anywhere</b> to move. You attack automatically. Tap the <b>ability button</b> for your special move. Collect <b>XP gems</b> to level up.'
        : 'Move with <b>WASD</b> or the <b>arrow keys</b>. You attack automatically. <b>Space</b> uses your special ability. Collect <b>XP gems</b> to level up and choose upgrades.';
      this.selectClass(this.selected);
      $('startBtn').addEventListener('click', startGame);
      $('restartBtn').addEventListener('click', startGame);
      $('heroesBtn').addEventListener('click', toMenu);
      $('pauseBtn').addEventListener('click', () => (game.state === 'paused' ? resume() : pause()));
      $('pauseMenu').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'resume') resume();
        else if (b.dataset.act === 'restart') { this.showPause(false); startGame(); }
        else if (b.dataset.act === 'menu') toMenu();
      });
      this.el.ab.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (game.state === 'playing') game.player.useAbility(); });
    },
    bestFor(id) { try { return Number(localStorage.getItem('survivalBest_' + id)) || 0; } catch (e) { return 0; } },
    selectClass(id) {
      this.selected = id;
      try { localStorage.setItem('survivalClass', id); } catch (e) { /* ignore */ }
      const c = classById(id), s = Object.assign({}, BASE_STATS, c.stats);
      document.querySelectorAll('.cc').forEach((b) => {
        b.classList.toggle('on', b.dataset.id === id);
        const best = this.bestFor(b.dataset.id); b.querySelector('.bw').textContent = best ? 'W' + best : '';
      });
      $('cdIcon').textContent = c.icon; $('cdIcon').style.borderColor = c.color;
      $('cdName').textContent = c.name; $('cdRole').textContent = c.role; $('cdDesc').textContent = c.desc;
      $('cdAbIcon').textContent = c.ability.icon; $('cdAbName').textContent = c.ability.name; $('cdAbDesc').textContent = c.ability.desc; $('cdAbCd').textContent = c.ability.cd + 's cooldown';
      $('cdPassive').textContent = c.passive.text; $('cdBest').textContent = this.bestFor(id);
      // rough 0..1 ratings for the stat bars
      const dps = c.attack.kind === 'deploy' ? 26 : (s.damage / s.cooldown) * (1 + s.crit * (s.critMult - 1));
      const rows = [['HEALTH', s.maxHp / 240], ['DAMAGE', Math.min(1, dps / 60)], ['SPEED', (s.speed - 150) / 160], ['RANGE', Math.min(1, s.range / 560)], ['DEFENSE', Math.min(1, Math.max(0.05, s.armor + s.block + s.evasion + 0.1) / 0.8)]];
      $('cdStats').innerHTML = rows.map(([n, v]) => '<div class="st-row">' + n + '<div class="st-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div></div>').join('');
    },
    update() {
      const p = game.player; if (!p) return;
      const cd = p.abilityTimer, cdMax = p.abilityCooldown;
      this.el.abRing.style.setProperty('--cd', (cd > 0 ? (cd / cdMax) * 100 : 0) + '%');
      const cdText = cd > 0 ? Math.ceil(cd) : '';
      if (this.el.abCd.textContent !== String(cdText)) this.el.abCd.textContent = cdText;
      this.el.ab.classList.toggle('ready', cd <= 0);
      const buffs = [];
      if (p.buffs.rage > 0) buffs.push('🩸 Rage ' + Math.ceil(p.buffs.rage) + 's');
      if (p.buffs.might > 0) buffs.push('✨ +50% dmg ' + Math.ceil(p.buffs.might) + 's');
      if (p.whirl > 0) buffs.push('🌀 Whirlwind');
      const pets = game.minions.length;
      if (pets) buffs.push('🐾 ' + pets);
      const key = [Math.ceil(p.hp), Math.round(p.stats.maxHp), p.level, Math.floor(p.xp), game.waves.wave, game.waves.remaining, game.kills, game.waves.phase, buffs.join()].join('|');
      if (key === this.last) return;
      this.last = key;
      this.el.lvl.textContent = p.level;
      this.el.hpText.textContent = Math.ceil(p.hp) + ' / ' + Math.round(p.stats.maxHp);
      const pct = p.hp / p.stats.maxHp;
      this.el.hpFill.style.width = pct * 100 + '%'; this.el.hpFill.classList.toggle('low', pct < 0.3);
      this.el.xpFill.style.width = (p.xp / p.xpNext) * 100 + '%';
      this.el.wave.textContent = game.waves.wave;
      this.el.enemies.textContent = game.waves.phase === 'break' ? 'next wave…' : game.waves.remaining + ' left';
      this.el.kills.textContent = game.kills;
      this.el.buffs.innerHTML = buffs.map((b) => '<span class="buff">' + b + '</span>').join('');
    },
    banner(text, cleared = false) {
      const b = this.el.banner; b.textContent = text; b.classList.toggle('cleared', cleared);
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    },
    flashAbility() { this.el.abName.classList.remove('hidden'); clearTimeout(this.abT); this.abT = setTimeout(() => this.el.abName.classList.add('hidden'), 1200); },
    hideAll() { for (const k of ['menu', 'pause', 'over', 'levelUp']) this.el[k].classList.add('hidden'); },
    showMenu() { this.hideAll(); this.selectClass(this.selected); this.el.menu.classList.remove('hidden'); this.el.hud.classList.add('hidden'); this.el.ab.classList.add('hidden'); this.el.abName.classList.add('hidden'); },
    showPlaying() {
      this.hideAll(); this.last = '';
      const c = game.cls;
      this.el.portraitIcon.textContent = c.icon; this.el.portraitIcon.parentElement.style.borderColor = c.color;
      this.el.heroName.textContent = c.name; this.el.abIcon.textContent = c.ability.icon; this.el.abName.textContent = c.ability.name;
      this.el.hud.classList.remove('hidden'); this.el.ab.classList.remove('hidden');
      this.el.ab.querySelector('.ab-key').textContent = isTouch ? 'TAP' : 'SPACE';
    },
    showPause(on) { this.el.pause.classList.toggle('hidden', !on); },
    // level up: pause and offer 3 upgrades
    choices: [],
    showLevelUp() {
      const p = game.player;
      game.state = 'levelup'; Input.clear();
      const pool = UPGRADES.filter((u) => !u.when || u.when(game.cls));
      this.choices = shuffle(pool.slice()).slice(0, 3);
      $('luTitle').textContent = 'Level ' + (p.level - p.pendingLevels + 1);
      const box = $('luChoices'); box.innerHTML = '';
      this.choices.forEach((u, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'choice';
        b.innerHTML = '<div class="ic">' + u.icon + '</div><div class="nm">' + u.name + '</div><div class="ds">' + u.desc + '</div><div class="k">' + (i + 1) + '</div>';
        b.addEventListener('click', () => this.pickLevelUp(i));
        box.appendChild(b);
      });
      this.el.levelUp.classList.remove('hidden');
    },
    pickLevelUp(i) {
      const u = this.choices[i]; if (!u || game.state !== 'levelup') return;
      const p = game.player;
      u.apply(p.stats, p);
      p.hp = Math.min(p.hp, p.stats.maxHp);
      p.pendingLevels--;
      this.el.levelUp.classList.add('hidden');
      game.state = 'playing'; this.last = '';
      game.floatText(p.x, p.y - 30, u.icon + ' ' + u.name, '#fde68a', true);
      if (p.pendingLevels > 0) this.showLevelUp();
    },
    showGameOver(wave, kills, time, level, isBest) {
      const m = Math.floor(time / 60), s = Math.floor(time % 60);
      this.el.overStats.innerHTML = 'As the <b>' + game.cls.name + '</b> you reached <b>wave ' + wave + '</b> and <b>level ' + level + '</b><br><b>' + kills + '</b> foes slain · survived <b>' + m + ':' + String(s).padStart(2, '0') + '</b>';
      this.el.newBest.classList.toggle('hidden', !isBest);
      this.el.ab.classList.add('hidden');
      setTimeout(() => { if (game.state === 'over') this.el.over.classList.remove('hidden'); }, 800);
    },
    showStick(x, y) { this.el.stick.style.left = x + 'px'; this.el.stick.style.top = y + 'px'; this.el.stick.classList.remove('hidden'); this.moveKnob(0, 0); },
    moveKnob(dx, dy) { const l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1; this.el.knob.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)'; },
    hideStick() { if (this.el) this.el.stick.classList.add('hidden'); },
  };

  // ===================================================================
  // 13. Main loop
  // ===================================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (game.state === 'playing') { game.update(dt); UI.update(); }
    else if (game.state === 'over') { for (const q of game.particles) q.update(dt); game.particles = game.particles.filter((q) => q.life > 0); for (const f of game.fx) f.t -= dt; game.fx = game.fx.filter((f) => f.t > 0); }
    game.draw();
    requestAnimationFrame(loop);
  }
  window.addEventListener('resize', resize);
  resize();
  UI.init();
  UI.showMenu();
  requestAnimationFrame(loop);

  // handy for testing from the console
  window.__survival = { game, startGame, CONFIG, CLASSES, UPGRADES, ENEMY_TYPES, ABILITIES, waveScaling, SPRITES, UI };
})();

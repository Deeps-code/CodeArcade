/* =====================================================================
   Wave Survivor: a top-down wave-survival game (plain Canvas, no libraries)

   Layout of this file:
     1. CONFIG        all the tunable numbers in one place
     2. SPRITES       optional images; every entity falls back to shapes
     3. Canvas        sizing for any screen / pixel density
     4. Input         keyboard (WASD / arrows) and a touch joystick
     5. Entities      Player, Enemy, Projectile, Particle
     6. WaveManager   spawns waves, scales difficulty, detects "cleared"
     7. Game          state, update, collisions, drawing
     8. UI            HUD, banners, menus, pause, game over
     9. Main loop

   To add later: items / skills / upgrades can hook into Player.stats
   (damage, cooldown, range, speed, maxHp) and into Game.onEnemyKilled.
   ===================================================================== */
(() => {
  'use strict';

  // ===================================================================
  // 1. CONFIG
  // ===================================================================
  const CONFIG = {
    player: {
      radius: 16,
      speed: 230,          // px per second
      maxHp: 100,
      hurtCooldown: 0.6,   // seconds of invulnerability after being hit
      color: '#58d68d',
    },
    attack: {
      cooldown: 0.42,      // seconds between shots
      damage: 12,
      range: 380,          // only enemies this close are targeted
      projectileSpeed: 560,
      projectileRadius: 5,
      knockback: 90,
    },
    wave: {
      breakTime: 2.4,      // pause between waves (seconds)
      baseCount: 5,        // enemies in wave 1
      countPerWave: 2,     // extra enemies each wave
      spawnInterval: 0.6,  // seconds between spawns at wave 1
      minSpawnInterval: 0.12,
    },
    arenaMargin: 24,       // the player can't leave the screen edge by more than this
  };

  // Enemy kinds. "fromWave" = the first wave they can appear in; "weight" = how common.
  const ENEMY_TYPES = {
    grunt:  { name: 'Grunt',  radius: 14, hp: 24, speed: 85,  damage: 10, color: '#ef4444', fromWave: 1, weight: 6 },
    runner: { name: 'Runner', radius: 10, hp: 14, speed: 155, damage: 7,  color: '#f97316', fromWave: 3, weight: 3 },
    brute:  { name: 'Brute',  radius: 24, hp: 90, speed: 55,  damage: 20, color: '#a855f7', fromWave: 5, weight: 1.6 },
    spitter:{ name: 'Spitter',radius: 13, hp: 30, speed: 70,  damage: 12, color: '#eab308', fromWave: 8, weight: 1.4, keepAway: 160 },
  };

  // How much harder each wave is. Wave 1 = all multipliers of 1.
  function waveScaling(wave) {
    const n = wave - 1;
    return {
      count: CONFIG.wave.baseCount + n * CONFIG.wave.countPerWave + Math.floor(Math.pow(n, 1.35)),
      hp: 1 + n * 0.12,
      speed: 1 + Math.min(0.9, n * 0.035),
      damage: 1 + n * 0.06,
      spawnInterval: Math.max(CONFIG.wave.minSpawnInterval, CONFIG.wave.spawnInterval * Math.pow(0.93, n)),
    };
  }

  // ===================================================================
  // 2. SPRITES (optional)
  //    Drop images in and every entity will use them instead of shapes, e.g.
  //      SPRITES.player = loadImage('img/player.png');
  //      SPRITES.grunt  = loadImage('img/grunt.png');
  // ===================================================================
  const SPRITES = {};
  function loadImage(src) { const img = new Image(); img.src = src; return img; }   // eslint-disable-line no-unused-vars
  // Draw an image centered at (x, y), sized to radius r, if it has loaded. Returns false if not.
  function drawSprite(ctx, key, x, y, r, angle = 0) {
    const img = SPRITES[key];
    if (!img || !img.complete || !img.naturalWidth) return false;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(img, -r, -r, r * 2, r * 2);
    ctx.restore();
    return true;
  }

  // ===================================================================
  // 3. Canvas
  // ===================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { w: 0, h: 0, dpr: 1 };
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth; view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
    if (game.player) game.player.clampTo(view);
  }

  // ===================================================================
  // Small helpers
  // ===================================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  function pickWeighted(items) {
    let total = 0; for (const it of items) total += it.weight;
    let r = Math.random() * total;
    for (const it of items) { r -= it.weight; if (r <= 0) return it; }
    return items[items.length - 1];
  }

  // ===================================================================
  // 4. Input
  // ===================================================================
  const Input = {
    keys: new Set(),
    touch: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    // A movement direction with length 0..1
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
  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) { e.preventDefault(); Input.keys.add(e.code); }
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); }
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      if (game.state === 'menu' || game.state === 'over') startGame();
      else if (game.state === 'paused') resume();
    }
  });
  window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
  window.addEventListener('blur', () => { Input.clear(); if (game.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
  // Touch: put a thumb anywhere and drag to move (a joystick appears under it)
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
  // 5. Entities
  // ===================================================================
  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.radius = CONFIG.player.radius;
      // Everything an item / upgrade might change lives in stats
      this.stats = {
        maxHp: CONFIG.player.maxHp,
        speed: CONFIG.player.speed,
        damage: CONFIG.attack.damage,
        cooldown: CONFIG.attack.cooldown,
        range: CONFIG.attack.range,
      };
      this.hp = this.stats.maxHp;
      this.hurtTimer = 0;
      this.attackTimer = 0.3;
      this.aim = 0;            // angle of the last shot (for drawing)
      this.alive = true;
    }
    update(dt) {
      const mv = Input.moveVector();
      this.x += mv.x * this.stats.speed * dt;
      this.y += mv.y * this.stats.speed * dt;
      this.clampTo(view);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      // auto-attack: shoot at the nearest enemy in range
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        const target = game.nearestEnemy(this, this.stats.range);
        if (target) {
          this.aim = Math.atan2(target.y - this.y, target.x - this.x);
          game.projectiles.push(new Projectile(this.x, this.y, this.aim, this.stats.damage));
          this.attackTimer = this.stats.cooldown;
        } else this.attackTimer = 0.05;   // check again soon
      }
    }
    clampTo(v) {
      const m = this.radius + 4;
      this.x = clamp(this.x, m, v.w - m);
      this.y = clamp(this.y, m, v.h - m);
    }
    takeDamage(amount) {
      if (this.hurtTimer > 0 || !this.alive) return false;
      this.hp = Math.max(0, this.hp - amount);
      this.hurtTimer = CONFIG.player.hurtCooldown;
      game.shake = 7;
      game.burst(this.x, this.y, '#ffffff', 10);
      if (this.hp <= 0) { this.alive = false; game.onPlayerDied(); }
      return true;
    }
    draw(ctx) {
      // blink while invulnerable
      if (this.hurtTimer > 0 && Math.floor(this.hurtTimer * 20) % 2 === 0) return;
      if (drawSprite(ctx, 'player', this.x, this.y, this.radius, this.aim)) return;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 0.9, this.radius * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CONFIG.player.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0b3d1f'; ctx.lineWidth = 3; ctx.stroke();
      // a little "weapon" pointing where it last shot
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.aim);
      ctx.fillStyle = '#d1fae5'; ctx.fillRect(this.radius * 0.4, -3, this.radius * 0.9, 6);
      ctx.restore();
    }
  }

  class Enemy {
    constructor(typeKey, x, y, scale) {
      const t = ENEMY_TYPES[typeKey];
      this.type = typeKey; this.def = t;
      this.x = x; this.y = y;
      this.radius = t.radius;
      this.maxHp = Math.round(t.hp * scale.hp); this.hp = this.maxHp;
      this.speed = t.speed * scale.speed * rand(0.9, 1.1);
      this.damage = Math.round(t.damage * scale.damage);
      this.flash = 0;          // white flash after being hit
      this.vx = 0; this.vy = 0; // knockback velocity
      this.dead = false;
      this.wobble = rand(0, Math.PI * 2);
    }
    update(dt, player) {
      const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy) || 1;
      // most enemies charge straight in; spitters hover at a distance and lob shots
      let dir = 1;
      if (this.def.keepAway) {
        dir = d > this.def.keepAway + 20 ? 1 : d < this.def.keepAway - 20 ? -0.6 : 0;
        this.shootTimer = (this.shootTimer ?? rand(1, 2)) - dt;
        if (this.shootTimer <= 0 && d < this.def.keepAway + 120) { this.shootTimer = rand(1.6, 2.4); game.enemyShots.push(new Projectile(this.x, this.y, Math.atan2(dy, dx), this.damage, true)); }
      }
      this.x += ((dx / d) * this.speed * dir + this.vx) * dt;
      this.y += ((dy / d) * this.speed * dir + this.vy) * dt;
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      this.flash = Math.max(0, this.flash - dt);
      this.wobble += dt * 6;
    }
    hit(damage, angle) {
      this.hp -= damage; this.flash = 0.1;
      this.vx += Math.cos(angle) * CONFIG.attack.knockback * (14 / this.radius);
      this.vy += Math.sin(angle) * CONFIG.attack.knockback * (14 / this.radius);
      if (this.hp <= 0 && !this.dead) { this.dead = true; game.onEnemyKilled(this); }
    }
    draw(ctx, player) {
      if (drawSprite(ctx, this.type, this.x, this.y, this.radius)) return;
      const r = this.radius * (1 + Math.sin(this.wobble) * 0.04);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.8, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.def.color;
      if (this.type === 'brute') { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(this.x - r, this.y - r, r * 2, r * 2, r * 0.35) : ctx.rect(this.x - r, this.y - r, r * 2, r * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill(); }
      // eyes that look at the player
      const a = Math.atan2(player.y - this.y, player.x - this.x), ex = Math.cos(a) * r * 0.3, ey = Math.sin(a) * r * 0.3;
      ctx.fillStyle = '#111';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(this.x + ex + Math.cos(a + Math.PI / 2) * s * r * 0.32, this.y + ey + Math.sin(a + Math.PI / 2) * s * r * 0.32, Math.max(2, r * 0.16), 0, Math.PI * 2); ctx.fill(); }
      // health bar once it's been hurt
      if (this.hp < this.maxHp) {
        const w = r * 2, y = this.y - r - 9;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(this.x - w / 2, y, w, 4);
        ctx.fillStyle = '#f87171'; ctx.fillRect(this.x - w / 2, y, w * Math.max(0, this.hp / this.maxHp), 4);
      }
    }
  }

  class Projectile {
    constructor(x, y, angle, damage, hostile = false) {
      this.x = x; this.y = y; this.angle = angle; this.damage = damage; this.hostile = hostile;
      const sp = hostile ? 230 : CONFIG.attack.projectileSpeed;
      this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
      this.radius = hostile ? 6 : CONFIG.attack.projectileRadius;
      this.life = hostile ? 3 : CONFIG.attack.range / CONFIG.attack.projectileSpeed + 0.15;
      this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx) {
      if (drawSprite(ctx, this.hostile ? 'enemyShot' : 'shot', this.x, this.y, this.radius, this.angle)) return;
      ctx.fillStyle = this.hostile ? '#facc15' : '#bbf7d0';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  class Particle {
    constructor(x, y, color) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 240);
      this.x = x; this.y = y; this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      this.life = rand(0.25, 0.55); this.max = this.life; this.color = color; this.size = rand(2, 4.5);
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.9; this.vy *= 0.9; this.life -= dt; }
    draw(ctx) {
      ctx.globalAlpha = Math.max(0, this.life / this.max);
      ctx.fillStyle = this.color; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
      ctx.globalAlpha = 1;
    }
  }

  // ===================================================================
  // 6. WaveManager
  // ===================================================================
  class WaveManager {
    constructor() { this.wave = 0; this.queue = 0; this.spawnTimer = 0; this.breakTimer = 0; this.phase = 'idle'; this.scale = null; }
    startWave(n) {
      this.wave = n;
      this.scale = waveScaling(n);
      this.queue = this.scale.count;
      this.spawnTimer = 0.4;
      this.phase = 'spawning';
      UI.banner('WAVE ' + n);
    }
    // enemies still to come plus enemies alive
    get remaining() { return this.queue + game.enemies.length; }
    update(dt) {
      if (this.phase === 'spawning') {
        this.spawnTimer -= dt;
        while (this.queue > 0 && this.spawnTimer <= 0) { this.spawnOne(); this.queue--; this.spawnTimer += this.scale.spawnInterval; }
        if (this.queue === 0 && game.enemies.length === 0) {
          this.phase = 'break';
          this.breakTimer = CONFIG.wave.breakTime;
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
      // just outside a random edge of the screen
      const pad = 40, side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = rand(0, view.w); y = -pad; }
      else if (side === 1) { x = view.w + pad; y = rand(0, view.h); }
      else if (side === 2) { x = rand(0, view.w); y = view.h + pad; }
      else { x = -pad; y = rand(0, view.h); }
      game.enemies.push(new Enemy(key, x, y, this.scale));
    }
  }

  // ===================================================================
  // 7. Game
  // ===================================================================
  const game = {
    state: 'menu',        // menu | playing | paused | over
    player: null,
    enemies: [], projectiles: [], enemyShots: [], particles: [],
    waves: new WaveManager(),
    kills: 0, time: 0, shake: 0,
    best: 0,

    nearestEnemy(from, range) {
      let best = null, bestD = range * range;
      for (const e of this.enemies) { const d = dist2(e, from); if (d < bestD) { bestD = d; best = e; } }
      return best;
    },
    burst(x, y, color, n) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color)); },

    // --- events (good places to hook items, drops, upgrades later) ---
    onEnemyKilled(enemy) {
      this.kills++;
      this.burst(enemy.x, enemy.y, enemy.def.color, 14);
    },
    onWaveCleared(/* wave */) {
      // e.g. offer an upgrade choice here later
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 10);   // a small heal between waves
    },
    onPlayerDied() {
      this.state = 'over';
      Input.clear();
      const wave = this.waves.wave;
      const isBest = wave > this.best;
      if (isBest) { this.best = wave; try { localStorage.setItem('survivalBestWave', String(wave)); } catch (e) { /* storage may be blocked */ } }
      UI.showGameOver(wave, this.kills, this.time, isBest);
    },

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      const p = this.player;
      p.update(dt);
      this.waves.update(dt);
      for (const e of this.enemies) e.update(dt, p);
      this.separateEnemies();
      for (const b of this.projectiles) b.update(dt);
      for (const b of this.enemyShots) b.update(dt);
      for (const q of this.particles) q.update(dt);

      // player shots hit enemies
      for (const b of this.projectiles) {
        if (b.dead) continue;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist2(b, e) < (b.radius + e.radius) ** 2) { e.hit(b.damage, b.angle); b.dead = true; this.burst(b.x, b.y, '#ffffff', 4); break; }
        }
      }
      // enemies and their shots hurt the player
      for (const e of this.enemies) {
        if (!e.dead && dist2(e, p) < (e.radius + p.radius) ** 2) {
          if (p.takeDamage(e.damage)) {
            // shove the enemy back a little so it doesn't sit on you
            const a = Math.atan2(e.y - p.y, e.x - p.x);
            e.vx += Math.cos(a) * 260; e.vy += Math.sin(a) * 260;
          }
        }
      }
      for (const b of this.enemyShots) if (!b.dead && dist2(b, p) < (b.radius + p.radius) ** 2) { b.dead = true; p.takeDamage(b.damage); }

      this.enemies = this.enemies.filter((e) => !e.dead);
      this.projectiles = this.projectiles.filter((b) => !b.dead);
      this.enemyShots = this.enemyShots.filter((b) => !b.dead);
      this.particles = this.particles.filter((q) => q.life > 0);
    },
    // keep enemies from piling into one blob
    separateEnemies() {
      const list = this.enemies;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, min = a.radius + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < min * min) {
            const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          }
        }
      }
    },

    draw() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) : 0;
      ctx.translate(sx, sy);
      drawFloor();
      for (const q of this.particles) q.draw(ctx);
      for (const e of this.enemies) e.draw(ctx, this.player || { x: view.w / 2, y: view.h / 2 });
      for (const b of this.projectiles) b.draw(ctx);
      for (const b of this.enemyShots) b.draw(ctx);
      if (this.player && this.player.alive) this.player.draw(ctx);
      // low-health red edge
      if (this.player && this.state === 'playing' && this.player.hp / this.player.stats.maxHp < 0.3) {
        const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.35, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
        g.addColorStop(0, 'rgba(239,68,68,0)'); g.addColorStop(1, 'rgba(239,68,68,' + (0.25 + Math.sin(this.time * 6) * 0.1) + ')');
        ctx.fillStyle = g; ctx.fillRect(-10, -10, view.w + 20, view.h + 20);
      }
    },
  };
  try { game.best = Number(localStorage.getItem('survivalBestWave')) || 0; } catch (e) { /* ignore */ }

  // the ground: a dark tiled floor
  function drawFloor() {
    ctx.fillStyle = '#121821'; ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
    const tile = 48;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= view.w; x += tile) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, view.h); }
    for (let y = 0; y <= view.h; y += tile) { ctx.moveTo(0, y + 0.5); ctx.lineTo(view.w, y + 0.5); }
    ctx.stroke();
    const vg = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
  }

  function startGame() {
    game.state = 'playing';
    game.player = new Player(view.w / 2, view.h / 2);
    game.enemies = []; game.projectiles = []; game.enemyShots = []; game.particles = [];
    game.kills = 0; game.time = 0; game.shake = 0;
    game.waves = new WaveManager();
    game.waves.startWave(1);
    Input.clear();
    UI.showPlaying();
  }
  function pause() { if (game.state !== 'playing') return; game.state = 'paused'; Input.clear(); UI.showPause(true); }
  function resume() { if (game.state !== 'paused') return; game.state = 'playing'; UI.showPause(false); }
  function toMenu() { game.state = 'menu'; game.player = null; game.enemies = []; game.projectiles = []; game.enemyShots = []; UI.showMenu(); }

  // ===================================================================
  // 8. UI
  // ===================================================================
  const $ = (id) => document.getElementById(id);
  const UI = {
    el: {
      hud: $('hud'), hpText: $('hpText'), hpFill: $('hpFill'), wave: $('waveText'), enemies: $('enemiesText'), kills: $('killsText'),
      banner: $('banner'), menu: $('menu'), pause: $('pauseMenu'), over: $('gameOver'), overStats: $('overStats'), newBest: $('newBest'),
      best: $('bestText'), stick: $('stick'), knob: $('knob'),
    },
    last: '',
    update() {
      const p = game.player; if (!p) return;
      const key = [Math.ceil(p.hp), p.stats.maxHp, game.waves.wave, game.waves.remaining, game.kills].join('|');
      if (key === this.last) return;
      this.last = key;
      this.el.hpText.textContent = Math.ceil(p.hp) + ' / ' + p.stats.maxHp;
      const pct = p.hp / p.stats.maxHp;
      this.el.hpFill.style.width = pct * 100 + '%';
      this.el.hpFill.classList.toggle('low', pct < 0.3);
      this.el.wave.textContent = game.waves.wave;
      this.el.enemies.textContent = game.waves.phase === 'break' ? 'next wave…' : game.waves.remaining + ' left';
      this.el.kills.textContent = game.kills;
    },
    banner(text, cleared = false) {
      const b = this.el.banner;
      b.textContent = text; b.classList.toggle('cleared', cleared);
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    },
    showMenu() {
      this.el.best.textContent = game.best;
      this.el.menu.classList.remove('hidden'); this.el.over.classList.add('hidden'); this.el.pause.classList.add('hidden'); this.el.hud.classList.add('hidden');
    },
    showPlaying() {
      this.last = '';
      this.el.menu.classList.add('hidden'); this.el.over.classList.add('hidden'); this.el.pause.classList.add('hidden'); this.el.hud.classList.remove('hidden');
    },
    showPause(on) { this.el.pause.classList.toggle('hidden', !on); },
    showGameOver(wave, kills, time, isBest) {
      const m = Math.floor(time / 60), s = Math.floor(time % 60);
      this.el.overStats.innerHTML = 'You reached <b>wave ' + wave + '</b> · <b>' + kills + '</b> kills · survived <b>' + m + ':' + String(s).padStart(2, '0') + '</b>';
      this.el.newBest.classList.toggle('hidden', !isBest);
      setTimeout(() => { if (game.state === 'over') this.el.over.classList.remove('hidden'); }, 700);
    },
    showStick(x, y) { this.el.stick.style.left = x + 'px'; this.el.stick.style.top = y + 'px'; this.el.stick.classList.remove('hidden'); this.moveKnob(0, 0); },
    moveKnob(dx, dy) { const l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1; this.el.knob.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)'; },
    hideStick() { if (this.el) this.el.stick.classList.add('hidden'); },
  };
  // buttons
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) $('howto').innerHTML = '<b>Drag anywhere</b> to move. You attack the nearest enemy automatically. Clear each wave to face a harder one. How long can you last?';
  $('startBtn').addEventListener('click', startGame);
  $('restartBtn').addEventListener('click', startGame);
  $('pauseBtn').addEventListener('click', () => (game.state === 'paused' ? resume() : pause()));
  $('pauseMenu').addEventListener('click', (e) => {
    const act = e.target.closest('button') && e.target.closest('button').dataset.act;
    if (act === 'resume') resume();
    else if (act === 'restart') { UI.showPause(false); startGame(); }
    else if (act === 'menu') toMenu();
  });

  // ===================================================================
  // 9. Main loop
  // ===================================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.state === 'playing') { game.update(dt); UI.update(); }
    else if (game.state === 'over') { for (const q of game.particles) q.update(dt); game.particles = game.particles.filter((q) => q.life > 0); }
    game.draw();
    requestAnimationFrame(loop);
  }
  window.addEventListener('resize', resize);
  resize();
  UI.showMenu();
  requestAnimationFrame(loop);

  // handy for testing from the console
  window.__survival = { game, startGame, CONFIG, ENEMY_TYPES, waveScaling, SPRITES };
})();

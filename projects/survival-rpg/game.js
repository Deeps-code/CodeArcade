/* =====================================================================
   Wave Survivor: a top-down wave-survival RPG (plain Canvas, no libraries)

   Layout of this file:
     1. CONFIG          tunable numbers, enemy kinds, wave scaling
     2. CLASSES         the 17 heroes: stats, attack style, ability, passive
     3. UPGRADES        level-up choices
     4. SPRITES         optional images (everything falls back to shapes)
     5. Canvas/helpers
     6. Input           keyboard (WASD / arrows, Q/E/R = skills), hold mouse to aim,
                        touch: left side = move stick, right side = aim stick
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
  // Two more skills for every class (skill 1 is the "ability" above). Keys: Q/Space, E, R.
  const EXTRA_SKILLS = {
    warrior: [
      { id: 'charge', name: 'Charge', icon: '🐂', cd: 6, desc: 'Rush at the nearest enemy, trampling everything in the way.' },
      { id: 'battlecry', name: 'Battle Cry', icon: '📯', cd: 14, desc: '+40% damage and 20% less damage taken for 6s.' }],
    mage: [
      { id: 'chainlightning', name: 'Chain Lightning', icon: '⚡', cd: 6, desc: 'Lightning that leaps between 7 enemies.' },
      { id: 'blink', name: 'Blink', icon: '✨', cd: 5, desc: 'Teleport away from danger, leaving an arcane blast behind.' }],
    archer: [
      { id: 'arrowrain', name: 'Rain of Arrows', icon: '🌧️', cd: 9, desc: 'Arrows pour down on a crowd of enemies for 3s.' },
      { id: 'roll', name: 'Dodge Roll', icon: '🤸', cd: 4, desc: 'Roll away; your next 3 arrows are guaranteed crits.' }],
    guardian: [
      { id: 'fortify', name: 'Fortify', icon: '🧱', cd: 12, desc: 'Take 70% less damage for 4s and heal 15%.' },
      { id: 'shieldthrow', name: 'Shield Throw', icon: '🥏', cd: 6, desc: 'Hurl your shield through a whole line, stunning them.' }],
    assassin: [
      { id: 'fanofknives', name: 'Fan of Knives', icon: '🔪', cd: 5, desc: 'Throw 16 knives in every direction.' },
      { id: 'smokebomb', name: 'Smoke Bomb', icon: '🌫️', cd: 12, desc: 'Vanish for 3s: untouchable, and nearby enemies stumble.' }],
    summoner: [
      { id: 'spiritburst', name: 'Spirit Burst', icon: '💥', cd: 7, desc: 'Every spirit unleashes a blast around itself.' },
      { id: 'soullink', name: 'Soul Link', icon: '🔗', cd: 14, desc: 'Heal 30% and your minions deal double damage for 6s.' }],
    healer: [
      { id: 'smite', name: 'Smite', icon: '🌩️', cd: 5, desc: 'Holy light strikes the 3 nearest enemies and stuns them.' },
      { id: 'divineshield', name: 'Divine Shield', icon: '🛡️', cd: 15, desc: 'Become completely invulnerable for 3s.' }],
    berserker: [
      { id: 'leapslam', name: 'Leap Slam', icon: '🦘', cd: 7, desc: 'Leap onto the nearest enemy and smash the ground around it.' },
      { id: 'execute', name: 'Execute', icon: '☠️', cd: 6, desc: 'A huge spinning cleave; badly hurt enemies die instantly.' }],
    paladin: [
      { id: 'consecrate', name: 'Consecrate', icon: '🔆', cd: 10, desc: 'Bless the ground for 5s: burns enemies, heals you while you stand in it.' },
      { id: 'judgment', name: 'Judgment', icon: '⚖️', cd: 6, desc: 'Throw a holy hammer that crushes and stuns.' }],
    necromancer: [
      { id: 'bonespear', name: 'Bone Spear', icon: '🦴', cd: 5, desc: 'A spear of bone that pierces every enemy in its path.' },
      { id: 'soulsiphon', name: 'Soul Siphon', icon: '🌀', cd: 9, desc: 'Drain the life of every enemy around you.' }],
    monk: [
      { id: 'palmstrike', name: 'Palm Strike', icon: '🖐️', cd: 5, desc: 'A mighty palm that blasts enemies back and stuns them.' },
      { id: 'innerpeace', name: 'Inner Peace', icon: '☯️', cd: 14, desc: 'Heal 30% and dodge every attack for 3s.' }],
    pyromancer: [
      { id: 'meteor', name: 'Meteor', icon: '☄️', cd: 10, desc: 'Call down a meteor on a crowd: huge damage and burning.' },
      { id: 'firetrail', name: 'Fire Trail', icon: '👣', cd: 9, desc: 'Leave a trail of flames wherever you walk for 5s.' }],
    gunner: [
      { id: 'grenade', name: 'Grenade', icon: '💣', cd: 6, desc: 'Lob a grenade that explodes in a wide blast.' },
      { id: 'overdrive', name: 'Overdrive', icon: '⚙️', cd: 12, desc: 'Fire twice as fast, two bullets at a time, for 5s.' }],
    druid: [
      { id: 'bearform', name: 'Bear Form', icon: '🐻', cd: 15, desc: 'Become a bear for 8s: +50% damage, much tougher, and heal 20%.' },
      { id: 'swarm', name: 'Swarm', icon: '🐝', cd: 8, desc: 'Release 5 angry bees that sting your foes for 10s.' }],
    engineer: [
      { id: 'overclock', name: 'Overclock', icon: '🔋', cd: 12, desc: 'Your turrets fire more than twice as fast for 6s.' },
      { id: 'rockets', name: 'Rocket Barrage', icon: '🚀', cd: 8, desc: 'Launch 8 rockets at the nearest enemies.' }],
    spearman: [
      { id: 'sweep', name: 'Spear Sweep', icon: '🌀', cd: 6, desc: 'Sweep your spear in a full circle, knocking everyone back.' },
      { id: 'vault', name: 'Pole Vault', icon: '🏃', cd: 5, desc: 'Vault forward through the horde, striking everything you pass.' }],
    icemage: [
      { id: 'iceshards', name: 'Ice Shards', icon: '🧊', cd: 5, desc: 'A fan of 7 freezing shards that badly slow what they hit.' },
      { id: 'blizzard', name: 'Blizzard', icon: '🌨️', cd: 12, desc: 'A raging blizzard over a crowd for 5s: slows and damages.' }],
  };
  for (const c of CLASSES) c.abilities = [c.ability, ...(EXTRA_SKILLS[c.id] || [])];
  const SKILL_KEYS = ['Q', 'E', 'R'];
  const classById = (id) => CLASSES.find((c) => c.id === id) || CLASSES[0];

  // ===================================================================
  // 3. UPGRADES (level-up choices)
  // ===================================================================
  const pct = (v) => Math.round(v * 100) + '%';
  const UPGRADES = [
    { id: 'might', icon: '💪', name: 'Might', desc: (k) => '+' + pct(0.15 * k) + ' damage', apply: (s, p, k) => { s.damage *= 1 + 0.15 * k; } },
    { id: 'haste', icon: '⚡', name: 'Haste', desc: (k) => 'Attack ' + pct(0.1 * k) + ' faster', apply: (s, p, k) => { s.cooldown *= 1 - 0.1 * Math.min(k, 2.5); } },
    { id: 'vigor', icon: '❤️', name: 'Vigor', desc: (k) => '+' + Math.round(25 * k) + ' max HP and heal it', apply: (s, p, k) => { s.maxHp += 25 * k; p.heal(25 * k); } },
    { id: 'swift', icon: '👟', name: 'Swiftness', desc: (k) => '+' + pct(0.08 * k) + ' move speed', apply: (s, p, k) => { s.speed *= 1 + 0.08 * k; } },
    { id: 'keen', icon: '🎯', name: 'Keen Eye', desc: (k) => '+' + pct(0.06 * k) + ' crit chance', apply: (s, p, k) => { s.crit = Math.min(0.9, s.crit + 0.06 * k); } },
    { id: 'brutal', icon: '💥', name: 'Brutality', desc: (k) => '+' + pct(0.3 * k) + ' crit damage', apply: (s, p, k) => { s.critMult += 0.3 * k; } },
    { id: 'focus', icon: '⏳', name: 'Focus', desc: (k) => 'Skills recharge ' + pct(0.12 * k) + ' faster', apply: (s, p, k) => { s.cdr *= 1 - 0.12 * Math.min(k, 2.5); } },
    { id: 'regen', icon: '🌿', name: 'Regeneration', desc: (k) => '+' + (1.2 * k).toFixed(1) + ' HP per second', apply: (s, p, k) => { s.regen += 1.2 * k; } },
    { id: 'reach', icon: '📏', name: 'Reach', desc: (k) => '+' + pct(0.12 * k) + ' attack range', apply: (s, p, k) => { s.range *= 1 + 0.12 * k; } },
    { id: 'tough', icon: '🛡️', name: 'Toughness', desc: (k) => 'Take ' + pct(0.06 * k) + ' less damage', apply: (s, p, k) => { s.armor = Math.min(0.75, s.armor + 0.06 * k); } },
    { id: 'vamp', icon: '🩸', name: 'Vampirism', desc: (k) => '+' + pct(0.03 * k) + ' life steal', apply: (s, p, k) => { s.lifesteal += 0.03 * k; } },
    { id: 'pack', icon: '🐾', name: 'Bigger Pack', desc: (k) => '+' + Math.max(1, Math.floor(k)) + ' minion / turret', apply: (s, p, k) => { s.minions += Math.max(1, Math.floor(k)); },
      when: (c) => ['summoner', 'druid', 'necromancer', 'engineer'].includes(c.id) },
  ];
  // Each card rolls a rarity: rarer cards are stronger versions of the same upgrade
  const RARITIES = [
    { id: 'common', name: 'Common', k: 1, weight: 60 },
    { id: 'rare', name: 'Rare', k: 1.5, weight: 27 },
    { id: 'epic', name: 'Epic', k: 2, weight: 10 },
    { id: 'legendary', name: 'Legendary', k: 3, weight: 3 },
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
    bgCanvas = null;
    motes = Array.from({ length: 36 }, (_, i) => ({ x: hash(i) * view.w, y: hash(i + 50) * view.h, s: 0.6 + hash(i + 9) * 1.6, v: 6 + hash(i + 3) * 14, p: hash(i + 7) * TAU }));
  }
  // ---- render caches: draw once to an offscreen canvas, then just copy it each frame ----
  const Cache = new Map();
  function cached(key, w, h, paint) {
    let c = Cache.get(key);
    if (c && c.dpr === view.dpr) return c;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * view.dpr)); cv.height = Math.max(1, Math.ceil(h * view.dpr));
    const g = cv.getContext('2d'); g.scale(view.dpr, view.dpr); paint(g, w, h);
    c = { c: cv, w, h, dpr: view.dpr }; Cache.set(key, c);
    return c;
  }
  function hexRgb(hex) {
    let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
  function shade(hex, k) { const c = hexRgb(hex).map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))); return 'rgb(' + c.join(',') + ')'; }
  // a soft glowing dot (replaces the very slow canvas shadowBlur)
  function glowSprite(color, r) {
    r = Math.max(2, Math.round(r * 2) / 2);
    return cached('gl:' + color + ':' + r, r * 5, r * 5, (g, w) => {
      const m = w / 2, gr = g.createRadialGradient(m, m, 0, m, m, m);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, color); gr.addColorStop(0.45, rgba(color, 0.35)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  }
  // a big soft light / explosion disc
  function lightSprite(color, inner = 'rgba(255,237,160,0.9)') {
    return cached('lt:' + color + inner, 128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.4, rgba(color, 0.75)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  const blit = (sp, x, y, w, h = w) => ctx.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
  const EMOJI_FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const rand = (a, b) => a + Math.random() * (b - a);
  // deterministic noise (for effects that shouldn't flicker randomly every frame)
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
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
  // a stone dungeon floor with a vignette, rendered once per screen size
  function makeFloorTile() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1612'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const v = 25 + ((x * 7 + y * 13) % 5) * 3;
      const gr = g.createLinearGradient(0, y * 64, 0, y * 64 + 64);
      gr.addColorStop(0, 'rgb(' + (v + 10) + ',' + (v + 5) + ',' + v + ')'); gr.addColorStop(1, 'rgb(' + (v + 2) + ',' + (v - 2) + ',' + (v - 6) + ')');
      g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x * 64 + 2, y * 64 + 60, 60, 2);
      for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x * 64 + 6 + ((i * 23 + x * 11) % 50), y * 64 + 6 + ((i * 37 + y * 7) % 50), 2 + (i % 3), 2); }
      if ((x + y) % 2) { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x * 64 + 14, y * 64 + 20); g.lineTo(x * 64 + 26, y * 64 + 31); g.lineTo(x * 64 + 24, y * 64 + 44); g.stroke(); }
    }
    return c;
  }
  let bgCanvas = null;
  function buildBackground() {
    const c = document.createElement('canvas'); c.width = canvas.width + Math.ceil(40 * view.dpr); c.height = canvas.height + Math.ceil(40 * view.dpr);
    const g = c.getContext('2d'); g.scale(view.dpr, view.dpr); g.translate(20, 20);
    g.fillStyle = g.createPattern(makeFloorTile(), 'repeat'); g.fillRect(-20, -20, view.w + 40, view.h + 40);
    const vg = g.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.28, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg; g.fillRect(-20, -20, view.w + 40, view.h + 40);
    // warm light from the wall torches, baked in
    g.globalCompositeOperation = 'lighter';
    for (const [sx, sy] of TORCHES) { const x = sx * view.w, y = sy * view.h, tg = g.createRadialGradient(x, y, 0, x, y, 250); tg.addColorStop(0, 'rgba(255,170,90,0.2)'); tg.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = tg; g.fillRect(x - 250, y - 250, 500, 500); }
    g.globalCompositeOperation = 'source-over';
    bgCanvas = c;
    // the floor never changes, so it's the canvas's CSS background; each frame only clears and draws what moves
    canvas.style.background = 'url(' + c.toDataURL('image/jpeg', 0.9) + ') -20px -20px / ' + (view.w + 40) + 'px ' + (view.h + 40) + 'px no-repeat #1a1612';
  }
  const TORCHES = [[0, 0.3], [0, 0.72], [1, 0.3], [1, 0.72]];
  let motes = [];

  // ===================================================================
  // 6. Input
  // ===================================================================
  const Input = {
    keys: new Set(),
    touch: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    // Manual aim. Auto-aim (nearest enemy) is used whenever neither of these is active.
    mouse: { down: false, x: 0, y: 0 },                  // hold the mouse button to aim at the cursor
    aimTouch: { id: null, ox: 0, oy: 0, x: 0, y: 0 },   // second stick on the right side of a phone
    // Angle the player is aiming by hand, or null for auto-aim.
    aimAngle(p) {
      if (this.mouse.down) {
        const dx = this.mouse.x - p.x, dy = this.mouse.y - p.y;
        return dx || dy ? Math.atan2(dy, dx) : p.aim;
      }
      if (this.aimTouch.id !== null) {
        const dx = this.aimTouch.x - this.aimTouch.ox, dy = this.aimTouch.y - this.aimTouch.oy;
        return Math.hypot(dx, dy) > 10 ? Math.atan2(dy, dx) : null;
      }
      return null;
    },
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
    clear() { this.keys.clear(); this.touch.id = null; this.aimTouch.id = null; this.mouse.down = false; UI.hideStick(); UI.hideStick(true); },
  };
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); Input.keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); }
    if (game.state === 'playing') {
      const slot = e.code === 'Space' || e.code === 'KeyQ' ? 0 : e.code === 'KeyE' ? 1 : e.code === 'KeyR' ? 2 : -1;
      if (slot >= 0) { e.preventDefault(); game.player.useAbility(slot); }
    }
    if (game.state === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) UI.pickLevelUp(+e.code.slice(-1) - 1);
    if (e.code === 'Enter') { if (game.state === 'menu' || game.state === 'over') startGame(); else if (game.state === 'paused') resume(); }
  });
  window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
  window.addEventListener('blur', () => { Input.clear(); if (game.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) { Input.mouse.down = true; Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; }
      return;
    }
    // Phones: a touch on the left half moves, a touch on the right half aims.
    const aimSide = e.clientX > view.w / 2;
    const stick = aimSide ? Input.aimTouch : Input.touch;
    if (stick.id !== null) return;
    Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
    UI.showStick(e.clientX, e.clientY, aimSide);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; return; }
    for (const [stick, aimSide] of [[Input.touch, false], [Input.aimTouch, true]]) {
      if (e.pointerId !== stick.id) continue;
      stick.x = e.clientX; stick.y = e.clientY;
      UI.moveKnob(e.clientX - stick.ox, e.clientY - stick.oy, aimSide);
    }
  });
  const endTouch = (e) => {
    if (e.pointerType === 'mouse') { Input.mouse.down = false; return; }
    if (e.pointerId === Input.touch.id) { Input.touch.id = null; UI.hideStick(); }
    if (e.pointerId === Input.aimTouch.id) { Input.aimTouch.id = null; UI.hideStick(true); }
  };
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
      this.attackTimer = 0.25; this.abilityTimers = cls.abilities.map(() => 0);   // 0 = ready
      this.focusShots = 0; this.trailTick = 0;
      this.hurtTimer = 0; this.aim = 0; this.alive = true;
      this.hits = 0;                 // counts attacks, for "every Nth" passives
      this.buffs = {};               // name -> seconds left
      this.whirl = 0; this.whirlTick = 0; this.flurry = 0; this.flurryTick = 0; this.storm = 0; this.stormTick = 0;
    }
    get dmgMult() {
      let m = 1;
      if (this.buffs.might > 0) m *= 1.5;
      if (this.buffs.cry > 0) m *= 1.4;
      if (this.buffs.bear > 0) m *= 1.5;
      if (this.cls.passive.berserk) m *= 1 + (1 - this.hp / this.stats.maxHp) * 1.6;
      return m;
    }
    get attackCooldown() { return this.stats.cooldown * (this.buffs.rage > 0 ? 0.45 : 1) * (this.buffs.overdrive > 0 ? 0.5 : 1); }
    get lifesteal() { return this.stats.lifesteal + (this.buffs.rage > 0 ? 0.1 : 0); }
    abilityCooldown(i = 0) { return this.cls.abilities[i].cd * this.stats.cdr; }
    get invulnerable() { return this.buffs.divine > 0 || this.buffs.smoke > 0; }
    heal(amount, quiet = false) {
      if (!this.alive || amount <= 0) return;
      const before = this.hp;
      this.hp = Math.min(this.stats.maxHp, this.hp + amount);
      if (!quiet && this.hp - before >= 1) game.floatText(this.x, this.y - 26, '+' + Math.round(this.hp - before), '#4ade80');
    }
    update(dt) {
      const mv = Input.moveVector();
      const manual = Input.aimAngle(this);
      if (manual !== null) this.aim = manual;
      this.x += mv.x * this.stats.speed * dt; this.y += mv.y * this.stats.speed * dt;
      this.clampTo(view);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      for (let i = 0; i < this.abilityTimers.length; i++) this.abilityTimers[i] = Math.max(0, this.abilityTimers[i] - dt);
      if (this.buffs.firetrail > 0) { this.trailTick -= dt; if (this.trailTick <= 0) { this.trailTick = 0.15; game.zones.push({ x: this.x, y: this.y, r: 34, t: 2.5, every: 0.4, tick: 0, dmg: this.stats.damage * 0.5, opts: { burn: { dps: this.stats.damage * 0.8, t: 2 }, knock: 0, quiet: true }, color: '#f97316', soft: true }); } }
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
      const manual = Input.aimAngle(this);
      if (manual !== null) this.aim = manual;     // aiming by hand: attack that way, enemy or not
      else {
        const target = game.nearestEnemy(this, melee ? this.stats.range * 1.25 + 14 : this.stats.range);
        if (!target) { this.attackTimer = 0.05; return; }
        this.aim = Math.atan2(target.y - this.y, target.x - this.x);
      }
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
        if (this.focusShots > 0) { this.focusShots--; fx.crit = true; }
        const shots = this.buffs.overdrive > 0 ? 2 : 1;
        for (let k = 0; k < shots; k++) {
          const ang = this.aim + (a.spread ? rand(-a.spread, a.spread) : 0) + (shots > 1 ? (k - 0.5) * 0.12 : 0);
          game.projectiles.push(new Projectile(this.x, this.y, ang, { speed: a.speed, dmg, size: a.size, color: a.color, shape: a.shape, pierce: a.pierce || 0, range: this.stats.range, fx }));
        }
      }
      this.attackTimer = this.attackCooldown;
    }
    useAbility(i = 0) {
      const sk = this.cls.abilities[i];
      if (!sk || this.abilityTimers[i] > 0 || !this.alive) return;
      const fn = ABILITIES[sk.id];
      if (!fn) return;
      if (fn(this) === false) return;   // the skill can refuse (e.g. no target)
      this.abilityTimers[i] = this.abilityCooldown(i);
      UI.flashAbility(sk);
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
      if (this.invulnerable) { if (Math.random() < 0.3) game.floatText(this.x, this.y - 26, 'IMMUNE', '#fde68a'); this.hurtTimer = 0.25; return false; }
      if (this.buffs.inner > 0 || (s.evasion && Math.random() < s.evasion)) { game.floatText(this.x, this.y - 26, 'DODGE', '#93c5fd'); this.hurtTimer = 0.25; return false; }
      if (s.block && Math.random() < s.block) { game.floatText(this.x, this.y - 26, 'BLOCK', '#bfdbfe'); game.fx.push({ type: 'ring', x: this.x, y: this.y, r0: 18, r1: 30, color: '#93c5fd', t: 0.25, max: 0.25 }); this.hurtTimer = 0.3; return false; }
      const armor = clamp(s.armor + (this.buffs.cry > 0 ? 0.2 : 0) + (this.buffs.bear > 0 ? 0.4 : 0), -0.5, 0.85);
      const dmg = Math.max(1, Math.round(amount * (1 - armor) * (this.buffs.fortify > 0 ? 0.3 : 1)));
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
      const c = this.cls, r = this.radius, bear = this.buffs.bear > 0;
      // blink (dim instead of vanishing) while invulnerable after a hit
      const blink = this.hurtTimer > 0 && Math.floor(this.hurtTimer * 20) % 2 === 0;
      if (c.passive.taunt) { ctx.strokeStyle = 'rgba(96,165,250,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -game.time * 20; ctx.beginPath(); ctx.arc(this.x, this.y, c.passive.taunt, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (this.buffs.rage > 0 || this.buffs.might > 0 || this.buffs.cry > 0) blit(lightSprite(this.buffs.rage > 0 || this.buffs.cry > 0 ? '#ef4444' : '#facc15', 'rgba(255,255,255,0.25)'), this.x, this.y, r * 5.5);
      if (this.whirl > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const a = game.time * 18 + i * (TAU / 3); ctx.beginPath(); ctx.arc(this.x, this.y, this.stats.range * 1.1, a, a + 0.9); ctx.stroke(); }
        ctx.lineCap = 'butt';
      }
      if (this.invulnerable || this.buffs.fortify > 0 || bear || this.buffs.inner > 0) {
        const col = this.buffs.divine > 0 ? '253,230,138' : this.buffs.smoke > 0 ? '148,163,184' : this.buffs.fortify > 0 ? '96,165,250' : bear ? '180,120,70' : '255,255,255';
        ctx.fillStyle = 'rgba(' + col + ',0.16)'; ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 10 + Math.sin(game.time * 6) * 1.5, 0, TAU); ctx.fill(); ctx.stroke();
      }
      if (Input.aimAngle(this) !== null) {   // manual-aim guide line
        const ax = Math.cos(this.aim), ay = Math.sin(this.aim), len = Math.min(this.stats.range || 200, 220);
        ctx.strokeStyle = 'rgba(245,215,122,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(this.x + ax * (r + 12), this.y + ay * (r + 12)); ctx.lineTo(this.x + ax * len, this.y + ay * len); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = (this.buffs.smoke > 0 ? 0.45 : 1) * (blink ? 0.35 : 1);
      if (drawSprite(ctx, c.id, this.x, this.y, r, this.aim)) { ctx.globalAlpha = 1; return; }
      // weapon pointer
      const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
      ctx.fillStyle = '#f3e9d2';
      ctx.beginPath(); ctx.moveTo(this.x + ax * (r + 10), this.y + ay * (r + 10)); ctx.lineTo(this.x + ax * (r - 1) - ay * 5, this.y + ay * (r - 1) + ax * 5); ctx.lineTo(this.x + ax * (r - 1) + ay * 5, this.y + ay * (r - 1) - ax * 5); ctx.closePath(); ctx.fill();
      const sp = heroSprite(c, bear), size = (r + 10) * 2;
      ctx.drawImage(sp.c, this.x - size / 2, this.y - size / 2 + 2, size, size);
      ctx.globalAlpha = 1;
    }
  }
  // the hero token: shadow, shaded body, gold ring and class icon, drawn once per class
  function heroSprite(c, bear) {
    const r = CONFIG.player.radius;
    return cached('hero:' + c.id + (bear ? ':bear' : ''), (r + 10) * 2, (r + 10) * 2, (g, w) => {
      const m = w / 2, cy = m - 2;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(m, cy + r * 0.9, r * 1.05, r * 0.4, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(m - r * 0.35, cy - r * 0.4, r * 0.1, m, cy, r);
      gr.addColorStop(0, shade(c.color, 0.45)); gr.addColorStop(0.6, c.color); gr.addColorStop(1, shade(c.color, -0.5));
      g.fillStyle = gr; g.beginPath(); g.arc(m, cy, r, 0, TAU); g.fill();
      g.lineWidth = 3.2; g.strokeStyle = '#d4a62a'; g.stroke();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(255, 236, 170, 0.8)'; g.beginPath(); g.arc(m, cy, r - 0.2, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(m, cy, r + 1.8, 0, TAU); g.stroke();
      g.font = Math.round(r * 1.1) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(bear ? '🐻' : c.icon, m, cy + 1);
    });
  }

  // each enemy type is drawn once (normal / hit flash / frozen) and then copied
  function enemySprite(type, state) {
    const t = ENEMY_TYPES[type], r = t.radius;
    if (t._dpr !== view.dpr) { t._dpr = view.dpr; t._spr = []; }
    if (t._spr[state]) return t._spr[state];
    return (t._spr[state] = cached('en:' + type + ':' + state, r * 2 + 18, r * 2 + 18, (g, w) => {
      const m = w / 2, cy = m - 2;
      const base = state === 1 ? shade(t.color, 0.6) : state === 2 ? '#bae6fd' : t.color, dark = shade(state === 1 ? t.color : base, -0.55);   // a hit is a bright tint, not a white blob
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(m, cy + r * 0.88, r, r * 0.36, 0, 0, TAU); g.fill();
      // things that stick out behind the body
      g.fillStyle = state === 0 ? shade(t.color, -0.5) : dark;
      if (type === 'grunt') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(m + sd * r * 0.35, cy - r * 0.8); g.lineTo(m + sd * r * 0.75, cy - r * 1.35); g.lineTo(m + sd * r * 0.78, cy - r * 0.55); g.fill(); }
      if (type === 'runner') for (let i = 0; i < 4; i++) { const a = -Math.PI * 0.85 + i * 0.42; g.beginPath(); g.moveTo(m + Math.cos(a - 0.2) * r * 0.85, cy + Math.sin(a - 0.2) * r * 0.85); g.lineTo(m + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5); g.lineTo(m + Math.cos(a + 0.2) * r * 0.85, cy + Math.sin(a + 0.2) * r * 0.85); g.fill(); }
      // body
      const gr = g.createRadialGradient(m - r * 0.35, cy - r * 0.45, r * 0.1, m, cy, r * 1.1);
      gr.addColorStop(0, shade(base, 0.45)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.45));
      g.fillStyle = gr; g.beginPath();
      if (type === 'brute') { if (g.roundRect) g.roundRect(m - r, cy - r, r * 2, r * 2, r * 0.38); else g.rect(m - r, cy - r, r * 2, r * 2); }
      else g.arc(m, cy, r, 0, TAU);
      g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      if (type === 'brute') {
        // armor plates and rivets
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(m - r + 2, cy + r * 0.25, r * 2 - 4, r * 0.3);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (const [dx, dy] of [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]]) { g.beginPath(); g.arc(m + dx * r, cy + dy * r, 2, 0, TAU); g.fill(); }
      }
      if (type === 'spitter') {
        g.fillStyle = '#3b2a06'; g.beginPath(); g.ellipse(m, cy + r * 0.42, r * 0.42, r * 0.26, 0, 0, TAU); g.fill();
        g.fillStyle = '#fde047'; g.beginPath(); g.ellipse(m, cy + r * 0.45, r * 0.22, r * 0.12, 0, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(m - r * 0.38, cy - r * 0.48, r * 0.32, r * 0.17, -0.6, 0, TAU); g.fill();
      // eye whites (the pupils are drawn live, looking at you)
      const er = Math.max(2.2, r * 0.22);
      g.fillStyle = '#fef3c7'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(m + sd * r * 0.36, cy - r * 0.12, er, 0, TAU); g.fill(); }
    }));
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
      if (this.x < -50 || this.y < -50 || this.x > view.w + 50 || this.y > view.h + 50) return;   // off screen
      if (drawSprite(ctx, this.type, this.x, this.y, this.radius)) return;
      const r = this.radius, bob = Math.sin(this.wobble) * 1.2;
      const sp = enemySprite(this.type, this.flash > 0 ? 1 : this.frozen > 0 ? 2 : 0);
      ctx.drawImage(sp.c, this.x - sp.w / 2, this.y - sp.w / 2 + 2 + bob, sp.w, sp.h);
      // eyes that follow you
      const a = Math.atan2(player.y - this.y, player.x - this.x), ca = Math.cos(a), sa = Math.sin(a);
      const er = Math.max(2.2, r * 0.22), px = ca * er * 0.45, py = sa * er * 0.45 + bob;
      ctx.fillStyle = '#1c1917'; ctx.beginPath();
      ctx.arc(this.x - r * 0.36 + px, this.y - r * 0.12 + py, er * 0.55, 0, TAU); ctx.moveTo(this.x + r * 0.36 + px + er * 0.55, this.y - r * 0.12 + py); ctx.arc(this.x + r * 0.36 + px, this.y - r * 0.12 + py, er * 0.55, 0, TAU);
      ctx.fill();
      // status looks
      if (this.burn) {
        for (let i = 0; i < 3; i++) {
          const k = (game.time * 2.2 + i / 3 + this.wobble * 0.05) % 1;
          ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 2 ? '#fde047' : '#f97316';
          ctx.beginPath(); ctx.arc(this.x + (hash(i + this.maxHp) - 0.5) * r * 1.2, this.y - r * 0.2 - k * r * 1.3, 3 * (1 - k) + 1, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (this.slow && this.frozen <= 0) { ctx.strokeStyle = 'rgba(125,211,252,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, r + 3, 0, TAU); ctx.stroke(); }
      if (this.frozen > 0) { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; ctx.moveTo(this.x + Math.cos(aa) * r * 0.5, this.y + Math.sin(aa) * r * 0.5); ctx.lineTo(this.x + Math.cos(aa) * (r + 5), this.y + Math.sin(aa) * (r + 5)); } ctx.stroke(); }
      if (this.root > 0) { ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i < 5; i++) { const aa = (i / 5) * TAU + 0.3; ctx.moveTo(this.x + Math.cos(aa) * r, this.y + Math.sin(aa) * r * 0.6 + r * 0.6); ctx.quadraticCurveTo(this.x + Math.cos(aa) * r * 1.5, this.y + r * 0.2, this.x + Math.cos(aa + 0.4) * r * 0.6, this.y - r * 0.2); } ctx.stroke(); }
      const hurt = this.hp < this.maxHp, barY = this.y - this.radius - 10;
      if (hurt) {
        const w = Math.max(24, this.radius * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(this.x - w / 2 - 1, barY - 1, w + 2, 6);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(this.x - w / 2, barY, w * Math.max(0, this.hp / this.maxHp), 4);
      }
      // stun stars sit above the health bar
      if (this.stun > 0 && this.frozen <= 0) { ctx.fillStyle = '#fde047'; for (let i = 0; i < 3; i++) { const aa = game.time * 5 + i * (TAU / 3); ctx.beginPath(); ctx.arc(this.x + Math.cos(aa) * this.radius * 0.8, (hurt ? barY - 6 : this.y - this.radius - 6) + Math.sin(aa) * 2.5, 2.5, 0, TAU); ctx.fill(); } }
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
      if (this.x < -30 || this.y < -30 || this.x > view.w + 30 || this.y > view.h + 30) return;
      if (drawSprite(ctx, this.hostile ? 'enemyShot' : 'shot', this.x, this.y, this.radius, this.angle)) return;
      if (this.shape === 'arrow') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
        ctx.restore(); return;
      }
      // a short streak behind it, a soft glow, and a bright core
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35; ctx.lineWidth = this.radius * 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035); ctx.lineTo(this.x, this.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      const gs = glowSprite(this.color, this.radius * (this.explode ? 1.6 : 1)); blit(gs, this.x, this.y, gs.w);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Pets, summons, turrets and mines that fight for you
  const MINION_KINDS = {
    spirit:   { r: 7,  speed: 270, cd: 0.45, reach: 10, mult: 0.75, color: '#5eead4', icon: '' },
    skeleton: { r: 10, speed: 125, cd: 0.7,  reach: 16, mult: 0.7,  color: '#e7e5e4', icon: '☠' },
    wolf:     { r: 11, speed: 215, cd: 0.55, reach: 14, mult: 0.9,  color: '#a8a29e', icon: '🐺' },
    turret:   { r: 12, speed: 0,   cd: 0.45, reach: 330, mult: 0.9, color: '#0ea5e9', icon: '' },
    mine:     { r: 6,  speed: 0,   cd: 0,    reach: 26, mult: 3,    color: '#ef4444', icon: '' },
    bee:      { r: 5,  speed: 320, cd: 0.35, reach: 8,  mult: 0.45, color: '#facc15', icon: '' },
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
        if (e) { this.aim = Math.atan2(e.y - this.y, e.x - this.x); if (this.cd <= 0) { this.cd = d.cd * (p.buffs.overclock > 0 ? 0.45 : 1); game.projectiles.push(new Projectile(this.x, this.y, this.aim, { speed: 600, dmg: p.stats.damage * d.mult, size: 4, color: '#7dd3fc', range: d.reach })); } }
        return;
      }
      // walkers & flyers: chase the nearest enemy near you, otherwise stay close
      const e = game.nearestEnemy(p, 320) && game.nearestEnemy(this, 360);
      let tx, ty;
      if (e) { tx = e.x; ty = e.y; }
      else { this.orbit += dt * (this.kind === 'spirit' || this.kind === 'bee' ? 2.5 : 0.6); tx = p.x + Math.cos(this.orbit) * 44; ty = p.y + Math.sin(this.orbit) * 44; }
      const dx = tx - this.x, dy = ty - this.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 2) { const st = Math.min(dd, d.speed * dt); this.x += (dx / dd) * st; this.y += (dy / dd) * st; this.aim = Math.atan2(dy, dx); }
      if (e && this.cd <= 0 && Math.hypot(e.x - this.x, e.y - this.y) < e.radius + d.r + d.reach) {
        this.cd = d.cd; Combat.damage(e, p.stats.damage * d.mult * (p.buffs.frenzy > 0 ? 2 : 1), { knockFrom: this, knock: 0.6 });
      }
    }
    draw(ctx) {
      const d = this.def;
      if (drawSprite(ctx, this.kind, this.x, this.y, d.r, this.aim)) return;
      const fade = isFinite(this.life) && this.life < 2 ? 0.4 + 0.6 * (Math.floor(this.life * 8) % 2) : 1;
      ctx.globalAlpha = fade;
      if (this.kind === 'spirit' || this.kind === 'bee') {
        const y = this.y + Math.sin(this.bob) * 2;
        const gs = glowSprite(d.color, d.r); blit(gs, this.x, y, gs.w);
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(this.x, y, d.r * 0.75, 0, TAU); ctx.fill();
        if (this.kind === 'bee') { ctx.fillStyle = '#1c1917'; ctx.fillRect(this.x - 1.5, y - d.r, 3, d.r * 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(this.x, y - d.r, 3, 2, 0, 0, TAU); ctx.fill(); }
        else { ctx.fillStyle = 'rgba(94,234,212,0.35)'; ctx.beginPath(); ctx.arc(this.x - Math.cos(this.aim) * 7, y - Math.sin(this.aim) * 7, d.r * 0.7, 0, TAU); ctx.fill(); }
      } else if (this.kind === 'turret') {
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(this.x, this.y, d.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.aim); ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, -3, d.r + 6, 6); ctx.restore();
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, TAU); ctx.fill();
      } else if (this.kind === 'mine') {
        ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(this.x, this.y, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = Math.sin(game.time * 10) > 0 ? '#ef4444' : '#7f1d1d'; ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, TAU); ctx.fill();
      } else {
        const sp = cached('mn:' + this.kind, d.r * 2 + 10, d.r * 2 + 10, (g, w) => {
          const m = w / 2, cy = m - 1;
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(m, cy + d.r * 0.85, d.r, d.r * 0.35, 0, 0, TAU); g.fill();
          const gr = g.createRadialGradient(m - d.r * 0.3, cy - d.r * 0.35, 1, m, cy, d.r);
          gr.addColorStop(0, shade(d.color, 0.4)); gr.addColorStop(1, shade(d.color, -0.35));
          g.fillStyle = gr; g.beginPath(); g.arc(m, cy, d.r, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.stroke();
          g.font = Math.round(d.r * 1.3) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1c1917'; g.fillText(d.icon, m, cy + 1);
        });
        ctx.drawImage(sp.c, this.x - sp.w / 2, this.y - sp.w / 2 + 1, sp.w, sp.h);
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
      const big = this.value >= 4, y = this.y + Math.sin(this.t * 5) * 1.5;
      const sp = cached('gem:' + big, 24, 24, (g) => {
        const s = big ? 6.5 : 5, col = big ? '#e879f9' : '#a78bfa';
        const gl = g.createRadialGradient(12, 12, 0, 12, 12, 12); gl.addColorStop(0, rgba(col, 0.55)); gl.addColorStop(1, rgba(col, 0));
        g.fillStyle = gl; g.fillRect(0, 0, 24, 24);
        g.fillStyle = col; g.beginPath(); g.moveTo(12, 12 - s); g.lineTo(12 + s * 0.7, 12); g.lineTo(12, 12 + s); g.lineTo(12 - s * 0.7, 12); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(12, 12 - s); g.lineTo(12 + s * 0.35, 12 - s * 0.1); g.lineTo(12, 12); g.closePath(); g.fill();
      });
      ctx.drawImage(sp.c, this.x - 12, y - 12, 24, 24);
    }
  }

  class Particle {
    constructor(x, y, color) {
      const a = rand(0, TAU), sp = rand(60, 240);
      this.x = x; this.y = y; this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      this.life = rand(0.25, 0.55); this.max = this.life; this.color = color; this.size = rand(2, 4.5);
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; const k = Math.pow(0.0018, dt); this.vx *= k; this.vy *= k; this.life -= dt; }   // same slowdown at any frame rate
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
      if (!o.quiet) game.floatText(e.x, e.y - e.radius - 6, String(dmg), o.color || (crit ? '#fde047' : '#ffffff'), crit, e);
      const steal = (o.raw ? 0 : p.lifesteal) + (o.drain || 0);
      if (steal > 0) p.heal(dmg * steal, true);
      if (o.knockFrom || o.knockAngle !== undefined) {
        const a = o.knockAngle ?? Math.atan2(e.y - o.knockFrom.y, e.x - o.knockFrom.x), k = (o.knock ?? 1) * 90 * (14 / e.radius);
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
        this.damage(e, dmg, Object.assign({ knockAngle: angle, knock: 1.2 }, o.hit));
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
  // move instantly (optionally hitting everything along the way)
  function dash(p, angle, dist, o = {}) {
    const x0 = p.x, y0 = p.y;
    p.x += Math.cos(angle) * dist; p.y += Math.sin(angle) * dist; p.clampTo(view);
    game.fx.push({ type: 'trail', x1: x0, y1: y0, x2: p.x, y2: p.y, color: o.color || '#ffffff', t: 0.35, max: 0.35 });
    if (o.dmg) Combat.thrust(x0, y0, Math.atan2(p.y - y0, p.x - x0), Math.hypot(p.x - x0, p.y - y0), o.width || 40, o.dmg, { color: o.color, hit: o.hit });
    p.hurtTimer = Math.max(p.hurtTimer, o.invuln ?? 0.35);
  }
  // the direction away from the closest enemy (or a random one)
  function awayAngle(p) {
    const e = game.nearestEnemy(p, 600);
    if (e) return Math.atan2(p.y - e.y, p.x - e.x);
    const mv = Input.moveVector();
    return mv.x || mv.y ? Math.atan2(mv.y, mv.x) : rand(0, TAU);
  }
  // the biggest group of enemies near the player (for meteors, blizzards, rains)
  function crowdSpot(p, range = 520) {
    let best = null, bestN = 0;
    for (const e of game.enemies) {
      if (dist2(e, p) > range * range) continue;
      let n = 0; for (const o of game.enemies) if (dist2(o, e) < 120 * 120) n++;
      if (n > bestN) { bestN = n; best = e; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }
  // Direction for an aimed skill: where the player is aiming by hand, else at the target.
  const aimFor = (p, t) => { const m = Input.aimAngle(p); return m !== null ? m : t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aim; };
  const zone = (z) => game.zones.push(Object.assign({ tick: 0, every: 0.3, opts: { knock: 0, quiet: true } }, z));
  const nearest = (p, n, range) => game.enemies.filter((e) => !e.dead && dist2(e, p) < range * range).sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, n);
  const ABILITIES = {
    whirlwind(p) { p.whirl = 2.5; p.whirlTick = 0; },
    fireball(p) {
      const t = game.nearestEnemy(p, 600); if (!t) return false;
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 400, dmg: p.stats.damage * 4, size: 13, color: '#f97316', range: 640, explode: { r: 120, mult: 1, burn: { dps: p.stats.damage * 0.8, t: 3 } } }));
    },
    volley(p) {
      const t = game.nearestEnemy(p, 700); const base = aimFor(p, t);
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
      const t = game.nearestEnemy(p, 900); const a = aimFor(p, t);
      Combat.thrust(p.x, p.y, a, 520, 38, p.stats.damage * 3, { color: '#67e8f9' }); game.shake = 6;
    },
    // --- warrior ---
    charge(p) {
      const t = game.nearestEnemy(p, 340); const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : awayAngle(p) + Math.PI;
      dash(p, a, t ? Math.min(260, Math.sqrt(dist2(t, p))) : 200, { dmg: p.stats.damage * 1.6, width: 48, color: '#fca5a5', hit: { knock: 3 } });
      Combat.area(p.x, p.y, 80, p.stats.damage, { knock: 2 }); game.shake = 6;
    },
    battlecry(p) { p.buffs.cry = 6; ring(p.x, p.y, 140, '#f87171', 0.6); },
    // --- mage ---
    chainlightning(p) { const t = game.nearestEnemy(p, 500); if (!t) return false; Combat.damage(t, p.stats.damage * 2, { color: '#c4b5fd' }); Combat.chain(t, 6, 210, p.stats.damage * 2); },
    blink(p) { const x0 = p.x, y0 = p.y; dash(p, awayAngle(p), 220, { color: '#c4b5fd', invuln: 0.5 }); Combat.area(x0, y0, 95, p.stats.damage * 1.6, { knock: 2 }); game.fx.push({ type: 'boom', x: x0, y: y0, r: 95, color: '#8b5cf6', t: 0.35, max: 0.35 }); },
    // --- archer ---
    arrowrain(p) { const c = crowdSpot(p); if (!c) return false; zone({ x: c.x, y: c.y, r: 115, t: 3, every: 0.22, dmg: p.stats.damage * 0.7, color: '#fde68a', rain: true }); },
    roll(p) { dash(p, awayAngle(p), 170, { color: '#86efac', invuln: 0.45 }); p.focusShots = 3; },
    // --- guardian ---
    fortify(p) { p.buffs.fortify = 4; p.heal(p.stats.maxHp * 0.15); ring(p.x, p.y, 80, '#60a5fa', 0.5); },
    shieldthrow(p) {
      const t = game.nearestEnemy(p, 600); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 620, dmg: p.stats.damage * 2.2, size: 11, color: '#93c5fd', pierce: 99, range: 560, fx: { stun: 1.2 } }));
    },
    // --- assassin ---
    fanofknives(p) { for (let i = 0; i < 16; i++) game.projectiles.push(new Projectile(p.x, p.y, (i / 16) * TAU, { speed: 700, dmg: p.stats.damage * 1.3, size: 3, color: '#e5e7eb', shape: 'arrow', pierce: 1, range: 300 })); },
    smokebomb(p) { p.buffs.smoke = 3; Combat.area(p.x, p.y, 160, 1, { slow: { k: 0.6, t: 3 }, knock: 0, quiet: true }); game.fx.push({ type: 'boom', x: p.x, y: p.y, r: 160, color: '#64748b', t: 0.6, max: 0.6 }); p.focusShots = 1; },
    // --- summoner ---
    spiritburst(p) {
      const sp = game.minions.filter((m) => m.kind === 'spirit'); if (!sp.length) return false;
      for (const m of sp) { Combat.area(m.x, m.y, 110, p.stats.damage * 2, { knock: 2 }); game.fx.push({ type: 'boom', x: m.x, y: m.y, r: 110, color: '#5eead4', t: 0.35, max: 0.35 }); }
    },
    soullink(p) { p.heal(p.stats.maxHp * 0.3); p.buffs.frenzy = 6; ring(p.x, p.y, 120, '#5eead4', 0.6); },
    // --- cleric ---
    smite(p) {
      const list = nearest(p, 3, 520); if (!list.length) return false;
      for (const e of list) { Combat.damage(e, p.stats.damage * 3, { stun: 0.9 }); game.fx.push({ type: 'pillar', x: e.x, y: e.y, color: '#fef08a', t: 0.35, max: 0.35 }); }
    },
    divineshield(p) { p.buffs.divine = 3; ring(p.x, p.y, 70, '#fde68a', 0.5); },
    // --- berserker ---
    leapslam(p) {
      const t = game.nearestEnemy(p, 380); if (!t) return false;
      const a = Math.atan2(t.y - p.y, t.x - p.x); dash(p, a, Math.max(0, Math.sqrt(dist2(t, p)) - t.radius - 10), { color: '#fca5a5', invuln: 0.4 });
      Combat.area(p.x, p.y, 125, p.stats.damage * 2.5, { stun: 1, knock: 3 }); game.fx.push({ type: 'boom', x: p.x, y: p.y, r: 125, color: '#b91c1c', t: 0.4, max: 0.4 }); game.shake = 9;
    },
    execute(p) {
      const r = p.stats.range * 1.5;
      Combat.melee(p.x, p.y, 0, r, TAU, p.stats.damage * 3, { knock: 2, color: '#ef4444' });
      for (const e of game.enemies) if (!e.dead && e.hp < e.maxHp * 0.25 && dist2(e, p) < (r + e.radius) ** 2) { Combat.damage(e, e.hp + 1, { raw: true, color: '#ef4444' }); game.floatText(e.x, e.y - 20, 'EXECUTED', '#ef4444', true); }
    },
    // --- paladin ---
    consecrate(p) { zone({ x: p.x, y: p.y, r: 135, t: 5, every: 0.4, dmg: p.stats.damage * 0.7, heal: 0.02, color: '#fcd34d' }); },
    judgment(p) {
      const t = game.nearestEnemy(p, 600); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 560, dmg: p.stats.damage * 3, size: 10, color: '#fbbf24', pierce: 2, range: 560, fx: { stun: 1.3 } }));
    },
    // --- necromancer ---
    bonespear(p) {
      const t = game.nearestEnemy(p, 700); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 760, dmg: p.stats.damage * 3, size: 6, color: '#e7e5e4', shape: 'arrow', pierce: 99, range: 700 }));
    },
    soulsiphon(p) { if (!game.nearestEnemy(p, 210)) return false; Combat.area(p.x, p.y, 210, p.stats.damage * 1.5, { drain: 0.5, knock: 0 }); ring(p.x, p.y, 210, '#a3e635', 0.55); },
    // --- monk ---
    palmstrike(p) { const t = game.nearestEnemy(p, 200); const a = aimFor(p, t); Combat.thrust(p.x, p.y, a, 100, 80, p.stats.damage * 4, { color: '#fdba74', hit: { stun: 1.1, knock: 6 } }); game.shake = 5; },
    innerpeace(p) { p.heal(p.stats.maxHp * 0.3); p.buffs.inner = 3; ring(p.x, p.y, 90, '#ffffff', 0.6); },
    // --- pyromancer ---
    meteor(p) {
      const c = crowdSpot(p, 600); if (!c) return false;
      game.fx.push({ type: 'mark', x: c.x, y: c.y, r: 150, color: '#f97316', t: 0.85, max: 0.85 });
      game.timers.push({ t: 0.85, fn: () => { Combat.area(c.x, c.y, 150, p.stats.damage * 5, { burn: { dps: p.stats.damage * 1.2, t: 4 }, knock: 3 }); game.fx.push({ type: 'boom', x: c.x, y: c.y, r: 150, color: '#ea580c', t: 0.6, max: 0.6 }); game.shake = 12; } });
    },
    firetrail(p) { p.buffs.firetrail = 5; },
    // --- gunner ---
    grenade(p) {
      const t = game.nearestEnemy(p, 520); const a = aimFor(p, t), d = t ? Math.sqrt(dist2(t, p)) : 260;
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 440, dmg: p.stats.damage * 6, size: 7, color: '#84cc16', range: d - 10, explode: { r: 115, mult: 1, color: '#a3e635' } }));
    },
    overdrive(p) { p.buffs.overdrive = 5; ring(p.x, p.y, 70, '#e2e8f0'); },
    // --- druid ---
    bearform(p) { p.buffs.bear = 8; p.heal(p.stats.maxHp * 0.2); ring(p.x, p.y, 90, '#a16207', 0.5); },
    swarm(p) { for (let i = 0; i < 5; i++) game.minions.push(new Minion('bee', p.x + rand(-15, 15), p.y + rand(-15, 15), { life: 10 })); },
    // --- engineer ---
    overclock(p) { if (!game.minions.some((m) => m.kind === 'turret')) return false; p.buffs.overclock = 6; for (const m of game.minions) if (m.kind === 'turret') ring(m.x, m.y, 40, '#7dd3fc', 0.4); },
    rockets(p) {
      const list = nearest(p, 8, 600); if (!list.length) return false;
      for (let i = 0; i < 8; i++) { const e = list[i % list.length], a = Math.atan2(e.y - p.y, e.x - p.x) + rand(-0.08, 0.08);
        game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 520, dmg: p.stats.damage * 2.2, size: 5, color: '#fb923c', range: Math.sqrt(dist2(e, p)) + 10, explode: { r: 60, mult: 1, color: '#f97316' } })); }
    },
    // --- spearman ---
    sweep(p) { Combat.melee(p.x, p.y, 0, p.stats.range * 1.15, TAU, p.stats.damage * 1.9, { knock: 3.5, color: '#67e8f9' }); },
    vault(p) { const t = game.nearestEnemy(p, 500); const a = aimFor(p, t); dash(p, a, 230, { dmg: p.stats.damage * 2, width: 42, color: '#67e8f9', invuln: 0.5 }); },
    // --- ice mage ---
    iceshards(p) {
      const t = game.nearestEnemy(p, 600); const a = aimFor(p, t);
      for (let i = 0; i < 7; i++) game.projectiles.push(new Projectile(p.x, p.y, a + (i - 3) * 0.14, { speed: 620, dmg: p.stats.damage * 1.6, size: 5, color: '#e0f2fe', pierce: 1, range: 460, fx: { slow: { k: 0.65, t: 3 } } }));
    },
    blizzard(p) { const c = crowdSpot(p) || { x: p.x, y: p.y }; zone({ x: c.x, y: c.y, r: 150, t: 5, every: 0.35, dmg: p.stats.damage * 0.55, opts: { slow: { k: 0.6, t: 1 }, knock: 0, quiet: true }, color: '#bae6fd', snow: true }); },
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
  // a simple spatial grid so collision checks only look at nearby enemies
  const Grid = {
    size: 72, cells: new Map(), out: [],
    key: (gx, gy) => (gx + 512) * 4096 + (gy + 512),
    build(list) {
      this.cells.clear();
      list.forEach((e, i) => {
        e._gi = i;
        const k = this.key(Math.floor(e.x / this.size), Math.floor(e.y / this.size));
        let c = this.cells.get(k); if (!c) { c = []; this.cells.set(k, c); } c.push(e);
      });
    },
    near(x, y) {
      const gx = Math.floor(x / this.size), gy = Math.floor(y / this.size), out = this.out; out.length = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = this.cells.get(this.key(gx + i, gy + j)); if (c) for (const e of c) out.push(e); }
      return out.slice();
    },
  };

  const game = {
    shakeX: 0, shakeY: 0,
    state: 'menu',      // menu | playing | levelup | paused | over
    cls: null, player: null,
    enemies: [], projectiles: [], enemyShots: [], minions: [], gems: [], particles: [], fx: [], zones: [], timers: [],
    waves: new WaveManager(), kills: 0, time: 0, shake: 0,

    nearestEnemy(from, range) {
      let best = null, bd = range * range;
      for (const e of this.enemies) { if (e.dead) continue; const d = dist2(e, from); if (d < bd) { bd = d; best = e; } }
      return best;
    },
    burst(x, y, color, n) { if (this.particles.length > 500) n = Math.min(n, 2); for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color)); },
    texts: [], textFor: new WeakMap(),
    // floating numbers: rapid hits on the same enemy add up into one number instead of a pile
    floatText(x, y, text, color, big = false, target = null) {
      const num = +text;
      if (target && !big && !isNaN(num)) {
        const f = this.textFor.get(target);
        if (f && f.t > f.max - 0.35 && f.color === color) { f.num += num; f.text = String(f.num); f.t = f.max; f.pop = 1; f.x = x; f.y = Math.min(f.y, y); return; }
      }
      const f = { x, y, text, color, big, t: big ? 1 : 0.75, max: big ? 1 : 0.75, num: isNaN(num) ? null : num, pop: 1 };
      if (target) this.textFor.set(target, f);
      this.texts.push(f);
      if (this.texts.length > 120) this.texts.shift();
    },

    // ----- events: hook drops, upgrades and achievements in here -----
    onEnemyKilled(e) {
      this.kills++;
      this.burst(e.x, e.y, e.def.color, 12);
      if (this.fx.length < 160) this.fx.push({ type: 'ring', x: e.x, y: e.y, r0: e.radius * 0.6, r1: e.radius * 2, color: e.def.color, t: 0.25, max: 0.25 });
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
      // smooth shake instead of random jumps every frame
      this.shakeX = this.shake ? (Math.sin(this.time * 63) + Math.sin(this.time * 41) * 0.6) * this.shake * 0.55 : 0;
      this.shakeY = this.shake ? (Math.cos(this.time * 57) + Math.cos(this.time * 37) * 0.6) * this.shake * 0.55 : 0;
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
      for (const f of this.fx) f.t -= dt;
      for (const f of this.texts) { f.t -= dt; f.y -= 38 * dt; f.pop = Math.max(0, f.pop - dt * 7); }
      if (this.texts.length && this.texts[0].t <= 0) this.texts = this.texts.filter((f) => f.t > 0);
      // ground effects (consecration, blizzards, rains, fire trails)
      for (const z of this.zones) {
        z.t -= dt; z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = z.every;
          if (z.dmg) Combat.area(z.x, z.y, z.r, z.dmg, Object.assign({ knock: 0 }, z.opts));
          if (z.heal && dist2(z, p) < z.r * z.r) p.heal(p.stats.maxHp * z.heal, true);
        }
      }
      this.zones = this.zones.filter((z) => z.t > 0);
      for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
      this.timers = this.timers.filter((tm) => !tm.done);

      // your shots
      for (const b of this.projectiles) {
        if (b.dead) continue;
        const near = Grid.near(b.x, b.y);
        for (const e of near) {
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
    // push overlapping enemies apart (only checks neighbors on a grid, not every pair)
    separate() {
      Grid.build(this.enemies);
      for (const a of this.enemies) {
        for (const b of Grid.near(a.x, a.y)) {
          if (b._gi <= a._gi) continue;
          const dx = b.x - a.x, dy = b.y - a.y, min = a.radius + b.radius, d2 = dx * dx + dy * dy;
          if (d2 > 0.0001 && d2 < min * min) { const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
          else if (d2 <= 0.0001) { a.x -= 0.5; b.x += 0.5; }
        }
      }
    },

    draw() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const live = this.state === 'playing';
      ctx.translate(live ? this.shakeX : 0, live ? this.shakeY : 0);
      drawFloor();
      const p = this.player || { x: view.w / 2, y: view.h / 2 };
      drawZones();
      for (const g of this.gems) g.draw(ctx);
      for (const q of this.particles) q.draw(ctx);
      ctx.globalAlpha = 1;
      for (const m of this.minions) if (m.kind === 'mine' || m.kind === 'turret') m.draw(ctx);
      for (const e of this.enemies) e.draw(ctx, p);
      for (const m of this.minions) if (m.kind !== 'mine' && m.kind !== 'turret') m.draw(ctx);
      for (const b of this.projectiles) b.draw(ctx);
      for (const b of this.enemyShots) b.draw(ctx);
      if (this.player && this.player.alive) this.player.draw(ctx);
      drawFx();
      drawTexts();
      drawTorchLight();
      if (this.player && this.state !== 'menu' && this.player.hp / this.player.stats.maxHp < 0.3) {
        const sp = cached('lowhp:' + Math.round(view.w) + 'x' + Math.round(view.h), view.w + 20, view.h + 20, (g, w, h) => {
          const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
          gr.addColorStop(0, 'rgba(239,68,68,0)'); gr.addColorStop(1, 'rgba(239,68,68,1)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        });
        ctx.globalAlpha = 0.28 + Math.sin(this.time * 6) * 0.1;
        ctx.drawImage(sp.c, -10, -10, sp.w, sp.h);
        ctx.globalAlpha = 1;
      }
    },
  };

  function drawFloor() {
    if (!bgCanvas) buildBackground();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    // drifting dust in the air
    ctx.fillStyle = 'rgba(253, 230, 170, 0.35)';
    for (const m of motes) {
      const y = ((m.y - game.time * m.v) % view.h + view.h) % view.h, x = m.x + Math.sin(game.time * 0.6 + m.p) * 14;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(game.time * 1.5 + m.p);
      ctx.fillRect(x, y, m.s, m.s);
    }
    ctx.globalAlpha = 1;
  }
  // wall torches with flickering warm light (drawn on top, added like real light)
  function drawTorchLight() {
    const t = game.time;
    TORCHES.forEach(([sx, sy], i) => {
      const fl = 0.8 + Math.sin(t * 9 + i * 2) * 0.12 + Math.sin(t * 23 + i) * 0.08;
      ctx.globalAlpha = 0.5 * fl; blit(lightSprite('#fb923c', 'rgba(255,200,120,0.9)'), sx === 0 ? 7 : view.w - 7, sy * view.h - 6, 70 * fl);
    });
    ctx.globalAlpha = 1;
    // the torches themselves, on the side walls
    TORCHES.forEach(([sx, sy], i) => {
      const x = sx === 0 ? 7 : view.w - 7, y = sy * view.h, fl = Math.sin(t * 14 + i * 3);
      ctx.fillStyle = '#3f2e18'; ctx.fillRect(x - 3, y - 2, 6, 14);
      ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(x, y - 6, 4.5, 8 + fl * 1.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 2.2, 4.5 + fl, 0, 0, TAU); ctx.fill();
    });
  }
  function drawTexts() {
    if (!game.texts.length) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const big of [false, true]) {
      ctx.font = big ? '900 20px system-ui, sans-serif' : '800 14px system-ui, sans-serif';
      ctx.lineWidth = big ? 4 : 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      for (const f of game.texts) {
        if (f.big !== big || f.t <= 0) continue;
        ctx.globalAlpha = Math.min(1, (f.t / f.max) * 2.5);
        const sc = 1 + f.pop * 0.35;
        if (sc > 1.02) { ctx.save(); ctx.translate(f.x, f.y); ctx.scale(sc, sc); ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0); ctx.restore(); }
        else { ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
      }
    }
    ctx.globalAlpha = 1; ctx.lineJoin = 'miter';
  }
  function drawZones() {
    for (const z of game.zones) {
      const k = Math.min(1, z.t / 0.5);
      ctx.globalAlpha = 0.9 * k;
      const zs = cached('zone:' + z.color, 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, rgba(z.color, 0.34)); gr.addColorStop(0.92, rgba(z.color, 0.1)); gr.addColorStop(1, rgba(z.color, 0)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      blit(zs, z.x, z.y, z.r * 2);
      if (!z.soft) {   // small trail patches are just a glow, no outline
        ctx.strokeStyle = z.color; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -game.time * 30;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      if (z.rain || z.snow) {
        ctx.strokeStyle = z.rain ? '#fde68a' : '#f0f9ff'; ctx.lineWidth = z.rain ? 2 : 3; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          // each streak falls through its own spot, then reappears somewhere new
          const cyc = game.time * (z.rain ? 3 : 1.2) + hash(i) * 7, n = Math.floor(cyc), u = cyc - n;
          const a = hash(i * 13 + n) * TAU, d = Math.sqrt(hash(i * 7 + n * 3)) * z.r * 0.95, x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d - (1 - u) * (z.rain ? 30 : 10);
          ctx.moveTo(x, y - (z.rain ? 12 : 2)); ctx.lineTo(x + (z.snow ? 2 : 0), y);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
    ctx.globalAlpha = 1;
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
        blit(lightSprite(f.color), f.x, f.y, f.r * 2 * (0.6 + (1 - k) * 0.45));
        ctx.strokeStyle = rgba(f.color, 0.8); ctx.lineWidth = 3 * k + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + (1 - k) * 0.55), 0, TAU); ctx.stroke();
      } else if (f.type === 'bolt') {
        if (!f.jag) {   // pick the zig-zag once, not every frame
          f.jag = [f.pts[0]];
          for (let i = 1; i < f.pts.length; i++) { const a = f.pts[i - 1], b = f.pts[i]; for (let s2 = 1; s2 <= 4; s2++) { const u = s2 / 4; f.jag.push({ x: a.x + (b.x - a.x) * u + (s2 < 4 ? rand(-9, 9) : 0), y: a.y + (b.y - a.y) * u + (s2 < 4 ? rand(-9, 9) : 0) }); } }
        }
        const line = () => { ctx.beginPath(); f.jag.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke(); };
        ctx.lineJoin = 'round';
        ctx.globalAlpha = k * 0.4; ctx.strokeStyle = f.color; ctx.lineWidth = 8; line();
        ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; line();
        ctx.lineJoin = 'miter';
      } else if (f.type === 'pillar') {
        const g = ctx.createLinearGradient(f.x, 0, f.x, f.y);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, f.color);
        ctx.fillStyle = g; ctx.fillRect(f.x - 9 * k, 0, 18 * k, f.y);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(f.x, f.y, 16 * k, 0, TAU); ctx.fill();
      } else if (f.type === 'mark') {
        // a warning circle where a meteor is about to land
        ctx.globalAlpha = 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = f.color + '33'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k), 0, TAU); ctx.fill();
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
    game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.particles = []; game.fx = []; game.zones = []; game.timers = []; game.texts = [];
    game.kills = 0; game.time = 0; game.shake = 0;
    game.waves = new WaveManager(); game.waves.startWave(1);
    Input.clear();
    UI.showPlaying();
  }
  function pause() { if (game.state !== 'playing') return; game.state = 'paused'; Input.clear(); UI.showPause(true); }
  function resume() { if (game.state !== 'paused') return; game.state = 'playing'; UI.showPause(false); }
  function toMenu() { game.state = 'menu'; game.player = null; game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.fx = []; game.zones = []; game.timers = []; game.texts = []; UI.showMenu(); }

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
      ab: $('abilities'), abName: $('abName'), stick: $('stick'), knob: $('knob'), aimStick: $('aimStick'), aimKnob: $('aimKnob'),
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
        ? '<b>Drag on the left</b> to move. You aim automatically, or <b>drag on the right</b> to aim yourself. Tap the <b>skill buttons</b> for your special moves. Collect <b>XP gems</b> to level up.'
        : 'Move with <b>WASD</b> or the <b>arrow keys</b>. You attack and aim automatically; <b>hold the mouse</b> to aim yourself. Use your three skills with <b>Q</b> (or Space), <b>E</b> and <b>R</b>. Collect <b>XP gems</b> to level up and choose upgrades.';
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
      $('cdSkills').innerHTML = '<div class="cd-label">SKILLS</div>' + c.abilities.map((sk, i) => '<div class="sk-row"><span class="sk-ic">' + sk.icon + '</span><div><div class="sk-nm">' + sk.name + ' <span class="sk-key">' + SKILL_KEYS[i] + '</span><span class="sk-cd">' + sk.cd + 's</span></div><div class="cd-small">' + sk.desc + '</div></div></div>').join('');
      $('cdPassive').textContent = c.passive.text; $('cdBest').textContent = this.bestFor(id);
      // rough 0..1 ratings for the stat bars
      const dps = c.attack.kind === 'deploy' ? 26 : (s.damage / s.cooldown) * (1 + s.crit * (s.critMult - 1));
      const rows = [['HEALTH', s.maxHp / 240], ['DAMAGE', Math.min(1, dps / 60)], ['SPEED', (s.speed - 150) / 160], ['RANGE', Math.min(1, s.range / 560)], ['DEFENSE', Math.min(1, Math.max(0.05, s.armor + s.block + s.evasion + 0.1) / 0.8)]];
      $('cdStats').innerHTML = rows.map(([n, v]) => '<div class="st-row">' + n + '<div class="st-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div></div>').join('');
    },
    update() {
      const p = game.player; if (!p) return;
      (this.abBtns || []).forEach((b, i) => {
        const cd = p.abilityTimers[i], cdMax = p.abilityCooldown(i);
        const pctv = cd > 0 ? Math.round((cd / cdMax) * 100) : 0;
        if (b.pct !== pctv) { b.pct = pctv; b.ring.style.setProperty('--cd', pctv + '%'); }
        const t = cd > 0 ? String(Math.ceil(cd)) : '';
        if (b.cd.textContent !== t) b.cd.textContent = t;
        if (b.ready !== (cd <= 0)) { b.ready = cd <= 0; b.el.classList.toggle('ready', b.ready); }
      });
      const buffs = [];
      if (p.buffs.rage > 0) buffs.push('🩸 Rage ' + Math.ceil(p.buffs.rage) + 's');
      if (p.buffs.might > 0) buffs.push('✨ +50% dmg ' + Math.ceil(p.buffs.might) + 's');
      if (p.whirl > 0) buffs.push('🌀 Whirlwind');
      const named = { cry: '📯 Battle Cry', fortify: '🧱 Fortify', divine: '🛡️ Divine', smoke: '🌫️ Hidden', inner: '☯️ Peace', frenzy: '🔗 Frenzy', overdrive: '⚙️ Overdrive', bear: '🐻 Bear', overclock: '🔋 Overclock', firetrail: '👣 Fire Trail' };
      for (const k in named) if (p.buffs[k] > 0) buffs.push(named[k] + ' ' + Math.ceil(p.buffs[k]) + 's');
      if (p.focusShots > 0) buffs.push('🎯 Crit ×' + p.focusShots);
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
    flashAbility(sk) { if (sk) this.el.abName.textContent = sk.icon + ' ' + sk.name; this.el.abName.classList.remove('hidden'); clearTimeout(this.abT); this.abT = setTimeout(() => this.el.abName.classList.add('hidden'), 1200); },
    hideAll() { for (const k of ['menu', 'pause', 'over', 'levelUp']) this.el[k].classList.add('hidden'); },
    showMenu() { this.hideAll(); this.selectClass(this.selected); this.el.menu.classList.remove('hidden'); this.el.hud.classList.add('hidden'); this.el.ab.classList.add('hidden'); this.el.abName.classList.add('hidden'); },
    showPlaying() {
      this.hideAll(); this.last = '';
      const c = game.cls;
      this.el.portraitIcon.textContent = c.icon; this.el.portraitIcon.parentElement.style.borderColor = c.color;
      this.el.heroName.textContent = c.name;
      // one button per skill
      this.el.ab.innerHTML = ''; this.abBtns = [];
      c.abilities.forEach((sk, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ab-btn' + (i === 0 ? ' main' : ''); b.title = sk.name + ' (' + SKILL_KEYS[i] + '): ' + sk.desc;
        b.innerHTML = '<span class="ab-ring"></span><span class="ab-icon">' + sk.icon + '</span><span class="ab-cd"></span><span class="ab-key">' + (isTouch ? sk.name.split(' ')[0].toUpperCase() : (i === 0 ? 'Q / SPC' : SKILL_KEYS[i])) + '</span>';
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (game.state === 'playing') game.player.useAbility(i); });
        this.el.ab.appendChild(b);
        this.abBtns.push({ el: b, ring: b.querySelector('.ab-ring'), cd: b.querySelector('.ab-cd') });
      });
      this.el.hud.classList.remove('hidden'); this.el.ab.classList.remove('hidden');
    },
    showPause(on) { this.el.pause.classList.toggle('hidden', !on); },
    // level up: pause and offer 3 upgrades
    choices: [], dealing: false,
    showLevelUp() {
      const p = game.player;
      game.state = 'levelup'; Input.clear();
      const pool = UPGRADES.filter((u) => !u.when || u.when(game.cls));
      this.choices = shuffle(pool.slice()).slice(0, 3).map((u) => ({ u, r: pickWeighted(RARITIES) }));
      $('luTitle').textContent = 'Level ' + (p.level - p.pendingLevels + 1);
      const box = $('luChoices'); box.innerHTML = '';
      this.choices.forEach(({ u, r }, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lcard r-' + r.id; b.style.setProperty('--i', i);
        b.innerHTML = '<div class="lc-inner">'
          + '<div class="lc-face lc-back"><div class="lc-sigil">⚜</div></div>'
          + '<div class="lc-face lc-front">'
          + '<div class="lc-rar">' + r.name + '</div>'
          + '<div class="lc-art"><span>' + u.icon + '</span></div>'
          + '<div class="lc-nm">' + u.name + '</div>'
          + '<div class="lc-ds">' + u.desc(r.k) + '</div>'
          + '<div class="lc-key">' + (i + 1) + '</div>'
          + '<div class="lc-shine"></div>'
          + '</div></div>';
        b.addEventListener('click', () => this.pickLevelUp(i));
        // tilt toward the pointer
        b.addEventListener('pointermove', (e) => {
          if (this.dealing) return;
          const rc = b.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width - 0.5, y = (e.clientY - rc.top) / rc.height - 0.5;
          b.style.setProperty('--rx', (-y * 14).toFixed(1) + 'deg'); b.style.setProperty('--ry', (x * 16).toFixed(1) + 'deg');
        });
        b.addEventListener('pointerleave', () => { b.style.setProperty('--rx', '0deg'); b.style.setProperty('--ry', '0deg'); });
        box.appendChild(b);
      });
      box.className = 'choices dealing';
      this.dealing = true;
      clearTimeout(this.dealT);
      this.dealT = setTimeout(() => { this.dealing = false; box.classList.remove('dealing'); }, 1250);
      this.el.levelUp.classList.remove('hidden');
    },
    pickLevelUp(i) {
      const c = this.choices[i]; if (!c || game.state !== 'levelup' || this.dealing || this.picking) return;
      const box = $('luChoices');
      this.picking = true;
      [...box.children].forEach((el, j) => el.classList.add(j === i ? 'picked' : 'dropped'));
      setTimeout(() => {
        this.picking = false;
        const p = game.player, { u, r } = c;
        u.apply(p.stats, p, r.k);
        p.hp = Math.min(p.hp, p.stats.maxHp);
        p.pendingLevels--;
        this.el.levelUp.classList.add('hidden');
        game.state = 'playing'; this.last = '';
        game.floatText(p.x, p.y - 30, u.icon + ' ' + u.name + (r.k > 1 ? ' (' + r.name + ')' : ''), r.k >= 3 ? '#fb923c' : r.k >= 2 ? '#c084fc' : r.k > 1 ? '#60a5fa' : '#fde68a', true);
        if (p.pendingLevels > 0) this.showLevelUp();
      }, 650);
    },
    showGameOver(wave, kills, time, level, isBest) {
      const m = Math.floor(time / 60), s = Math.floor(time % 60);
      this.el.overStats.innerHTML = 'As the <b>' + game.cls.name + '</b> you reached <b>wave ' + wave + '</b> and <b>level ' + level + '</b><br><b>' + kills + '</b> foes slain · survived <b>' + m + ':' + String(s).padStart(2, '0') + '</b>';
      this.el.newBest.classList.toggle('hidden', !isBest);
      this.el.ab.classList.add('hidden');
      setTimeout(() => { if (game.state === 'over') this.el.over.classList.remove('hidden'); }, 800);
    },
    showStick(x, y, aim = false) { const st = aim ? this.el.aimStick : this.el.stick; st.style.left = x + 'px'; st.style.top = y + 'px'; st.classList.remove('hidden'); this.moveKnob(0, 0, aim); },
    moveKnob(dx, dy, aim = false) { const l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1; (aim ? this.el.aimKnob : this.el.knob).style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)'; },
    hideStick(aim = false) { if (this.el) (aim ? this.el.aimStick : this.el.stick).classList.add('hidden'); },
  };

  // ===================================================================
  // 13. Main loop
  // ===================================================================
  let last = performance.now();
  // coming back to the tab shouldn't count the time away
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  function loop(now) {
    // real elapsed time; long frames are split into small steps so the game never slows down or skips through walls
    let dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
    if (game.state === 'playing') {
      while (dt > 0 && game.state === 'playing') { const step = Math.min(dt, 1 / 60); game.update(step); dt -= step; }
      UI.update();
    } else if (game.state === 'over') {
      dt = Math.min(dt, 0.05);
      for (const q of game.particles) q.update(dt); game.particles = game.particles.filter((q) => q.life > 0);
      for (const f of game.fx) f.t -= dt; game.fx = game.fx.filter((f) => f.t > 0);
      for (const f of game.texts) { f.t -= dt; f.y -= 38 * dt; } game.texts = game.texts.filter((f) => f.t > 0);
    }
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

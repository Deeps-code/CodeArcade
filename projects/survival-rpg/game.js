/* =====================================================================
   Wave Survivor: a top-down wave-survival RPG (plain Canvas, no libraries)

   Layout of this file:
     1. CONFIG          tunable numbers, enemy kinds, wave scaling
     2. CLASSES         the 18 heroes: stats, attack style, ability, passive
     3. UPGRADES        level-up choices
     4. SPRITES         optional images (everything falls back to shapes)
     5. Canvas/helpers
     6. Input           keyboard (WASD / arrows, Q/E/R = skills, aimed at the cursor;
                        Shift+Q/E/R = auto-cast on/off), hold mouse to aim attacks,
                        touch: left side = move stick, right side = aim stick,
                        drag a skill button to aim that skill
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
    xp: { magnet: 150 },   // gems within this distance lock on and fly to the hero
  };
  const ENEMY_TYPES = {
    grunt:   { name: 'Grunt',   radius: 14, hp: 24, speed: 85,  damage: 10, color: '#dc2626', fromWave: 1, weight: 6, xp: 1 },
    runner:  { name: 'Runner',  radius: 10, hp: 14, speed: 155, damage: 7,  color: '#ea580c', fromWave: 3, weight: 3, xp: 1 },
    brute:   { name: 'Brute',   radius: 24, hp: 90, speed: 55,  damage: 20, color: '#7c3aed', fromWave: 5, weight: 1.6, xp: 4 },
    spitter: { name: 'Spitter', radius: 13, hp: 30, speed: 70,  damage: 12, color: '#ca8a04', fromWave: 8, weight: 1.4, xp: 2, keepAway: 160 },
    // more variety: each of these has its own trick
    bat:      { name: 'Bat',      radius: 9,  hp: 12, speed: 175, damage: 6,  color: '#6d28d9', fromWave: 4,  weight: 2.2, xp: 1, zigzag: true, pad: 10 },
    bomber:   { name: 'Bomber',   radius: 13, hp: 26, speed: 105, damage: 28, color: '#334155', fromWave: 6,  weight: 1.3, xp: 2, bomb: true, pad: 5 },
    slime:    { name: 'Slime',    radius: 17, hp: 46, speed: 60,  damage: 12, color: '#65a30d', fromWave: 7,  weight: 1.4, xp: 2, split: 'slimelet' },
    slimelet: { name: 'Slimelet', radius: 9,  hp: 14, speed: 95,  damage: 6,  color: '#84cc16', fromWave: Infinity, weight: 0, xp: 1 },
    shaman:   { name: 'Shaman',   radius: 13, hp: 34, speed: 70,  damage: 8,  color: '#0f766e', fromWave: 9,  weight: 0.9, xp: 3, keepAway: 210, noShoot: true, healer: true, pad: 7 },
    knight:   { name: 'Knight',   radius: 18, hp: 70, speed: 62,  damage: 18, color: '#64748b', fromWave: 11, weight: 1.1, xp: 3, armor: 0.45, pad: 5 },
    wraith:   { name: 'Wraith',   radius: 14, hp: 40, speed: 110, damage: 14, color: '#93c5fd', fromWave: 13, weight: 1,   xp: 3, phase: true, pad: 4 },
    // bosses: one arrives every 10th wave (they take turns), never in the normal mix
    colossus: { name: 'Bone Colossus', radius: 48, hp: 1100, speed: 42,  damage: 22, color: '#a8a29e', fromWave: Infinity, weight: 0, xp: 60, boss: true },
    warlock:  { name: 'Flame Warlock', radius: 40, hp: 850,  speed: 70,  damage: 20, color: '#dc2626', fromWave: Infinity, weight: 0, xp: 60, boss: true },
    beast:    { name: 'Shadow Beast',  radius: 42, hp: 950,  speed: 92,  damage: 22, color: '#7c3aed', fromWave: Infinity, weight: 0, xp: 60, boss: true },
  };
  const BOSS_ORDER = ['colossus', 'warlock', 'beast'];
  const BOSS_EVERY = 10;
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
    { id: 'samurai', name: 'Samurai', icon: '⛩️', color: '#be123c', role: 'Melee · Dash',
      desc: 'A swift swordsman who cuts through the horde in a flash of steel, dashing again and again.',
      stats: { maxHp: 120, speed: 245, damage: 17, cooldown: 0.45, range: 78, crit: 0.15, critMult: 2.2, armor: 0.05 },
      attack: { kind: 'melee', arc: 1.9 }, passive: { text: 'Bushido: 15% crit chance, and critical hits deal 220% damage.' },
      ability: { id: 'quickdraw', name: 'Flash Cut', icon: '🗡️', cd: 0, desc: 'Dash forward, cutting every enemy in your path. No cooldown!' } },
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
    samurai: [
      { id: 'thousandcuts', name: 'Thousand Cuts', icon: '⚔️', cd: 9, desc: 'Blink between up to 8 nearby enemies, slashing each one.' },
      { id: 'sakura', name: 'Blossom Storm', icon: '🌸', cd: 12, desc: 'A whirl of cherry petals cuts everything near you for 4s, and you move 30% faster.' }],
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
    mouse: { down: false, x: 0, y: 0, seen: false },     // hold the mouse button to aim at the cursor
    skillDrag: null,   // a skill button being dragged to aim it: { i, id, ox, oy, a, k, on }
    // Desktop: skills cast with a key go toward the mouse cursor (when it's over the game).
    cursorCast(p) {
      if (!this.mouse.seen) return null;
      const dx = this.mouse.x - p.x, dy = this.mouse.y - p.y;
      return { a: dx || dy ? Math.atan2(dy, dx) : p.aim, x: this.mouse.x, y: this.mouse.y };
    },
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
    clear() { this.keys.clear(); this.touch.id = null; this.aimTouch.id = null; this.mouse.down = false; this.skillDrag = null; UI.hideStick(); UI.hideStick(true); },
  };
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); Input.keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); }
    if (game.state === 'playing') {
      const slot = e.code === 'Space' || e.code === 'KeyQ' ? 0 : e.code === 'KeyE' ? 1 : e.code === 'KeyR' ? 2 : -1;
      if (slot >= 0) {
        e.preventDefault();
        if (e.shiftKey && e.code !== 'Space') UI.toggleAuto(slot);
        else game.player.useAbility(slot, Input.cursorCast(game.player));
      }
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
    if (e.pointerType === 'mouse') { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; Input.mouse.seen = true; return; }
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
  // the cursor left the window: key-cast skills go back to auto-aim
  document.documentElement.addEventListener('mouseleave', () => { Input.mouse.seen = false; });
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
      this.autoRetry = cls.abilities.map(() => 0);   // auto-cast waits a moment after a skill refuses
      this.focusShots = 0; this.trailTick = 0;
      this.hurtTimer = 0; this.aim = 0; this.alive = true;
      // animation: weapon swing / recoil, casting pose, walking, leaps through the air
      this.swing = 0; this.swingMax = 0.2; this.swingArc = 2; this.swingKind = ''; this.castT = 0; this.moving = false; this.leap = null;
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
      this.moving = !!(mv.x || mv.y); this.mvx = mv.x;
      this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
      if (this.moving && !this.leap) {   // little dust puffs from the feet
        this.stepT = (this.stepT || 0) - dt;
        if (this.stepT <= 0 && game.particles.length < 450) {
          this.stepT = 0.2;
          const q = new Particle(this.x + rand(-6, 6), this.y + 20, 'rgba(168,162,158,0.7)');
          q.vx = rand(-18, 18) - mv.x * 40; q.vy = rand(-28, -8) - mv.y * 20; q.life = q.max = 0.35; q.size = rand(2.5, 4); game.particles.push(q);
        }
      }
      this.swing = Math.max(0, this.swing - dt); this.castT = Math.max(0, this.castT - dt); this.dashLock = Math.max(0, (this.dashLock || 0) - dt);
      const spd = this.stats.speed * (this.buffs.sakura > 0 ? 1.3 : 1);
      if (this.leap) this.updateLeap(dt);
      else { this.x += mv.x * spd * dt; this.y += mv.y * spd * dt; }
      this.clampTo(view);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      for (let i = 0; i < this.abilityTimers.length; i++) this.abilityTimers[i] = Math.max(0, this.abilityTimers[i] - dt);
      // auto-cast: skills switched to AUTO fire on their own as soon as they're ready (only while enemies are around)
      for (let i = 0; i < this.abilityTimers.length; i++) {
        if (!game.autoCast[i] || this.abilityTimers[i] > 0) continue;
        this.autoRetry[i] -= dt;
        if (this.autoRetry[i] > 0 || !game.enemies.some((e) => !e.dead)) continue;
        if (!this.useAbility(i)) this.autoRetry[i] = 0.3;
        else if (!this.cls.abilities[i].cd) this.autoRetry[i] = 0.7;   // no-cooldown skills: auto-cast at a sane pace
      }
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
        FX.muzzle(this.x + Math.cos(this.aim) * 30, this.y + Math.sin(this.aim) * 30 + 2, a.color);
      }
      this.swing = this.swingMax = melee ? 0.18 : 0.1; this.swingArc = Math.min(2.4, a.arc || 1.4); this.swingKind = a.kind;
      this.attackTimer = this.attackCooldown;
    }
    // aim: { a: angle, x, y: aimed point } to cast toward, or null for auto-aim. Returns true if it was cast.
    useAbility(i = 0, aim = null) {
      const sk = this.cls.abilities[i];
      if (!sk || this.abilityTimers[i] > 0 || !this.alive) return false;
      const fn = ABILITIES[sk.id];
      if (!fn) return false;
      castAim = aim;
      let ok;
      try { ok = fn(this) !== false; } finally { castAim = null; }   // the skill can refuse (e.g. no target)
      if (!ok) return false;
      this.aim = aim ? aim.a : this.aim;
      this.castT = 0.45; FX.cast(this, sk, i);
      this.abilityTimers[i] = this.abilityCooldown(i);
      UI.flashAbility(sk);
      return true;
    }
    // flying through the air (leaps, vaults, shield slam hop): position follows a smooth curve
    updateLeap(dt) {
      const L = this.leap; L.t += dt;
      const u = Math.min(1, L.t / L.max), e = u * u * (3 - 2 * u);
      this.x = L.x0 + (L.x1 - L.x0) * e; this.y = L.y0 + (L.y1 - L.y0) * e;
      L.ghost -= dt;
      if (L.ghost <= 0 && (L.x1 !== L.x0 || L.y1 !== L.y0)) { L.ghost = 0.045; FX.after(this, L.color); }
      if (u >= 1) { this.leap = null; if (L.onLand) L.onLand(); }
    }
    updateAbilityEffects(dt) {
      if (this.buffs.sakura > 0) {   // blossom storm: petals cut everything nearby
        this.sakuraTick = (this.sakuraTick || 0) - dt;
        if (this.sakuraTick <= 0) { this.sakuraTick = 0.25; Combat.area(this.x, this.y, this.stats.range * 1.7, this.stats.damage * 0.45, { knock: 0.4 }); }
      }
      if (this.whirl > 0) {
        this.whirl -= dt; this.whirlTick -= dt;
        if (this.whirlTick <= 0) { this.whirlTick = 0.2; Combat.area(this.x, this.y, this.stats.range * 1.3, this.stats.damage * 0.7, { knock: 1 }); FX.embers(this.x, this.y + 12, '#a8a29e', 5, 260); }
      }
      if (this.flurry > 0) {
        this.flurry -= dt; this.flurryTick -= dt;
        if (this.flurryTick <= 0) {
          this.flurryTick = 0.075; const fa = rand(0, TAU), fr = this.stats.range * rand(0.6, 1.1);
          Combat.melee(this.x, this.y, fa, this.stats.range * 1.2, 1.6, this.stats.damage * 0.8, { color: this.cls.color });
          FX.impact(this.x + Math.cos(fa) * fr, this.y + Math.sin(fa) * fr, '#fdba74', 22); this.aim = fa; this.swing = this.swingMax = 0.07;
        }
      }
      if (this.storm > 0) {
        this.stormTick -= dt;
        if (this.stormTick <= 0) {
          this.stormTick = 0.18; this.storm--;
          FX.add({ type: 'ring', x: this.x, y: this.y, r0: 14, r1: 60, color: '#fde68a', t: 0.2, max: 0.2, w: 4 }); game.shake = Math.max(game.shake, 4);
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
      this.hurtTimer = CONFIG.player.hurtCooldown; this.hurtFlash = 0.18;
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
      const blink = this.hurtTimer > 0 && !this.leap && Math.floor(this.hurtTimer * 20) % 2 === 0;
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
      const sd = Input.skillDrag;
      if (sd && sd.on) {   // aiming a skill: line + target circle
        const len = sd.k * SKILL_REACH, tx = this.x + Math.cos(sd.a) * len, ty = this.y + Math.sin(sd.a) * len;
        ctx.strokeStyle = 'rgba(248,113,113,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(248,113,113,0.15)'; ctx.beginPath(); ctx.arc(tx, ty, 34, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (Input.aimAngle(this) !== null) {   // manual-aim guide line
        const ax = Math.cos(this.aim), ay = Math.sin(this.aim), len = Math.min(this.stats.range || 200, 220);
        ctx.strokeStyle = 'rgba(245,215,122,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(this.x + ax * (r + 12), this.y + ay * (r + 12)); ctx.lineTo(this.x + ax * len, this.y + ay * len); ctx.stroke();
        ctx.setLineDash([]);
      }
      drawAuras(this, false);
      ctx.globalAlpha = (this.buffs.smoke > 0 ? 0.45 : 1) * (blink ? 0.35 : 1);
      if (drawSprite(ctx, c.id, this.x, this.y, r, this.aim)) { ctx.globalAlpha = 1; return; }
      this.drawHero(ctx, bear ? 'bear' : c.id);
      ctx.globalAlpha = 1;
      drawAuras(this, true);
    }
    // the hand-drawn hero (heroes.js) with a live weapon that follows the aim and swings
    drawHero(ctx, id) {
      const L = this.leap, lift = L ? Math.sin(Math.min(1, L.t / L.max) * Math.PI) * L.h : 0;
      const sh = 1 - Math.min(0.5, lift / 140);
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 21, 13 * sh, 4.6 * sh, 0, 0, TAU); ctx.fill();
      const face = Math.cos(this.aim) < 0 ? -1 : 1, t = game.time;
      const bob = this.moving && !L ? -Math.abs(Math.sin(t * 11)) * 2.6 : 0;
      const cast = this.castT > 0 ? this.castT / 0.45 : 0;
      const sc = 1.12 * (1 + Math.sin(cast * Math.PI) * 0.14);
      const w = HeroArt.weapon(id);
      let wa = face < 0 ? Math.PI - this.aim : this.aim, kick = 0;
      if (this.swing > 0) {
        const pr = 1 - this.swing / this.swingMax;
        if (this.swingKind === 'thrust') kick = Math.sin(pr * Math.PI) * 10;
        else if (w.melee) wa += (pr - 0.5) * this.swingArc;
        else kick = -4 * (this.swing / this.swingMax);
      } else if (w.melee) wa -= 0.35;   // at rest the weapon is held up a little
      if (cast > 0) wa = wa * (1 - cast) - 1.3 * cast;   // raise it high while casting
      if (L) wa -= 0.8;
      // squash & stretch: breathing when idle, a bouncy step when walking, a lunge on melee hits, a flinch when hurt
      let sx = 1, sy = 1, lx = 0, ly = 0, lean = 0;
      if (this.moving && !L) { const st = Math.abs(Math.sin(t * 11)) - 0.5; sy = 1 + st * 0.07; sx = 1 - st * 0.05; lean = clamp(this.mvx || 0, -1, 1) * 0.1 + Math.sin(t * 11) * 0.04; }
      else { sy = 1 + Math.sin(t * 2.6) * 0.02; sx = 1 - Math.sin(t * 2.6) * 0.014; }
      if (this.swing > 0 && w.melee) { const lu = Math.sin((1 - this.swing / this.swingMax) * Math.PI); lx = Math.cos(this.aim) * lu * 4.5; ly = Math.sin(this.aim) * lu * 4.5; sx *= 1 + lu * 0.06; sy *= 1 - lu * 0.05; }
      if (this.hurtFlash > 0) { const hk = this.hurtFlash / 0.18; sx *= 1 + hk * 0.1; sy *= 1 - hk * 0.1; lx += rand(-1.5, 1.5) * hk; }
      ctx.save();
      ctx.translate(this.x + lx, this.y + 21 + bob - lift + ly);   // scale around the feet so squashes stay on the ground
      ctx.rotate(lean);
      ctx.scale(face * sc * sx, sc * sy);
      ctx.translate(0, -19);
      ctx.drawImage((this.hurtFlash > 0 ? heroHurtSprite(id) : heroSprite(id)).c, -32, -40, 64, 64);
      // the weapon is always held in front of the body
      ctx.save(); ctx.translate(10.8, 6.2); ctx.rotate(wa); ctx.translate(kick, 0); HeroArt.drawWeapon(ctx, id, t); ctx.restore();
      ctx.restore();
    }
  }
  // the hero's body (artwork in heroes.js), drawn once per hero: origin at (32, 40) in a 64x64 box
  function heroSprite(id) { return cached('hero2:' + id, 64, 64, (g) => { g.translate(32, 40); HeroArt.drawBody(g, id); }); }
  // the same body tinted red, flashed for a moment when the hero gets hit
  function heroHurtSprite(id) {
    return cached('hero2h:' + id, 64, 64, (g) => { g.translate(32, 40); HeroArt.drawBody(g, id); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,70,70,0.6)'; g.fillRect(-32, -40, 64, 64); });
  }
  // a portrait image (data URL) for the menus and HUD
  const heroImgs = {};
  const heroImg = (id, px) => heroImgs[id + px] || (heroImgs[id + px] = HeroArt.portrait(id, px).toDataURL());
  // glowing effects that hang around the hero while a skill or buff is active
  function drawAuras(p, front) {
    const t = game.time, x = p.x, y = p.y;
    if (!front) {
      if (p.buffs.divine > 0) {   // golden wings
        for (const sd of [-1, 1]) {
          ctx.save(); ctx.translate(x + sd * 5, y - 4); ctx.scale(sd, 1); ctx.rotate(-0.2 + Math.sin(t * 7) * 0.18);
          ctx.fillStyle = 'rgba(254,243,199,0.9)'; ctx.strokeStyle = '#eab308'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(16, -30, 40, -24); ctx.quadraticCurveTo(33, -15, 36, -8); ctx.quadraticCurveTo(26, -6, 29, 1); ctx.quadraticCurveTo(18, 1, 16, 8); ctx.quadraticCurveTo(6, 6, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; blit(lightSprite('#fde68a', 'rgba(255,255,255,0.4)'), x, y - 4, 110); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (p.buffs.rage > 0 || p.buffs.bear > 0 && p.buffs.cry > 0) {   // flames of rage
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, fx = x + Math.cos(a) * 15, fy = y + 10 + Math.sin(a) * 7, h = 16 + hash(i + Math.floor(t * 14) * 13) * 14;
          ctx.fillStyle = i % 2 ? 'rgba(239,68,68,0.55)' : 'rgba(251,146,60,0.45)';
          ctx.beginPath(); ctx.moveTo(fx - 5, fy); ctx.quadraticCurveTo(fx - 2, fy - h * 0.6, fx + Math.sin(t * 9 + i) * 3, fy - h); ctx.quadraticCurveTo(fx + 2, fy - h * 0.6, fx + 5, fy); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (p.buffs.frenzy > 0) {   // soul links to every minion
        ctx.strokeStyle = 'rgba(94,234,212,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); for (const m of game.minions) if (m.kind !== 'mine' && m.kind !== 'turret') { ctx.moveTo(x, y); ctx.lineTo(m.x, m.y); } ctx.stroke(); ctx.setLineDash([]);
      }
      return;
    }
    if (p.whirl > 0) {   // three swords spinning around the warrior
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(x, y + 2); ctx.rotate(t * 17 + i * (TAU / 3)); ctx.translate(14, 0); ctx.scale(1.3, 1.3); HeroArt.drawWeapon(ctx, 'warrior', t); ctx.restore(); }
    }
    if (p.buffs.sakura > 0) {   // cherry petals swirling around the samurai
      const R = p.stats.range;
      for (let i = 0; i < 16; i++) {
        const a = t * (2.2 + (i % 3) * 0.6) + (i / 16) * TAU, rr = R * (0.7 + (i % 4) * 0.28);
        ctx.save(); ctx.translate(x + Math.cos(a) * rr, y + 2 + Math.sin(a) * rr); ctx.rotate(a * 2);
        ctx.fillStyle = i % 2 ? 'rgba(251,207,232,0.9)' : 'rgba(249,168,212,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    if (p.buffs.fortify > 0) {   // stone-blue plates orbiting
      for (let i = 0; i < 6; i++) {
        const a = t * 1.4 + (i / 6) * TAU, px = x + Math.cos(a) * 30, py = y + Math.sin(a) * 30;
        ctx.fillStyle = 'rgba(96,165,250,0.35)'; ctx.strokeStyle = 'rgba(191,219,254,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); for (let j = 0; j < 6; j++) { const b = a + (j / 6) * TAU; j ? ctx.lineTo(px + Math.cos(b) * 8, py + Math.sin(b) * 8) : ctx.moveTo(px + Math.cos(b) * 8, py + Math.sin(b) * 8); } ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (p.buffs.inner > 0) {   // lotus petals
      for (let i = 0; i < 8; i++) {
        const a = t * 1.6 + (i / 8) * TAU;
        ctx.save(); ctx.translate(x + Math.cos(a) * 27, y + 2 + Math.sin(a) * 27); ctx.rotate(a);
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.75)' : 'rgba(251,207,232,0.75)'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    if (p.buffs.overdrive > 0 || p.buffs.overclock > 0) {   // crackling sparks
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = hash(i + Math.floor(t * 20) * 7) * TAU, d = 16 + hash(i * 5 + Math.floor(t * 20)) * 10, sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d; ctx.moveTo(sx, sy); ctx.lineTo(sx + rand(-6, 6), sy + rand(-6, 6)); }
      ctx.stroke();
    }
  }

  // ---- boss brains ----
  const smooth = (u) => u * u * (3 - 2 * u);
  const BOSS_AI = {
    // slow giant: leaps onto the hero (the landing spot is marked) and calls in grunts
    colossus(e, p, dt, ux, uy, d) {
      if (e.slam) {
        const S = e.slam; S.t -= dt;
        const u = Math.min(1, 1 - S.t / S.max);
        e.lift = Math.sin(u * Math.PI) * 90;
        e.x = S.x0 + (S.x1 - S.x0) * smooth(u); e.y = S.y0 + (S.y1 - S.y0) * smooth(u);
        if (S.t <= 0) {
          e.slam = null; e.lift = 0;
          if (dist2(e, p) < (150 + p.radius) ** 2) p.takeDamage(Math.round(e.damage * 1.4));
          FX.shock(e.x, e.y, 165, '#a3e635'); FX.embers(e.x, e.y, '#a8a29e', 20, 300); FX.flash('#1a2e05', 0.25); game.shake = 18;
        }
        return;
      }
      if (e.stun > 0) return;
      e.walk(ux, uy, 1, dt);
      if (e.bt.a <= 0 && e.entered && d < 560) {
        e.bt.a = 5.2;
        e.slam = { t: 1.15, max: 1.15, x0: e.x, y0: e.y, x1: p.x, y1: p.y };
        FX.add({ type: 'mark', x: p.x, y: p.y, r: 150, color: '#a3e635', t: 1.15, max: 1.15, ground: true });
      }
      if (e.bt.c <= 0) {
        e.bt.c = 11;
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU, x = clamp(e.x + Math.cos(a) * 90, 30, view.w - 30), y = clamp(e.y + Math.sin(a) * 90, 30, view.h - 30); FX.portal(x, y, 22, '#a3e635'); game.waves.spawnAt('grunt', x, y); }
      }
    },
    // keeps its distance, fires rings and fans of fireballs, and teleports away
    warlock(e, p, dt, ux, uy, d) {
      e.lift = 10 + Math.sin(game.time * 2.5) * 5;
      if (e.stun > 0) return;
      e.walk(ux, uy, d > 320 ? 1 : d < 220 ? -0.8 : 0, dt);
      e.x += -uy * 45 * e.side * dt; e.y += ux * 45 * e.side * dt;   // circles around the hero
      if (e.bt.a <= 0) {   // fan aimed at the hero
        e.bt.a = 2.1; const a = Math.atan2(uy, ux);
        for (let i = -2; i <= 2; i++) e.bossShot(a + i * 0.17, 300);
      }
      if (e.bt.b <= 0) {   // a ring in every direction
        e.bt.b = 3.4; const off = rand(0, TAU), n = 14 + e.tier * 2;
        for (let i = 0; i < n; i++) e.bossShot(off + (i / n) * TAU, 190, 8);
        FX.shock(e.x, e.y, 70, '#f97316', { noCracks: true });
      }
      if (e.bt.c <= 0 && e.entered) {   // teleport
        e.bt.c = 7; FX.portal(e.x, e.y, 42, '#f97316');
        for (let tries = 0; tries < 12; tries++) {
          const x = rand(80, view.w - 80), y = rand(80, view.h - 80);
          if ((x - p.x) ** 2 + (y - p.y) ** 2 > 260 * 260) { e.x = x; e.y = y; break; }
        }
        FX.portal(e.x, e.y, 42, '#f97316'); FX.flash('#7f1d1d', 0.15); e.side *= -1;
      }
    },
    // fast predator: flashes a warning line, then charges; roars to knock you back
    beast(e, p, dt, ux, uy, d) {
      if (e.charge) {
        const C = e.charge; C.t -= dt;
        if (C.phase === 'wind') { if (C.t <= 0) { C.phase = 'go'; C.t = 0.62; game.shake = 6; } return; }
        e.x += Math.cos(C.a) * 780 * dt; e.y += Math.sin(C.a) * 780 * dt;
        if (Math.random() < 0.7) FX.embers(e.x, e.y + e.radius * 0.6, '#57534e', 2, 120);
        const m = e.radius, hitWall = e.x < m || e.y < m || e.x > view.w - m || e.y > view.h - m;
        if (hitWall) { FX.shock(clamp(e.x, m, view.w - m), clamp(e.y, m, view.h - m), 110, '#a855f7'); game.shake = 12; e.stun = Math.max(e.stun, 0.6); }
        if (C.t <= 0 || hitWall) e.charge = null;
        return;
      }
      if (e.stun > 0) return;
      e.walk(ux, uy, 1, dt);
      if (e.bt.a <= 0 && e.entered && d < 620) {
        e.bt.a = Math.max(2.2, 3.8 - e.tier * 0.3); const a = Math.atan2(uy, ux);
        e.charge = { phase: 'wind', t: 0.8, a };
        FX.add({ type: 'warnline', x: e.x, y: e.y, angle: a, len: 780 * 0.62, w: e.radius * 2, t: 0.8, max: 0.8, ground: true });
      }
      if (e.bt.c <= 0) {
        e.bt.c = 10;
        for (let i = 0; i < 3; i++) FX.add({ type: 'ring', x: e.x, y: e.y, r0: 30, r1: 230, color: '#a855f7', t: 0.5, max: 0.5, delay: i * 0.12, w: 10 });
        if (d < 230 + p.radius) { p.takeDamage(Math.round(e.damage * 0.8)); }
        for (let i = 0; i < 3; i++) game.waves.spawnAt('runner', clamp(e.x + rand(-80, 80), 30, view.w - 30), clamp(e.y + rand(-80, 80), 30, view.h - 30));
        FX.flash('#3b0764', 0.25); game.shake = 10;
      }
    },
  };
  // ---- boss looks: the body is drawn once, eyes / glows / props live ----
  function bossSprite(type) {
    const r = ENEMY_TYPES[type].radius, w = r * 2 + 64;
    return cached('boss:' + type, w, w, (g) => {
      const m = w / 2, cy = m + 4, INK = 'rgba(18,10,6,0.9)';
      const shp = (path, fillStyle, lw = 2.5) => { g.beginPath(); path(); g.fillStyle = fillStyle; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); };
      const radg = (x, y, rr, c) => { const gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr * 1.05); gr.addColorStop(0, shade(c, 0.35)); gr.addColorStop(0.65, c); gr.addColorStop(1, shade(c, -0.45)); return gr; };
      if (type === 'colossus') {
        for (const sd of [-1, 1]) shp(() => { g.moveTo(m + sd * r * 0.4, cy - r * 0.62); g.quadraticCurveTo(m + sd * r * 1.25, cy - r * 0.9, m + sd * r * 1.05, cy - r * 1.5); g.quadraticCurveTo(m + sd * r * 0.85, cy - r * 1.0, m + sd * r * 0.15, cy - r * 0.82); g.closePath(); }, radg(m + sd * r * 0.8, cy - r * 1.1, r * 0.5, '#e7e5e4'));
        for (const sd of [-1, 1]) shp(() => g.arc(m + sd * r * 1.02, cy + r * 0.35, r * 0.36, 0, TAU), radg(m + sd * r, cy + r * 0.3, r * 0.36, '#78716c'));
        shp(() => g.ellipse(m, cy, r, r * 0.92, 0, 0, TAU), radg(m, cy, r, '#78716c'), 3);
        g.fillStyle = 'rgba(101,163,13,0.55)'; for (const [x, y, rr] of [[-0.55, 0.35, 0.18], [0.6, 0.5, 0.14], [0.2, 0.7, 0.12]]) { g.beginPath(); g.ellipse(m + x * r, cy + y * r, rr * r, rr * r * 0.6, 0, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(28,25,23,0.6)'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(m, cy + r * 0.25 + i * r * 0.17, r * (0.55 - i * 0.08), Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
        shp(() => g.ellipse(m, cy - r * 0.3, r * 0.56, r * 0.48, 0, 0, TAU), radg(m, cy - r * 0.3, r * 0.56, '#e7e5e4'));
        g.fillStyle = '#0c0a09'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(m + sd * r * 0.22, cy - r * 0.36, r * 0.14, r * 0.16, 0, 0, TAU); g.fill(); }
        g.beginPath(); g.moveTo(m, cy - r * 0.2); g.lineTo(m - r * 0.06, cy - r * 0.08); g.lineTo(m + r * 0.06, cy - r * 0.08); g.closePath(); g.fill();
        g.fillStyle = '#1c1917'; g.fillRect(m - r * 0.32, cy - r * 0.02, r * 0.64, r * 0.12);
        g.fillStyle = '#f5f5f4'; for (let i = 0; i < 6; i++) g.fillRect(m - r * 0.3 + i * r * 0.105, cy - r * 0.02, r * 0.07, r * 0.1);
      } else if (type === 'warlock') {
        shp(() => { g.moveTo(m - r * 0.45, cy - r * 0.3); g.quadraticCurveTo(m - r * 1.05, cy + r * 0.4, m - r * 0.95, cy + r * 1.05); for (let i = 0; i <= 6; i++) g.lineTo(m - r * 0.95 + i * r * 0.317, cy + r * (i % 2 ? 0.85 : 1.05)); g.quadraticCurveTo(m + r * 1.05, cy + r * 0.4, m + r * 0.45, cy - r * 0.3); g.closePath(); }, (() => { const gr = g.createLinearGradient(0, cy - r * 0.3, 0, cy + r); gr.addColorStop(0, '#b91c1c'); gr.addColorStop(1, '#450a0a'); return gr; })(), 3);
        g.strokeStyle = '#fbbf24'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(m, cy - r * 0.2); g.lineTo(m, cy + r * 0.95); g.stroke();
        for (const sd of [-1, 1]) shp(() => g.ellipse(m + sd * r * 0.72, cy + r * 0.15, r * 0.24, r * 0.42, sd * -0.4, 0, TAU), radg(m + sd * r * 0.7, cy + r * 0.1, r * 0.4, '#991b1b'));
        g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(m, cy + r * 0.12, r * 0.12, 0, TAU); g.fill(); g.fillStyle = '#f97316'; g.beginPath(); g.arc(m, cy + r * 0.12, r * 0.06, 0, TAU); g.fill();
        for (let i = -2; i <= 2; i++) shp(() => { const x = m + i * r * 0.17, b = cy - r * 0.82; g.moveTo(x - r * 0.1, b); g.quadraticCurveTo(x - r * 0.06, b - r * 0.3, x, b - r * (0.45 + (2 - Math.abs(i)) * 0.12)); g.quadraticCurveTo(x + r * 0.08, b - r * 0.25, x + r * 0.1, b); g.closePath(); }, i % 2 ? '#fbbf24' : '#f97316', 1.5);
        shp(() => g.arc(m, cy - r * 0.45, r * 0.5, 0, TAU), radg(m, cy - r * 0.45, r * 0.5, '#7f1d1d'), 3);
        g.fillStyle = '#0c0a09'; g.beginPath(); g.ellipse(m, cy - r * 0.38, r * 0.33, r * 0.3, 0, 0, TAU); g.fill();
      } else {
        for (let i = 0; i < 7; i++) shp(() => { const x = m - r * 0.75 + i * r * 0.25, b = cy - r * 0.55 + Math.abs(i - 3) * r * 0.08; g.moveTo(x - r * 0.12, b + r * 0.1); g.lineTo(x, b - r * (0.45 - Math.abs(i - 3) * 0.06)); g.lineTo(x + r * 0.12, b + r * 0.1); g.closePath(); }, '#2e1065', 2);
        for (const sd of [-1, 1]) { shp(() => g.ellipse(m + sd * r * 0.85, cy + r * 0.55, r * 0.3, r * 0.22, 0, 0, TAU), radg(m + sd * r * 0.85, cy + r * 0.5, r * 0.3, '#4c1d95')); g.fillStyle = '#f5f5f4'; for (let k = -1; k <= 1; k++) { g.beginPath(); const x = m + sd * r * 0.85 + k * r * 0.12; g.moveTo(x - r * 0.04, cy + r * 0.7); g.lineTo(x, cy + r * 0.86); g.lineTo(x + r * 0.04, cy + r * 0.7); g.fill(); } }
        shp(() => g.ellipse(m, cy, r * 1.05, r * 0.85, 0, 0, TAU), radg(m, cy, r, '#5b21b6'), 3);
        g.fillStyle = 'rgba(167,139,250,0.35)'; g.beginPath(); g.ellipse(m, cy + r * 0.3, r * 0.6, r * 0.4, 0, 0, TAU); g.fill();
        for (const sd of [-1, 1]) shp(() => { g.moveTo(m + sd * r * 0.5, cy - r * 0.55); g.lineTo(m + sd * r * 0.75, cy - r * 1.0); g.lineTo(m + sd * r * 0.25, cy - r * 0.7); g.closePath(); }, '#3b0764', 2);
        shp(() => g.ellipse(m, cy + r * 0.25, r * 0.62, r * 0.34, 0, 0, TAU), '#450a0a', 2.5);
        g.fillStyle = '#f8fafc'; for (let i = 0; i < 7; i++) { const x = m - r * 0.5 + i * r * 0.166; g.beginPath(); g.moveTo(x - r * 0.06, cy + r * 0.0); g.lineTo(x, cy + r * 0.16); g.lineTo(x + r * 0.06, cy + r * 0.0); g.fill(); g.beginPath(); g.moveTo(x - r * 0.05, cy + r * 0.52); g.lineTo(x, cy + r * 0.38); g.lineTo(x + r * 0.05, cy + r * 0.52); g.fill(); }
      }
    });
  }
  const BOSS_EYES = { colossus: { y: -0.36, x: 0.22, c: '#a3e635', s: 7 }, warlock: { y: -0.42, x: 0.13, c: '#fb923c', s: 6 }, beast: { y: -0.22, x: 0.32, c: '#ef4444', s: 6.5 } };
  function drawBoss(e, player) {
    const r = e.radius, lift = e.lift || 0, sh = 1 - Math.min(0.5, lift / 180);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.85, r * 1.05 * sh, r * 0.35 * sh, 0, 0, TAU); ctx.fill();
    const y = e.y - lift + Math.sin(e.wobble) * 1.5;
    // an aura so it reads as a boss
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(game.time * 3) * 0.1;
    blit(lightSprite(e.def.color, 'rgba(255,255,255,0.08)'), e.x, y, r * 3.6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (e.type === 'warlock') for (let i = 0; i < 3; i++) { const a = game.time * 2 + (i / 3) * TAU; ctx.globalCompositeOperation = 'lighter'; const gs = glowSprite('#fb923c', 6); blit(gs, e.x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 0.9, gs.w); ctx.globalCompositeOperation = 'source-over'; }
    const sp = bossSprite(e.type);
    ctx.drawImage(sp.c, e.x - sp.w / 2, y - sp.w / 2 - 4, sp.w, sp.h);
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; ctx.drawImage(sp.c, e.x - sp.w / 2, y - sp.w / 2 - 4, sp.w, sp.h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // glowing eyes (brighter while winding up an attack)
    const E = BOSS_EYES[e.type], hot = e.slam || (e.charge && e.charge.phase === 'wind') ? 1.6 : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const sd of [-1, 1]) { const gs = glowSprite(E.c, E.s * hot); blit(gs, e.x + sd * r * E.x, y + r * E.y, gs.w); }
    ctx.globalCompositeOperation = 'source-over';
    if (e.frozen > 0) { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, y, r + 6, 0, TAU); ctx.stroke(); }
    if (e.stun > 0 && e.frozen <= 0) { ctx.fillStyle = '#fde047'; for (let i = 0; i < 4; i++) { const aa = game.time * 4 + i * (TAU / 4); ctx.beginPath(); ctx.arc(e.x + Math.cos(aa) * r * 0.7, y - r - 14 + Math.sin(aa) * 4, 3.5, 0, TAU); ctx.fill(); } }
    if (e.burn) { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const k = (game.time * 1.8 + i / 4) % 1; ctx.globalAlpha = 1 - k; const gs = glowSprite('#f97316', 4); blit(gs, e.x + (hash(i) - 0.5) * r * 1.4, y - k * r * 1.2, gs.w); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }

  // each enemy type is drawn once (normal / hit flash / frozen) and then copied
  function enemySprite(type, state) {
    const t = ENEMY_TYPES[type], r = t.radius;
    if (t._dpr !== view.dpr) { t._dpr = view.dpr; t._spr = []; }
    if (t._spr[state]) return t._spr[state];
    const pad = (t.pad || 0) * 2;
    return (t._spr[state] = cached('en:' + type + ':' + state, r * 2 + 18 + pad, r * 2 + 18 + pad, (g, w) => {
      const m = w / 2, cy = m - 2;
      const base = state === 1 ? shade(t.color, 0.6) : state === 2 ? '#bae6fd' : t.color, dark = shade(state === 1 ? t.color : base, -0.55);   // a hit is a bright tint, not a white blob
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(m, cy + r * 0.88, r, r * 0.36, 0, 0, TAU); g.fill();
      // things that stick out behind the body
      g.fillStyle = state === 0 ? shade(t.color, -0.5) : dark;
      if (type === 'grunt') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(m + sd * r * 0.35, cy - r * 0.8); g.lineTo(m + sd * r * 0.75, cy - r * 1.35); g.lineTo(m + sd * r * 0.78, cy - r * 0.55); g.fill(); }
      if (type === 'runner') for (let i = 0; i < 4; i++) { const a = -Math.PI * 0.85 + i * 0.42; g.beginPath(); g.moveTo(m + Math.cos(a - 0.2) * r * 0.85, cy + Math.sin(a - 0.2) * r * 0.85); g.lineTo(m + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5); g.lineTo(m + Math.cos(a + 0.2) * r * 0.85, cy + Math.sin(a + 0.2) * r * 0.85); g.fill(); }
      if (type === 'bat') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(m + sd * r * 0.5, cy - r * 0.3); g.quadraticCurveTo(m + sd * r * 1.5, cy - r * 1.4, m + sd * r * 2.0, cy - r * 0.1); g.lineTo(m + sd * r * 1.6, cy + r * 0.15); g.lineTo(m + sd * r * 1.3, cy - r * 0.1); g.lineTo(m + sd * r * 1.0, cy + r * 0.3); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.stroke(); }
      if (type === 'bat') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(m + sd * r * 0.2, cy - r * 0.8); g.lineTo(m + sd * r * 0.6, cy - r * 1.4); g.lineTo(m + sd * r * 0.75, cy - r * 0.6); g.fill(); }
      if (type === 'shaman') for (let i = -1; i <= 1; i++) { g.fillStyle = i ? '#ef4444' : '#facc15'; g.beginPath(); g.ellipse(m + i * r * 0.45, cy - r * 1.05, r * 0.16, r * 0.5, i * 0.4, 0, TAU); g.fill(); }
      if (type === 'knight') { g.fillStyle = '#dc2626'; g.beginPath(); g.ellipse(m, cy - r * 1.0, r * 0.18, r * 0.42, 0, 0, TAU); g.fill(); }
      if (type === 'bomber') { g.strokeStyle = '#a8a29e'; g.lineWidth = 2; g.beginPath(); g.moveTo(m + r * 0.2, cy - r * 0.9); g.quadraticCurveTo(m + r * 0.6, cy - r * 1.4, m + r * 0.55, cy - r * 1.25); g.stroke(); }
      // body
      const gr = g.createRadialGradient(m - r * 0.35, cy - r * 0.45, r * 0.1, m, cy, r * 1.1);
      gr.addColorStop(0, shade(base, 0.45)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.45));
      g.fillStyle = gr; g.beginPath();
      if (type === 'brute') { if (g.roundRect) g.roundRect(m - r, cy - r, r * 2, r * 2, r * 0.38); else g.rect(m - r, cy - r, r * 2, r * 2); }
      else if (type === 'slime' || type === 'slimelet') { g.moveTo(m - r * 1.1, cy + r * 0.75); g.quadraticCurveTo(m - r * 1.2, cy - r * 0.9, m, cy - r); g.quadraticCurveTo(m + r * 1.2, cy - r * 0.9, m + r * 1.1, cy + r * 0.75); g.quadraticCurveTo(m, cy + r * 1.05, m - r * 1.1, cy + r * 0.75); g.closePath(); }
      else if (type === 'wraith') { g.arc(m, cy - r * 0.1, r, Math.PI, 0); g.lineTo(m + r, cy + r * 0.8); for (let i = 1; i <= 5; i++) g.lineTo(m + r - i * r * 0.4, cy + r * (i % 2 ? 0.45 : 0.95)); g.closePath(); }
      else g.arc(m, cy, r, 0, TAU);
      g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      if (type === 'brute') {
        // armor plates and rivets
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(m - r + 2, cy + r * 0.25, r * 2 - 4, r * 0.3);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (const [dx, dy] of [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]]) { g.beginPath(); g.arc(m + dx * r, cy + dy * r, 2, 0, TAU); g.fill(); }
      }
      if (type === 'slime' || type === 'slimelet') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(m + r * 0.4, cy + r * 0.3, r * 0.14, r * 0.1, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(m - r * 0.5, cy + r * 0.45, r * 0.08, 0, TAU); g.fill(); }
      if (type === 'shaman') { g.fillStyle = '#f5f5f4'; g.beginPath(); if (g.roundRect) g.roundRect(m - r * 0.75, cy - r * 0.42, r * 1.5, r * 0.6, r * 0.2); else g.rect(m - r * 0.75, cy - r * 0.42, r * 1.5, r * 0.6); g.fill(); g.fillStyle = '#b91c1c'; g.fillRect(m - r * 0.06, cy - r * 0.4, r * 0.12, r * 0.56); }
      if (type === 'knight') {   // helmet band, rivets and a big shield in front
        g.fillStyle = 'rgba(15,23,42,0.55)'; g.fillRect(m - r * 0.8, cy - r * 0.32, r * 1.6, r * 0.42);
        g.fillStyle = '#1e3a8a'; g.strokeStyle = '#facc15'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(m - r * 0.55, cy + r * 0.2); g.lineTo(m + r * 0.55, cy + r * 0.2); g.lineTo(m + r * 0.5, cy + r * 0.75); g.quadraticCurveTo(m, cy + r * 1.15, m - r * 0.5, cy + r * 0.75); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#facc15'; g.fillRect(m - r * 0.06, cy + r * 0.3, r * 0.12, r * 0.55); g.fillRect(m - r * 0.3, cy + r * 0.48, r * 0.6, r * 0.12);
      }
      if (type === 'bomber') { g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(m, cy + r * 0.45, r * 0.22, 0, TAU); g.fill(); g.fillStyle = '#334155'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(m + sd * r * 0.08, cy + r * 0.42, r * 0.06, 0, TAU); g.fill(); } }
      if (type === 'wraith') { g.fillStyle = 'rgba(30,58,138,0.55)'; g.beginPath(); g.ellipse(m, cy + r * 0.35, r * 0.22, r * 0.3, 0, 0, TAU); g.fill(); }
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
    constructor(typeKey, x, y, scale, tier = 1) {
      const t = ENEMY_TYPES[typeKey];
      this.type = typeKey; this.def = t; this.x = x; this.y = y; this.radius = t.radius;
      this.maxHp = Math.round(t.hp * scale.hp * (t.boss ? 1 + (tier - 1) * 0.35 : 1)); this.hp = this.maxHp;
      this.zz = rand(0, TAU); this.fuse = 0; this.healT = rand(1.5, 3); this.phaseT = rand(2, 4); this.phased = false;
      if (t.boss) { this.boss = true; this.tier = tier; this.bt = { a: 2.5, b: 5, c: 8 }; this.side = 1; this.lift = 0; this.entered = false; }
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
      if (this.boss) { this.updateBoss(dt, player); return; }
      const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy) || 1;
      let dir = 1;
      const D = this.def;
      if (D.bomb) {   // close in, light the fuse (it stops and flashes), then blow up
        if (this.fuse > 0) {
          this.fuse -= dt; this.flash = Math.max(this.flash, Math.sin(this.fuse * 30) > 0 ? 0.02 : 0);
          if (this.fuse <= 0) { this.selfBoom = true; this.dead = true; Combat.bomb(this, true); }
          this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
          return;
        }
        if (d < this.radius + player.radius + 34 && this.stun <= 0) this.fuse = 0.8;
      }
      if (D.healer) {   // patches up everything around it
        this.healT -= dt;
        if (this.healT <= 0 && this.stun <= 0) {
          this.healT = 3.2; let any = false;
          for (const o of game.enemies) if (!o.dead && o !== this && o.hp < o.maxHp && dist2(o, this) < 170 * 170) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.2); any = true; }
          if (any) { FX.add({ type: 'ring', x: this.x, y: this.y, r0: 10, r1: 170, color: '#4ade80', t: 0.5, max: 0.5, w: 6 }); FX.embers(this.x, this.y, '#86efac', 6, 120, true); }
        }
      }
      if (D.phase) {   // fades out of the world now and then: can't be hurt and moves faster
        this.phaseT -= dt;
        if (this.phaseT <= 0) { this.phased = !this.phased; this.phaseT = this.phased ? 1.4 : rand(2.5, 4); }
      }
      if (this.def.keepAway) {
        dir = d > this.def.keepAway + 20 ? 1 : d < this.def.keepAway - 20 ? -0.6 : 0;
        this.shootTimer = (this.shootTimer ?? rand(1, 2)) - dt;
        if (!this.def.noShoot && this.shootTimer <= 0 && d < this.def.keepAway + 140 && this.stun <= 0) {
          this.shootTimer = rand(1.6, 2.4);
          game.enemyShots.push(new Projectile(this.x, this.y, Math.atan2(dy, dx), { hostile: true, speed: 230, dmg: this.damage, size: 6, color: '#facc15', life: 3 }));
        }
      }
      const sp = this.speed * this.moveFactor * (this.phased ? 1.4 : 1);
      this.x += ((dx / d) * sp * dir + this.vx) * dt; this.y += ((dy / d) * sp * dir + this.vy) * dt;
      if (D.zigzag && this.moveFactor > 0) { const z = Math.cos(game.time * 7 + this.zz) * this.speed * 0.9; this.x += (-dy / d) * z * dt; this.y += (dx / d) * z * dt; }
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      this.flash = Math.max(0, this.flash - dt);
      if (this.moveFactor > 0) this.wobble += dt * 6;
    }
    // ---- bosses: each has its own attack pattern, always telegraphed ----
    updateBoss(dt, p) {
      this.flash = Math.max(0, this.flash - dt); this.wobble += dt * 3;
      if (this.stun <= 0) for (const k in this.bt) this.bt[k] -= dt;
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      BOSS_AI[this.type](this, p, dt, dx / d, dy / d, d);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      // once it has walked in, it stays inside the arena
      const m = this.radius;
      if (!this.entered && this.x > m && this.y > m && this.x < view.w - m && this.y < view.h - m) this.entered = true;
      if (this.entered) { this.x = clamp(this.x, m, view.w - m); this.y = clamp(this.y, m, view.h - m); }
    }
    walk(ux, uy, dir, dt) { const sp = this.speed * this.moveFactor * dir; this.x += ux * sp * dt; this.y += uy * sp * dt; }
    bossShot(a, speed, size = 7) { game.enemyShots.push(new Projectile(this.x, this.y, a, { hostile: true, speed, dmg: Math.round(this.damage * 0.6), size, color: '#fb923c', life: 4 })); }
    draw(ctx, player) {
      if (this.boss) { drawBoss(this, player); return; }
      if (this.x < -50 || this.y < -50 || this.x > view.w + 50 || this.y > view.h + 50) return;   // off screen
      if (drawSprite(ctx, this.type, this.x, this.y, this.radius)) return;
      const r = this.radius, bob = Math.sin(this.wobble) * 1.2;
      if (this.fuse > 0) {   // bomber about to blow: show the blast area
        const u = 1 - this.fuse / 0.8;
        ctx.strokeStyle = 'rgba(239,68,68,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(this.x, this.y, 95, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239,68,68,0.18)'; ctx.beginPath(); ctx.arc(this.x, this.y, 95 * u, 0, TAU); ctx.fill();
      }
      if (this.phased) ctx.globalAlpha = 0.28;
      const sp = enemySprite(this.type, this.flash > 0 ? 1 : this.frozen > 0 ? 2 : 0);
      const pop = 1 + this.flash * 1.8, wob = this.moveFactor > 0 ? Math.sin(this.wobble * 1.3) * 0.04 : 0;
      const ew = sp.w * pop * (1 + wob), eh = sp.h * pop * (1 - wob);
      ctx.drawImage(sp.c, this.x - ew / 2, this.y - sp.h / 2 + 2 + bob + (sp.h - eh), ew, eh);
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
      ctx.globalAlpha = 1;
      if (this.type === 'bomber') { ctx.globalCompositeOperation = 'lighter'; const gs = glowSprite(this.fuse > 0 ? '#ef4444' : '#fde047', 3 + Math.sin(game.time * 30) * 1); blit(gs, this.x + r * 0.55, this.y - r * 1.25 + bob, gs.w); ctx.globalCompositeOperation = 'source-over'; }
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
      this.speed = o.speed; this.spin = o.spin || 0; this.rot = angle; this.trail = o.trail;
      this.onHit = o.onHit; this.onBoom = o.onBoom; this.homing = o.homing;
      this.arc = o.arc || 0; this.noHit = !!o.arc;   // lobbed things fly over enemies and only burst where they land
      this.boomerang = !!o.boomerang; this.out = o.range ? o.range / o.speed : 0.6;
      if (this.boomerang) this.life = this.out + 3;
      this.life0 = this.life;
    }
    update(dt) {
      if (this.homing && !this.homing.dead) {   // steer toward the target
        const want = Math.atan2(this.homing.y - this.y, this.homing.x - this.x);
        this.angle += clamp(angDiff(want, this.angle), -7 * dt, 7 * dt);
        this.vx = Math.cos(this.angle) * this.speed; this.vy = Math.sin(this.angle) * this.speed;
      }
      if (this.boomerang) {   // fly out, then come back to the hero (hitting everything again)
        this.out -= dt;
        if (this.out <= 0) {
          if (!this.back) { this.back = true; this.hitSet.clear(); }
          const p = game.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * this.speed * 1.15; this.vy = (dy / d) * this.speed * 1.15;
          if (d < 22) { this.dead = true; return; }
        }
      }
      this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; this.rot += this.spin * dt;
      if (this.trail && Math.random() < 0.55 && game.particles.length < 420) {
        const q = new Particle(this.x, this.y, this.trail); q.vx *= 0.15; q.vy *= 0.15; q.life = q.max = 0.35; game.particles.push(q);
      }
      if (this.life <= 0) { if (this.explode) Combat.explode(this); this.dead = true; }
    }
    draw(ctx) {
      if (this.x < -30 || this.y < -30 || this.x > view.w + 30 || this.y > view.h + 30) return;
      if (drawSprite(ctx, this.hostile ? 'enemyShot' : 'shot', this.x, this.y, this.radius, this.angle)) return;
      if (this.shape && PROJ_SHAPES[this.shape]) { PROJ_SHAPES[this.shape](ctx, this); return; }
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

  // special projectiles for skills: each one looks like what it is
  const PROJ_SHAPES = {
    fireball(ctx, b) {
      const a = Math.atan2(b.vy, b.vx), r = b.radius;
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      const gr = ctx.createLinearGradient(-60, 0, 0, 0); gr.addColorStop(0, 'rgba(234,88,12,0)'); gr.addColorStop(1, 'rgba(251,146,60,0.85)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(-30, -r * 0.7 + Math.sin(game.time * 30) * 3, -62, 0); ctx.quadraticCurveTo(-30, r * 0.7 + Math.cos(game.time * 26) * 3, 0, r); ctx.closePath(); ctx.fill();
      ctx.restore();
      blit(lightSprite('#f97316'), b.x, b.y, r * 6);
      const gs = glowSprite('#fde68a', r * 0.9); blit(gs, b.x, b.y, gs.w);
      ctx.globalCompositeOperation = 'source-over';
    },
    goldarrow(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(253,230,138,0.45)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(6, 0); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4.5); ctx.lineTo(4, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.lineCap = 'butt';
    },
    shield(ctx, b) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; blit(lightSprite('#60a5fa', 'rgba(191,219,254,0.6)'), b.x, b.y, 56); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      const gr = ctx.createRadialGradient(-3, -3, 1, 0, 0, 13); gr.addColorStop(0, '#93c5fd'); gr.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = gr; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 2.4 : 6; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    hammer(ctx, b) {
      ctx.globalCompositeOperation = 'lighter'; blit(lightSprite('#fbbf24'), b.x, b.y, 64); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.translate(-12, 0); ctx.scale(1.1, 1.1); HeroArt.drawWeapon(ctx, 'paladin', game.time); ctx.restore();
    },
    knife(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = '#f1f5f9'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-2, -2.4); ctx.lineTo(-2, 2.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7c3aed'; ctx.fillRect(-7, -1.6, 5, 3.2);
      ctx.restore();
    },
    bone(ctx, b) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; blit(lightSprite('#65a30d', 'rgba(190,242,100,0.5)'), b.x, b.y, 60); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = '#f5f5f4'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(8, -4); ctx.lineTo(-16, -2); ctx.lineTo(-20, -5); ctx.lineTo(-23, 0); ctx.lineTo(-20, 5); ctx.lineTo(-16, 2); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    shard(ctx, b) {
      ctx.globalCompositeOperation = 'lighter'; const gs = glowSprite('#7dd3fc', 5); blit(gs, b.x, b.y, gs.w); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = '#e0f2fe'; ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(0, -4.5); ctx.lineTo(-8, 0); ctx.lineTo(0, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 0); ctx.stroke();
      ctx.restore();
    },
    rocket(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.globalCompositeOperation = 'lighter'; const f = 10 + Math.sin(game.time * 50) * 4;
      ctx.fillStyle = 'rgba(253,186,116,0.9)'; ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-7 - f, 0); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-10, -6); ctx.lineTo(-4, -3); ctx.moveTo(-7, 3); ctx.lineTo(-10, 6); ctx.lineTo(-4, 3); ctx.fill();
      ctx.restore();
    },
    grenade(ctx, b) {
      const u = 1 - Math.max(0, b.life) / b.life0, h = Math.sin(u * Math.PI) * b.arc;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, 7, 3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(b.x, b.y - h); ctx.rotate(b.rot);
      ctx.fillStyle = '#4d7c0f'; ctx.strokeStyle = '#1a2e05'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
      ctx.fillStyle = '#a8a29e'; ctx.fillRect(-2, -10, 4, 3);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; const gs = glowSprite('#fde047', 2.5 + Math.sin(game.time * 40)); blit(gs, b.x + Math.cos(b.rot - 1.57) * 9, b.y - h + Math.sin(b.rot - 1.57) * 9, gs.w); ctx.globalCompositeOperation = 'source-over';
    },
  };

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
      let dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      // Once the hero comes in range the gem locks on for good and flies straight at them,
      // speeding up until it's always faster than the hero, so it can't be outrun.
      if (!this.homing && d < CONFIG.xp.magnet) { this.homing = true; this.speed = Math.hypot(this.vx, this.vy) + 200; }
      if (this.homing) {
        this.speed = Math.max(this.speed + 2400 * dt, p.stats.speed * 1.3);
        const st = Math.min(d, this.speed * dt);
        this.x += (dx / d) * st; this.y += (dy / d) * st;
      } else { this.x += this.vx * dt; this.y += this.vy * dt; }
      dx = p.x - this.x; dy = p.y - this.y; d = Math.hypot(dx, dy);
      if (d < p.radius + 8) { this.dead = true; p.gainXp(this.value); }
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
      if (e.dead || e.phased) return 0;   // a faded wraith can't be touched
      const p = game.player;
      let dmg = amount * (o.raw ? 1 : p.dmgMult);
      const crit = !o.raw && (o.crit || Math.random() < p.stats.crit);
      if (crit) dmg *= p.stats.critMult;
      if (e.def.armor) dmg *= 1 - e.def.armor;   // knights shrug off part of every hit
      dmg = Math.max(1, Math.round(dmg));
      e.hp -= dmg; e.flash = 0.08;
      if (!o.quiet) game.floatText(e.x, e.y - e.radius - 6, String(dmg), o.color || (crit ? '#fde047' : '#ffffff'), crit, e);
      if (crit && !o.quiet) FX.spark(e.x, e.y, '#fde047', 30);   // crits get a big golden burst
      const steal = (o.raw ? 0 : p.lifesteal) + (o.drain || 0);
      if (steal > 0) p.heal(dmg * steal, true);
      if (o.knockFrom || o.knockAngle !== undefined) {
        const a = o.knockAngle ?? Math.atan2(e.y - o.knockFrom.y, e.x - o.knockFrom.x), k = (o.knock ?? 1) * 90 * (14 / e.radius);
        e.vx += Math.cos(a) * k; e.vy += Math.sin(a) * k;
      }
      if (o.burn) e.burn = { dps: Math.max(o.burn.dps, e.burn ? e.burn.dps : 0), t: Math.max(o.burn.t, e.burn ? e.burn.t : 0) };
      const cc = e.boss ? 0.3 : 1;   // bosses shrug off most of a stun / freeze / root
      if (o.slow) e.slow = { k: o.slow.k * (e.boss ? 0.5 : 1), t: o.slow.t };
      if (o.stun) e.stun = Math.max(e.stun, o.stun * cc);
      if (o.freeze) { e.stun = Math.max(e.stun, o.freeze * cc); e.frozen = Math.max(e.frozen, o.freeze * cc); }
      if (o.root) e.root = Math.max(e.root, o.root * cc);
      if (e.hp <= 0) { e.dead = true; game.onEnemyKilled(e); }
      return dmg;
    },
    // a sword-style swing: hits everything in a wedge in front of you
    melee(x, y, angle, radius, arc, dmg, o = {}) {
      let hits = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
        if (d > radius + e.radius) continue;
        if (d > e.radius && Math.abs(angDiff(Math.atan2(dy, dx), angle)) > arc / 2) continue;
        this.damage(e, dmg, { knockAngle: Math.atan2(dy, dx), knock: o.knock || 1 });
        if (hits++ < 4) FX.spark(e.x - (dx / (d || 1)) * e.radius * 0.6, e.y - (dy / (d || 1)) * e.radius * 0.6, o.color || '#ffffff');
      }
      game.fx.push({ type: 'slash', x, y, angle, arc, radius, color: o.color || '#ffffff', t: 0.2, max: 0.2 });
    },
    // a spear thrust: hits everything along a line
    thrust(x, y, angle, length, width, dmg, o = {}) {
      const cx = Math.cos(angle), cy = Math.sin(angle); let hits = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, along = dx * cx + dy * cy, side = Math.abs(-dx * cy + dy * cx);
        if (along < -e.radius || along > length + e.radius || side > width / 2 + e.radius) continue;
        this.damage(e, dmg, Object.assign({ knockAngle: angle, knock: 1.2 }, o.hit));
        if (hits++ < 3) FX.spark(e.x, e.y, o.color || '#e0f2fe');
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
    // a bomber going off: hurts the hero when it lit itself, and always hurts nearby enemies
    bomb(e, self) {
      const p = game.player;
      if (self && p && dist2(e, p) < (95 + p.radius) ** 2) p.takeDamage(e.damage);
      this.area(e.x, e.y, 95, 30 + game.waves.wave * 2, { raw: true, knock: 3, quiet: true });
      FX.shock(e.x, e.y, 100, '#f97316', { scorch: true }); FX.add({ type: 'boom', x: e.x, y: e.y, r: 95, color: '#f97316', t: 0.4, max: 0.4 });
      FX.embers(e.x, e.y, '#fdba74', 12, 260); game.shake = Math.max(game.shake, 8);
    },
    explode(b) {
      const ex = b.explode;
      this.area(b.x, b.y, ex.r, b.dmg * ex.mult, { burn: ex.burn, knock: 2 });
      game.fx.push({ type: 'boom', x: b.x, y: b.y, r: ex.r, color: ex.color || '#f97316', t: 0.4, max: 0.4 });
      game.shake = Math.max(game.shake, 6);
      if (b.onBoom) b.onBoom(b);
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
  // ---- dramatic effects: each skill combines these into its own look ----
  //   ground: drawn under everyone (sigils, cracks, portals); follow: sticks to the hero; delay: waits before starting
  const FX = {
    add(o) { if (game.fx.length < 260) game.fx.push(o); return o; },
    slow(t) { game.slowT = Math.max(game.slowT || 0, t); },   // a short slow-motion beat for big moments
    flash(color, a = 0.3, t = 0.28) { FX.add({ type: 'flash', color, a, t, max: t }); },
    sigil(x, y, r, color, t = 0.8, follow = false) { FX.add({ type: 'sigil', x, y, r, color, t, max: t, follow, ground: true }); },
    title(p, text, color, big) { FX.add({ type: 'title', x: p.x, y: p.y, text, color, big, t: 1, max: 1, follow: true }); },
    // a shockwave with the ground cracking open
    shock(x, y, r, color, o = {}) {
      const cracks = [];
      if (!o.noCracks) {
        for (let i = 0; i < 9; i++) {
          let a = (i / 9) * TAU + rand(-0.25, 0.25), d = r * 0.12;
          const pts = [{ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }], L = r * rand(0.55, 0.95);
          while (d < L) { d += rand(10, 20); a += rand(-0.35, 0.35); pts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }); }
          cracks.push(pts);
        }
        FX.embers(x, y, '#a8a29e', 8, r * 2);
      }
      const t = o.noCracks ? 0.45 : 1.2;
      FX.add({ type: 'shock', x, y, r, color, cracks, scorch: o.scorch, t, max: t, ground: true });
    },
    crescent(x, y, angle, radius, arc, color, width, t = 0.25, spin = 0) { FX.add({ type: 'crescent', x, y, angle, radius, arc, color, width, t, max: t, spin }); },
    // ghostly copies of the hero (dashes, leaps, teleports)
    after(p, color) { FX.add({ type: 'after', x: p.x, y: p.y, id: p.buffs.bear > 0 ? 'bear' : p.cls.id, face: Math.cos(p.aim) < 0 ? -1 : 1, color, t: 0.35, max: 0.35 }); },
    afterTrail(p, x0, y0, color) {
      const id = p.buffs.bear > 0 ? 'bear' : p.cls.id, face = Math.cos(p.aim) < 0 ? -1 : 1;
      for (let i = 0; i < 5; i++) { const u = i / 5; FX.add({ type: 'after', x: x0 + (p.x - x0) * u, y: y0 + (p.y - y0) * u, id, face, color, t: 0.15 + u * 0.3, max: 0.45 }); }
    },
    spikes(x, y, n, len, color, style, t = 0.9, o = {}) {
      const list = [];
      for (let i = 0; i < n; i++) list.push({ a: (o.a0 || 0) + (i / n) * TAU + rand(-0.2, 0.2), l: len * rand(0.6, 1.1), w: len * 0.13 + 2, r0: o.r0 ?? rand(0, 8) });
      FX.add({ type: 'spikes', x, y, list, color, style, t, max: t, delay: o.delay || 0, ground: true });
    },
    wisp(x, y, color) { const t = rand(0.45, 0.75); FX.add({ type: 'wisp', x0: x, y0: y, cx: rand(-70, 70), cy: rand(-70, 70), color, t, max: t }); },
    vine(x0, y0, x1, y1, color) { FX.add({ type: 'vine', x0, y0, x1, y1, color, seed: rand(0, 10), t: 1.3, max: 1.3, ground: true }); },
    meteor(x, y, t) { FX.add({ type: 'meteor', x, y, t, max: t }); },
    firewave(x, y, r, t = 0.5) { FX.add({ type: 'firewave', x, y, r, t, max: t }); },
    palm(x, y, angle, size, color) { FX.add({ type: 'palm', x, y, angle, size, color, t: 0.4, max: 0.4 }); },
    xslash(x, y, size, color) { FX.add({ type: 'xslash', x, y, size, color, t: 0.32, max: 0.32 }); },
    smoke(x, y, r) { const puffs = []; for (let i = 0; i < 16; i++) puffs.push({ a: rand(0, TAU), d: Math.sqrt(Math.random()), s: rand(26, 46) }); FX.add({ type: 'smoke', x, y, r, puffs, t: 1.6, max: 1.6 }); },
    portal(x, y, r, color) { FX.add({ type: 'portal', x, y, r, color, t: 0.85, max: 0.85, ground: true }); },
    muzzle(x, y, color) { FX.add({ type: 'impact', x, y, color, size: 13, rot: rand(0, 1), t: 0.1, max: 0.1 }); },
    // small bursts where hits land (skipped when the screen is already busy)
    spark(x, y, color, size = 16) { if (game.fx.length < 200) FX.add({ type: 'impact', x, y, color, size, rot: rand(0, 1), t: 0.16, max: 0.16 }); },
    impact(x, y, color, size) { FX.add({ type: 'impact', x, y, color, size, rot: rand(0, 1), t: 0.22, max: 0.22 }); },
    skyshot(x, y, color) { FX.add({ type: 'skyshot', x, y, color, t: 0.4, max: 0.4 }); },
    pillar(x, y, color, w = 18, t = 0.45) { FX.add({ type: 'pillar', x, y, color, w, t, max: t }); },
    embers(x, y, color, n, speed = 200, up = false) {
      for (let i = 0; i < n && game.particles.length < 480; i++) {
        const q = new Particle(x, y, color), a = rand(0, TAU), sp = rand(0.3, 1) * speed;
        q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp - (up ? speed * 0.6 : 0); q.life = q.max = rand(0.4, 0.8); q.size = rand(2, 4);
        game.particles.push(q);
      }
    },
    // every cast: a magic circle under the hero and the skill's name
    cast(p, sk, i) { if (!sk.cd) return; FX.sigil(p.x, p.y, 44, p.cls.color, 0.55, true); FX.title(p, sk.name.toUpperCase(), p.cls.color, i === 0); },
  };
  // jump through the air to (x, y); onLand runs when the hero touches down
  function leapTo(p, x, y, dur, h, onLand, color) {
    p.leap = { x0: p.x, y0: p.y, x1: clamp(x, 24, view.w - 24), y1: clamp(y, 24, view.h - 24), t: 0, max: dur, h, onLand, ghost: 0, color: color || p.cls.color };
    p.hurtTimer = Math.max(p.hurtTimer, dur + 0.2);
  }
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
  // ---- Skill aiming ----
  // castAim is set while a skill is cast by hand: { a: angle, x, y: aimed point }. null = auto-aim.
  // Holding the attack aim (mouse / right stick) also aims skills, including auto-cast ones.
  const SKILL_REACH = 520;   // how far a dragged skill button can reach
  let castAim = null;
  function manualCast(p) {
    if (castAim) return castAim;
    const m = Input.aimAngle(p);
    return m !== null ? { a: m, x: p.x + Math.cos(m) * 260, y: p.y + Math.sin(m) * 260 } : null;
  }
  // Direction for an aimed skill: where the player is aiming by hand, else at the target.
  const aimFor = (p, t) => { const c = manualCast(p); return c ? c.a : t ? Math.atan2(t.y - p.y, t.x - p.x) : p.aim; };
  // Target for a single-target skill: when aimed by hand, the enemy in that direction closest
  // to the aimed point; otherwise simply the nearest enemy.
  function targetFor(p, range) {
    const c = manualCast(p); if (!c) return game.nearestEnemy(p, range);
    const ax = Math.cos(c.a), ay = Math.sin(c.a);
    let best = null, bs = Infinity;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > range * range) continue;
      const along = dx * ax + dy * ay, side = Math.abs(dx * ay - dy * ax);
      if (along <= 0 || side > along * 0.6 + 40) continue;   // only enemies inside a cone around the aim
      const sc = Math.hypot(e.x - c.x, e.y - c.y);
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  // Spot for a ground skill (rains, meteors): the aimed point (kept within range), else the biggest crowd.
  function groundSpot(p, range) {
    const c = manualCast(p); if (!c) return crowdSpot(p, range);
    const d = Math.min(range, Math.hypot(c.x - p.x, c.y - p.y));
    return { x: p.x + Math.cos(c.a) * d, y: p.y + Math.sin(c.a) * d };
  }
  // Direction for an escape dash: where aimed, else away from the closest enemy.
  const dashAngle = (p) => { const c = manualCast(p); return c ? c.a : awayAngle(p); };
  const zone = (z) => game.zones.push(Object.assign({ tick: 0, every: 0.3, opts: { knock: 0, quiet: true } }, z));
  // the n enemies closest to the aimed point (or to the player when not aiming), within range of the player
  const nearest = (p, n, range) => { const o = manualCast(p) || p; return game.enemies.filter((e) => !e.dead && dist2(e, p) < range * range).sort((a, b) => dist2(a, o) - dist2(b, o)).slice(0, n); };
  const ABILITIES = {
    // --- warrior: steel and fury ---
    whirlwind(p) { p.whirl = 2.5; p.whirlTick = 0; FX.slow(0.1); FX.shock(p.x, p.y, p.stats.range * 1.3, '#e2e8f0', { noCracks: true }); },
    charge(p) {
      const t = targetFor(p, 340); const a = manualCast(p) ? aimFor(p, t) : t ? Math.atan2(t.y - p.y, t.x - p.x) : awayAngle(p) + Math.PI;
      const x0 = p.x, y0 = p.y;
      dash(p, a, t ? Math.min(260, Math.sqrt(dist2(t, p))) : 200, { dmg: p.stats.damage * 1.6, width: 48, color: '#fca5a5', hit: { knock: 3 } });
      FX.afterTrail(p, x0, y0, '#ef4444');
      Combat.area(p.x, p.y, 80, p.stats.damage, { knock: 2 }); FX.shock(p.x, p.y, 95, '#ef4444'); game.shake = 9;
    },
    // a roar that shoves the horde back and stuns it
    battlecry(p) {
      p.buffs.cry = 6;
      for (let i = 0; i < 3; i++) FX.add({ type: 'ring', x: p.x, y: p.y, r0: 20, r1: 220, color: '#f87171', t: 0.5, max: 0.5, delay: i * 0.12, follow: true, w: 10 });
      Combat.area(p.x, p.y, 200, p.stats.damage * 0.5, { knock: 6, stun: 0.7 });
      FX.flash('#ef4444', 0.25); game.shake = 10;
    },
    // --- mage: arcane power ---
    fireball(p) {
      const t = targetFor(p, 600); if (!t && !manualCast(p)) return false;
      const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 400, dmg: p.stats.damage * 4, size: 13, color: '#f97316', shape: 'fireball', trail: '#fb923c', range: 640,
        explode: { r: 120, mult: 1, burn: { dps: p.stats.damage * 0.8, t: 3 } },
        onBoom: (b) => { FX.shock(b.x, b.y, 130, '#f97316', { scorch: true }); FX.embers(b.x, b.y, '#fdba74', 22, 320); FX.flash('#f97316', 0.22); game.shake = 12; } }));
    },
    chainlightning(p) {
      const t = targetFor(p, 500); if (!t) return false;
      FX.add({ type: 'bolt', pts: [{ x: p.x, y: p.y - 10 }, { x: t.x, y: t.y }], color: '#c4b5fd', t: 0.3, max: 0.3 });
      Combat.damage(t, p.stats.damage * 2, { color: '#c4b5fd' }); Combat.chain(t, 6, 210, p.stats.damage * 2);
      FX.impact(t.x, t.y, '#c4b5fd', 34); FX.flash('#a78bfa', 0.18);
    },
    blink(p) {
      const x0 = p.x, y0 = p.y; FX.after(p, '#a78bfa');
      dash(p, dashAngle(p), 220, { color: '#c4b5fd', invuln: 0.5 });
      Combat.area(x0, y0, 95, p.stats.damage * 1.6, { knock: 2 });
      FX.sigil(x0, y0, 95, '#8b5cf6', 0.6); FX.add({ type: 'boom', x: x0, y: y0, r: 95, color: '#8b5cf6', t: 0.35, max: 0.35 }); FX.embers(p.x, p.y, '#ddd6fe', 12, 160);
    },
    // --- archer: a storm of arrows ---
    volley(p) {
      const t = targetFor(p, 700); const base = aimFor(p, t);
      for (let i = 0; i < 11; i++) game.projectiles.push(new Projectile(p.x, p.y, base + (i - 5) * 0.11, { speed: 860, dmg: p.stats.damage * 1.4, size: 4, color: '#fde68a', shape: 'goldarrow', pierce: 2, range: p.stats.range }));
      FX.crescent(p.x, p.y, base, 40, 1.4, '#fde68a', 10, 0.25);
    },
    // fire into the sky... and the arrows come down a moment later
    arrowrain(p) {
      const c = groundSpot(p, 520); if (!c) return false;
      FX.skyshot(p.x, p.y, '#fde68a');
      FX.add({ type: 'mark', x: c.x, y: c.y, r: 115, color: '#fde68a', t: 0.35, max: 0.35, ground: true });
      game.timers.push({ t: 0.3, fn: () => zone({ x: c.x, y: c.y, r: 115, t: 3, every: 0.22, dmg: p.stats.damage * 0.7, color: '#fde68a', rain: true }) });
    },
    roll(p) {
      const x0 = p.x, y0 = p.y; dash(p, dashAngle(p), 170, { color: '#86efac', invuln: 0.45 });
      FX.afterTrail(p, x0, y0, '#86efac'); FX.embers(x0, y0 + 14, '#a8a29e', 10, 120); p.focusShots = 3;
    },
    // --- guardian: the unbreakable wall ---
    // hop up and come crashing down with the shield
    shieldslam(p) {
      leapTo(p, p.x, p.y, 0.3, 34, () => {
        Combat.area(p.x, p.y, 160, p.stats.damage * 1.6, { stun: 1.6, knock: 4 });
        FX.shock(p.x, p.y, 170, '#60a5fa'); FX.flash('#93c5fd', 0.2); game.shake = 12;
      });
    },
    fortify(p) { p.buffs.fortify = 4; p.heal(p.stats.maxHp * 0.15); FX.shock(p.x, p.y, 70, '#60a5fa', { noCracks: true }); FX.embers(p.x, p.y, '#bfdbfe', 10, 120); },
    // the shield flies out and comes back like a boomerang, hitting on the way back too
    shieldthrow(p) {
      const t = targetFor(p, 600); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 620, dmg: p.stats.damage * 2.2, size: 11, color: '#93c5fd', shape: 'shield', spin: 18, boomerang: true, pierce: 99, range: 420, fx: { stun: 1.2 } }));
    },
    // --- assassin: shadows ---
    shadowdash(p) {
      const t = targetFor(p, 440); if (!t) return false;
      const a = Math.atan2(t.y - p.y, t.x - p.x), x0 = p.x, y0 = p.y;
      FX.after(p, '#6b21a8');
      p.x = t.x + Math.cos(a) * (t.radius + 22); p.y = t.y + Math.sin(a) * (t.radius + 22); p.clampTo(view);
      FX.afterTrail(p, x0, y0, '#7c3aed');
      Combat.damage(t, p.stats.damage * 4, { crit: true });
      Combat.area(p.x, p.y, 70, p.stats.damage * 1.2, {});
      FX.xslash(t.x, t.y, 46, '#c084fc'); FX.flash('#1e1b4b', 0.35); FX.slow(0.1);
      p.aim = a + Math.PI; p.hurtTimer = 0.6;
    },
    fanofknives(p) {
      for (let i = 0; i < 16; i++) game.projectiles.push(new Projectile(p.x, p.y, (i / 16) * TAU, { speed: 700, dmg: p.stats.damage * 1.3, size: 3, color: '#e5e7eb', shape: 'knife', pierce: 1, range: 300 }));
      FX.crescent(p.x, p.y, 0, 34, TAU * 0.95, '#e5e7eb', 8, 0.25, 6);
    },
    smokebomb(p) { p.buffs.smoke = 3; Combat.area(p.x, p.y, 160, 1, { slow: { k: 0.6, t: 3 }, knock: 0, quiet: true }); FX.smoke(p.x, p.y, 160); p.focusShots = 1; },
    // --- summoner: spirits through portals ---
    spiritcall(p) {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU, x = p.x + Math.cos(a) * 40, y = p.y + Math.sin(a) * 40; FX.portal(x, y, 22, '#5eead4'); game.minions.push(new Minion('spirit', x, y, { life: 12 })); }
      FX.sigil(p.x, p.y, 70, '#5eead4', 0.9);
    },
    spiritburst(p) {
      const sp = game.minions.filter((m) => m.kind === 'spirit'); if (!sp.length) return false;
      for (const m of sp) {
        Combat.area(m.x, m.y, 110, p.stats.damage * 2, { knock: 2 });
        FX.shock(m.x, m.y, 110, '#5eead4', { noCracks: true }); FX.add({ type: 'bolt', pts: [{ x: p.x, y: p.y }, { x: m.x, y: m.y }], color: '#5eead4', t: 0.25, max: 0.25 });
      }
      FX.flash('#5eead4', 0.15);
    },
    soullink(p) { p.heal(p.stats.maxHp * 0.3); p.buffs.frenzy = 6; FX.sigil(p.x, p.y, 90, '#5eead4', 0.8, true); FX.embers(p.x, p.y, '#99f6e4', 12, 120, true); },
    // --- cleric: holy light ---
    sanctuary(p) {
      p.heal(p.stats.maxHp * 0.4); p.buffs.might = 6;
      FX.pillar(p.x, p.y, '#fde68a', 46, 0.7); FX.sigil(p.x, p.y, 130, '#fde047', 1.2, true); FX.embers(p.x, p.y, '#fffbeb', 18, 140, true); FX.flash('#fef9c3', 0.25);
    },
    // three beams of light, one after another
    smite(p) {
      const list = nearest(p, 3, 520); if (!list.length) return false;
      list.forEach((e, i) => game.timers.push({ t: i * 0.12, fn: () => {
        Combat.damage(e, p.stats.damage * 3, { stun: 0.9 });
        FX.pillar(e.x, e.y, '#fef08a', 26, 0.45); FX.shock(e.x, e.y, 50, '#fde047', { noCracks: true }); game.shake = Math.max(game.shake, 5);
      } }));
      FX.flash('#fef08a', 0.15);
    },
    divineshield(p) { p.buffs.divine = 3; FX.pillar(p.x, p.y, '#fde68a', 36, 0.5); FX.flash('#fef3c7', 0.3); FX.embers(p.x, p.y, '#ffffff', 16, 160, true); },
    // --- berserker: blood and thunder ---
    bloodrage(p) { p.buffs.rage = 6; FX.shock(p.x, p.y, 100, '#ef4444', { noCracks: true }); FX.flash('#7f1d1d', 0.35); FX.embers(p.x, p.y, '#ef4444', 18, 200); FX.slow(0.1); },
    // a real leap through the air, crashing down on the target
    leapslam(p) {
      const t = targetFor(p, 380), c = manualCast(p); if (!t && !c) return false;
      let tx, ty;
      if (t) { const a = Math.atan2(t.y - p.y, t.x - p.x), d = Math.max(0, Math.sqrt(dist2(t, p)) - t.radius - 10); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
      else { const d = Math.min(380, Math.hypot(c.x - p.x, c.y - p.y)); tx = p.x + Math.cos(c.a) * d; ty = p.y + Math.sin(c.a) * d; }
      FX.add({ type: 'mark', x: tx, y: ty, r: 125, color: '#dc2626', t: 0.42, max: 0.42, ground: true });
      leapTo(p, tx, ty, 0.42, 85, () => {
        Combat.area(p.x, p.y, 125, p.stats.damage * 2.5, { stun: 1, knock: 3 });
        FX.shock(p.x, p.y, 140, '#dc2626'); FX.embers(p.x, p.y, '#a8a29e', 16, 260); FX.flash('#b91c1c', 0.2); game.shake = 14; FX.slow(0.08);
      }, '#ef4444');
    },
    execute(p) {
      const r = p.stats.range * 1.5;
      Combat.melee(p.x, p.y, 0, r, TAU, p.stats.damage * 3, { knock: 2, color: '#ef4444' });
      FX.crescent(p.x, p.y, p.aim, r, TAU * 0.95, '#dc2626', 22, 0.35, 9);
      for (const e of game.enemies) if (!e.dead && !e.boss && e.hp < e.maxHp * 0.25 && dist2(e, p) < (r + e.radius) ** 2) {
        Combat.damage(e, e.hp + 1, { raw: true, color: '#ef4444' }); game.floatText(e.x, e.y - 20, 'EXECUTED', '#ef4444', true); FX.xslash(e.x, e.y, 26, '#ef4444');
      }
      game.shake = 9;
    },
    // --- paladin: the hammer of dawn ---
    // three waves of holy light roll outward
    holynova(p) {
      p.heal(p.stats.maxHp * 0.25);
      for (let i = 0; i < 3; i++) game.timers.push({ t: i * 0.18, fn: () => {
        Combat.area(p.x, p.y, 120 + i * 30, p.stats.damage, { knock: 2 });
        FX.add({ type: 'ring', x: p.x, y: p.y, r0: 20, r1: 120 + i * 30, color: '#fde68a', t: 0.4, max: 0.4, w: 12, follow: true });
      } });
      FX.pillar(p.x, p.y, '#fde68a', 40, 0.6); FX.flash('#fef3c7', 0.25); FX.embers(p.x, p.y, '#fde68a', 16, 220, true);
    },
    consecrate(p) { zone({ x: p.x, y: p.y, r: 135, t: 5, every: 0.4, dmg: p.stats.damage * 0.7, heal: 0.02, color: '#fcd34d', sigil: true }); FX.pillar(p.x, p.y, '#fcd34d', 30, 0.5); },
    // a spinning hammer: each enemy it crushes is struck by light
    judgment(p) {
      const t = targetFor(p, 600); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 560, dmg: p.stats.damage * 3, size: 10, color: '#fbbf24', shape: 'hammer', spin: 14, pierce: 2, range: 560, fx: { stun: 1.3 },
        onHit: (b, e) => { FX.pillar(e.x, e.y, '#fde68a', 22, 0.4); FX.impact(e.x, e.y, '#fbbf24', 34); game.shake = Math.max(game.shake, 6); } }));
    },
    // --- necromancer: bones and souls ---
    raisedead(p) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU, x = p.x + Math.cos(a) * 34, y = p.y + Math.sin(a) * 34;
        FX.portal(x, y, 20, '#a3e635'); FX.embers(x, y, '#a3e635', 6, 90, true); game.minions.push(new Minion('skeleton', x, y, { life: 20 }));
      }
      FX.sigil(p.x, p.y, 80, '#65a30d', 1); FX.flash('#1a2e05', 0.3);
    },
    // a bone spear, with bones bursting out of the ground along its path
    bonespear(p) {
      const t = targetFor(p, 700); const a = aimFor(p, t);
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 760, dmg: p.stats.damage * 3, size: 6, color: '#e7e5e4', shape: 'bone', trail: '#a3e635', pierce: 99, range: 700 }));
      for (let i = 1; i <= 6; i++) FX.spikes(p.x + Math.cos(a) * i * 95, p.y + Math.sin(a) * i * 95, 5, 22, '#e7e5e4', 'bone', 0.6, { delay: i * 0.12 });
    },
    // souls fly out of every enemy into the necromancer
    soulsiphon(p) {
      if (!game.nearestEnemy(p, 210)) return false;
      let n = 0;
      for (const e of game.enemies) if (!e.dead && dist2(e, p) < 210 * 210 && n++ < 14) FX.wisp(e.x, e.y, '#a3e635');
      Combat.area(p.x, p.y, 210, p.stats.damage * 1.5, { drain: 0.5, knock: 0 });
      FX.sigil(p.x, p.y, 210, '#65a30d', 0.9, true);
    },
    // --- monk: lightning hands ---
    flurry(p) { p.flurry = 0.9; p.flurryTick = 0; FX.slow(0.06); },
    palmstrike(p) {
      const t = targetFor(p, 200); const a = aimFor(p, t);
      Combat.thrust(p.x, p.y, a, 100, 80, p.stats.damage * 4, { color: '#fdba74', hit: { stun: 1.1, knock: 6 } });
      FX.palm(p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 50, a, 50, '#fdba74'); FX.shock(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 70, '#fb923c', { noCracks: true });
      game.shake = 8; FX.slow(0.08);
    },
    innerpeace(p) { p.heal(p.stats.maxHp * 0.3); p.buffs.inner = 3; FX.sigil(p.x, p.y, 70, '#ffffff', 0.9, true); FX.embers(p.x, p.y, '#fde68a', 12, 100, true); },
    // --- pyromancer: everything burns ---
    // a wall of fire rolls outward, burning in two waves
    flamering(p) {
      const x = p.x, y = p.y, burn = { dps: p.stats.damage * 1.4, t: 4 };
      FX.firewave(x, y, 190, 0.5);
      Combat.area(x, y, 95, p.stats.damage * 0.8, { burn });
      game.timers.push({ t: 0.2, fn: () => Combat.area(x, y, 185, p.stats.damage * 0.8, { burn }) });
      FX.flash('#ea580c', 0.2); game.shake = 8;
    },
    // the meteor falls from the sky, then the ground cracks and burns
    meteor(p) {
      const c = groundSpot(p, 600); if (!c) return false;
      FX.add({ type: 'mark', x: c.x, y: c.y, r: 150, color: '#f97316', t: 0.85, max: 0.85, ground: true });
      FX.meteor(c.x, c.y, 0.85);
      game.timers.push({ t: 0.85, fn: () => {
        Combat.area(c.x, c.y, 150, p.stats.damage * 5, { burn: { dps: p.stats.damage * 1.2, t: 4 }, knock: 3 });
        FX.add({ type: 'boom', x: c.x, y: c.y, r: 150, color: '#ea580c', t: 0.6, max: 0.6 });
        FX.shock(c.x, c.y, 175, '#ea580c', { scorch: true }); FX.embers(c.x, c.y, '#fdba74', 30, 380); FX.flash('#f97316', 0.35);
        game.shake = 16; FX.slow(0.12);
      } });
    },
    firetrail(p) { p.buffs.firetrail = 5; FX.firewave(p.x, p.y, 70, 0.35); },
    // --- gunner: lead and gunpowder ---
    bulletstorm(p) { p.storm = 3; p.stormTick = 0; FX.slow(0.08); },
    // lobbed over the horde: it only bursts where it lands
    grenade(p) {
      const t = targetFor(p, 520), c = manualCast(p), a = aimFor(p, t);
      const d = c ? clamp(Math.hypot(c.x - p.x, c.y - p.y), 80, 520) : t ? Math.sqrt(dist2(t, p)) : 260;
      game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 440, dmg: p.stats.damage * 6, size: 7, color: '#84cc16', shape: 'grenade', arc: 70, spin: 10, range: d - 10, explode: { r: 115, mult: 1, color: '#a3e635' },
        onBoom: (b) => { FX.shock(b.x, b.y, 125, '#f59e0b', { scorch: true }); FX.smoke(b.x, b.y, 90); FX.embers(b.x, b.y, '#fde047', 18, 300); game.shake = 12; } }));
    },
    overdrive(p) { p.buffs.overdrive = 5; FX.shock(p.x, p.y, 70, '#e2e8f0', { noCracks: true }); FX.embers(p.x, p.y, '#fde047', 14, 220); },
    // --- druid: the wild ---
    // vines snake out to every nearby enemy and hold it fast
    entangle(p) {
      let n = 0;
      for (const e of game.enemies) if (!e.dead && dist2(e, p) < 175 * 175 && n++ < 14) FX.vine(p.x, p.y, e.x, e.y, '#4ade80');
      Combat.area(p.x, p.y, 175, p.stats.damage * 1.2, { root: 3 });
      FX.spikes(p.x, p.y, 12, 30, '#22c55e', 'thorn', 0.8, { r0: 18 }); FX.sigil(p.x, p.y, 175, '#4ade80', 0.8);
      game.minions.push(new Minion('wolf', p.x, p.y, { life: 12 }));
    },
    bearform(p) { p.buffs.bear = 8; p.heal(p.stats.maxHp * 0.2); FX.embers(p.x, p.y, '#22c55e', 24, 240); FX.shock(p.x, p.y, 90, '#a16207', { noCracks: true }); FX.flash('#14532d', 0.3); game.shake = 8; FX.slow(0.1); },
    swarm(p) { for (let i = 0; i < 5; i++) game.minions.push(new Minion('bee', p.x + rand(-15, 15), p.y + rand(-15, 15), { life: 10 })); FX.embers(p.x, p.y, '#facc15', 14, 200); FX.sigil(p.x, p.y, 50, '#facc15', 0.6); },
    // --- engineer: gadgets ---
    minefield(p) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, x = p.x + Math.cos(a) * 60, y = p.y + Math.sin(a) * 60;
        game.minions.push(new Minion('mine', x, y, { life: 30 }));
        FX.add({ type: 'ring', x, y, r0: 4, r1: 26, color: '#ef4444', t: 0.35, max: 0.35, delay: i * 0.05 });
      }
      FX.sigil(p.x, p.y, 70, '#0ea5e9', 0.7);
    },
    overclock(p) {
      const ts = game.minions.filter((m) => m.kind === 'turret'); if (!ts.length) return false;
      p.buffs.overclock = 6;
      for (const m of ts) { FX.add({ type: 'bolt', pts: [{ x: p.x, y: p.y }, { x: m.x, y: m.y }], color: '#7dd3fc', t: 0.35, max: 0.35 }); FX.shock(m.x, m.y, 45, '#7dd3fc', { noCracks: true }); }
      FX.flash('#0ea5e9', 0.15);
    },
    // rockets fan out, then curve in on their targets
    rockets(p) {
      const list = nearest(p, 8, 600); if (!list.length) return false;
      for (let i = 0; i < 8; i++) {
        const e = list[i % list.length], a = aimFor(p, e) + (i - 3.5) * 0.28;
        game.timers.push({ t: i * 0.06, fn: () => game.projectiles.push(new Projectile(p.x, p.y, a, { speed: 460, dmg: p.stats.damage * 2.2, size: 5, color: '#fb923c', shape: 'rocket', trail: '#a8a29e', homing: e, range: 900, explode: { r: 60, mult: 1, color: '#f97316' } })) });
      }
    },
    // --- spearman: reach ---
    sweep(p) {
      Combat.melee(p.x, p.y, 0, p.stats.range * 1.15, TAU, p.stats.damage * 1.9, { knock: 3.5, color: '#67e8f9' });
      FX.add({ type: 'spinspear', x: p.x, y: p.y, angle: p.aim, r: p.stats.range * 1.15, t: 0.35, max: 0.35, follow: true });
      FX.shock(p.x, p.y, p.stats.range * 1.2, '#67e8f9', { noCracks: true });
    },
    // pole vault over the horde, striking everything below
    vault(p) {
      const t = targetFor(p, 500); const a = aimFor(p, t), x0 = p.x, y0 = p.y;
      leapTo(p, p.x + Math.cos(a) * 230, p.y + Math.sin(a) * 230, 0.34, 55, () => {
        const len = Math.hypot(p.x - x0, p.y - y0);
        if (len > 1) Combat.thrust(x0, y0, Math.atan2(p.y - y0, p.x - x0), len, 42, p.stats.damage * 2, { color: '#67e8f9' });
        FX.shock(p.x, p.y, 70, '#67e8f9', { noCracks: true }); game.shake = 6;
      }, '#67e8f9');
    },
    lance(p) {
      const t = targetFor(p, 900); const a = aimFor(p, t);
      Combat.thrust(p.x, p.y, a, 520, 38, p.stats.damage * 3, { color: '#67e8f9' });
      const pts = []; for (let i = 0; i <= 8; i++) pts.push({ x: p.x + Math.cos(a) * i * 65, y: p.y + Math.sin(a) * i * 65 });
      FX.add({ type: 'bolt', pts, color: '#67e8f9', t: 0.35, max: 0.35 });
      FX.add({ type: 'lance', x: p.x, y: p.y, angle: a, len: 540, t: 0.4, max: 0.4 });
      FX.flash('#67e8f9', 0.18); game.shake = 10; FX.slow(0.08);
    },
    // --- samurai: the way of the blade ---
    // dash and cut: no cooldown, just a tiny pause between dashes
    quickdraw(p) {
      if (p.dashLock > 0) return false;
      const t = targetFor(p, 260), c = manualCast(p);
      let a;
      if (c || t) a = aimFor(p, t);
      else { const mv = Input.moveVector(); a = mv.x || mv.y ? Math.atan2(mv.y, mv.x) : p.aim; }
      const x0 = p.x, y0 = p.y;
      dash(p, a, 180, { dmg: p.stats.damage * 1.4, width: 46, color: '#fecdd3', invuln: 0.25 });
      FX.afterTrail(p, x0, y0, '#fb7185');
      FX.add({ type: 'cutline', x1: x0, y1: y0, x2: p.x, y2: p.y, t: 0.3, max: 0.3 });
      p.dashLock = 0.22; p.aim = a; p.swing = p.swingMax = 0.15; p.swingKind = 'melee';
    },
    // blink from enemy to enemy, one cut each
    thousandcuts(p) {
      const list = nearest(p, 8, 380); if (!list.length) return false;
      p.hurtTimer = Math.max(p.hurtTimer, list.length * 0.08 + 0.35);
      FX.flash('#0c0a09', 0.3); FX.slow(0.25);
      list.forEach((e, i) => game.timers.push({ t: i * 0.08, fn: () => {
        if (!p.alive) return;
        const a = rand(0, TAU), x0 = p.x, y0 = p.y;
        FX.after(p, '#fda4af');
        p.x = clamp(e.x + Math.cos(a) * (e.radius + 18), 20, view.w - 20); p.y = clamp(e.y + Math.sin(a) * (e.radius + 18), 20, view.h - 20);
        p.aim = Math.atan2(e.y - p.y, e.x - p.x); p.swing = p.swingMax = 0.1; p.swingKind = 'melee';
        FX.add({ type: 'cutline', x1: x0, y1: y0, x2: p.x, y2: p.y, t: 0.25, max: 0.25 });
        Combat.damage(e, p.stats.damage * 2.2, { crit: i === list.length - 1 });
        FX.xslash(e.x, e.y, 30, '#fb7185'); game.shake = Math.max(game.shake, 4);
      } }));
    },
    sakura(p) { p.buffs.sakura = 4; p.sakuraTick = 0; FX.embers(p.x, p.y, '#fbcfe8', 20, 220); FX.sigil(p.x, p.y, 90, '#fb7185', 0.8, true); },
    // --- ice mage: the deep freeze ---
    iceshards(p) {
      const t = targetFor(p, 600); const a = aimFor(p, t);
      for (let i = 0; i < 7; i++) game.projectiles.push(new Projectile(p.x, p.y, a + (i - 3) * 0.14, { speed: 620, dmg: p.stats.damage * 1.6, size: 5, color: '#e0f2fe', shape: 'shard', trail: '#bae6fd', pierce: 1, range: 460, fx: { slow: { k: 0.65, t: 3 } } }));
      FX.crescent(p.x, p.y, a, 36, 1.3, '#bae6fd', 9, 0.25);
    },
    blizzard(p) {
      const c = groundSpot(p, 520) || { x: p.x, y: p.y };
      zone({ x: c.x, y: c.y, r: 150, t: 5, every: 0.35, dmg: p.stats.damage * 0.55, opts: { slow: { k: 0.6, t: 1 }, knock: 0, quiet: true }, color: '#bae6fd', snow: true });
      FX.sigil(c.x, c.y, 150, '#bae6fd', 0.8); FX.flash('#e0f2fe', 0.15);
    },
    // ice spikes burst out of the ground all around
    frostnova(p) {
      Combat.area(p.x, p.y, 190, p.stats.damage * 1.2, { freeze: 2.5 });
      FX.spikes(p.x, p.y, 18, 70, '#bae6fd', 'ice', 1.3, { r0: 22 }); FX.spikes(p.x, p.y, 12, 40, '#e0f2fe', 'ice', 1.3, { r0: 90, a0: 0.2 });
      FX.shock(p.x, p.y, 200, '#bae6fd', { noCracks: true }); FX.flash('#e0f2fe', 0.3); game.shake = 8; FX.slow(0.12);
    },
  };

  // ===================================================================
  // 10. WaveManager
  // ===================================================================
  class WaveManager {
    constructor() { this.wave = 0; this.queue = 0; this.spawnTimer = 0; this.breakTimer = 0; this.phase = 'idle'; this.scale = null; }
    startWave(n) {
      this.wave = n; this.scale = waveScaling(n); this.queue = this.scale.count;
      this.spawnTimer = 0.4; this.phase = 'spawning'; this.bossTimer = 0;
      if (n % BOSS_EVERY === 0) {   // boss wave: fewer regular enemies, and the boss walks in shortly after
        this.queue = Math.ceil(this.scale.count * 0.4); this.bossTimer = 1.6;
        UI.banner('BOSS WAVE ' + n);
      } else UI.banner('WAVE ' + n);
    }
    spawnBoss() {
      const round = this.wave / BOSS_EVERY, type = BOSS_ORDER[(round - 1) % BOSS_ORDER.length], tier = Math.floor((round - 1) / BOSS_ORDER.length) + 1;
      const b = new Enemy(type, view.w / 2, -60, this.scale, tier);
      game.enemies.push(b); game.boss = b;
      UI.banner(b.def.name.toUpperCase() + (tier > 1 ? ' ' + 'I'.repeat(Math.min(tier, 3)) : ''));
      FX.flash(b.def.color, 0.3); game.shake = 14; FX.slow(0.2);
    }
    spawnAt(key, x, y) { game.enemies.push(new Enemy(key, x, y, this.scale)); }
    get remaining() { return this.queue + game.enemies.length + (this.bossTimer > 0 ? 1 : 0); }
    update(dt) {
      if (this.phase === 'spawning') {
        this.spawnTimer -= dt;
        while (this.queue > 0 && this.spawnTimer <= 0) { this.spawnOne(); this.queue--; this.spawnTimer += this.scale.spawnInterval; }
        if (this.bossTimer > 0) { this.bossTimer -= dt; if (this.bossTimer <= 0) this.spawnBoss(); }
        if (this.queue === 0 && this.bossTimer <= 0 && game.enemies.length === 0) {
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
    autoCast: [false, false, false],   // per skill slot: cast automatically when ready

    nearestEnemy(from, range) {
      let best = null, bd = range * range;
      for (const e of this.enemies) { if (e.dead || e.phased) continue; const d = dist2(e, from); if (d < bd) { bd = d; best = e; } }
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
      if (e.boss) {   // a boss falls: big explosion, a shower of XP, and a heal
        if (this.boss === e) this.boss = null;
        FX.shock(e.x, e.y, 200, e.def.color); FX.embers(e.x, e.y, e.def.color, 40, 420); FX.embers(e.x, e.y, '#fde68a', 20, 300);
        FX.add({ type: 'boom', x: e.x, y: e.y, r: 180, color: e.def.color, t: 0.7, max: 0.7 }); FX.flash('#ffffff', 0.45); FX.slow(0.35); this.shake = 20;
        const total = Math.round(e.def.xp * (1 + this.waves.wave * 0.04));
        for (let i = 0; i < 14; i++) this.gems.push(new Gem(e.x + rand(-30, 30), e.y + rand(-30, 30), Math.max(4, Math.round(total / 14))));
        this.player.heal(this.player.stats.maxHp * 0.3);
        UI.banner(e.def.name.toUpperCase() + ' DEFEATED!', true);
        return;
      }
      this.burst(e.x, e.y, e.def.color, 12);
      if (this.fx.length < 160) this.fx.push({ type: 'ring', x: e.x, y: e.y, r0: e.radius * 0.6, r1: e.radius * 2, color: e.def.color, t: 0.25, max: 0.25 });
      const v = Math.max(1, Math.round(e.def.xp * (1 + this.waves.wave * 0.04)));
      this.gems.push(new Gem(e.x, e.y, v));
      if (e.def.split) for (const sd of [-1, 1]) this.waves.spawnAt(e.def.split, e.x + sd * 12, e.y + rand(-6, 6));
      if (e.def.bomb) Combat.bomb(e, false);
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
      for (const f of this.fx) { if (f.delay > 0) f.delay -= dt; else f.t -= dt; }
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
        if (b.dead || b.noHit) continue;
        const near = Grid.near(b.x, b.y);
        for (const e of near) {
          if (e.dead || b.hitSet.has(e)) continue;
          if (dist2(b, e) < (b.radius + e.radius) ** 2) {
            b.hitSet.add(e);
            if (b.explode) { Combat.explode(b); b.dead = true; break; }
            Combat.damage(e, b.dmg, Object.assign({ knockAngle: b.angle, knock: 0.6 }, b.fx));
            if (b.fx.chain) Combat.chain(e, b.fx.chain.count, b.fx.chain.range, b.dmg * b.fx.chain.mult);
            if (b.onHit) b.onHit(b, e);
            this.burst(b.x, b.y, b.color, 3); FX.spark(b.x, b.y, b.color, 12);
            if (b.pierce-- <= 0) { b.dead = true; break; }
          }
        }
      }
      // enemies and their shots hurt you
      for (const e of this.enemies) {
        if (!e.dead && !e.phased && e.stun <= 0 && dist2(e, p) < (e.radius + p.radius) ** 2 && p.takeDamage(e.damage)) {
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
          if (d2 > 0.0001 && d2 < min * min) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, wa = a.boss ? 0 : b.boss ? 1 : 0.5, wb = 1 - wa, push = min - d;
            a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb;
          }
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
      drawFx(true);
      for (const g of this.gems) g.draw(ctx);
      for (const q of this.particles) q.draw(ctx);
      ctx.globalAlpha = 1;
      for (const m of this.minions) if (m.kind === 'mine' || m.kind === 'turret') m.draw(ctx);
      for (const e of this.enemies) e.draw(ctx, p);
      for (const m of this.minions) if (m.kind !== 'mine' && m.kind !== 'turret') m.draw(ctx);
      for (const b of this.projectiles) b.draw(ctx);
      for (const b of this.enemyShots) b.draw(ctx);
      if (this.player && this.player.alive) this.player.draw(ctx);
      drawFx(false);
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
      if (z.sigil) drawSigil(z.x, z.y, z.r, z.color, game.time * 0.8, 0.75 * k);
      if (z.snow) {   // swirling wind
        ctx.strokeStyle = 'rgba(240,249,255,0.5)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) { const a = game.time * 2.4 + i * (TAU / 4); ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.35 + i * 0.16), a, a + 1.3); ctx.stroke(); }
        ctx.lineCap = 'butt';
      }
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
  // a rotating magic circle
  function drawSigil(x, y, r, color, rot, alpha) {
    if (r < 2 || alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y);
    ctx.globalAlpha = alpha * 0.35; blit(lightSprite(color, 'rgba(255,255,255,0.15)'), 0, 0, r * 2.1); ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.stroke();
    ctx.rotate(rot);
    ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84); ctx.lineTo(Math.cos(a) * r * (i % 2 ? 0.92 : 1), Math.sin(a) * r * (i % 2 ? 0.92 : 1)); } ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath();
    for (const off of [0, Math.PI / 3]) for (let i = 0; i <= 3; i++) { const a = off + (i / 3) * TAU - Math.PI / 2, px = Math.cos(a) * r * 0.8, py = Math.sin(a) * r * 0.8; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.rotate(-rot * 2); ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32); ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); } ctx.stroke();
    ctx.restore();
  }
  // visual effects. ground = true draws the floor layer (under everyone), false the top layer
  function drawFx(ground) {
    const flashes = [];
    for (const f of game.fx) {
      if (!!f.ground !== ground || f.delay > 0) continue;
      if (f.follow && game.player) { f.x = game.player.x; f.y = game.player.y; }
      const k = Math.max(0, f.t / f.max), u = 1 - k;
      ctx.globalAlpha = k;
      if (f.type === 'flash') { flashes.push(f); continue; }
      if (f.type === 'sigil') {
        drawSigil(f.x, f.y, f.r * (0.55 + 0.45 * Math.min(1, u * 6)), f.color, game.time * 1.6, Math.min(1, k * 2.2));
      } else if (f.type === 'title') {
        const age = f.max - f.t, sc = age < 0.12 ? 1.7 - (age / 0.12) * 0.7 : 1;
        ctx.globalAlpha = Math.min(1, k * 3);
        ctx.save(); ctx.translate(f.x, f.y - 54 - age * 16); ctx.scale(sc, sc);
        ctx.font = '900 ' + (f.big ? 19 : 14) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = '#fff7e0'; ctx.fillText(f.text, 0, 0);
        ctx.globalAlpha *= 0.55; ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
        ctx.restore();
      } else if (f.type === 'shock') {
        if (f.scorch) { ctx.globalAlpha = k * 0.75; blit(cached('scorch', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(12,8,4,0.85)'); gr.addColorStop(0.6, 'rgba(28,18,8,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), f.x, f.y, f.r * 1.3); }
        if (f.cracks.length) {
          const gr = Math.min(1, u * 6);
          const path = () => { ctx.beginPath(); for (const pts of f.cracks) pts.forEach((pt, i) => { const x = f.x + (pt.x - f.x) * gr, y = f.y + (pt.y - f.y) * gr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
          ctx.lineJoin = 'round';
          ctx.globalAlpha = Math.min(1, k * 1.6); ctx.strokeStyle = 'rgba(10,6,4,0.8)'; ctx.lineWidth = 4; path(); ctx.stroke();
          ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; path(); ctx.stroke();
          ctx.lineJoin = 'miter';
        }
        const re = Math.min(1, u / (f.cracks.length ? 0.4 : 1));
        if (re < 1) {
          const R = f.r * (0.2 + 0.8 * Math.sqrt(re));
          ctx.globalAlpha = 1 - re; ctx.strokeStyle = f.color; ctx.lineWidth = 12 * (1 - re) + 2; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 * (1 - re); ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
        }
      } else if (f.type === 'crescent') {
        const R = f.radius * (0.85 + 0.25 * u), a = f.angle + f.spin * u, half = f.arc / 2;
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(f.color, 0.75);
        ctx.beginPath(); ctx.arc(f.x, f.y, R, a - half, a + half);
        for (let i = 20; i >= 0; i--) { const v = i / 20, aa = a - half + f.arc * v, rr = R - f.width * Math.sin(v * Math.PI); ctx.lineTo(f.x + Math.cos(aa) * rr, f.y + Math.sin(aa) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, R, a - half, a + half); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'after') {
        ctx.globalAlpha = k * 0.45;
        ctx.save(); ctx.translate(f.x, f.y + 2); ctx.scale(f.face * 1.12, 1.12); ctx.drawImage(heroSprite(f.id).c, -32, -40, 64, 64); ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.55; blit(lightSprite(f.color, 'rgba(255,255,255,0.15)'), f.x, f.y, 62); ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'spikes') {
        const grow = Math.min(1, u * 7) * (k < 0.3 ? k / 0.3 : 1);
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        for (const sp of f.list) {
          const ca = Math.cos(sp.a), sa = Math.sin(sp.a), bx = f.x + ca * sp.r0, by = f.y + sa * sp.r0, L = sp.l * grow, tx = bx + ca * L, ty = by + sa * L;
          ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath(); ctx.moveTo(bx - sa * sp.w, by + ca * sp.w); ctx.lineTo(tx, ty); ctx.lineTo(bx + sa * sp.w, by - ca * sp.w); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = f.style === 'thorn' ? 'rgba(20,83,45,0.8)' : 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
        }
      } else if (f.type === 'wisp') {
        const p = game.player; if (!p) continue;
        const e = u * u, mx = (f.x0 + p.x) / 2 + f.cx, my = (f.y0 + p.y) / 2 + f.cy;
        const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * p.x, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * p.y;
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; const gs = glowSprite(f.color, 5); blit(gs, x, y, gs.w); ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'vine') {
        const g2 = Math.min(1, u * 4), dx = f.x1 - f.x0, dy = f.y1 - f.y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(2, Math.round(20 * g2));
        const pt = (i) => { const v = i / 20, w = Math.sin(v * 12 + f.seed) * 6 * Math.sin(v * Math.PI); return [f.x0 + dx * v + nx * w, f.y0 + dy * v + ny * w]; };
        ctx.globalAlpha = Math.min(1, k * 2.5); ctx.lineCap = 'round';
        const line = () => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); };
        ctx.strokeStyle = '#14532d'; ctx.lineWidth = 5; line(); ctx.strokeStyle = f.color; ctx.lineWidth = 2.2; line();
        ctx.fillStyle = '#86efac'; for (let i = 3; i < n; i += 4) { const [x, y] = pt(i); ctx.beginPath(); ctx.ellipse(x, y, 4, 2, f.seed + i, 0, TAU); ctx.fill(); }
        ctx.lineCap = 'butt';
      } else if (f.type === 'meteor') {
        const sx = f.x + 260, sy = f.y - 520, x = sx + (f.x - sx) * u, y = sy + (f.y - sy) * u, sc = 0.6 + u * 0.7;
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(251,146,60,0.45)'; ctx.lineWidth = 28 * sc; ctx.beginPath(); ctx.moveTo(x + 80, y - 160); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(254,240,138,0.8)'; ctx.lineWidth = 10 * sc; ctx.beginPath(); ctx.moveTo(x + 40, y - 80); ctx.lineTo(x, y); ctx.stroke();
        blit(lightSprite('#f97316'), x, y, 130 * sc);
        ctx.lineCap = 'butt'; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#3f3a36'; ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12 * sc, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (f.type === 'firewave') {
        const R = f.r * Math.sqrt(u), n = 30;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.6; blit(lightSprite('#ea580c'), f.x, f.y, R * 2.3); ctx.globalAlpha = 1;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU, fl = 14 + hash(i * 3 + Math.floor(game.time * 22)) * 16, ca = Math.cos(a), sa = Math.sin(a);
          ctx.fillStyle = i % 2 ? 'rgba(251,146,60,' + k + ')' : 'rgba(253,224,71,' + k + ')';
          ctx.beginPath(); ctx.moveTo(f.x + ca * (R - 6) - sa * 8, f.y + sa * (R - 6) + ca * 8); ctx.lineTo(f.x + ca * (R + fl), f.y + sa * (R + fl)); ctx.lineTo(f.x + ca * (R - 6) + sa * 8, f.y + sa * (R - 6) - ca * 8); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'palm') {
        const sz = f.size * (0.6 + u * 0.7);
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.scale(sz, sz);
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(f.color, 0.55 * k); ctx.strokeStyle = 'rgba(255,255,255,' + k + ')'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, TAU);
        for (const [fy, fl] of [[-0.33, 0.95], [-0.11, 1.05], [0.11, 1], [0.33, 0.85]]) { ctx.moveTo(0.25, fy - 0.09); ctx.lineTo(fl, fy - 0.08); ctx.arc(fl, fy, 0.08, -Math.PI / 2, Math.PI / 2); ctx.lineTo(0.25, fy + 0.09); }
        ctx.moveTo(-0.1, -0.38); ctx.lineTo(0.35, -0.75); ctx.arc(0.35, -0.67, 0.08, -Math.PI / 2, Math.PI / 2); ctx.lineTo(0.1, -0.3);
        ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (f.type === 'xslash') {
        const L = f.size * Math.min(1, u * 5); ctx.lineCap = 'round';
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
          ctx.strokeStyle = rgba(f.color, 0.65); ctx.lineWidth = 10 * k + 2; ctx.beginPath(); ctx.moveTo(f.x - dx, f.y - dy); ctx.lineTo(f.x + dx, f.y + dy); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * k + 0.5; ctx.beginPath(); ctx.moveTo(f.x - dx, f.y - dy); ctx.lineTo(f.x + dx, f.y + dy); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      } else if (f.type === 'smoke') {
        const sp = cached('smoke', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(148,163,184,0.9)'); gr.addColorStop(0.6, 'rgba(100,116,139,0.5)'); gr.addColorStop(1, 'rgba(71,85,105,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
        ctx.globalAlpha = Math.min(1, k * 1.5) * 0.8;
        for (const q of f.puffs) { const d = q.d * (0.3 + 0.7 * Math.sqrt(u)) * f.r; blit(sp, f.x + Math.cos(q.a) * d, f.y + Math.sin(q.a) * d - u * 12, q.s * (1 + u * 1.2)); }
      } else if (f.type === 'portal') {
        const g2 = Math.min(1, u * 4);
        drawSigil(f.x, f.y, f.r * g2, f.color, game.time * 3, k);
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(f.x, f.y - 100, f.x, f.y); gr.addColorStop(0, rgba(f.color, 0)); gr.addColorStop(1, rgba(f.color, 0.75 * k));
        ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(f.x - f.r * 0.6 * g2, f.y - 100, f.r * 1.2 * g2, 100);
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'impact') {
        const sz = f.size * (0.5 + u * 0.8);
        ctx.globalCompositeOperation = 'lighter'; blit(lightSprite(f.color), f.x, f.y, sz * 1.6);
        ctx.strokeStyle = 'rgba(255,255,255,' + k + ')'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + f.rot, r2 = sz * (i % 2 ? 0.7 : 1); ctx.moveTo(f.x + Math.cos(a) * sz * 0.35, f.y + Math.sin(a) * sz * 0.35); ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2); }
        ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'skyshot') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i < 9; i++) { const x = f.x + (i - 4) * 6, y = f.y - 14 - u * 280 - hash(i) * 40; ctx.moveTo(x, y); ctx.lineTo(x + (i - 4) * 0.6, y - 20); }
        ctx.stroke(); ctx.lineCap = 'butt';
      } else if (f.type === 'lance') {
        const w = 30 * k + 4, L = f.len * Math.min(1, u * 5 + 0.2);
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(0, 0, L + 30, 0); gr.addColorStop(0, 'rgba(103,232,249,0.95)'); gr.addColorStop(1, 'rgba(103,232,249,0.1)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -w / 2); ctx.lineTo(L, -w * 0.12); ctx.lineTo(L + 34, 0); ctx.lineTo(L, w * 0.12); ctx.lineTo(0, w / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, -2, L, 4);
        ctx.restore();
      } else if (f.type === 'cutline') {   // a bright sword stroke left behind by a dash
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(251,113,133,' + 0.6 * k + ')'; ctx.lineWidth = 12 * k + 1; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + k + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
      } else if (f.type === 'warnline') {   // where a boss is about to charge
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(game.time * 22); ctx.fillStyle = '#ef4444'; ctx.fillRect(0, -f.w / 2, f.len, f.w);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -game.time * 60; ctx.strokeRect(0, -f.w / 2, f.len, f.w); ctx.setLineDash([]);
        ctx.restore();
      } else if (f.type === 'spinspear') {
        const a = f.angle + u * TAU * 1.25, sc = f.r / 52;
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#67e8f9', 0.55 * k); ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.8, a - 1.8, a); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, k * 3); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a); ctx.scale(sc, sc); ctx.translate(-10, 0); HeroArt.drawWeapon(ctx, 'spearman', game.time); ctx.restore();
      } else if (f.type === 'slash') {
        const sweep = Math.min(1, u * 3.5), a0 = f.angle - f.arc / 2, a1 = a0 + f.arc * sweep, R = f.radius * (0.88 + u * 0.15), wd = Math.max(7, f.radius * 0.34);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(f.color, 0.6 * k);
        ctx.beginPath(); ctx.arc(f.x, f.y, R, a0, a1);
        for (let i = 14; i >= 0; i--) { const v = i / 14, aa = a0 + (a1 - a0) * v, rr = R - wd * Math.sin(v * Math.PI); ctx.lineTo(f.x + Math.cos(aa) * rr, f.y + Math.sin(aa) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 * k + 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(f.x, f.y, R, a0, a1); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'beam') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        ctx.fillStyle = f.color; ctx.fillRect(0, -f.width / 2 * k, f.len, f.width * k);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -2, f.len * (1 - k * 0.3), 4); ctx.restore();
      } else if (f.type === 'ring') {
        ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 6) * k + 1;
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
        const w = (f.w || 18) * (0.35 + 0.65 * k), g = ctx.createLinearGradient(f.x, 0, f.x, f.y);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, f.color);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.fillRect(f.x - w / 2, 0, w, f.y);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(f.x - w * 0.15, 0, w * 0.3, f.y);
        blit(lightSprite(f.color), f.x, f.y, w * 3.2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.type === 'mark') {
        ctx.save();
        // a warning circle where a meteor is about to land
        ctx.globalAlpha = 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = f.color + '33'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k), 0, TAU); ctx.fill();
        ctx.restore();
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
    for (const f of flashes) { ctx.globalAlpha = (f.t / f.max) * f.a; ctx.fillStyle = f.color; ctx.fillRect(-30, -30, view.w + 60, view.h + 60); }
    ctx.globalAlpha = 1;
  }

  function startGame() {
    game.cls = classById(UI.selected);
    game.state = 'playing';
    game.player = new Player(game.cls, view.w / 2, view.h / 2);
    game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.particles = []; game.fx = []; game.zones = []; game.timers = []; game.texts = [];
    game.kills = 0; game.time = 0; game.shake = 0; game.slowT = 0; game.boss = null;
    game.waves = new WaveManager(); game.waves.startWave(1);
    Input.clear();
    UI.showPlaying();
  }
  function pause() { if (game.state !== 'playing') return; game.state = 'paused'; Input.clear(); UI.showPause(true); }
  function resume() { if (game.state !== 'paused') return; game.state = 'playing'; UI.showPause(false); }
  function toMenu() { game.state = 'menu'; game.player = null; game.boss = null; game.enemies = []; game.projectiles = []; game.enemyShots = []; game.minions = []; game.gems = []; game.fx = []; game.zones = []; game.timers = []; game.texts = []; UI.showMenu(); }

  // ===================================================================
  // 12. UI
  // ===================================================================
  const $ = (id) => document.getElementById(id);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  // a skill's drawn icon (icons.js) followed by its name
  const skillLabel = (sk) => '<img alt="" src="' + SkillIcons.url(sk.id, 48) + '">' + sk.name;
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
        b.innerHTML = '<span class="dot" style="background:' + c.color + '"></span><span class="bw"></span><div class="ic"><img alt="" src="' + heroImg(c.id, 96) + '"></div><div class="nm">' + c.name + '</div><div class="rl">' + c.role + '</div>';
        b.addEventListener('click', () => this.selectClass(c.id));
        b.addEventListener('dblclick', () => { this.selectClass(c.id); startGame(); });
        grid.appendChild(b);
      }
      $('howto').innerHTML = isTouch
        ? '<b>Drag on the left</b> to move. You aim automatically, or <b>drag on the right</b> to aim yourself. <b>Tap a skill</b> to cast it, or <b>drag from it</b> to aim it. Tap <b>AUTO</b> on a skill to have it cast itself. Collect <b>XP gems</b> to level up.'
        : 'Move with <b>WASD</b> or the <b>arrow keys</b>. You attack and aim automatically; <b>hold the mouse</b> to aim yourself. Skills (<b>Q</b> or Space, <b>E</b>, <b>R</b>) fire toward your <b>cursor</b>; <b>Shift+Q/E/R</b> or the <b>AUTO</b> tag makes a skill cast itself. Collect <b>XP gems</b> to level up and choose upgrades.';
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
      $('cdIcon').innerHTML = '<img alt="" src="' + heroImg(c.id, 128) + '">'; $('cdIcon').style.borderColor = c.color;
      $('cdName').textContent = c.name; $('cdRole').textContent = c.role; $('cdDesc').textContent = c.desc;
      $('cdSkills').innerHTML = '<div class="cd-label">SKILLS</div>' + c.abilities.map((sk, i) => '<div class="sk-row"><span class="sk-ic"><img alt="" src="' + SkillIcons.url(sk.id, 64) + '"></span><div><div class="sk-nm">' + sk.name + ' <span class="sk-key">' + SKILL_KEYS[i] + '</span><span class="sk-cd">' + (sk.cd ? sk.cd + 's' : 'no cooldown') + '</span></div><div class="cd-small">' + sk.desc + '</div></div></div>').join('');
      $('cdPassive').textContent = c.passive.text; $('cdBest').textContent = this.bestFor(id);
      // rough 0..1 ratings for the stat bars
      const dps = c.attack.kind === 'deploy' ? 26 : (s.damage / s.cooldown) * (1 + s.crit * (s.critMult - 1));
      const rows = [['HEALTH', s.maxHp / 240], ['DAMAGE', Math.min(1, dps / 60)], ['SPEED', (s.speed - 150) / 160], ['RANGE', Math.min(1, s.range / 560)], ['DEFENSE', Math.min(1, Math.max(0.05, s.armor + s.block + s.evasion + 0.1) / 0.8)]];
      $('cdStats').innerHTML = rows.map(([n, v]) => '<div class="st-row">' + n + '<div class="st-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div></div>').join('');
    },
    update() {
      const p = game.player; if (!p) return;
      const b = game.boss && !game.boss.dead ? game.boss : null;
      if (!this.el.bossBar) { this.el.bossBar = $('bossBar'); this.el.bossName = $('bossName'); this.el.bossFill = $('bossFill'); }
      if (b) {
        if (this.el.bossBar.classList.contains('hidden')) { this.el.bossName.textContent = b.def.name; this.el.bossBar.classList.remove('hidden'); this.el.bossBar.style.setProperty('--boss', b.def.color); }
        const w = Math.max(0, b.hp / b.maxHp * 100).toFixed(1) + '%';
        if (this.el.bossFill.style.width !== w) this.el.bossFill.style.width = w;
      } else if (!this.el.bossBar.classList.contains('hidden')) this.el.bossBar.classList.add('hidden');
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
      const named = { cry: '📯 Battle Cry', fortify: '🧱 Fortify', divine: '🛡️ Divine', smoke: '🌫️ Hidden', inner: '☯️ Peace', frenzy: '🔗 Frenzy', overdrive: '⚙️ Overdrive', bear: '🐻 Bear', overclock: '🔋 Overclock', sakura: '🌸 Blossom', firetrail: '👣 Fire Trail' };
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
    // auto-cast choices are remembered per hero
    loadAuto(id) {
      try { const all = JSON.parse(localStorage.getItem('survivalAutoCast') || '{}'); if (Array.isArray(all[id])) return [0, 1, 2].map((i) => !!all[id][i]); } catch (e) { /* ignore */ }
      return [false, false, false];
    },
    toggleAuto(i) {
      if (!game.cls || !game.cls.abilities[i]) return;
      game.autoCast[i] = !game.autoCast[i];
      try { const all = JSON.parse(localStorage.getItem('survivalAutoCast') || '{}'); all[game.cls.id] = game.autoCast.slice(); localStorage.setItem('survivalAutoCast', JSON.stringify(all)); } catch (e) { /* ignore */ }
      const b = this.abBtns && this.abBtns[i]; if (b) b.el.classList.toggle('auto', game.autoCast[i]);
      const sk = game.cls.abilities[i];
      this.el.abName.innerHTML = skillLabel(sk) + (game.autoCast[i] ? ': AUTO ON' : ': AUTO OFF');
      this.el.abName.classList.remove('hidden'); clearTimeout(this.abT); this.abT = setTimeout(() => this.el.abName.classList.add('hidden'), 1400);
    },
    flashAbility(sk) { if (sk) this.el.abName.innerHTML = skillLabel(sk); this.el.abName.classList.remove('hidden'); clearTimeout(this.abT); this.abT = setTimeout(() => this.el.abName.classList.add('hidden'), 1200); },
    hideAll() { for (const k of ['menu', 'pause', 'over', 'levelUp']) this.el[k].classList.add('hidden'); },
    showMenu() { this.hideAll(); this.selectClass(this.selected); this.el.menu.classList.remove('hidden'); this.el.hud.classList.add('hidden'); this.el.ab.classList.add('hidden'); this.el.abName.classList.add('hidden'); },
    showPlaying() {
      this.hideAll(); this.last = '';
      const c = game.cls;
      this.el.portraitIcon.innerHTML = '<img alt="" src="' + heroImg(c.id, 112) + '">'; this.el.portraitIcon.parentElement.style.borderColor = c.color;
      this.el.heroName.textContent = c.name;
      // one button per skill
      game.autoCast = this.loadAuto(c.id);
      this.el.ab.innerHTML = ''; this.abBtns = [];
      c.abilities.forEach((sk, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ab-btn' + (i === 0 ? ' main' : ''); b.title = sk.name + ' (' + SKILL_KEYS[i] + '): ' + sk.desc;
        b.innerHTML = '<span class="ab-ring"></span><span class="ab-icon"><img alt="" src="' + SkillIcons.url(sk.id, 128) + '"></span><span class="ab-cd"></span><span class="ab-key">' + (isTouch ? sk.name.split(' ')[0].toUpperCase() : (i === 0 ? 'Q / SPC' : SKILL_KEYS[i])) + '</span>'
          + '<span class="ab-auto" title="Auto-cast this skill' + (isTouch ? '' : ' (Shift+' + SKILL_KEYS[i] + ')') + '">AUTO</span>';
        // Tap = cast with auto-aim. Drag away from the button = aim it; release to cast that way.
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); e.preventDefault();
          if (game.state !== 'playing') return;
          try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          Input.skillDrag = { i, id: e.pointerId, ox: e.clientX, oy: e.clientY, a: 0, k: 0, on: false };
        });
        b.addEventListener('pointermove', (e) => {
          const d = Input.skillDrag; if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.ox, dy = e.clientY - d.oy, len = Math.hypot(dx, dy);
          if (len > 16) { d.on = true; d.a = Math.atan2(dy, dx); d.k = clamp(len / 110, 0.2, 1); }
          else d.on = false;   // dragged back onto the button: auto-aim again
        });
        b.addEventListener('pointerup', (e) => {
          const d = Input.skillDrag; if (!d || d.id !== e.pointerId) return;
          Input.skillDrag = null;
          if (game.state !== 'playing') return;
          const p = game.player, len = d.k * SKILL_REACH;
          p.useAbility(i, d.on ? { a: d.a, x: p.x + Math.cos(d.a) * len, y: p.y + Math.sin(d.a) * len } : null);
        });
        b.addEventListener('pointercancel', () => { Input.skillDrag = null; });
        const autoTag = b.querySelector('.ab-auto');
        autoTag.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.toggleAuto(i); });
        b.classList.toggle('auto', !!game.autoCast[i]);
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
          + '<div class="lc-art"><span><img alt="" src="' + SkillIcons.url('up_' + u.id, 128) + '"></span></div>'
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
        game.floatText(p.x, p.y - 30, u.name + (r.k > 1 ? ' (' + r.name + ')' : ''), r.k >= 3 ? '#fb923c' : r.k >= 2 ? '#c084fc' : r.k > 1 ? '#60a5fa' : '#fde68a', true);
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
      // big skills give a short slow-motion beat
      if (game.slowT > 0) { game.slowT -= dt; dt *= 0.3; }
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

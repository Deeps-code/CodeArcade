/* =====================================================================
   Wave Survivor: sound effects, made on the fly with the Web Audio API
   (no audio files to download).

   SFX.play(name, { vol, combo })   play a sound (rapid repeats are thinned out)
   SFX.toggle()                     mute / unmute (remembered), returns true when muted
   SFX.muted                        current state
   SFX.music(mode)                  background music: "menu" | "battle" | "boss" | "off"
   SFX.toggleMusic() / SFX.duck(on) music on/off (remembered) / quieter while paused
   Browsers only allow sound after the first tap / key press; that's handled here.
   ===================================================================== */
(() => {
  'use strict';
  let ac = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem('survivalMute') === '1'; } catch (e) { /* storage blocked */ }
  // background music state (the engine is further down)
  const M = { want: 'off', mode: 'off', on: true, duck: false, gain: null, step: 0, next: 0 };
  try { M.on = localStorage.getItem('survivalMusic') !== '0'; } catch (e) { /* storage blocked */ }
  const musicLevel = () => (M.on ? (M.duck ? 0.18 : 0.42) : 0);
  const last = {};
  const rnd = (a, b) => a + Math.random() * (b - a);

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
      const comp = ac.createDynamicsCompressor();   // keeps many sounds at once from clipping
      comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ac.destination);
      // background music has its own volume, so it can be switched off separately
      M.gain = ac.createGain(); M.gain.gain.value = musicLevel(); M.gain.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // unlock audio on the first interaction
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, ensure, { passive: true });

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  // a pitched tone that can slide from f0 to f1
  //   (o.at = an exact start time, o.dest = where it goes, o.lp = a lowpass filter, o.detune in cents)
  function tone(o) {
    const t = o.at ?? ac.currentTime + (o.delay || 0), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    env(g, t, o.vol, o.attack || 0.005, o.dur);
    let out = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
    out.connect(g); g.connect(o.dest || master); osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  // filtered noise: whooshes, thuds, explosions
  function noise(o) {
    const t = o.at ?? ac.currentTime + (o.delay || 0), src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = o.filter || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    env(g, t, o.vol, o.attack || 0.004, o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || master);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.03);
  }
  // a quick run of notes
  const arp = (notes, step, o) => notes.forEach((f, i) => tone({ ...o, f0: f, delay: (o.delay || 0) + i * step }));

  // gap = the shortest time between two of the same sound
  const SOUNDS = {
    swing:  { gap: 0.06, play: (v) => noise({ filter: 'bandpass', f0: 2200, f1: 500, q: 1.3, dur: 0.15, vol: 0.28 * v }) },
    magic:  { gap: 0.05, play: (v) => { tone({ type: 'triangle', f0: rnd(850, 1000), f1: 320, dur: 0.13, vol: 0.12 * v }); tone({ type: 'sine', f0: 1800, f1: 900, dur: 0.06, vol: 0.04 * v }); } },
    arrow:  { gap: 0.05, play: (v) => { tone({ type: 'triangle', f0: 440, f1: 190, dur: 0.09, vol: 0.15 * v }); noise({ filter: 'highpass', f0: 3500, dur: 0.06, vol: 0.08 * v }); } },
    gun:    { gap: 0.06, play: (v) => { noise({ filter: 'lowpass', f0: 2800, f1: 400, dur: 0.07, vol: 0.16 * v }); tone({ type: 'square', f0: 170, f1: 60, dur: 0.05, vol: 0.05 * v }); } },
    hit:    { gap: 0.045, play: (v) => { noise({ filter: 'lowpass', f0: 1000, f1: 200, dur: 0.08, vol: 0.2 * v }); tone({ type: 'sine', f0: rnd(200, 250), f1: 90, dur: 0.07, vol: 0.1 * v }); } },
    crit:   { gap: 0.08, play: (v) => { tone({ type: 'square', f0: 1500, f1: 950, dur: 0.07, vol: 0.05 * v }); tone({ type: 'sine', f0: 2200, dur: 0.14, vol: 0.06 * v, delay: 0.01 }); } },
    pop:    { gap: 0.04, play: (v) => tone({ type: 'sine', f0: 520 * rnd(0.85, 1.15), f1: 110, dur: 0.12, vol: 0.13 * v }) },
    hurt:   { gap: 0.15, play: (v) => { tone({ type: 'sawtooth', f0: 190, f1: 70, dur: 0.22, vol: 0.14 * v }); noise({ filter: 'lowpass', f0: 650, dur: 0.15, vol: 0.2 * v }); } },
    gem:    { gap: 0.03, play: (v, o) => { const f = 880 * Math.pow(2, Math.min(14, o.combo || 0) / 12); tone({ type: 'sine', f0: f, dur: 0.09, vol: 0.07 * v }); tone({ type: 'triangle', f0: f * 2, dur: 0.06, vol: 0.025 * v, delay: 0.02 }); } },
    levelup:{ gap: 0.3, play: (v) => arp([523, 659, 784, 1047], 0.07, { type: 'triangle', dur: 0.24, vol: 0.12 * v }) },
    chest:  { gap: 0.3, play: (v) => { arp([784, 988, 1175, 1568, 1976], 0.06, { type: 'sine', dur: 0.32, vol: 0.1 * v }); noise({ filter: 'highpass', f0: 5000, dur: 0.55, vol: 0.05 * v }); } },
    pick:   { gap: 0.2, play: (v) => tone({ type: 'triangle', f0: 660, f1: 1320, dur: 0.18, vol: 0.12 * v }) },
    cast:   { gap: 0.08, play: (v) => { noise({ filter: 'bandpass', f0: 400, f1: 2600, q: 2, dur: 0.26, vol: 0.18 * v }); tone({ type: 'sine', f0: 300, f1: 900, dur: 0.26, vol: 0.07 * v }); } },
    dash:   { gap: 0.05, play: (v) => { noise({ filter: 'bandpass', f0: 3200, f1: 700, q: 1.5, dur: 0.16, vol: 0.22 * v }); tone({ type: 'sine', f0: 1900, f1: 2700, dur: 0.06, vol: 0.035 * v }); } },
    boom:   { gap: 0.06, play: (v) => { noise({ filter: 'lowpass', f0: 1300, f1: 80, dur: 0.6, vol: 0.38 * v }); tone({ type: 'sine', f0: 110, f1: 35, dur: 0.5, vol: 0.28 * v }); } },
    slam:   { gap: 0.1, play: (v) => { noise({ filter: 'lowpass', f0: 520, f1: 60, dur: 0.5, vol: 0.38 * v }); tone({ type: 'sine', f0: 85, f1: 30, dur: 0.45, vol: 0.32 * v }); } },
    wave:   { gap: 0.5, play: (v) => { tone({ type: 'sawtooth', f0: 220, dur: 0.26, vol: 0.05 * v }); tone({ type: 'sawtooth', f0: 330, dur: 0.42, vol: 0.05 * v, delay: 0.22 }); } },
    clear:  { gap: 0.5, play: (v) => arp([392, 523, 659], 0.1, { type: 'triangle', dur: 0.26, vol: 0.1 * v }) },
    bossRoar: { gap: 1, play: (v) => { tone({ type: 'sawtooth', f0: 140, f1: 45, dur: 1.2, vol: 0.16 * v }); noise({ filter: 'lowpass', f0: 700, f1: 120, dur: 1.1, vol: 0.24 * v }); tone({ type: 'square', f0: 70, f1: 40, dur: 1.0, vol: 0.07 * v }); } },
    bossDie:  { gap: 1, play: (v) => { SOUNDS.boom.play(v * 1.3); arp([523, 659, 784, 1047, 1319], 0.09, { type: 'triangle', dur: 0.36, vol: 0.11 * v, delay: 0.25 }); } },
    enemyShot:{ gap: 0.12, play: (v) => tone({ type: 'square', f0: 320, f1: 150, dur: 0.1, vol: 0.035 * v }) },
    fuse:   { gap: 0.4, play: (v) => noise({ filter: 'highpass', f0: 4200, dur: 0.75, vol: 0.06 * v, attack: 0.05 }) },
    charge: { gap: 0.5, play: (v) => tone({ type: 'sawtooth', f0: 90, f1: 240, dur: 0.7, vol: 0.09 * v, attack: 0.05 }) },
    build:  { gap: 0.1, play: (v) => { tone({ type: 'square', f0: 330, dur: 0.05, vol: 0.05 * v }); tone({ type: 'square', f0: 495, dur: 0.06, vol: 0.05 * v, delay: 0.06 }); } },
    gameover: { gap: 1, play: (v) => arp([392, 330, 262, 196], 0.18, { type: 'triangle', dur: 0.42, vol: 0.12 * v }) },
    click:  { gap: 0.05, play: (v) => tone({ type: 'triangle', f0: 720, f1: 520, dur: 0.05, vol: 0.07 * v }) },
  };

  function play(name, o = {}) {
    if (muted) return;
    const s = SOUNDS[name]; if (!s || !ensure() || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (now - (last[name] ?? -9) < s.gap) return;
    last[name] = now;
    try { s.play(o.vol ?? 1, o); } catch (e) { /* never let a sound break the game */ }
  }
  function toggle() {
    muted = !muted;
    try { localStorage.setItem('survivalMute', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.value = muted ? 0 : 0.55;
    if (!muted) { ensure(); play('click'); }
    return muted;
  }
  // ===================================================================
  // Background music: a looping dark-fantasy track in A minor, generated live.
  //   menu   calm pads and a slow arpeggio
  //   battle a driving groove: bass, arpeggio, drums
  //   boss   faster and heavier, with a darker chord change
  // Changes of mood wait for the next bar so it never jumps mid-phrase.
  // ===================================================================
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note -> Hz
  const MOODS = {
    menu:   { bpm: 74,  chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], drums: 0, bass: 0, arp: 'slow' },
    battle: { bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], drums: 1, bass: 1, arp: 'fast' },
    boss:   { bpm: 132, chords: [[57, 60, 64], [58, 62, 65], [57, 60, 64], [52, 56, 59]], drums: 2, bass: 2, arp: 'fast' },
  };
  const has = (arr, s) => arr.indexOf(s) >= 0;
  function playStep(md, step, t, spb) {
    const bar = Math.floor(step / 16), s = step % 16, ch = md.chords[bar % 4], dest = M.gain;
    // pads: a soft, slightly detuned chord held for the whole bar
    if (s === 0) for (const n of ch) for (const dt of [-8, 8]) tone({ at: t, type: 'triangle', f0: mf(n), detune: dt, dur: spb * 16, vol: 0.022, attack: 0.5, lp: 1400, dest });
    // bass
    if (md.bass === 0 && s === 0) tone({ at: t, type: 'sine', f0: mf(ch[0] - 24), dur: spb * 15, vol: 0.09, attack: 0.3, dest });
    if (md.bass === 1 && has([0, 3, 6, 8, 10, 12, 14], s)) tone({ at: t, type: 'sawtooth', f0: mf(ch[0] - (s === 6 || s === 14 ? 12 : 24)), dur: spb * 1.8, vol: 0.07, lp: 420, dest });
    if (md.bass === 2 && s % 2 === 0) tone({ at: t, type: 'sawtooth', f0: mf(ch[0] - (s % 8 === 6 ? 12 : 24)), dur: spb * 1.6, vol: 0.08, lp: 700, dest });
    // arpeggio over the chord
    if (md.arp === 'slow' && s % 4 === 0) tone({ at: t, type: 'triangle', f0: mf(ch[(s / 4) % 3] + 12 + (bar % 2 ? 12 : 0)), dur: spb * 5, vol: 0.03, attack: 0.02, lp: 2200, dest });
    if (md.arp === 'fast' && s % 2 === 0) tone({ at: t, type: 'square', f0: mf(ch[(s / 2) % 3] + 12 + (Math.floor(s / 8) % 2 ? 12 : 0)), dur: spb * 1.4, vol: 0.016, lp: 1800, dest });
    // drums
    if (md.drums) {
      const kicks = md.drums === 2 ? [0, 4, 8, 12, 14] : bar % 2 ? [0, 8, 10] : [0, 8];
      if (has(kicks, s)) tone({ at: t, type: 'sine', f0: 140, f1: 42, dur: 0.2, vol: 0.2, dest });
      if (s === 4 || s === 12) { noise({ at: t, filter: 'bandpass', f0: 1900, q: 0.9, dur: 0.13, vol: 0.08, dest }); tone({ at: t, type: 'triangle', f0: 200, f1: 150, dur: 0.07, vol: 0.04, dest }); }
      if (md.drums === 2 || s % 2 === 1) noise({ at: t, filter: 'highpass', f0: 7500, dur: 0.03, vol: md.drums === 2 ? 0.025 : 0.03, dest });
      if (md.drums === 2 && step === 0) noise({ at: t, filter: 'highpass', f0: 3000, dur: 1.2, vol: 0.05, dest });   // a crash every 4 bars
    }
  }
  function musicTick() {
    if (!ac || ac.state !== 'running' || !M.gain) return;
    if (M.mode !== M.want) {
      // start / stop right away; switch between moods on the next bar
      if (M.mode === 'off' || M.want === 'off') { M.mode = M.want; M.step = 0; M.next = ac.currentTime + 0.05; }
      else if (M.step % 16 === 0) M.mode = M.want;
    }
    if (M.mode === 'off') return;
    const md = MOODS[M.mode], spb = 60 / md.bpm / 4;   // seconds per 16th note
    if (M.next < ac.currentTime) M.next = ac.currentTime + 0.05;
    while (M.next < ac.currentTime + 0.2) {
      try { playStep(md, M.step, M.next, spb); } catch (e) { /* never let music break the game */ }
      M.next += spb; M.step = (M.step + 1) % 64;
      if (M.mode !== M.want && M.step % 16 === 0) break;   // let the next tick switch moods on the bar
    }
  }
  setInterval(musicTick, 40);
  function music(mode) { M.want = MOODS[mode] ? mode : 'off'; }
  function setMusicGain() { if (M.gain) M.gain.gain.setTargetAtTime(musicLevel(), ac.currentTime, 0.15); }
  function toggleMusic() {
    M.on = !M.on;
    try { localStorage.setItem('survivalMusic', M.on ? '1' : '0'); } catch (e) { /* ignore */ }
    ensure(); setMusicGain();
    return M.on;
  }
  function duck(on) { M.duck = !!on; setMusicGain(); }   // quieter while paused

  window.SFX = { play, toggle, music, toggleMusic, duck, get muted() { return muted; }, get musicOn() { return M.on; }, get musicMode() { return M.mode; } };
})();

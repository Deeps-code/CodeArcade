import { useEffect, useRef } from 'react'

// Interactive background: neon arcade pieces float around.
// - Move the mouse / finger near them to push them away (they light up).
// - Click / tap a piece to pop it into sparks (it respawns later).
// - Click empty space to send out a small push wave.
const COLORS = ['#ff4fa3', '#4fd1ff', '#a78bfa', '#ffd23f', '#5dffb0']
const TYPES = ['block', 'coin', 'diamond', 'plus', 'triangle', 'star', 'controller']

export default function Background() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const PUSH_RADIUS = 160
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    let lite = false

    let W = 0, H = 0, dpr = 1
    let pieces = []
    // Space layers
    const STAR_MARGIN = 40 // extra edge so parallax never shows a gap
    let starLayer = null
    let galaxy = null, galaxyR = 0, galaxySpin = 0
    let twinklers = []
    let shootingStars = []
    let nextShootingStar = 3
    let time = 0
    const parallax = { x: 0, y: 0 }
    let sparks = []
    let rings = []
    let popups = []
    let raf = 0
    let last = performance.now()
    const pointer = { x: -9999, y: -9999 }

    const rand = (a, b) => a + Math.random() * (b - a)
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

    function makePiece(fromEdge = false) {
      const size = rand(14, 30)
      let x = rand(0, W), y = rand(0, H)
      if (fromEdge) {
        // Enter from a random edge so respawns don't pop out of nowhere.
        const side = Math.floor(Math.random() * 4)
        if (side === 0) { x = -size * 2; y = rand(0, H) }
        if (side === 1) { x = W + size * 2; y = rand(0, H) }
        if (side === 2) { y = -size * 2; x = rand(0, W) }
        if (side === 3) { y = H + size * 2; x = rand(0, W) }
      }
      const angle = Math.random() * Math.PI * 2
      const speed = rand(8, 22) // px per second
      const bvx = Math.cos(angle) * speed
      const bvy = Math.sin(angle) * speed
      return {
        type: pick(TYPES), color: pick(COLORS), size,
        x, y, vx: bvx, vy: bvy, bvx, bvy,
        rot: Math.random() * Math.PI * 2, vrot: rand(-0.5, 0.5),
        glow: 0,
        fade: fromEdge ? 0 : 1,
      }
    }

    // Roughly bell-shaped random number around 0 (about -1..1).
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
    const STAR_TINTS = ['255,255,255', '200,220,255', '255,236,214', '222,204,255', '190,240,255']

    // Pre-render the static star field + Milky Way band once (cheap to draw every frame).
    function buildStarLayer() {
      const lw = W + STAR_MARGIN * 2
      const lh = H + STAR_MARGIN * 2
      const c = document.createElement('canvas')
      c.width = lw * dpr
      c.height = lh * dpr
      const g = c.getContext('2d')
      g.setTransform(dpr, 0, 0, dpr, 0, 0)

      // The band runs diagonally from bottom-left to top-right.
      const x0 = -lw * 0.1, y0 = lh * 0.92, x1 = lw * 1.1, y1 = lh * 0.08
      const len = Math.hypot(x1 - x0, y1 - y0)
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len // perpendicular
      const bandWidth = Math.min(lw, lh) * 0.16
      const onBand = (spread) => {
        const t = Math.random()
        const off = gauss() * bandWidth * spread
        return [x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]
      }

      // Glowing dust clouds along the band
      g.globalCompositeOperation = 'lighter'
      const dust = ['130,90,255', '255,90,180', '90,160,255', '120,220,255']
      for (let i = 0; i < 70; i++) {
        const [x, y] = onBand(0.9)
        const r = rand(bandWidth * 0.5, bandWidth * 1.4)
        const col = pick(dust)
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, `rgba(${col},0.07)`)
        grad.addColorStop(1, `rgba(${col},0)`)
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }

      // Stars: a good share packed into the band, the rest scattered.
      const count = Math.round((lw * lh) / 1700)
      for (let i = 0; i < count; i++) {
        const inBand = Math.random() < 0.55
        const [x, y] = inBand ? onBand(0.7) : [Math.random() * lw, Math.random() * lh]
        const big = Math.random() < 0.04
        const r = big ? rand(1, 1.6) : rand(0.25, 0.9)
        g.fillStyle = `rgba(${pick(STAR_TINTS)},${rand(0.35, 0.95)})`
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      return c
    }

    // Pre-render a spiral galaxy once; it's rotated when drawn.
    function buildGalaxy(R) {
      const c = document.createElement('canvas')
      const size = Math.ceil(R * 2 * dpr)
      c.width = c.height = size
      const g = c.getContext('2d')
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.translate(R, R)

      const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.4)
      core.addColorStop(0, 'rgba(255,244,225,0.95)')
      core.addColorStop(0.15, 'rgba(255,205,170,0.5)')
      core.addColorStop(0.5, 'rgba(170,120,255,0.12)')
      core.addColorStop(1, 'rgba(120,80,255,0)')
      g.fillStyle = core
      g.beginPath()
      g.arc(0, 0, R * 0.4, 0, Math.PI * 2)
      g.fill()

      g.globalCompositeOperation = 'lighter'
      const ARMS = 3
      const armColors = ['150,185,255', '205,165,255', '255,140,205', '170,225,255']
      for (let i = 0; i < 3200; i++) {
        const arm = i % ARMS
        const t = Math.pow(Math.random(), 0.65) // more stars toward the center
        const r = t * R * 0.95
        const a = (arm * Math.PI * 2) / ARMS + t * 5.2 + gauss() * 0.4 * (1 - t * 0.4)
        const x = Math.cos(a) * r + gauss() * R * 0.025
        const y = Math.sin(a) * r + gauss() * R * 0.025
        const col = t < 0.18 ? '255,232,205' : pick(armColors)
        g.fillStyle = `rgba(${col},${(1 - t) * 0.55 + 0.12})`
        const s = rand(0.5, 1.4)
        g.fillRect(x, y, s, s)
      }
      return c
    }

    function init() {
      W = window.innerWidth
      // Use the background's own (largest-viewport) height so it covers the screen
      // whether or not the phone's address bar is showing.
      H = Math.max(window.innerHeight, canvas.parentElement.clientHeight)
      // Phones / small screens: a lighter background (30 fps, fewer pieces and twinkling stars).
      // It sits behind the content, so the difference is hard to see but saves a lot of work.
      lite = isTouch || W < 700
      // Always match the screen's real sharpness (up to 2x) so the shapes stay crisp;
      // lite mode saves its work with fewer things and 30 fps instead.
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingQuality = 'high' // smooth, sharp downscaling of the piece sprites

      starLayer = buildStarLayer()
      galaxyR = Math.max(70, Math.min(W, H) * 0.2)
      galaxy = buildGalaxy(galaxyR)

      // Brighter stars that twinkle (drawn live each frame).
      const tw = Math.round(Math.min(90, Math.max(30, (W * H) / 20000)) * (lite ? 0.6 : 1))
      twinklers = Array.from({ length: tw }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() < 0.18 ? rand(1.4, 2.2) : rand(0.7, 1.3),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.8, 2.6),
        color: pick(STAR_TINTS),
      }))

      // Fewer pieces on small screens.
      const count = lite ? 12 : Math.round(Math.min(28, Math.max(12, (W * H) / 45000)))
      pieces = Array.from({ length: count }, () => makePiece())
    }

    function spawnShootingStar() {
      const fromLeft = Math.random() < 0.5
      const angle = fromLeft ? rand(0.25, 0.6) : Math.PI - rand(0.25, 0.6)
      const speed = rand(700, 1100)
      shootingStars.push({
        x: fromLeft ? rand(-50, W * 0.5) : rand(W * 0.5, W + 50),
        y: rand(-30, H * 0.35),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        len: rand(120, 220),
      })
    }

    function drawSpace() {
      // Background stars + Milky Way (slight parallax for depth)
      ctx.drawImage(starLayer, -STAR_MARGIN + parallax.x, -STAR_MARGIN + parallax.y, W + STAR_MARGIN * 2, H + STAR_MARGIN * 2)

      // Spiral galaxy, tilted and slowly spinning
      const gx = W * (W < 600 ? 0.78 : 0.82) + parallax.x * 1.8
      const gy = H * 0.22 + parallax.y * 1.8
      ctx.save()
      ctx.translate(gx, gy)
      ctx.rotate(-0.45)
      ctx.scale(1, 0.42)
      ctx.rotate(galaxySpin)
      ctx.globalAlpha = 0.85
      ctx.drawImage(galaxy, -galaxyR, -galaxyR, galaxyR * 2, galaxyR * 2)
      ctx.restore()

      // Twinkling stars with little light flares on the bright ones
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const s of twinklers) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase))
        const x = s.x + parallax.x * 1.4
        const y = s.y + parallax.y * 1.4
        ctx.globalAlpha = a
        ctx.fillStyle = `rgb(${s.color})`
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
        if (s.r > 1.4) {
          const f = s.r * 5 * a
          ctx.strokeStyle = `rgba(${s.color},${0.5 * a})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.moveTo(x - f, y); ctx.lineTo(x + f, y)
          ctx.moveTo(x, y - f); ctx.lineTo(x, y + f)
          ctx.stroke()
        }
      }

      // Shooting stars
      for (const s of shootingStars) {
        const sp = Math.hypot(s.vx, s.vy)
        const tx = s.x - (s.vx / sp) * s.len
        const ty = s.y - (s.vy / sp) * s.len
        const grad = ctx.createLinearGradient(s.x, s.y, tx, ty)
        grad.addColorStop(0, `rgba(255,255,255,${s.life})`)
        grad.addColorStop(0.3, `rgba(170,200,255,${s.life * 0.5})`)
        grad.addColorStop(1, 'rgba(170,200,255,0)')
        ctx.globalAlpha = 1
        ctx.strokeStyle = grad
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }
      ctx.restore()
    }

    function stepSpace(dt) {
      time += dt
      galaxySpin += dt * 0.04

      // Parallax eases toward the pointer (centered when there's no pointer).
      const hasPointer = pointer.x > -1000
      const tx = hasPointer ? -(pointer.x - W / 2) * 0.018 : 0
      const ty = hasPointer ? -(pointer.y - H / 2) * 0.018 : 0
      parallax.x += (tx - parallax.x) * Math.min(1, dt * 2)
      parallax.y += (ty - parallax.y) * Math.min(1, dt * 2)

      nextShootingStar -= dt
      if (nextShootingStar <= 0) {
        spawnShootingStar()
        nextShootingStar = rand(3, 8)
      }
      for (const s of shootingStars) {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.life -= dt * 0.9
      }
      shootingStars = shootingStars.filter((s) => s.life > 0 && s.x > -300 && s.x < W + 300 && s.y < H + 300)
    }

    // ---------- Shapes (drawn around 0,0 with "radius" s) ----------
    // `pc` is the canvas the shape helpers draw into (the screen, or a piece's sprite).
    let pc = ctx
    function roundRectPath(x, y, w, h, r) {
      pc.moveTo(x + r, y)
      pc.arcTo(x + w, y, x + w, y + h, r)
      pc.arcTo(x + w, y + h, x, y + h, r)
      pc.arcTo(x, y + h, x, y, r)
      pc.arcTo(x, y, x + w, y, r)
      pc.closePath()
    }

    function shapePath(type, s) {
      pc.beginPath()
      switch (type) {
        case 'block':
          roundRectPath(-s, -s, s * 2, s * 2, s * 0.3)
          roundRectPath(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.12)
          break
        case 'coin':
          pc.arc(0, 0, s, 0, Math.PI * 2)
          pc.moveTo(s * 0.62, 0)
          pc.arc(0, 0, s * 0.62, 0, Math.PI * 2)
          pc.moveTo(0, -s * 0.35)
          pc.lineTo(0, s * 0.35)
          break
        case 'diamond':
          pc.moveTo(0, -s * 1.15)
          pc.lineTo(s * 0.85, 0)
          pc.lineTo(0, s * 1.15)
          pc.lineTo(-s * 0.85, 0)
          pc.closePath()
          break
        case 'plus': {
          const a = s * 0.34
          pc.moveTo(-a, -s); pc.lineTo(a, -s); pc.lineTo(a, -a); pc.lineTo(s, -a)
          pc.lineTo(s, a); pc.lineTo(a, a); pc.lineTo(a, s); pc.lineTo(-a, s)
          pc.lineTo(-a, a); pc.lineTo(-s, a); pc.lineTo(-s, -a); pc.lineTo(-a, -a)
          pc.closePath()
          break
        }
        case 'triangle':
          for (let i = 0; i < 3; i++) {
            const ang = -Math.PI / 2 + (i * Math.PI * 2) / 3
            const px = Math.cos(ang) * s * 1.15
            const py = Math.sin(ang) * s * 1.15
            if (i === 0) pc.moveTo(px, py); else pc.lineTo(px, py)
          }
          pc.closePath()
          break
        case 'star':
          for (let i = 0; i < 10; i++) {
            const ang = -Math.PI / 2 + (i * Math.PI) / 5
            const r = i % 2 === 0 ? s * 1.15 : s * 0.5
            const px = Math.cos(ang) * r
            const py = Math.sin(ang) * r
            if (i === 0) pc.moveTo(px, py); else pc.lineTo(px, py)
          }
          pc.closePath()
          break
        case 'controller': {
          const w = s * 1.4, h = s * 0.8
          roundRectPath(-w, -h, w * 2, h * 2, h * 0.9)
          // D-pad
          const dx = -w * 0.5, d = s * 0.28, t = s * 0.09
          pc.moveTo(dx - d, -t); pc.lineTo(dx + d, -t); pc.lineTo(dx + d, t); pc.lineTo(dx - d, t); pc.closePath()
          pc.moveTo(dx - t, -d); pc.lineTo(dx + t, -d); pc.lineTo(dx + t, d); pc.lineTo(dx - t, d); pc.closePath()
          // Buttons
          pc.moveTo(w * 0.42 + s * 0.13, -s * 0.15)
          pc.arc(w * 0.42, -s * 0.15, s * 0.13, 0, Math.PI * 2)
          pc.moveTo(w * 0.68 + s * 0.13, s * 0.12)
          pc.arc(w * 0.68, s * 0.12, s * 0.13, 0, Math.PI * 2)
          break
        }
      }
    }

    // Each piece's glowing outline is drawn ONCE into a small sprite, then just stamped
    // every frame. Canvas glow (shadowBlur) is very slow, especially on phones.
    const GLOW = 8
    // Sprites are drawn sharper than the screen so rotating / scaling them never looks soft.
    const spriteRes = () => Math.min(dpr * 1.5, 3)
    function makeSprite(p) {
      const half = p.size * 1.5 + GLOW * 1.6
      const c = document.createElement('canvas')
      const r = spriteRes()
      c.width = c.height = Math.ceil(half * 2 * r)
      const g = c.getContext('2d')
      g.setTransform(r, 0, 0, r, half * r, half * r)
      pc = g
      shapePath(p.type, p.size)
      pc = ctx
      g.fillStyle = p.color + '14' // very faint fill (hex alpha)
      g.fill('evenodd')
      g.lineWidth = 2.2
      g.lineJoin = 'round'
      g.strokeStyle = p.color
      g.shadowColor = p.color
      g.shadowBlur = GLOW
      g.stroke()
      g.shadowBlur = 0
      g.stroke() // crisp line on top of its glow
      p.sprite = c
      p.spriteHalf = half
    }

    function drawPiece(p) {
      if (!p.sprite) makeSprite(p)
      const glow = p.glow
      const scale = 1 + glow * 0.18
      const h = p.spriteHalf
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.scale(scale, scale)
      ctx.globalAlpha = p.fade * (0.55 + glow * 0.45)
      ctx.drawImage(p.sprite, -h, -h, h * 2, h * 2)
      if (glow > 0.05) {
        // Near the pointer: stamp it again additively so it lights up
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = p.fade * glow * 0.6
        ctx.drawImage(p.sprite, -h, -h, h * 2, h * 2)
      }
      ctx.restore()
    }

    // ---------- Popping ----------
    function pop(p) {
      const n = 16
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rand(-0.2, 0.2)
        const speed = rand(80, 260)
        sparks.push({
          x: p.x, y: p.y,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          life: 1, decay: rand(1.2, 2), size: rand(1.5, 3.5), color: p.color,
        })
      }
      rings.push({ x: p.x, y: p.y, r: p.size, life: 1, color: p.color })
      popups.push({ x: p.x, y: p.y, life: 1, color: p.color })
      // Respawn a new piece from the edge after a short break.
      const idx = pieces.indexOf(p)
      if (idx !== -1) pieces.splice(idx, 1)
      setTimeout(() => pieces.push(makePiece(true)), 1500)
    }

    function shockwave(x, y) {
      rings.push({ x, y, r: 6, life: 1, color: '#ffffff' })
      for (const p of pieces) {
        const dx = p.x - x, dy = p.y - y
        const d = Math.hypot(dx, dy)
        if (d < 260 && d > 0.01) {
          const f = (1 - d / 260) * 420
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
          p.vrot += rand(-3, 3)
        }
      }
    }

    function pieceAt(x, y) {
      // Topmost (last drawn) piece wins.
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]
        if (Math.hypot(p.x - x, p.y - y) < p.size * 1.35) return p
      }
      return null
    }

    // ---------- Simulation ----------
    function step(dt) {
      for (const p of pieces) {
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const d = Math.hypot(dx, dy)
        const near = d < PUSH_RADIUS
        if (near && d > 0.01) {
          const f = (1 - d / PUSH_RADIUS) * 900 * dt
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
          p.vrot += (Math.random() - 0.5) * 4 * dt
        }
        // Glow when the pointer is close.
        const targetGlow = near ? 1 - d / PUSH_RADIUS : 0
        p.glow += (targetGlow - p.glow) * Math.min(1, dt * 8)

        // Ease back toward their natural drift.
        const ease = Math.min(1, dt * 1.2)
        p.vx += (p.bvx - p.vx) * ease
        p.vy += (p.bvy - p.vy) * ease
        p.vrot += (Math.sign(p.vrot || 1) * 0.3 - p.vrot) * Math.min(1, dt * 0.8)

        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vrot * dt
        p.fade = Math.min(1, p.fade + dt * 0.8)

        // Wrap around the edges.
        const m = p.size * 2
        if (p.x < -m) p.x = W + m
        if (p.x > W + m) p.x = -m
        if (p.y < -m) p.y = H + m
        if (p.y > H + m) p.y = -m
      }

      for (const s of sparks) {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vx *= 1 - dt * 2.5
        s.vy *= 1 - dt * 2.5
        s.life -= s.decay * dt
      }
      sparks = sparks.filter((s) => s.life > 0)

      for (const r of rings) { r.r += 220 * dt; r.life -= dt * 1.8 }
      rings = rings.filter((r) => r.life > 0)

      for (const t of popups) { t.y -= 40 * dt; t.life -= dt * 1.2 }
      popups = popups.filter((t) => t.life > 0)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      drawSpace()
      for (const p of pieces) drawPiece(p)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const r of rings) {
        ctx.globalAlpha = r.life * 0.6
        ctx.strokeStyle = r.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (const s of sparks) {
        ctx.globalAlpha = Math.max(0, s.life)
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      ctx.save()
      ctx.font = '700 16px "Space Grotesk", system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const t of popups) {
        ctx.globalAlpha = Math.max(0, t.life)
        ctx.fillStyle = t.color
        ctx.shadowColor = t.color
        ctx.shadowBlur = 10
        ctx.fillText('+1', t.x, t.y - 20)
      }
      ctx.restore()
    }

    // On lite devices only redraw ~30 times a second; that's plenty for slow drifting.
    let frameAcc = 0
    function loop(now) {
      frameAcc += (now - last) / 1000
      last = now
      if (frameAcc >= (lite ? 1 / 31 : 0)) {
        const dt = Math.min(frameAcc, 0.05)
        frameAcc = 0
        stepSpace(dt)
        step(dt)
        draw()
      }
      raf = requestAnimationFrame(loop)
    }

    function start() {
      cancelAnimationFrame(raf)
      last = performance.now()
      if (reduceMotion) draw()
      else raf = requestAnimationFrame(loop)
    }

    // ---------- Input ----------
    const onMove = (e) => { pointer.x = e.clientX; pointer.y = e.clientY }
    const onLeave = () => { pointer.x = -9999; pointer.y = -9999 }
    const onDown = (e) => {
      // Let clicks on cards, buttons, links and inputs behave normally.
      if (e.target.closest && e.target.closest('a, button, input, .card, .nav')) return
      if (reduceMotion) return
      const p = pieceAt(e.clientX, e.clientY)
      if (p) pop(p)
      else shockwave(e.clientX, e.clientY)
    }
    // A finger lifting off the screen shouldn't leave the "pointer" stuck there.
    const onUp = (e) => { if (e.pointerType !== 'mouse') onLeave() }
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else start()
    }
    let resizeTimer = 0
    const onResize = () => {
      // Phones fire resize when the address bar shows/hides during scrolling.
      // Rebuilding then would re-randomize everything and flicker, so skip
      // height-only changes that still fit inside the current canvas.
      const h = Math.max(window.innerHeight, canvas.parentElement.clientHeight)
      if (window.innerWidth === W && h <= H) return
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { init(); start() }, 150)
    }

    init()
    start()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="bg" aria-hidden="true">
      <div className="nebula nebula-1" />
      <div className="nebula nebula-2" />
      <div className="nebula nebula-3" />
      <div className="nebula-band" />
      <canvas ref={canvasRef} className="bg-canvas" />
      <div className="vignette" />
    </div>
  )
}

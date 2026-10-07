/**
 * Synthesized sound kit + background music (WebAudio). Nothing to download.
 * Browsers only allow audio after a user gesture, so the context is created lazily.
 */

let ctx = null
let master = null
let sfxBus = null
let musicBus = null
let reverb = null
let sfxOn = true
let musicOn = true
let musicTimer = null

function impulse(c, seconds = 1.6, decay = 3) {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.7
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 3
  master.connect(comp)
  comp.connect(ctx.destination)
  sfxBus = ctx.createGain()
  sfxBus.gain.value = sfxOn ? 1 : 0
  sfxBus.connect(master)
  musicBus = ctx.createGain()
  musicBus.gain.value = musicOn ? 0.16 : 0
  musicBus.connect(master)
  reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.22
  reverb.connect(wet)
  wet.connect(master)
  startMusic()
  return ctx
}

export function unlockAudio() {
  const c = ensure()
  if (c && c.state === 'suspended') c.resume()
}

export function setSfx(on) {
  sfxOn = on
  if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05)
}
export function setMusic(on) {
  musicOn = on
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.2)
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function tone(freq, { dur = 0.12, type = 'sine', vol = 0.25, at = 0, slide = 0, attack = 0.008, out, wet = 0.3, vib = 0 } = {}) {
  if (!ctx) return
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  if (vib) {
    const lfo = ctx.createOscillator()
    const lg = ctx.createGain()
    lfo.frequency.value = 7
    lg.gain.value = vib
    lfo.connect(lg)
    lg.connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.05)
  }
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(out || sfxBus)
  if (wet && !out) {
    const s = ctx.createGain()
    s.gain.value = wet
    g.connect(s)
    s.connect(reverb)
  }
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise({ dur = 0.3, vol = 0.25, at = 0, type = 'lowpass', freq = 1200, endFreq = 0, q = 0.8, out } = {}) {
  if (!ctx) return
  const t = ctx.currentTime + at
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  const g = ctx.createGain()
  g.gain.value = vol
  src.connect(f)
  f.connect(g)
  g.connect(out || sfxBus)
  src.start(t)
}

/** A cartoon quack: buzzy source through two vowel formants with a falling pitch. */
function quack(at = 0, pitch = 1, vol = 0.22) {
  if (!ctx) return
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(330 * pitch, t)
  osc.frequency.exponentialRampToValueAtTime(240 * pitch, t + 0.16)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  for (const [f, qv, gv] of [[1100, 6, 1], [2600, 8, 0.5]]) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(f, t)
    bp.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.18)
    bp.Q.value = qv
    const fg = ctx.createGain()
    fg.gain.value = gv * 2.2
    osc.connect(bp)
    bp.connect(fg)
    fg.connect(g)
  }
  g.connect(sfxBus)
  osc.start(t)
  osc.stop(t + 0.25)
}

const chord = (notes, opts) => notes.forEach((f, i) => tone(f, { ...opts, at: (opts?.at || 0) + i * (opts?.spread || 0) }))

let stepFlip = false
const SOUNDS = {
  click: () => tone(880, { dur: 0.06, type: 'sine', vol: 0.18, slide: -300, wet: 0.1 }),
  open: () => {
    tone(660, { dur: 0.07, type: 'triangle', vol: 0.16, wet: 0.1 })
    tone(990, { dur: 0.09, type: 'triangle', vol: 0.16, at: 0.05, wet: 0.1 })
  },
  close: () => {
    tone(880, { dur: 0.07, type: 'triangle', vol: 0.14, wet: 0.1 })
    tone(590, { dur: 0.09, type: 'triangle', vol: 0.14, at: 0.05, wet: 0.1 })
  },
  step: () => {
    stepFlip = !stepFlip
    tone(stepFlip ? 560 : 500, { dur: 0.07, type: 'triangle', vol: 0.05, slide: -120, wet: 0 })
  },
  jump: () => {
    tone(320, { dur: 0.18, type: 'sine', vol: 0.2, slide: 520, wet: 0.15 })
    tone(640, { dur: 0.12, type: 'triangle', vol: 0.06, slide: 700, at: 0.02, wet: 0.1 })
  },
  land: () => {
    tone(150, { dur: 0.12, type: 'sine', vol: 0.18, slide: -70, wet: 0 })
    noise({ dur: 0.1, vol: 0.06, freq: 500 })
  },
  bounce: () => {
    tone(260, { dur: 0.32, type: 'sine', vol: 0.24, slide: 900, vib: 30, wet: 0.2 })
    tone(520, { dur: 0.22, type: 'triangle', vol: 0.08, slide: 900, wet: 0.2 })
  },
  quack: () => {
    quack(0, 1)
    quack(0.17, 1.08, 0.18)
  },
  levelUp: () => {
    chord([523, 659, 784, 1047, 1319], { dur: 0.22, type: 'triangle', vol: 0.14, spread: 0.07 })
    tone(1568, { dur: 0.7, type: 'sine', vol: 0.16, at: 0.36, vib: 12 })
    noise({ dur: 0.5, vol: 0.05, at: 0.3, type: 'highpass', freq: 6000 })
  },
  win: () => {
    chord([523, 659, 784, 1047], { dur: 0.18, type: 'square', vol: 0.06, spread: 0.08 })
    chord([1047, 1319, 1568], { dur: 0.9, type: 'triangle', vol: 0.12, at: 0.34 })
    tone(2093, { dur: 0.6, type: 'sine', vol: 0.06, at: 0.42, vib: 20 })
    noise({ dur: 0.6, vol: 0.06, at: 0.32, type: 'highpass', freq: 7000 })
  },
  buy: () => {
    tone(1318, { dur: 0.08, type: 'square', vol: 0.07, wet: 0.2 })
    tone(1975, { dur: 0.3, type: 'triangle', vol: 0.14, at: 0.07, wet: 0.3 })
    noise({ dur: 0.18, vol: 0.05, at: 0.05, type: 'highpass', freq: 5000 })
  },
  equip: () => {
    quack(0, 1.1, 0.18)
    tone(1175, { dur: 0.25, type: 'sine', vol: 0.12, at: 0.12 })
  },
  boost: () => {
    tone(400, { dur: 0.5, type: 'sawtooth', vol: 0.06, slide: 1200 })
    chord([784, 988, 1175], { dur: 0.5, type: 'triangle', vol: 0.1, at: 0.25 })
  },
  error: () => {
    tone(220, { dur: 0.14, type: 'square', vol: 0.08, wet: 0 })
    tone(180, { dur: 0.2, type: 'square', vol: 0.08, at: 0.1, wet: 0 })
  },
  portal: () => {
    noise({ dur: 0.9, vol: 0.14, type: 'bandpass', freq: 300, endFreq: 3000, q: 2 })
    chord([523, 784, 1047], { dur: 0.8, type: 'sine', vol: 0.08, at: 0.3, spread: 0.08 })
  },
  splash: () => {
    noise({ dur: 0.6, vol: 0.22, type: 'bandpass', freq: 1800, endFreq: 400, q: 1 })
    for (let i = 0; i < 4; i += 1) tone(500 + Math.random() * 400, { dur: 0.08, vol: 0.06, slide: 500, at: 0.15 + i * 0.07 })
  },
  zap: () => {
    tone(1400, { dur: 0.3, type: 'sawtooth', vol: 0.09, slide: -1250, wet: 0.1 })
    noise({ dur: 0.25, vol: 0.08, type: 'highpass', freq: 3000 })
  },
  burn: () => {
    noise({ dur: 0.6, vol: 0.18, type: 'lowpass', freq: 2500, endFreq: 300 })
    tone(300, { dur: 0.4, type: 'sawtooth', vol: 0.05, slide: -200 })
  },
  bonk: () => {
    tone(240, { dur: 0.16, type: 'sine', vol: 0.26, slide: -150, wet: 0.1 })
    noise({ dur: 0.08, vol: 0.12, freq: 900 })
    quack(0.1, 1.3, 0.12)
  },
  fall: () => tone(700, { dur: 0.6, type: 'sine', vol: 0.12, slide: -560 }),
  wave: () => {
    noise({ dur: 2.2, vol: 0.28, type: 'lowpass', freq: 200, endFreq: 900, q: 0.6 })
    noise({ dur: 1.6, vol: 0.12, at: 0.4, type: 'bandpass', freq: 1500, endFreq: 600, q: 0.7 })
  },
  sink: () => noise({ dur: 0.35, vol: 0.07, type: 'lowpass', freq: 700, endFreq: 200 }),
  tick: () => tone(1800, { dur: 0.025, type: 'square', vol: 0.05, wet: 0 }),
  countdown: () => tone(880, { dur: 0.18, type: 'triangle', vol: 0.18 }),
  go: () => chord([1047, 1319, 1568], { dur: 0.45, type: 'triangle', vol: 0.14 }),
  spawn: () => chord([784, 1175], { dur: 0.3, type: 'sine', vol: 0.08, spread: 0.06 }),
  rebirth: () => {
    tone(200, { dur: 1.2, type: 'sawtooth', vol: 0.07, slide: 1600 })
    chord([523, 659, 784, 1047, 1319, 1568], { dur: 0.9, type: 'triangle', vol: 0.1, at: 0.8, spread: 0.06 })
    noise({ dur: 1.2, vol: 0.06, at: 0.8, type: 'highpass', freq: 6000 })
  },
  gift: () => chord([1047, 1319, 1568, 2093], { dur: 0.35, type: 'sine', vol: 0.1, spread: 0.06 }),
  wheelWin: () => {
    chord([784, 988, 1175, 1568], { dur: 0.4, type: 'triangle', vol: 0.12, spread: 0.07 })
    tone(2093, { dur: 0.7, type: 'sine', vol: 0.08, at: 0.3, vib: 18 })
  },
}

export function play(name) {
  if (!ctx || !sfxOn) return
  if (ctx.state === 'suspended') ctx.resume()
  try {
    SOUNDS[name]?.()
  } catch {
    /* never let audio break the game */
  }
}

/* ------------------------------------------------------------------ */
/* Music: a bouncy I-V-vi-IV loop with a pentatonic lead                */
/* ------------------------------------------------------------------ */

const BPM = 118
const BEAT = 60 / BPM
// C, G, Am, F (root frequencies for the bass, chord tones for the pads)
const PROG = [
  { bass: 65.41, chord: [261.63, 329.63, 392.0] },
  { bass: 98.0, chord: [246.94, 293.66, 392.0] },
  { bass: 110.0, chord: [261.63, 329.63, 440.0] },
  { bass: 87.31, chord: [261.63, 349.23, 440.0] },
]
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
// Lead pattern: index into PENTA per eighth note (-1 = rest), 2 bars x 8.
const LEAD = [
  [0, -1, 2, 3, -1, 2, 1, -1, 2, -1, 3, 4, -1, 3, 2, -1],
  [4, -1, 3, 2, 3, -1, 1, -1, 0, 1, 2, -1, 3, -1, -1, -1],
]

function startMusic() {
  if (musicTimer) return
  let next = ctx.currentTime + 0.2
  let step = 0
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  lp.connect(musicBus)
  const out = lp
  const schedule = () => {
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % 4
      const eighth = step % 8
      const ch = PROG[bar]
      const at = next - ctx.currentTime
      // Bass on beats, octave hop on the off-beat.
      if (eighth % 2 === 0) tone(ch.bass * (eighth % 4 === 2 ? 2 : 1), { dur: BEAT * 0.45, type: 'triangle', vol: 0.5, at, out })
      // Pad stabs on 2 and 4.
      if (eighth === 2 || eighth === 6) ch.chord.forEach((f) => tone(f, { dur: BEAT * 0.35, type: 'square', vol: 0.07, at, out }))
      // Lead.
      const pat = LEAD[Math.floor(step / 32) % 2]
      const n = pat[step % 16]
      if (n >= 0) tone(PENTA[n], { dur: BEAT * 0.42, type: 'triangle', vol: 0.18, at, out, vib: 4 })
      // Soft hat on every eighth, kick on 1 and 3.
      noise({ dur: 0.04, vol: eighth % 2 ? 0.05 : 0.03, at, type: 'highpass', freq: 8000, out })
      if (eighth === 0 || eighth === 4) tone(110, { dur: 0.16, type: 'sine', vol: 0.55, slide: -70, at, out })
      next += BEAT / 2
      step += 1
    }
  }
  musicTimer = setInterval(schedule, 100)
  schedule()
}

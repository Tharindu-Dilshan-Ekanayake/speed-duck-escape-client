import { Client } from 'colyseus.js'

import { play } from '../audio/sfx'
import { getSDK, safeCall } from '../bloxity/sdk'
import { getBloxityState, useBloxityStore } from '../bloxity/store'
import { DUCKS, GAME_ID, ROOM_NAME, WHEEL, formatNum } from '../shared/gameData'
import { runtime, useGame } from '../state/store'
import { createOfflineRoom } from './offline'

/**
 * Multiplayer connection.
 *
 * Production: ask the Bloxity matchmaker (play.bloxity.io) for a pod, then join the
 * "lobby" room there. Colyseus fills a lobby to 8 players; the 9th gets a fresh one.
 * Local dev: VITE_SERVER_URL=ws://localhost:2567 skips the matchmaker.
 *
 * If the server can't be reached the game switches to offline play (offline.js): the
 * same LobbyLogic runs in the browser, so the lobby and every stage stay playable.
 * Messages from either source go through the same `handlers` table below.
 */

const DIRECT_URL = import.meta.env.VITE_SERVER_URL || ''
const GAME = import.meta.env.VITE_GAME_ID || GAME_ID
const MATCHMAKER = import.meta.env.VITE_MATCHMAKER_URL || 'https://play.bloxity.io'
const CONNECT_TIMEOUT_MS = 9000

let room = null
let connecting = false
let pingTimer = null
let offline = null
let failures = 0

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('server not responding')), ms))])

function deviceId() {
  try {
    let id = localStorage.getItem('sde-device')
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^\w-]/g, '')
      localStorage.setItem('sde-device', id)
    }
    return id
  } catch {
    return `nostore-${Math.random().toString(36).slice(2, 14)}`
  }
}

async function resolveEndpoint() {
  if (DIRECT_URL) return DIRECT_URL
  const sdk = getSDK()
  if (sdk?.net?.resolveEndpoint) {
    const r = await sdk.net.resolveEndpoint(GAME, { matchmakerUrl: MATCHMAKER })
    if (r?.endpoint) return r.endpoint
  }
  const res = await fetch(`${MATCHMAKER}/v1/play/${encodeURIComponent(GAME)}`, { method: 'POST' })
  const { roomId } = await res.json()
  if (!roomId) throw new Error('matchmaker returned no room')
  return `${MATCHMAKER.replace(/^http/, 'ws')}/v1/ws/${roomId}`
}

/**
 * Hosted on Bloxity the game runs in an iframe and the portal hands over the signed-in
 * user shortly after start-up, so give it a moment before playing as a guest. There is
 * no login button: you are your Bloxity account, or a guest.
 */
async function waitForIdentity(timeoutMs = 6000, userWaitMs = 1500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = useBloxityStore.getState().status
    if (status === 'ready' || status === 'error') break
    await wait(100)
  }
  const sdk = getSDK()
  const inFrame = safeCall(sdk?.portal?.isInIframe?.bind(sdk?.portal)) ?? window.self !== window.top
  if (!inFrame) return
  const until = Date.now() + userWaitMs
  while (Date.now() < until && !useBloxityStore.getState().user) await wait(100)
}

function identityName() {
  const bx = getBloxityState()
  const identity = bx.user || bx.guest
  return identity?.displayName || identity?.username || 'Guest'
}

function joinOptions() {
  const bx = getBloxityState()
  const sdk = getSDK()
  return {
    token: bx.user ? safeCall(sdk?.auth?.getToken?.bind(sdk.auth)) || undefined : undefined,
    deviceId: deviceId(),
    name: identityName(),
    avatar: bx.equipped || null,
    proportions: bx.proportions || null,
  }
}

let identityWaited = false
export async function connect() {
  if (connecting || room || offline) return
  connecting = true
  const g = useGame.getState()
  useGame.setState({ net: g.profile ? 'reconnecting' : 'connecting', netError: null })
  try {
    if (!identityWaited) {
      identityWaited = true
      await waitForIdentity()
    }
    const endpoint = await withTimeout(resolveEndpoint(), CONNECT_TIMEOUT_MS)
    const client = new Client(endpoint)
    room = await withTimeout(client.joinOrCreate(ROOM_NAME, joinOptions()), CONNECT_TIMEOUT_MS)
    failures = 0
    wire(room)
    safeCall(getSDK()?.game?.updateRoom, room.roomId)
  } catch (err) {
    console.warn('[net] connect failed', err)
    room = null
    failures += 1
    // No server at start-up: play solo right away. Mid-game (a redeploy or a blip): keep
    // retrying with backoff for ~20 s before carrying on offline with the same profile.
    if (failures >= (g.profile ? 6 : 1)) startOffline()
    else setTimeout(connect, Math.min(6000, 800 * 2 ** (failures - 1)))
  } finally {
    connecting = false
  }
}

export function send(type, payload) {
  if (offline) offline.send(type, payload)
  else if (room?.connection?.isOpen) room.send(type, payload)
}

export const isOffline = () => !!offline

function startOffline() {
  if (offline) return
  clearInterval(pingTimer)
  const carry = useGame.getState().profile
  offline = createOfflineRoom({ name: identityName(), existing: carry, dispatch: (type, msg) => handlers[type]?.(msg) })
  useGame.getState().toast('Server offline - playing solo. Progress is saved on this device.', 'warn')
}

/** Logging in / out on the Bloxity portal switches which profile we play with. */
export function reconnectWithNewIdentity() {
  if (!room) return
  const r = room
  room = null
  r.leave(true).finally(() => setTimeout(connect, 200))
}

function syncClock() {
  send('ping', { t: Date.now() })
}

/* ------------------------------------------------------------------ */
/* Server -> client messages (live room and offline room alike)        */
/* ------------------------------------------------------------------ */

const handlers = {}
const set = (...a) => useGame.setState(...a)
const get = () => useGame.getState()
const on = (type, fn) => {
  handlers[type] = fn
}

function wire(r) {
  r.onMessage('*', (type, msg) => handlers[type]?.(msg))
  r.onLeave((code) => {
    console.warn('[net] left room', code)
    clearInterval(pingTimer)
    if (room !== r) return
    room = null
    if (code === 4001) {
      set({ net: 'error', netError: 'You started playing somewhere else.' })
      return
    }
    set({ net: 'reconnecting' })
    setTimeout(connect, 1500)
  })
}

const remoteEntry = (p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.pos.yaw, tx: p.pos.x, ty: p.pos.y, tz: p.pos.z, tyaw: p.pos.yaw, flags: p.flags || 0, speed: 0 })

on('init', (m) => {
  runtime.clockOffset = m.now - Date.now()
  runtime.remote.clear()
  const players = {}
  for (const p of m.players) {
    players[p.sid] = p
    runtime.remote.set(p.sid, remoteEntry(p))
  }
  runtime.pendingTeleport = m.spawn
  set({
    net: m.offline ? 'offline' : 'online',
    sid: m.sid,
    roomId: m.roomId,
    profile: m.profile,
    players,
    lb: m.lb || get().lb,
    race: m.race,
    session: m.session,
    sessionAt: Date.now(),
    statsAt: Date.now(),
    dev: !!m.dev,
    loggedIn: !!m.loggedIn,
    friends: m.players.length + 1,
  })
  clearInterval(pingTimer)
  pingTimer = setInterval(syncClock, 10000)
  syncClock()
})

on('pong', (m) => {
  const rtt = Date.now() - m.t
  runtime.clockOffset = m.now + rtt / 2 - Date.now()
})

on('profile', (profile) => set({ profile, statsAt: Date.now() }))
on('stats', (s) => {
  const p = get().profile
  if (p) set({ profile: { ...p, ...s }, statsAt: Date.now() })
})
on('friends', (m) => set({ friends: m.count }))
on('lb', (lb) => set({ lb }))

on('join', (p) => {
  runtime.remote.set(p.sid, remoteEntry(p))
  set({ players: { ...get().players, [p.sid]: p } })
  get().pushFeed(`${p.name} joined the server!`, 'join')
})
on('leave', ({ sid }) => {
  runtime.remote.delete(sid)
  const players = { ...get().players }
  const gone = players[sid]
  delete players[sid]
  set({ players })
  if (gone) get().pushFeed(`${gone.name} left.`, 'leave')
})
on('appearance', (a) => {
  const prev = get().players[a.sid]
  if (prev) set({ players: { ...get().players, [a.sid]: { ...prev, ...a } } })
})
on('snap', (snap) => {
  const mySid = get().sid
  for (const [sid, x, y, z, yaw, flags] of snap) {
    if (sid === mySid) continue
    const t = runtime.remote.get(sid)
    if (!t) continue
    t.tx = x
    t.ty = y
    t.tz = z
    t.tyaw = yaw
    t.flags = flags
  }
})

on('teleport', (pos) => {
  runtime.pendingTeleport = pos
})

on('levelUp', (lv) => {
  get().showBig({ kind: 'level', text: 'You leveled up!', sub: `Level ${lv.to}`, ms: 1600 })
  runtime.flashes.set('me', performance.now())
  runtime.bursts.push({ kind: 'level', at: performance.now() })
  play('levelUp')
})

on('fx', (fx) => {
  runtime.flashes.set(fx.sid, performance.now())
})

on('reward', (m) => {
  play('win')
  runtime.bursts.push({ kind: 'coins', at: performance.now() })
  get().showBig({
    kind: 'wins',
    text: `+${formatNum(m.wins)} Win${m.wins === 1 ? '' : 's'}`,
    sub: m.race ? `Stage ${m.stage} cleared - RACE x2!` : `Stage ${m.stage} cleared!`,
    ms: 2200,
  })
})

on('race', (race) => {
  set({ race })
  if (race.phase === 'countdown') get().pushFeed('A race is starting! Stand in the lobby to join.', 'race')
})
on('raceGo', () => {
  play('go')
  get().showBig({ kind: 'race', text: 'RACE!', sub: 'First to the Stage 1 pad wins!', ms: 2400 })
})
on('raceWin', (m) => {
  get().showBig({ kind: 'wins', text: 'YOU WON THE RACE!', sub: `${m.secs}s  +${formatNum(m.bonus)} Wins`, ms: 3200 })
})
on('sys', (m) => get().pushFeed(`[SYSTEM]: ${m.text}`, m.race ? 'race' : 'sys'))

on('spin', (m) => set({ wheel: { idx: m.idx, reward: m.reward, at: performance.now() } }))
on('gift', (m) => {
  play('gift')
  set({ session: m.session, sessionAt: Date.now() })
  get().showBig({ kind: 'gift', text: m.reward.text, sub: 'Free gift claimed!', ms: 1800 })
})
on('packed', (m) => {
  play('buy')
  get().toast(m.spins ? `+${m.spins} Spins!` : `+${formatNum(m.xp)} Steps!`, 'good')
})
on('newDuck', (m) => {
  const d = DUCKS.find((x) => x.id === m.id)
  set({ newDuck: { id: m.id, at: performance.now() } })
  play('quack')
  get().showBig({ kind: 'duck', text: 'NEW DUCK!', sub: `${d?.name} - +${formatNum(d?.perStep)} / Step`, ms: 2600 })
})
on('rebirthed', (m) => {
  play('rebirth')
  runtime.flashes.set('me', performance.now())
  runtime.bursts.push({ kind: 'rebirth', at: performance.now() })
  get().showBig({ kind: 'rebirth', text: `REBIRTH ${m.rebirths}!`, sub: `Steps x${m.rebirths + 1}  -  Wins x${1 + m.rebirths * 0.5}`, ms: 3000 })
})

on('toast', (m) => {
  get().toast(m.text, m.kind)
  if (m.kind === 'error') play('error')
})
on('sfx', (m) => play(m.name))

export const wheelLabel = (idx) => WHEEL[idx]?.label || ''

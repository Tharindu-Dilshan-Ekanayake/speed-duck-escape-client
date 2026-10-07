import { useEffect, useMemo, useRef, useState } from 'react'

import { play, setMusic, setSfx } from '../audio/sfx'
import { send } from '../net/net'
import {
  DUCKS,
  GIFTS,
  STAGE_COUNT,
  STAGE_NAMES,
  STAGE_WINS,
  WHEEL,
  WORLD2_REBIRTHS,
  formatNum,
  formatTime,
  giftWins,
  rebirthLevel,
  stageWorld,
  stepMultiplier,
  winMultiplier,
} from '../shared/gameData'
import { useGame } from '../state/store'
import { CloseX, DuckIcon, Lock, Trophy } from './icons'

function Panel({ title, children, width }) {
  const close = useGame((s) => s.closePanel)
  return (
    <div
      className="shade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          play('close')
          close()
        }
      }}
    >
      <div className="panel" style={width ? { width } : undefined}>
        <h2 className="ol">{title}</h2>
        <button
          type="button"
          className="close"
          aria-label="Close panel (Esc)"
          aria-keyshortcuts="Escape"
          title="Close - Esc"
          onClick={() => {
            play('close')
            close()
          }}
        >
          <kbd className="shortcut wide" aria-hidden="true">ESC</kbd>
          <CloseX />
        </button>
        <div className="body">{children}</div>
      </div>
    </div>
  )
}

/* ---- Rebirth --------------------------------------------------------- */
function RebirthPanel({ p }) {
  const need = rebirthLevel(p.rebirths)
  const k = Math.min(1, p.level / need)
  const ok = p.level >= need
  return (
    <Panel title="Rebirth" width="min(640px, 94vw)">
      <div className="row">
        <span className="ol">Rebirths</span>
        <span className="gold" style={{ fontFamily: 'var(--title)', fontSize: 34 }}>
          {p.rebirths}
        </span>
      </div>
      <div className="ol" style={{ fontWeight: 700, fontSize: 20 }}>
        Level {p.level} / {need}
      </div>
      <div className="pbar">
        <div style={{ width: `${k * 100}%` }} />
      </div>
      <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <div className="ol">
          Steps: x{stepMultiplier(p.rebirths)} → <span style={{ color: '#7dff8a' }}>x{stepMultiplier(p.rebirths + 1)}</span>
        </div>
        <div className="ol">
          Wins: x{winMultiplier(p.rebirths)} → <span style={{ color: '#7dff8a' }}>x{winMultiplier(p.rebirths + 1)}</span>
        </div>
        {p.rebirths + 1 === WORLD2_REBIRTHS && <div className="ol" style={{ color: '#ffe14a' }}>Unlocks WORLD 2!</div>}
        <div className="r-sub">Resets your Level &amp; Speed. You keep your Wins, Ducks and Treadmills.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          className="gbtn big"
          disabled={!ok}
          onClick={() => {
            send('rebirth')
            useGame.getState().closePanel()
          }}
        >
          {ok ? 'REBIRTH!' : `Reach Level ${need}`}
        </button>
      </div>
    </Panel>
  )
}

/* ---- Ducks inventory ---------------------------------------------------- */
function DucksPanel({ p }) {
  return (
    <Panel title="Ducks">
      <div className="r-sub" style={{ marginBottom: 10, fontSize: 16 }}>
        Buy ducks at the red pads in the lobby (walk up &amp; press E). Every duck you own can be equipped here.
      </div>
      <div className="grid">
        {DUCKS.map((d) => {
          const owned = p.ducks.includes(d.id)
          const eq = p.duck === d.id
          const locked = !owned && p.rebirths < d.reb
          return (
            <div key={d.id} className={`card ${owned ? 'owned' : ''} ${eq ? 'eq' : ''} ${locked ? 'locked' : ''}`}>
              <DuckIcon size={74} body={d.body} beak={d.beak} glow={d.fx?.glow} />
              <div className="t ol">{d.name}</div>
              <div className="s ol">+{formatNum(d.perStep)} / Step</div>
              {owned ? (
                <button
                  className={`gbtn ${eq ? 'gold' : ''}`}
                  disabled={eq}
                  onClick={() => {
                    play('click')
                    send('equip', { id: d.id })
                  }}
                >
                  {eq ? 'Equipped' : 'Equip'}
                </button>
              ) : (
                <div className="s ol" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fff' }}>
                  {d.wheel ? (
                    'Lucky Wheel only!'
                  ) : locked ? (
                    <>
                      <Lock size={20} /> {d.reb} Rebirths
                    </>
                  ) : (
                    <>
                      {formatNum(d.cost)} <Trophy size={20} /> • World {d.world}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* ---- Stages / teleport ------------------------------------------------------ */
function StagesPanel({ p }) {
  const tp = (to) => {
    send('tp', { to })
    useGame.getState().closePanel()
  }
  const w2 = p.rebirths >= WORLD2_REBIRTHS
  return (
    <Panel title="Stages">
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="gbtn blue" onClick={() => tp('w1')}>
          World 1 Lobby
        </button>
        <button className="gbtn blue" disabled={!w2} onClick={() => tp('w2')}>
          {w2 ? 'World 2 Lobby' : `World 2 (${WORLD2_REBIRTHS} Rebirths)`}
        </button>
      </div>
      {Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((n) => {
        const worldOk = stageWorld(n) === 1 || w2
        const open = n <= p.maxStage && worldOk
        return (
          <div key={n} className="row" style={{ opacity: open ? 1 : 0.6 }}>
            <div>
              <div className="ol">
                Stage {n} • {STAGE_NAMES[n]}
              </div>
              <div className="r-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                World {stageWorld(n)} • +{formatNum(Math.round(STAGE_WINS[n] * winMultiplier(p.rebirths)))} <Trophy size={16} />
              </div>
            </div>
            {open ? (
              <button className="gbtn" onClick={() => tp(n)}>
                Teleport
              </button>
            ) : (
              <span className="ol" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}>
                <Lock size={22} /> {worldOk ? 'Reach it first' : `${WORLD2_REBIRTHS} Rebirths`}
              </span>
            )}
          </div>
        )
      })}
    </Panel>
  )
}

/* ---- Settings ---------------------------------------------------------- */
function SettingsPanel() {
  const settings = useGame((s) => s.settings)
  const setSetting = useGame((s) => s.setSetting)
  const toggle = (k, apply) => {
    play('click')
    const v = !settings[k]
    setSetting(k, v)
    apply?.(v)
  }
  return (
    <Panel title="Settings" width="min(620px, 94vw)">
      <div className="row">
        <span className="ol">Music</span>
        <button className={`toggle ${settings.music ? 'on' : ''}`} onClick={() => toggle('music', setMusic)}>
          {settings.music ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="row">
        <span className="ol">Sound Effects</span>
        <button className={`toggle ${settings.sfx ? 'on' : ''}`} onClick={() => toggle('sfx', setSfx)}>
          {settings.sfx ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="row">
        <span className="ol">Step Popups</span>
        <button className={`toggle ${settings.popups ? 'on' : ''}`} onClick={() => toggle('popups')}>
          {settings.popups ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="row">
        <div>
          <div className="ol">A / D Keys</div>
          <div className="r-sub">Turn the camera as you run, or strafe sideways.</div>
        </div>
        <button className={`toggle ${settings.turnKeys ? 'on' : ''}`} onClick={() => toggle('turnKeys')}>
          {settings.turnKeys ? 'TURN' : 'STRAFE'}
        </button>
      </div>
      <div className="row">
        <div>
          <div className="ol">Graphics</div>
          <div className="r-sub">Low turns off shadows for slower devices.</div>
        </div>
        <button
          className={`toggle ${settings.quality === 'high' ? 'on' : ''}`}
          onClick={() => {
            play('click')
            setSetting('quality', settings.quality === 'high' ? 'low' : 'high')
          }}
        >
          {settings.quality === 'high' ? 'HIGH' : 'LOW'}
        </button>
      </div>
      <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', fontSize: 16 }}>
        <div className="ol">Controls</div>
        <div className="r-sub">W / S - run • A / D - turn camera • Space - jump (hold to keep hopping) • Drag - turn camera • Wheel - zoom</div>
        <div className="r-sub">E - buy / equip / spin • R Rebirth • Q Ducks • T Stages • F Free gifts • O Settings • Esc close</div>
      </div>
    </Panel>
  )
}

/* ---- Free gifts --------------------------------------------------------- */
function GiftsPanel({ p }) {
  const session = useGame((s) => s.session)
  const sessionAt = useGame((s) => s.sessionAt)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  const ms = session.ms + (Date.now() - sessionAt)
  return (
    <Panel title="Free Gifts!">
      <div className="r-sub" style={{ marginBottom: 10, fontSize: 16 }}>
        Keep playing to unlock gifts. They reset when you rejoin.
      </div>
      <div className="grid">
        {GIFTS.map((g, i) => {
          const claimed = session.claimed.includes(i)
          const left = g.min * 60000 - ms
          const label = g.kind === 'wins' ? `+${formatNum(giftWins(g.f, p.maxStage, p.rebirths))} Wins` : g.label
          return (
            <div key={i} className={`card ${claimed ? 'owned' : ''}`}>
              <div style={{ fontSize: 46, lineHeight: 1 }}>{g.kind === 'wins' ? '🏆' : g.kind === 'spins' ? '🎡' : g.kind === 'boost' ? '⚡' : '⭐'}</div>
              <div className="t ol">{label}</div>
              <button
                className="gbtn"
                disabled={claimed || left > 0}
                onClick={() => {
                  send('gift', { i })
                }}
              >
                {claimed ? 'Claimed' : left > 0 ? formatTime(left) : 'Claim!'}
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* ---- Lucky wheel ------------------------------------------------------------ */
function WheelPanel({ p }) {
  const wheel = useGame((s) => s.wheel)
  const [angle, setAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const seenAt = useRef(wheel?.at || 0)
  const tickTimer = useRef(null)
  const seg = 360 / WHEEL.length
  const bg = useMemo(() => `conic-gradient(${WHEEL.map((w, i) => `${w.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(',')})`, [seg])

  useEffect(() => {
    if (!wheel || wheel.at === seenAt.current) return undefined
    seenAt.current = wheel.at
    const target = 360 * 6 + (360 - (wheel.idx + 0.5) * seg)
    setSpinning(true)
    setResult(null)
    setAngle((a) => a - (a % 360) + target)
    let n = 0
    tickTimer.current = setInterval(() => {
      n += 1
      if (n < 34) play('tick')
    }, 110)
    const done = setTimeout(() => {
      clearInterval(tickTimer.current)
      setSpinning(false)
      setResult(wheel.reward)
      play(wheel.reward.duck ? 'quack' : 'wheelWin')
      if (wheel.reward.duck) useGame.getState().showBig({ kind: 'duck', text: 'LUCKY DUCK!', sub: '+4K / Step - equipped!', ms: 3000 })
    }, 4100)
    return () => {
      clearInterval(tickTimer.current)
      clearTimeout(done)
    }
  }, [wheel, seg])

  return (
    <Panel title="Lucky Wheel" width="min(560px, 94vw)">
      <div className="wheel2d">
        <div className="ptr" />
        <div className="disc" style={{ background: bg, transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.12, 0.8, 0.18, 1)' : 'none' }}>
          {WHEEL.map((w, i) => (
            <div key={w.id} className="lab" style={{ transform: `rotate(${(i + 0.5) * seg - 90}deg)` }}>
              <span className="ol">{w.label}</span>
            </div>
          ))}
        </div>
        <div className="hub" />
      </div>
      <div style={{ textAlign: 'center' }}>
        {result && (
          <div className="gold" style={{ fontFamily: 'var(--title)', fontSize: 40, marginBottom: 8 }}>
            {result.text}
          </div>
        )}
        <div className="ol" style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
          Spins: {p.spins}
        </div>
        <button
          className="gbtn big gold"
          disabled={spinning || p.spins < 1}
          onClick={() => {
            play('click')
            send('spin')
          }}
        >
          {spinning ? 'Spinning…' : p.spins < 1 ? 'No spins' : 'SPIN!'}
        </button>
        <div className="r-sub" style={{ marginTop: 10 }}>
          You get a free spin every 10 minutes. The ??? slice is the exclusive Lucky Duck!
        </div>
      </div>
    </Panel>
  )
}

export function Panels() {
  const panel = useGame((s) => s.panel)
  const p = useGame((s) => s.profile)
  if (!panel || !p) return null
  switch (panel) {
    case 'rebirth':
      return <RebirthPanel p={p} />
    case 'ducks':
      return <DucksPanel p={p} />
    case 'stages':
      return <StagesPanel p={p} />
    case 'settings':
      return <SettingsPanel />
    case 'gifts':
      return <GiftsPanel p={p} />
    case 'wheel':
      return <WheelPanel p={p} />
    default:
      return null
  }
}

export default Panels

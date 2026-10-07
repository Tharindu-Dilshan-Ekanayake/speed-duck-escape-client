import { useEffect, useRef } from 'react'

import { play } from '../audio/sfx'
import { send } from '../net/net'
import { LOBBIES, STAGES } from '../shared/course'
import { TUT_DONE, duckById } from '../shared/gameData'
import { runtime, useGame } from '../state/store'

/**
 * A short guide for brand-new players only (profile.tut < TUT_DONE). Each step shows a
 * card at the top of the screen and points a big bouncing 3D arrow (GuideArrow) at the
 * place to go. The server only lets the step move forward, so it never repeats.
 *
 *   0  train on the free treadmill until Level 3
 *   1  run through the gate into Stage 1
 *   2  step on a green wins pad (that sends you back to the lobby)
 *   3  collect enough Wins and buy the Shadow Duck
 *   4  "you're ready" - then the guide is finished
 */

const FIRST_DUCK = 'shadow'

function stepInfo(step, p, region) {
  const L = LOBBIES[1]
  const tread = L.treads[0]
  const gate = STAGES[1].spawn
  const pedestal = L.pedestals.find((d) => d.id === FIRST_DUCK)
  const inLobby = region.stage === 0
  switch (step) {
    case 0:
      return {
        title: 'Train your Speed!',
        text: `Run on the treadmill to level up (Level ${p.level}/3).`,
        target: inLobby ? { x: tread.x, y: tread.top, z: tread.z } : null,
        done: p.level >= 3,
      }
    case 1:
      return { title: 'Escape time!', text: 'Run through the big gate into Stage 1.', target: { x: gate.x, y: 0, z: STAGES[1].z0 - 2 }, done: region.stage >= 1 }
    case 2: {
      const S = region.stage >= 1 ? STAGES[region.stage] : STAGES[1]
      return {
        title: 'Grab the Wins!',
        text: 'Step on the green WINS pad at the end. It sends you back to the lobby - or keep going for more!',
        target: S.pad ? { x: S.pad.x, y: S.pad.y, z: S.pad.z } : null,
        done: (p.totalWins || 0) > 0,
      }
    }
    case 3: {
      const cost = duckById(FIRST_DUCK).cost
      const enough = p.wins >= cost
      return {
        title: enough ? 'Buy a faster duck!' : 'Run again for more Wins',
        text: enough ? `Walk to the ${duckById(FIRST_DUCK).name} and press E to buy it.` : `You need ${cost} Wins (${p.wins}/${cost}). Run the stages again!`,
        target: !inLobby ? null : enough ? { x: pedestal.x, y: pedestal.y, z: pedestal.z } : { x: gate.x, y: 0, z: STAGES[1].z0 - 2 },
        done: p.ducks.length > 1,
      }
    }
    case 4:
      return { title: "You're ready!", text: 'Better ducks + treadmills = more Speed. More Speed = later stages = BIG Wins.', target: null, done: false }
    default:
      return null
  }
}

export default function Guide() {
  const p = useGame((s) => s.profile)
  const region = useGame((s) => s.region)
  const sent = useRef(-1)
  const step = p ? p.tut ?? TUT_DONE : TUT_DONE
  const info = p && step < TUT_DONE ? stepInfo(step, p, region) : null

  // Advance when the current step is done.
  useEffect(() => {
    if (!info?.done || sent.current >= step + 1) return
    sent.current = step + 1
    play('levelUp')
    send('tut', { step: step + 1 })
  }, [info?.done, step])

  // The final "you're ready" card closes itself.
  useEffect(() => {
    if (step !== 4) return undefined
    const id = setTimeout(() => send('tut', { step: TUT_DONE }), 9000)
    return () => clearTimeout(id)
  }, [step])

  useEffect(() => {
    runtime.guideTarget = info?.target || null
  })
  useEffect(() => () => (runtime.guideTarget = null), [])

  if (!info) return null
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={badge}>GUIDE {Math.min(step + 1, 5)}/5</div>
        <div style={title}>{info.title}</div>
        <div style={text}>{info.text}</div>
        {step < 4 && (
          <button style={skip} onClick={() => send('tut', { step: TUT_DONE })}>
            Skip guide
          </button>
        )}
      </div>
    </div>
  )
}

const wrap = { position: 'absolute', top: 138, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 12 }
const card = {
  pointerEvents: 'auto',
  maxWidth: 'min(520px, calc(100vw - 32px))',
  padding: '10px 18px 12px',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,231,92,0.97), rgba(255,184,28,0.97))',
  border: '3px solid #fff6c4',
  boxShadow: '0 6px 0 #b86a00, 0 10px 24px rgba(0,0,0,0.25)',
  textAlign: 'center',
  color: '#4a2600',
  fontFamily: '"Baloo 2", "Nunito", system-ui, sans-serif',
}
const badge = { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, opacity: 0.7 }
const title = { fontSize: 24, fontWeight: 800, lineHeight: 1.1 }
const text = { fontSize: 15, fontWeight: 700, marginTop: 2 }
const skip = { marginTop: 6, fontSize: 11, fontWeight: 800, border: 0, background: 'rgba(0,0,0,0.12)', color: '#4a2600', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }

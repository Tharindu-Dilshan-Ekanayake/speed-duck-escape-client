import { useEffect, useMemo, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { useGame } from '../state/store'
import { DuckIcon } from './icons'
import './loading.css'

const TIPS = [
  'Every waddle makes you faster!',
  'Stones in Stage 2 sink when you step on them - keep moving!',
  'A tsunami chases you in Stage 3 - level up to outrun it.',
  'Ducks give more Speed every Step. Buy them with Wins!',
  'Rebirth to multiply your Steps and Wins.',
  'Stand on a treadmill for free Steps.',
  'Spin the Lucky Wheel for a chance at the exclusive Lucky Duck!',
  'Play with friends: every player in your server gives +10% Steps.',
]

/**
 * Full-screen loading page in the game's theme. Stays up until the world has rendered,
 * the server answered (or we fell back to solo play), and the avatar is ready.
 */
export function LoadingScreen() {
  const { game, status } = useBloxity()
  const net = useGame((s) => s.net)
  const sceneReady = useGame((s) => s.sceneReady)
  const avatarReady = useGame((s) => s.avatarReady)
  const [timedOut, setTimedOut] = useState(false)
  const [gone, setGone] = useState(false)
  const [tip, setTip] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 12000)
    const t = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 3200)
    return () => {
      clearTimeout(id)
      clearInterval(t)
    }
  }, [])

  const connected = net === 'online' || net === 'offline' || net === 'error'
  const steps = [status === 'ready' || status === 'error', sceneReady, connected, avatarReady || timedOut]
  const progress = steps.filter(Boolean).length / steps.length
  const done = sceneReady && connected && (avatarReady || timedOut)
  const label = !steps[0] ? 'Waking up the ducks…' : !sceneReady ? 'Building the world…' : !connected ? 'Joining a server…' : !steps[3] ? 'Dressing your avatar…' : "Let's go!"

  useEffect(() => {
    game.loadingStep(label)
  }, [game, label])
  useEffect(() => {
    if (!done) return undefined
    game.loadingEnd()
    const id = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(id)
  }, [done, game])

  const clouds = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ top: 6 + ((i * 37) % 40), left: (i * 23) % 100, s: 0.7 + ((i * 13) % 10) / 10, d: 30 + i * 7 })), [])

  if (gone) return null
  return (
    <div className={`loading ${done ? 'out' : ''}`}>
      {clouds.map((c, i) => (
        <div key={i} className="cloud" style={{ top: `${c.top}%`, left: `${c.left}%`, transform: `scale(${c.s})`, animationDuration: `${c.d}s` }} />
      ))}
      <div className="rainbow" />
      <div className="hill h1" />
      <div className="hill h2" />
      <div className="center">
        <div className="logo">
          <span className="plus">+1</span>
          <span className="w1">SPEED</span>
          <span className="w2">DUCK</span>
          <span className="w3">ESCAPE</span>
        </div>
        <div className="hero">
          <DuckIcon size={150} />
        </div>
        <div className="bar">
          <div className="fill" style={{ width: `${Math.max(6, progress * 100)}%` }} />
          <div className="marchers" style={{ left: `${Math.max(6, progress * 100)}%` }}>
            <DuckIcon size={28} />
            <DuckIcon size={34} />
            <DuckIcon size={44} />
          </div>
          <div className="lbl">{label}</div>
        </div>
        <div key={tip} className="tip">
          {TIPS[tip]}
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen

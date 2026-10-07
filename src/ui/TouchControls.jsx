import { useRef } from 'react'

import { unlockAudio } from '../audio/sfx'
import { runtime, useGame } from '../state/store'

const isTouch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

/** On-screen joystick + jump / interact buttons for phones and tablets. */
export function TouchControls() {
  const prompt = useGame((s) => s.prompt)
  const knob = useRef()
  const origin = useRef(null)
  if (!isTouch) return null

  const move = (e) => {
    if (!origin.current) return
    const dx = e.clientX - origin.current.x
    const dy = e.clientY - origin.current.y
    const len = Math.hypot(dx, dy)
    // Knob travel scales with the joystick (it is smaller on phones in landscape).
    const max = origin.current.max
    const k = len > max ? max / len : 1
    if (knob.current) knob.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    runtime.input.touchX = (dx * k) / max
    runtime.input.touchY = -(dy * k) / max
  }
  const end = () => {
    origin.current = null
    runtime.input.touchX = 0
    runtime.input.touchY = 0
    if (knob.current) knob.current.style.transform = ''
  }

  return (
    <div className="touch">
      <div
        className="joy"
        onPointerDown={(e) => {
          unlockAudio()
          const r = e.currentTarget.getBoundingClientRect()
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, max: r.width * 0.38 }
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="knob" />
      </div>
      <button
        className="tbtn"
        onPointerDown={(e) => {
          unlockAudio()
          e.currentTarget.setPointerCapture(e.pointerId)
          runtime.input.touchJump = true
        }}
        onPointerUp={() => (runtime.input.touchJump = false)}
        onPointerCancel={() => (runtime.input.touchJump = false)}
      >
        JUMP
      </button>
      {prompt && !prompt.done && (
        <button className="tbtn e" onPointerDown={() => runtime.interact?.()}>
          E
        </button>
      )}
    </div>
  )
}

export default TouchControls

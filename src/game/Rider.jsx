import { useFrame } from '@react-three/fiber'
import { memo, useRef } from 'react'
import Avatar from './Avatar'
import Duck from './Duck'

/**
 * A player riding their duck: the duck waddles, the avatar sits in it and paddles.
 * Jumps get a stretch + a quick 360 twirl, landings a squash.
 *
 * motionRef.current = { time, ratio, grounded, vy, jumpT, landT }
 */
export const Rider = memo(function Rider({ duck, equipped, proportions, motionRef, onReady }) {
  const spin = useRef()
  useFrame(() => {
    const mo = motionRef.current
    if (spin.current) {
      // Twirl during the first 0.45 s of a jump, eased.
      const k = Math.min(1, mo.jumpT / 0.45)
      const e = mo.grounded && mo.jumpT > 0.45 ? 0 : 1 - Math.pow(1 - k, 3)
      spin.current.rotation.y = mo.twirl ? e * Math.PI * 2 : 0
      spin.current.rotation.x = mo.grounded ? 0 : Math.max(-0.25, Math.min(0.25, -mo.vy * 0.015))
    }
  })
  return (
    <group>
      <group ref={spin}>
        <Duck id={duck} motionRef={motionRef} />
        {/* The rider sits behind the neck, legs hanging down both sides of it. */}
        <group position={[0, 0.92, -0.12]}>
          <Avatar equipped={equipped} proportions={proportions} motionRef={motionRef} onReady={onReady} />
        </group>
      </group>
    </group>
  )
})

export const newMotion = () => ({ time: 0, ratio: 0, grounded: true, vy: 0, jumpT: 9, landT: 9, twirl: true })

export default Rider

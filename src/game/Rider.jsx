import { useFrame } from '@react-three/fiber'
import { memo, useRef } from 'react'
import { RingGeometry } from 'three'

import { runtime } from '../state/store'
import Avatar from './Avatar'
import Duck from './Duck'

const RING = new RingGeometry(0.8, 1.05, 48)

/**
 * A player riding their duck: the duck waddles, the avatar sits in it and paddles.
 * Jumps get a stretch + a quick 360 twirl, landings a squash. A golden ring flashes on
 * level-up / rebirth (runtime.flashes[sid]).
 *
 * motionRef.current = { time, ratio, grounded, vy, jumpT, landT }
 */
export const Rider = memo(function Rider({ duck, equipped, proportions, motionRef, flashKey, onReady }) {
  const spin = useRef()
  const flash = useRef()
  useFrame(() => {
    const mo = motionRef.current
    if (spin.current) {
      // Twirl during the first 0.45 s of a jump, eased.
      const k = Math.min(1, mo.jumpT / 0.45)
      const e = mo.grounded && mo.jumpT > 0.45 ? 0 : 1 - Math.pow(1 - k, 3)
      spin.current.rotation.y = mo.twirl ? e * Math.PI * 2 : 0
      spin.current.rotation.x = mo.grounded ? 0 : Math.max(-0.25, Math.min(0.25, -mo.vy * 0.015))
    }
    if (flash.current) {
      const at = runtime.flashes.get(flashKey)
      const age = at ? (performance.now() - at) / 1000 : 9
      const on = age < 0.9
      flash.current.visible = on
      if (on) {
        const s = 1 + age * 4
        flash.current.scale.set(s, s, s)
        flash.current.material.opacity = 0.9 * (1 - age / 0.9)
      }
    }
  })
  return (
    <group>
      <group ref={spin}>
        <group scale={1.18}>
          <Duck id={duck} motionRef={motionRef} />
        </group>
        {/* The rider sits behind the neck, legs hanging down both sides of it. */}
        <group position={[0, 0.98, 0.1]}>
          <Avatar equipped={equipped} proportions={proportions} motionRef={motionRef} onReady={onReady} />
        </group>
      </group>
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} geometry={RING} visible={false}>
        <meshBasicMaterial color="#ffe14a" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
})

export const newMotion = () => ({ time: 0, ratio: 0, grounded: true, vy: 0, jumpT: 9, landT: 9, twirl: true })

export default Rider

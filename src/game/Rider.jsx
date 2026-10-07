import { useFrame } from '@react-three/fiber'
import { memo, useRef } from 'react'
import { CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three'

import Avatar from './Avatar'
import Duck from './Duck'

/**
 * A player riding their duck: the duck waddles, the avatar sits in a saddle on its back
 * holding a handle, bobbing with each step. Every jump does a trick - a spin, a front
 * flip or a barrel roll in turn - with a stretch on take-off and a squash on landing.
 *
 * motionRef.current = { time, ratio, grounded, vy, jumpT, landT }
 */

/** Height the duck's centre of mass sits at: flips rotate around it, not the feet. */
const PIVOT = 1.05
/** Seat: hips just above the duck's back. */
const SEAT = [0, 0.68 - PIVOT, -0.16]

const SADDLE = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
const RIM = new TorusGeometry(1, 0.1, 8, 28)
const BAR = new CylinderGeometry(0.035, 0.035, 0.62, 10)
const KNOB = new SphereGeometry(0.06, 10, 8)
const saddleMat = new MeshStandardMaterial({ color: '#d8344a', roughness: 0.55 })
const goldMat = new MeshStandardMaterial({ color: '#ffcc1a', metalness: 0.7, roughness: 0.3, emissive: '#ff9a00', emissiveIntensity: 0.2 })
const TRICKS = 3
const TRICK_TIME = 0.55

export const Rider = memo(function Rider({ duck, equipped, proportions, motionRef, onReady }) {
  const trick = useRef()
  const seat = useRef()
  const state = useRef({ lastJumpT: 9, style: -1 })
  useFrame(() => {
    const mo = motionRef.current
    const st = state.current
    // A new jump started: pick the next trick.
    if (mo.jumpT < st.lastJumpT - 0.05 && mo.jumpT < 0.1) st.style = (st.style + 1) % TRICKS
    st.lastJumpT = mo.jumpT
    if (trick.current) {
      const k = Math.min(1, mo.jumpT / TRICK_TIME)
      const e = mo.grounded && mo.jumpT > TRICK_TIME ? 0 : mo.twirl === false ? 0 : 1 - Math.pow(1 - k, 3)
      const turn = e * Math.PI * 2
      const lean = mo.grounded ? 0 : Math.max(-0.25, Math.min(0.25, -mo.vy * 0.015))
      trick.current.rotation.set(st.style === 1 ? turn : lean, st.style === 0 ? turn : 0, st.style === 2 ? turn : 0)
    }
    if (seat.current) {
      // The rider bounces in the saddle with the waddle, and sinks in on landing.
      const ph = mo.time * (7 + mo.ratio * 7)
      const land = Math.max(0, 1 - mo.landT / 0.25)
      seat.current.position.y = SEAT[1] + (mo.grounded ? Math.abs(Math.sin(ph)) * 0.05 * mo.ratio : 0.04) - land * 0.08
      seat.current.rotation.z = mo.grounded ? Math.sin(ph) * 0.06 * mo.ratio : 0
    }
  })
  return (
    <group position={[0, PIVOT, 0]}>
      <group ref={trick}>
        <group position={[0, -PIVOT, 0]}>
          <Duck id={duck} motionRef={motionRef} />
          {/* Saddle with a gold rim, and a handle across the neck to hold on to. */}
          <mesh geometry={SADDLE} material={saddleMat} position={[0, 1.13, -0.16]} scale={[0.42, 0.14, 0.5]} />
          <mesh geometry={RIM} material={goldMat} position={[0, 1.14, -0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[0.42, 0.5, 0.4]} />
          <mesh geometry={BAR} material={goldMat} position={[0, 1.5, 0.3]} rotation={[0, 0, Math.PI / 2]} />
          {[1, -1].map((s) => (
            <mesh key={s} geometry={KNOB} material={goldMat} position={[s * 0.33, 1.5, 0.3]} />
          ))}
        </group>
        <group ref={seat} position={SEAT}>
          <Avatar equipped={equipped} proportions={proportions} motionRef={motionRef} onReady={onReady} />
        </group>
      </group>
    </group>
  )
})

export const newMotion = () => ({ time: 0, ratio: 0, grounded: true, vy: 0, jumpT: 9, landT: 9, twirl: true })

export default Rider

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { ConeGeometry, CylinderGeometry, MeshBasicMaterial, Shape, ShapeGeometry } from 'three'

import { runtime } from '../../state/store'

/**
 * The new-player guide's pointers (runtime.guideTarget, set by ui/Guide.jsx): a big
 * bouncing arrow over the place to go, plus a glowing arrow at the duck's feet that
 * turns to face it.
 */

const HEAD = new ConeGeometry(1.1, 1.6, 4)
HEAD.rotateX(Math.PI) // point down
const SHAFT = new CylinderGeometry(0.42, 0.42, 1.8, 12)
const POINTER = (() => {
  const s = new Shape()
  s.moveTo(0, 1.25)
  s.lineTo(0.8, 0.2)
  s.lineTo(0.3, 0.2)
  s.lineTo(0.3, -0.6)
  s.lineTo(-0.3, -0.6)
  s.lineTo(-0.3, 0.2)
  s.lineTo(-0.8, 0.2)
  s.closePath()
  const g = new ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  return g
})()
const gold = new MeshBasicMaterial({ color: '#ffd21a', toneMapped: false })
const glow = new MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })

export default function GuideArrow() {
  const big = useRef()
  const feet = useRef()
  useFrame(({ clock }) => {
    const t = runtime.guideTarget
    const me = runtime.me
    const on = !!(t && me)
    if (big.current) big.current.visible = on
    if (feet.current) feet.current.visible = on
    if (!on) return
    const time = clock.elapsedTime
    big.current.position.set(t.x, (t.y || 0) + 5.2 + Math.sin(time * 3.2) * 0.6, t.z)
    big.current.rotation.y = time * 1.6
    const dx = t.x - me.x
    const dz = t.z - me.z
    const near = Math.hypot(dx, dz) < 4
    feet.current.visible = !near
    feet.current.position.set(me.x, me.y + 0.12, me.z)
    // Shape points to -z; rotate it to face the target.
    feet.current.rotation.y = Math.atan2(-dx, -dz)
    const s = 1.2 + Math.sin(time * 6) * 0.12
    feet.current.children[0].position.z = -2.4 - Math.sin(time * 6) * 0.25
    feet.current.children[0].scale.setScalar(s)
  })
  return (
    <>
      <group ref={big} visible={false}>
        <mesh geometry={HEAD} material={gold} />
        <mesh geometry={SHAFT} material={gold} position={[0, 1.6, 0]} />
      </group>
      <group ref={feet} visible={false}>
        <mesh geometry={POINTER} material={glow} position={[0, 0, -2.4]} renderOrder={6} />
      </group>
    </>
  )
}

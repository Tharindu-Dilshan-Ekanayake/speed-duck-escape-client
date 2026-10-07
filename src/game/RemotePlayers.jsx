import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { CanvasTexture, LinearFilter, SpriteMaterial, SRGBColorSpace } from 'three'

import { formatNum } from '../shared/gameData'
import { runtime, useGame } from '../state/store'
import Rider, { newMotion } from './Rider'
import { FONT_UI } from './textures'

/** Name tag: name on top, level + wins underneath. */
function tagMaterial(name, level, wins, rebirths) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.font = `700 54px ${FONT_UI}`
  g.lineWidth = 10
  g.strokeStyle = 'rgba(10,12,24,0.9)'
  g.strokeText(name, 256, 48)
  g.fillStyle = '#ffffff'
  g.fillText(name, 256, 48)
  g.font = `700 40px ${FONT_UI}`
  const sub = `${rebirths ? `R${rebirths} • ` : ''}Lv ${level}  🏆 ${formatNum(wins)}`
  g.lineWidth = 8
  g.strokeText(sub, 256, 116)
  g.fillStyle = '#ffd84a'
  g.fillText(sub, 256, 116)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  return new SpriteMaterial({ map: t, transparent: true, depthWrite: false })
}

const RemoteRider = memo(function RemoteRider({ sid, player }) {
  const group = useRef()
  const motion = useRef(newMotion())
  const prev = useRef({ grounded: true, x: 0, z: 0 })
  const tag = useMemo(() => tagMaterial(player.name, player.level, player.wins, player.rebirths), [player.name, player.level, player.wins, player.rebirths])

  useFrame((_s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const r = runtime.remote.get(sid)
    if (!r || !group.current) return
    const far = Math.hypot(r.tx - r.x, r.tz - r.z) > 25
    const k = far ? 1 : 1 - Math.pow(0.0005, dt)
    r.x += (r.tx - r.x) * k
    r.y += (r.ty - r.y) * k
    r.z += (r.tz - r.z) * k
    let d = r.tyaw - r.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    r.yaw += d * (1 - Math.pow(0.0001, dt))
    group.current.position.set(r.x, r.y, r.z)
    group.current.rotation.y = r.yaw
    // Visibility: only nearby players in the same world are drawn.
    const me = runtime.me
    group.current.visible = !me || Math.hypot(me.x - r.x, me.z - r.z) < 260

    const p = prev.current
    const spd = dt > 0 ? Math.hypot(r.x - p.x, r.z - p.z) / dt : 0
    p.x = r.x
    p.z = r.z
    const mo = motion.current
    const grounded = (r.flags & 2) !== 0
    const tread = (r.flags & 8) !== 0
    if (!grounded && p.grounded && (r.flags & 4)) mo.jumpT = 0
    if (grounded && !p.grounded) mo.landT = 0
    p.grounded = grounded
    mo.time += dt
    mo.grounded = grounded
    mo.vy = r.flags & 4 ? 6 : grounded ? 0 : -6
    mo.ratio = tread ? 1 : Math.min(1, (mo.ratio * 0.8 + (spd / 9) * 0.2))
    mo.jumpT += dt
    mo.landT += dt
  })

  return (
    <group ref={group}>
      <Rider duck={player.duck || 'rubber'} equipped={player.avatar} proportions={player.proportions} motionRef={motion} flashKey={sid} />
      <sprite material={tag} position={[0, 3.35, 0]} scale={[2.6, 0.81, 1]} />
    </group>
  )
})

export function RemotePlayers() {
  const players = useGame((s) => s.players)
  return (
    <>
      {Object.values(players).map((p) => (
        <RemoteRider key={p.sid} sid={p.sid} player={p} />
      ))}
    </>
  )
}

export default RemotePlayers

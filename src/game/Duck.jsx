import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'

import { duckById } from '../shared/gameData'
import { additiveMaterial, fresnelMaterial } from './materials'
import { shapeTexture } from './textures'

/**
 * A smooth, cartoon rubber duck. Every duck shares this model; `def.fx` adds the
 * personality: glow shell, particles, hat / crown / halo, wings, horns, aura ring.
 *
 * Local frame: facing +z, feet at y = 0, about 1.6 m tall.
 */

const SPHERE = new SphereGeometry(1, 40, 28)
const SPHERE_LO = new SphereGeometry(1, 16, 12)
const CYL = new CylinderGeometry(1, 1, 1, 24)
const CONE = new ConeGeometry(1, 1, 18)
const TORUS = new TorusGeometry(1, 0.06, 10, 48)
const HALO = new TorusGeometry(1, 0.09, 12, 40)

const FOOT = (() => {
  const s = new Shape()
  s.moveTo(0, -0.04)
  s.lineTo(-0.17, 0.26)
  s.quadraticCurveTo(-0.11, 0.3, -0.06, 0.24)
  s.quadraticCurveTo(0, 0.31, 0.06, 0.24)
  s.quadraticCurveTo(0.11, 0.3, 0.17, 0.26)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 })
  g.rotateX(Math.PI / 2)
  return g
})()

let crackTex = null
function crackTexture() {
  if (crackTex) return crackTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#fff'
  g.lineWidth = 3
  for (let i = 0; i < 26; i += 1) {
    let x = Math.random() * 256
    let y = Math.random() * 256
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 6; k += 1) {
      x += (Math.random() - 0.5) * 40
      y += (Math.random() - 0.5) * 40
      g.lineTo(x, y)
    }
    g.stroke()
  }
  crackTex = new CanvasTexture(c)
  crackTex.colorSpace = SRGBColorSpace
  return crackTex
}

const matCache = new Map()
function duckMaterials(def) {
  if (matCache.has(def.id)) return matCache.get(def.id)
  const fx = def.fx || {}
  const body = new MeshStandardMaterial({
    color: new Color(def.body),
    roughness: fx.gold ? 0.28 : fx.crystal ? 0.1 : 0.42,
    metalness: fx.gold ? 0.8 : fx.crystal ? 0.25 : 0.04,
    emissive: new Color(fx.glow || def.body),
    emissiveIntensity: fx.glow ? (fx.ghost ? 0.55 : 0.22) : 0.04,
    transparent: !!(fx.ghost || fx.crystal),
    opacity: fx.ghost ? 0.82 : fx.crystal ? 0.88 : 1,
    flatShading: !!fx.crystal,
  })
  if (fx.cracks) {
    body.emissiveMap = crackTexture()
    body.emissive = new Color(fx.cracks)
    body.emissiveIntensity = 1.6
  }
  const m = {
    body,
    beak: new MeshStandardMaterial({ color: new Color(def.beak), roughness: 0.4, emissive: new Color(def.beak), emissiveIntensity: 0.08 }),
    feet: new MeshStandardMaterial({ color: new Color(def.beak), roughness: 0.5 }),
    eye: new MeshStandardMaterial({ color: '#111018', roughness: 0.15 }),
    shine: new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6 }),
    cheek: new MeshStandardMaterial({ color: '#ff8fb3', transparent: true, opacity: 0.55, roughness: 0.6 }),
    black: new MeshStandardMaterial({ color: '#15151c', roughness: 0.5 }),
    band: new MeshStandardMaterial({ color: '#d4142e', roughness: 0.5 }),
    gold: new MeshStandardMaterial({ color: '#ffcc1a', roughness: 0.25, metalness: 0.85, emissive: '#ff9a00', emissiveIntensity: 0.2 }),
    horn: new MeshStandardMaterial({ color: fx.horns || '#ff6a00', emissive: fx.horns || '#ff6a00', emissiveIntensity: 0.7 }),
    wing: new MeshStandardMaterial({
      color: new Color(fx.wings || def.body),
      emissive: new Color(fx.wings || def.body),
      emissiveIntensity: fx.wings ? 0.35 : 0.04,
      roughness: 0.5,
      transparent: !!fx.ghost,
      opacity: fx.ghost ? 0.8 : 1,
    }),
    glow: fx.glow ? fresnelMaterial(fx.glow, fx.ghost ? 1.1 : 1.6) : null,
  }
  matCache.set(def.id, m)
  return m
}

/* ------------------------------------------------------------------ */
/* Particles: one Points draw call per duck                             */
/* ------------------------------------------------------------------ */

const PARTICLE_SHAPE = { sparkle: 'star', fire: 'dot', hearts: 'heart', snow: 'snow', wind: 'dot', bolts: 'bolt', stars: 'star', bubbles: 'ring' }

const pointsMaterial = (shape, color) =>
  new ShaderMaterial({
    uniforms: { uMap: { value: shapeTexture(shape) }, uColor: { value: new Color(color) } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; varying float vA;
      void main() {
        vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColor * t.rgb, t.a * vA);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

const N = 16
function DuckParticles({ type, color, scale = 1 }) {
  const ref = useRef()
  const data = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('aSize', new BufferAttribute(new Float32Array(N), 1))
    geo.setAttribute('aAlpha', new BufferAttribute(new Float32Array(N), 1))
    const seeds = Array.from({ length: N }, () => ({ a: Math.random() * 6.28, r: 0.5 + Math.random() * 0.6, s: Math.random(), off: Math.random() }))
    return { geo, seeds, mat: pointsMaterial(PARTICLE_SHAPE[type] || 'dot', color) }
  }, [type, color])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pos = data.geo.attributes.position.array
    const size = data.geo.attributes.aSize.array
    const alpha = data.geo.attributes.aAlpha.array
    data.seeds.forEach((sd, i) => {
      const life = (t * (type === 'fire' ? 1.3 : 0.45) + sd.off) % 1
      let x
      let y
      let z
      let s
      let a = Math.sin(life * Math.PI)
      switch (type) {
        case 'fire':
          x = Math.cos(sd.a) * sd.r * 0.55 * (1 - life)
          z = Math.sin(sd.a) * sd.r * 0.55 * (1 - life)
          y = 0.5 + life * 1.6
          s = 0.5 * (1 - life) + 0.1
          break
        case 'snow':
          x = Math.cos(sd.a + t * 0.3) * sd.r * 1.2
          z = Math.sin(sd.a + t * 0.3) * sd.r * 1.2
          y = 2.2 - life * 2.2
          s = 0.22
          break
        case 'hearts':
        case 'bubbles':
          x = Math.cos(sd.a) * sd.r + Math.sin(t * 2 + sd.a) * 0.12
          z = Math.sin(sd.a) * sd.r
          y = 0.4 + life * 2
          s = type === 'hearts' ? 0.3 : 0.22
          break
        case 'wind': {
          const ang = sd.a + t * 4
          x = Math.cos(ang) * (0.9 + sd.s * 0.3)
          z = Math.sin(ang) * (0.9 + sd.s * 0.3)
          y = 0.3 + sd.s * 1.5
          s = 0.12
          a = 0.7
          break
        }
        case 'bolts':
          x = Math.cos(sd.a + Math.floor(t * 6 + sd.off * 9)) * sd.r * 1.1
          z = Math.sin(sd.a + Math.floor(t * 6 + sd.off * 9)) * sd.r * 1.1
          y = 0.4 + sd.s * 1.6
          s = 0.35
          a = (t * 6 + sd.off * 9) % 1 < 0.5 ? 1 : 0
          break
        case 'stars': {
          const ang = sd.a + t * 1.2
          x = Math.cos(ang) * (1 + sd.s * 0.3)
          z = Math.sin(ang) * (1 + sd.s * 0.3)
          y = 0.6 + Math.sin(t * 2 + sd.a) * 0.4 + sd.s
          s = 0.24
          a = 0.6 + 0.4 * Math.sin(t * 5 + sd.a)
          break
        }
        default:
          x = Math.cos(sd.a) * sd.r * 1.1
          z = Math.sin(sd.a) * sd.r * 1.1
          y = 0.3 + sd.s * 1.8 + life * 0.4
          s = 0.24
          a = Math.max(0, Math.sin(life * Math.PI * 2))
      }
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      size[i] = s * scale
      alpha[i] = a
    })
    data.geo.attributes.position.needsUpdate = true
    data.geo.attributes.aSize.needsUpdate = true
    data.geo.attributes.aAlpha.needsUpdate = true
  })

  return <points ref={ref} geometry={data.geo} material={data.mat} frustumCulled={false} />
}

/* ------------------------------------------------------------------ */

const IDLE = { time: 0, ratio: 0, grounded: true, vy: 0, jumpT: 9, landT: 9 }

/**
 * @param {{ id: string, motionRef?: object, particles?: boolean, glow?: boolean }} props
 * motionRef.current: { time, ratio (0..1 run amount), grounded, vy, jumpT, landT }
 */
export const Duck = memo(function Duck({ id, motionRef, particles = true, glow = true }) {
  const def = duckById(id)
  const fx = def.fx || {}
  const m = duckMaterials(def)
  const root = useRef()
  const body = useRef()
  const wingL = useRef()
  const wingR = useRef()
  const footL = useRef()
  const footR = useRef()
  const head = useRef()
  const ring = useRef()
  const bigWings = useRef()

  useFrame((state, dt) => {
    const mo = motionRef?.current || IDLE
    const t = motionRef ? mo.time : state.clock.elapsedTime
    const ratio = mo.ratio || 0
    const phase = t * (7 + ratio * 7)
    const air = !mo.grounded
    // Waddle: roll side to side, alternate feet.
    if (body.current) {
      body.current.rotation.z = air ? 0 : Math.sin(phase) * 0.13 * ratio + Math.sin(t * 1.8) * 0.02
      body.current.position.y = air ? 0 : Math.abs(Math.cos(phase)) * 0.07 * ratio + Math.sin(t * 2) * 0.012
    }
    if (footL.current && footR.current) {
      const kick = air ? 0.7 : Math.sin(phase) * 0.75 * ratio
      footL.current.rotation.x = kick
      footR.current.rotation.x = air ? 0.7 : -kick
    }
    const flap = air ? Math.sin(t * 28) * 0.7 + 0.5 : Math.sin(phase * 0.5) * 0.12 * ratio
    if (wingL.current) wingL.current.rotation.z = 0.2 + flap
    if (wingR.current) wingR.current.rotation.z = -0.2 - flap
    if (head.current) head.current.rotation.x = air ? -0.15 : Math.sin(phase * 2) * 0.04 * ratio
    if (ring.current) ring.current.rotation.z += dt * 1.6
    if (bigWings.current) bigWings.current.children.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * (0.35 + Math.sin(t * (air ? 14 : 3)) * 0.25)))
    // Squash on landing, stretch on take-off.
    if (root.current) {
      const j = Math.max(0, 1 - mo.jumpT / 0.22)
      const l = Math.max(0, 1 - mo.landT / 0.2)
      const sy = 1 + j * 0.16 - l * 0.2
      const sxz = 1 - j * 0.08 + l * 0.14
      root.current.scale.set(sxz, sy, sxz)
    }
    if (fx.rainbow) {
      // Shared material, so drive it from the shared clock (not per-instance deltas).
      const hue = (state.clock.elapsedTime * 0.25) % 1
      m.body.color.setHSL(hue, 0.95, 0.55)
      m.body.emissive.setHSL(hue, 1, 0.4)
    }
  })

  return (
    <group ref={root}>
      <group ref={body}>
        {/* Body, chest and tail. */}
        <mesh geometry={SPHERE} material={m.body} position={[0, 0.72, -0.05]} scale={[0.64, 0.5, 0.8]} rotation={[-0.08, 0, 0]} castShadow />
        <mesh geometry={SPHERE} material={m.body} position={[0, 0.8, 0.34]} scale={[0.5, 0.44, 0.48]} castShadow />
        <mesh geometry={SPHERE} material={m.body} position={[0, 1.0, -0.78]} scale={[0.24, 0.16, 0.3]} rotation={[-0.65, 0, 0]} castShadow />
        {glow && m.glow && <mesh geometry={SPHERE_LO} material={m.glow} position={[0, 0.78, 0]} scale={[0.84, 0.72, 1.02]} />}
        {/* Wings. */}
        <group ref={wingL} position={[0.6, 0.86, -0.06]}>
          <mesh geometry={SPHERE} material={m.wing} position={[0.04, -0.14, 0]} scale={[0.12, 0.3, 0.42]} castShadow />
        </group>
        <group ref={wingR} position={[-0.6, 0.86, -0.06]}>
          <mesh geometry={SPHERE} material={m.wing} position={[-0.04, -0.14, 0]} scale={[0.12, 0.3, 0.42]} castShadow />
        </group>
        {fx.wings && (
          <group ref={bigWings} position={[0, 1.05, -0.45]}>
            {[1, -1].map((s) => (
              <group key={s} rotation={[0, s * 0.4, 0]}>
                <mesh geometry={SPHERE} material={m.wing} position={[s * 0.62, 0.32, -0.1]} scale={[0.6, 0.36, 0.08]} rotation={[0, 0, s * 0.45]} />
                <mesh geometry={SPHERE} material={m.wing} position={[s * 0.42, 0.12, -0.06]} scale={[0.42, 0.24, 0.07]} rotation={[0, 0, s * 0.2]} />
              </group>
            ))}
          </group>
        )}
        {/* Head. */}
        <group ref={head} position={[0, 1.32, 0.55]}>
          <mesh geometry={SPHERE} material={m.body} scale={0.37} castShadow />
          {glow && m.glow && <mesh geometry={SPHERE_LO} material={m.glow} scale={0.45} />}
          <mesh geometry={SPHERE} material={m.beak} position={[0, -0.04, 0.33]} scale={[0.2, 0.075, 0.22]} />
          <mesh geometry={SPHERE} material={m.beak} position={[0, -0.1, 0.3]} scale={[0.16, 0.055, 0.17]} />
          {[1, -1].map((s) => (
            <group key={s}>
              <mesh geometry={SPHERE} material={m.eye} position={[s * 0.16, 0.08, 0.28]} scale={0.068} />
              <mesh geometry={SPHERE} material={m.shine} position={[s * 0.14, 0.11, 0.335]} scale={0.024} />
              <mesh geometry={SPHERE} material={m.cheek} position={[s * 0.25, -0.03, 0.22]} scale={[0.06, 0.045, 0.03]} />
            </group>
          ))}
          {fx.hat === 'top' && (
            <group position={[0, 0.33, -0.02]} rotation={[-0.1, 0, 0.08]}>
              <mesh geometry={CYL} material={m.black} scale={[0.3, 0.04, 0.3]} castShadow />
              <mesh geometry={CYL} material={m.black} position={[0, 0.2, 0]} scale={[0.19, 0.38, 0.19]} castShadow />
              <mesh geometry={CYL} material={m.band} position={[0, 0.06, 0]} scale={[0.195, 0.07, 0.195]} />
            </group>
          )}
          {fx.hat === 'crown' && (
            <group position={[0, 0.34, 0]}>
              <mesh geometry={CYL} material={m.gold} scale={[0.22, 0.14, 0.22]} />
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} geometry={CONE} material={m.gold} position={[Math.cos((i / 5) * 6.28) * 0.18, 0.15, Math.sin((i / 5) * 6.28) * 0.18]} scale={[0.06, 0.18, 0.06]} />
              ))}
            </group>
          )}
          {fx.horns && [1, -1].map((s) => <mesh key={s} geometry={CONE} material={m.horn} position={[s * 0.22, 0.32, -0.04]} rotation={[0, 0, -s * 0.5]} scale={[0.07, 0.28, 0.07]} />)}
          {fx.halo && <mesh geometry={HALO} material={additiveMaterial(fx.halo, 0.95)} position={[0, 0.58, -0.05]} rotation={[Math.PI / 2 - 0.2, 0, 0]} scale={0.26} />}
        </group>
      </group>
      {/* Legs + webbed feet. */}
      {[
        [0.22, footL],
        [-0.22, footR],
      ].map(([x, ref]) => (
        <group key={x} ref={ref} position={[x, 0.3, 0.12]}>
          <mesh geometry={CYL} material={m.feet} position={[0, -0.15, 0]} scale={[0.045, 0.3, 0.045]} />
          <mesh geometry={FOOT} material={m.feet} position={[0, -0.28, -0.02]} castShadow />
        </group>
      ))}
      {fx.ring && <mesh ref={ring} geometry={TORUS} material={additiveMaterial(fx.ring, 0.8)} position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={1.05} />}
      {particles && fx.particles && <DuckParticles type={fx.particles} color={fx.pc || '#ffffff'} />}
    </group>
  )
})

export default Duck

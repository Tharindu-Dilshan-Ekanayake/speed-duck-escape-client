import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { NeutralToneMapping, PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { runtime, useGame } from '../state/store'
import CameraRig from './CameraRig'
import Ambient from './fx/Ambient'
import Bursts from './fx/Bursts'
import Footprints from './fx/Footprints'
import GuideArrow from './fx/GuideArrow'
import Popups from './fx/Popups'
import LocalPlayer from './LocalPlayer'
import { tickMaterials } from './materials'
import RemotePlayers from './RemotePlayers'
import Sky, { Lights } from './Sky'
import World from './world/World'

/** Drives material animation and reports "first frames rendered" to the loading screen. */
function Ticker() {
  const frames = useRef(0)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    // Warm up shaders so the first seconds of play don't hitch.
    try {
      gl.compile(scene, camera)
    } catch {
      /* best effort */
    }
  }, [gl, scene, camera])
  useFrame(({ clock }) => {
    tickMaterials(clock.elapsedTime)
    // Re-render the sun's shadow map every other frame: half the shadow cost, no visible lag.
    if (gl.shadowMap.enabled) {
      gl.shadowMap.autoUpdate = false
      if (frames.current % 2 === 0) gl.shadowMap.needsUpdate = true
    }
    frames.current += 1
    if (frames.current === 8) useGame.setState({ sceneReady: true })
  })
  return null
}

function Environment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.4
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

export function GameScene() {
  const quality = useGame((s) => s.settings.quality)
  const high = quality === 'high'
  return (
    <Canvas
      key={quality}
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 1.5] : [0.75, 1]}
      gl={{ antialias: high, powerPreference: 'high-performance' }}
      camera={{ fov: 68, near: 0.15, far: 1100, position: [0, 8, 34] }}
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV) Object.assign(runtime, { gl, scene })
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1.08
      }}
    >
      <Environment />
      <Sky />
      <Lights shadows={high} />
      <World />
      <LocalPlayer />
      <RemotePlayers />
      <Footprints />
      <Popups />
      <Bursts />
      <Ambient />
      <GuideArrow />
      <CameraRig />
      <Ticker />
    </Canvas>
  )
}

export default GameScene

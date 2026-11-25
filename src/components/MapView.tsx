import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Ping, Token } from '../types'
import { TERRAIN, hash2, type PropKind } from '../lib/terrain'

export interface MapLabel {
  text: string
  x: number
  y: number
  hidden?: boolean
}

export interface MapViewProps {
  mapKey: string
  width: number
  height: number
  terrain: string[]
  ambient?: 'day' | 'dusk' | 'night' | 'dungeon'
  /** Vue MJ : masque des cases révélées (les autres sont assombries) */
  fog?: boolean[][]
  labels: MapLabel[]
  tokens: Token[]
  pings: Ping[]
  selectedTokenId?: string | null
  showHp?: boolean
  canDrag: (t: Token) => boolean
  onTokenMove: (id: string, x: number, y: number) => void
  onTokenClick?: (t: Token) => void
  onTileClick?: (x: number, y: number, mods: { shift: boolean; alt: boolean }) => void
  onTilePing?: (x: number, y: number) => void
  brush?: 'reveal' | 'hide' | null
  onTilePaint?: (x: number, y: number) => void
  /** Cases de bâtiments où l'on peut entrer : "x,y" -> nom de l'intérieur */
  doors?: Record<string, string>
  onEnter?: (x: number, y: number) => void
}

// ---------- Décors : chaque type est une liste de pièces géométriques ----------

type Part = { geo: THREE.BufferGeometry; color: string; pos: [number, number, number]; scale: [number, number, number]; emissive?: boolean; jitter?: number }

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  pyr: new THREE.ConeGeometry(0.62, 1, 4),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  sph: new THREE.SphereGeometry(0.5, 10, 8),
  dode: new THREE.DodecahedronGeometry(0.5, 0),
}

const PROPS: Record<PropKind, Part[]> = {
  tree: [
    { geo: G.cyl, color: '#6b4a2b', pos: [0, 0.35, 0], scale: [0.18, 0.7, 0.18] },
    { geo: G.ico, color: '#3f7f34', pos: [0, 1.05, 0], scale: [0.95, 0.9, 0.95], jitter: 0.25 },
  ],
  pine: [
    { geo: G.cyl, color: '#5a3d24', pos: [0, 0.25, 0], scale: [0.16, 0.5, 0.16] },
    { geo: G.cone, color: '#2e5e2f', pos: [0, 0.85, 0], scale: [0.9, 1.0, 0.9], jitter: 0.2 },
    { geo: G.cone, color: '#356b35', pos: [0, 1.35, 0], scale: [0.6, 0.8, 0.6], jitter: 0.2 },
  ],
  bush: [{ geo: G.ico, color: '#4c7f33', pos: [0, 0.22, 0], scale: [0.6, 0.42, 0.6], jitter: 0.3 }],
  tomb: [{ geo: G.box, color: '#9a9a96', pos: [0, 0.25, -0.1], scale: [0.45, 0.5, 0.14] }],
  sarcophagus: [{ geo: G.box, color: '#8b8a85', pos: [0, 0.25, 0], scale: [0.6, 0.5, 0.95] }],
  well: [
    { geo: G.cyl, color: '#8d8a83', pos: [0, 0.25, 0], scale: [0.85, 0.5, 0.85] },
    { geo: G.cyl, color: '#13263a', pos: [0, 0.51, 0], scale: [0.6, 0.02, 0.6] },
    { geo: G.box, color: '#6b4a2b', pos: [0, 0.9, 0], scale: [0.9, 0.08, 0.08] },
  ],
  door: [{ geo: G.box, color: '#5a3b22', pos: [0, 0.02, 0], scale: [0.8, 0.04, 0.8] }],
  mushroom: [
    { geo: G.sph, color: '#c0392b', pos: [0.15, 0.1, 0.1], scale: [0.25, 0.14, 0.25] },
    { geo: G.sph, color: '#e3c27a', pos: [-0.2, 0.08, -0.15], scale: [0.2, 0.12, 0.2] },
    { geo: G.sph, color: '#a93226', pos: [-0.05, 0.08, 0.28], scale: [0.16, 0.1, 0.16] },
  ],
  bed: [
    { geo: G.box, color: '#6b4a2b', pos: [0, 0.18, 0], scale: [0.8, 0.36, 0.95] },
    { geo: G.box, color: '#e9e2d0', pos: [0, 0.38, 0.05], scale: [0.72, 0.08, 0.8] },
    { geo: G.box, color: '#8e2f3b', pos: [0, 0.43, 0.22], scale: [0.74, 0.04, 0.45] },
  ],
  cage: [
    { geo: G.box, color: '#5b3d22', pos: [0, 0.05, 0], scale: [0.95, 0.1, 0.95] },
    { geo: G.box, color: '#5b3d22', pos: [0, 0.95, 0], scale: [0.95, 0.08, 0.95] },
    { geo: G.box, color: '#5b3d22', pos: [0.42, 0.5, 0.42], scale: [0.08, 0.9, 0.08] },
    { geo: G.box, color: '#5b3d22', pos: [-0.42, 0.5, 0.42], scale: [0.08, 0.9, 0.08] },
    { geo: G.box, color: '#5b3d22', pos: [0.42, 0.5, -0.42], scale: [0.08, 0.9, 0.08] },
    { geo: G.box, color: '#5b3d22', pos: [-0.42, 0.5, -0.42], scale: [0.08, 0.9, 0.08] },
    { geo: G.box, color: '#5b3d22', pos: [0, 0.5, 0.42], scale: [0.06, 0.9, 0.06] },
  ],
  fire: [
    { geo: G.cyl, color: '#4a3020', pos: [0, 0.06, 0], scale: [0.6, 0.12, 0.6] },
    { geo: G.cone, color: '#ff8a1f', pos: [0, 0.35, 0], scale: [0.4, 0.55, 0.4], emissive: true },
    { geo: G.cone, color: '#ffd34d', pos: [0, 0.3, 0], scale: [0.22, 0.4, 0.22], emissive: true },
  ],
  tent: [{ geo: G.pyr, color: '#b9a57e', pos: [0, 0.45, 0], scale: [1.2, 0.9, 1.2], jitter: 0.1 }],
  table: [{ geo: G.box, color: '#7a5532', pos: [0, 0.25, 0], scale: [0.9, 0.12, 0.7] }],
  candles: [
    { geo: G.cyl, color: '#ffe8a3', pos: [0.3, 0.12, 0.3], scale: [0.08, 0.24, 0.08], emissive: true },
    { geo: G.cyl, color: '#ffe8a3', pos: [-0.3, 0.12, -0.3], scale: [0.08, 0.24, 0.08], emissive: true },
    { geo: G.cyl, color: '#9b59b6', pos: [0, 0.01, 0], scale: [0.9, 0.02, 0.9], emissive: true },
  ],
  statue: [
    { geo: G.cyl, color: '#9c9a94', pos: [0, 0.1, 0], scale: [0.6, 0.2, 0.6] },
    { geo: G.cyl, color: '#a8a6a0', pos: [0, 0.55, 0], scale: [0.35, 0.7, 0.35] },
    { geo: G.sph, color: '#a8a6a0', pos: [0, 1.05, 0], scale: [0.32, 0.32, 0.32] },
  ],
  hay: [{ geo: G.box, color: '#d8b75a', pos: [0, 0.25, 0], scale: [0.85, 0.5, 0.75], jitter: 0.1 }],
  stairs: [
    { geo: G.box, color: '#a19d95', pos: [0, 0.06, -0.25], scale: [0.9, 0.12, 0.5] },
    { geo: G.box, color: '#aaa69e', pos: [0, 0.18, -0.35], scale: [0.9, 0.12, 0.3] },
  ],
  post: [
    { geo: G.cyl, color: '#7a5532', pos: [-0.22, 0.55, 0], scale: [0.22, 1.1, 0.22] },
    { geo: G.cyl, color: '#6b4a2b', pos: [0.22, 0.6, 0], scale: [0.22, 1.2, 0.22] },
    { geo: G.cone, color: '#6b4a2b', pos: [0.22, 1.28, 0], scale: [0.22, 0.18, 0.22] },
  ],
  rock: [
    { geo: G.dode, color: '#85837c', pos: [0, 0.35, 0], scale: [0.95, 0.75, 0.9], jitter: 0.25 },
    { geo: G.dode, color: '#77756f', pos: [0.25, 0.2, 0.25], scale: [0.45, 0.4, 0.45] },
  ],
  stone: [{ geo: G.dode, color: '#efeee8', pos: [0, 0.14, 0], scale: [0.45, 0.3, 0.4] }],
  oven: [
    { geo: G.box, color: '#8a4b32', pos: [0, 0.3, 0], scale: [0.95, 0.6, 0.95] },
    { geo: G.sph, color: '#9c5638', pos: [0, 0.6, 0], scale: [0.9, 0.6, 0.9] },
    { geo: G.box, color: '#ff8a1f', pos: [0, 0.3, 0.46], scale: [0.4, 0.3, 0.06], emissive: true },
  ],
  shelf: [
    { geo: G.box, color: '#6b4a2b', pos: [0, 0.55, -0.3], scale: [0.95, 1.1, 0.3] },
    { geo: G.box, color: '#c9a86b', pos: [0, 0.4, -0.2], scale: [0.8, 0.14, 0.2] },
    { geo: G.box, color: '#7aa0c4', pos: [0.15, 0.78, -0.2], scale: [0.5, 0.16, 0.2] },
  ],
  counter: [
    { geo: G.box, color: '#7a5532', pos: [0, 0.32, 0], scale: [1, 0.64, 0.6] },
    { geo: G.box, color: '#a07447', pos: [0, 0.66, 0], scale: [1.02, 0.06, 0.66] },
  ],
  anvil: [
    { geo: G.box, color: '#6b4a2b', pos: [0, 0.18, 0], scale: [0.35, 0.36, 0.35] },
    { geo: G.box, color: '#3c3f44', pos: [0, 0.45, 0], scale: [0.7, 0.18, 0.32] },
  ],
  barrel: [
    { geo: G.cyl, color: '#7a5532', pos: [-0.2, 0.3, -0.15], scale: [0.45, 0.6, 0.45] },
    { geo: G.cyl, color: '#6b4a2b', pos: [0.22, 0.3, 0.18], scale: [0.45, 0.6, 0.45] },
  ],
  bookcase: [
    { geo: G.box, color: '#5a3b22', pos: [0, 0.6, -0.3], scale: [0.95, 1.2, 0.3] },
    { geo: G.box, color: '#8e2f3b', pos: [-0.2, 0.45, -0.18], scale: [0.4, 0.2, 0.12] },
    { geo: G.box, color: '#2f5d8e', pos: [0.2, 0.75, -0.18], scale: [0.45, 0.2, 0.12] },
    { geo: G.box, color: '#3f7a3a', pos: [-0.1, 1.0, -0.18], scale: [0.6, 0.18, 0.12] },
  ],
  workbench: [
    { geo: G.box, color: '#a07447', pos: [0, 0.4, 0], scale: [0.95, 0.1, 0.55] },
    { geo: G.box, color: '#6b4a2b', pos: [-0.35, 0.2, 0], scale: [0.1, 0.4, 0.5] },
    { geo: G.box, color: '#6b4a2b', pos: [0.35, 0.2, 0], scale: [0.1, 0.4, 0.5] },
    { geo: G.box, color: '#d8b77a', pos: [0.1, 0.5, 0], scale: [0.6, 0.06, 0.12] },
  ],
  fireplace: [
    { geo: G.box, color: '#7c776f', pos: [0, 0.55, -0.25], scale: [1, 1.1, 0.5] },
    { geo: G.box, color: '#1d1a18', pos: [0, 0.3, 0.01], scale: [0.55, 0.45, 0.06] },
    { geo: G.cone, color: '#ff8a1f', pos: [0, 0.25, 0.05], scale: [0.3, 0.35, 0.2], emissive: true },
  ],
  chest: [
    { geo: G.box, color: '#7a4b22', pos: [0, 0.2, 0], scale: [0.7, 0.4, 0.45] },
    { geo: G.box, color: '#c9a227', pos: [0, 0.4, 0], scale: [0.72, 0.05, 0.47] },
  ],
  sacks: [
    { geo: G.sph, color: '#e8dfc8', pos: [-0.2, 0.25, 0], scale: [0.45, 0.5, 0.4] },
    { geo: G.sph, color: '#ddd3b8', pos: [0.22, 0.22, 0.15], scale: [0.4, 0.45, 0.38] },
  ],
  bread: [
    { geo: G.box, color: '#7a5532', pos: [0, 0.3, 0], scale: [0.9, 0.08, 0.7] },
    { geo: G.box, color: '#6b4a2b', pos: [0, 0.15, 0], scale: [0.8, 0.3, 0.6] },
    { geo: G.sph, color: '#c98a3e', pos: [-0.2, 0.4, 0], scale: [0.35, 0.18, 0.22] },
    { geo: G.sph, color: '#d49a4a', pos: [0.2, 0.4, 0.1], scale: [0.3, 0.16, 0.3] },
  ],
  chair: [
    { geo: G.box, color: '#7a5532', pos: [0, 0.22, 0], scale: [0.4, 0.06, 0.4] },
    { geo: G.box, color: '#7a5532', pos: [0, 0.4, -0.18], scale: [0.4, 0.4, 0.06] },
  ],
}

const tmpObj = new THREE.Object3D()
const tmpColor = new THREE.Color()
const FOG_TINT = new THREE.Color('#1b2233')

function tinted(hex: string, v: number, dim: boolean): THREE.Color {
  tmpColor.set(hex)
  tmpColor.offsetHSL(0, 0, (v - 0.5) * 0.07)
  if (dim) tmpColor.lerp(FOG_TINT, 0.66)
  return tmpColor
}

function buildWorld(width: number, height: number, terrain: string[], fog?: boolean[][]): THREE.Group {
  const group = new THREE.Group()
  const ox = -width / 2 + 0.5
  const oz = -height / 2 + 0.5
  const ground: { x: number; y: number; c: string; h: number; dim: boolean; water?: boolean }[] = []
  const blocks: { x: number; y: number; h: number; side: string; top?: string; base: number; dim: boolean }[] = []
  const props: Record<string, { x: number; y: number; base: number; dim: boolean }[]> = {}
  for (let y = 0; y < height; y++) {
    const row = terrain[y] ?? ''
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ' '
      if (ch === ' ') continue
      const t = TERRAIN[ch] ?? TERRAIN['.']
      const dim = fog ? !fog[y]?.[x] : false
      ground.push({ x, y, c: t.ground, h: t.h, dim, water: t.water })
      if (t.block) blocks.push({ x, y, h: t.block.h, side: t.block.color, top: t.block.top, base: t.h, dim })
      if (t.prop) (props[t.prop] ??= []).push({ x, y, base: t.h, dim })
    }
  }
  const mat = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 })

  // sol
  const gm = new THREE.InstancedMesh(G.box, mat(), Math.max(ground.length, 1))
  gm.count = ground.length
  ground.forEach((g, i) => {
    const v = hash2(g.x, g.y)
    const hh = g.h + (g.water ? 0 : v * 0.04)
    tmpObj.position.set(g.x + ox, hh / 2, g.y + oz)
    tmpObj.scale.set(1, hh, 1)
    tmpObj.rotation.set(0, 0, 0)
    tmpObj.updateMatrix()
    gm.setMatrixAt(i, tmpObj.matrix)
    gm.setColorAt(i, tinted(g.c, v, g.dim))
  })
  gm.receiveShadow = true
  group.add(gm)

  // volumes (murs, maisons)
  const bm = new THREE.InstancedMesh(G.box, mat(), Math.max(blocks.length, 1))
  const tm = new THREE.InstancedMesh(G.box, mat(), Math.max(blocks.length, 1))
  bm.count = blocks.length
  tm.count = blocks.length
  blocks.forEach((b, i) => {
    const v = hash2(b.x + 7, b.y + 3)
    tmpObj.position.set(b.x + ox, b.base + b.h / 2, b.y + oz)
    tmpObj.scale.set(1, b.h, 1)
    tmpObj.updateMatrix()
    bm.setMatrixAt(i, tmpObj.matrix)
    bm.setColorAt(i, tinted(b.side, v, b.dim))
    tmpObj.position.set(b.x + ox, b.base + b.h + 0.06, b.y + oz)
    tmpObj.scale.set(1.02, 0.12, 1.02)
    tmpObj.updateMatrix()
    tm.setMatrixAt(i, tmpObj.matrix)
    tm.setColorAt(i, tinted(b.top ?? b.side, v, b.dim))
  })
  for (const m of [bm, tm]) {
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }

  // décors
  for (const [kind, cells] of Object.entries(props)) {
    const parts = PROPS[kind as PropKind]
    for (const part of parts) {
      const material = part.emissive
        ? new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color(part.color), emissiveIntensity: 0.9, roughness: 0.6 })
        : mat()
      const im = new THREE.InstancedMesh(part.geo, material, cells.length)
      cells.forEach((c, i) => {
        const v = hash2(c.x * 3 + 1, c.y * 5 + 2)
        const j = part.jitter ? 1 + (v - 0.5) * part.jitter * 2 : 1
        tmpObj.position.set(c.x + ox + part.pos[0], c.base + part.pos[1] * j, c.y + oz + part.pos[2])
        tmpObj.scale.set(part.scale[0] * j, part.scale[1] * j, part.scale[2] * j)
        tmpObj.rotation.set(0, part.jitter ? v * Math.PI * 2 : 0, 0)
        tmpObj.updateMatrix()
        im.setMatrixAt(i, tmpObj.matrix)
        im.setColorAt(i, tinted(part.color, v, c.dim))
      })
      im.castShadow = !part.emissive
      im.receiveShadow = true
      group.add(im)
    }
  }
  return group
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.InstancedMesh
    if (m.isInstancedMesh) {
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
  })
}

// ---------- Pions ----------

function TokenMesh({
  t,
  pos,
  selected,
  showHp,
  draggable,
  onDown,
  onClick,
  ghost,
}: {
  t: Token
  pos: [number, number, number]
  selected: boolean
  showHp: boolean
  draggable: boolean
  onDown?: (e: ThreeEvent<PointerEvent>) => void
  onClick?: () => void
  ghost?: boolean
}) {
  const color = t.color
  const hidden = !t.visible
  const opacity = ghost ? 0.45 : hidden ? 0.55 : 1
  const transparent = opacity < 1
  const hpPct = t.hpMax ? Math.max(0, Math.min(1, (t.hp ?? 0) / t.hpMax)) : null
  return (
    <group
      position={pos}
      onPointerDown={onDown}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        if (draggable) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.42, 0.12, 20]} />
        <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
      </mesh>
      {t.kind === 'monster' ? (
        <mesh position={[0, 0.48, 0]} castShadow>
          <dodecahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color={color} roughness={0.5} transparent={transparent} opacity={opacity} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.24, 0.55, 14]} />
            <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.8, 0]} castShadow>
            <sphereGeometry args={[t.kind === 'npc' ? 0.15 : 0.19, 14, 12]} />
            <meshStandardMaterial color={t.kind === 'npc' ? '#f1e3c8' : color} transparent={transparent} opacity={opacity} />
          </mesh>
        </>
      )}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.46, 0.56, 32]} />
          <meshBasicMaterial color="#ffd34d" />
        </mesh>
      )}
      {!ghost && (
        <Html position={[0, 1.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`token-label ${hidden ? 'is-hidden' : ''}`}>
            <span>{t.label}</span>
            {showHp && hpPct !== null && (
              <i className="hpbar">
                <b style={{ width: `${hpPct * 100}%`, background: hpPct > 0.5 ? '#5cb85c' : hpPct > 0.2 ? '#f0ad4e' : '#d9534f' }} />
              </i>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

function PingMesh({ p, pos }: { p: Ping; pos: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const age = (Date.now() - p.ts) / 1000
    const k = (age % 1.2) / 1.2
    ref.current.scale.setScalar(0.3 + k * 1.6)
    ;(ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * (age < 5 ? 1 : 0)
  })
  return (
    <mesh ref={ref} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.55, 32]} />
      <meshBasicMaterial color={p.color} transparent depthWrite={false} />
    </mesh>
  )
}

// ---------- Scène ----------

const AMBIENTS = {
  day: { bg: '#1c2531', amb: 0.75, sun: 1.6, sunColor: '#fff3dd', hemi: ['#cfe3ff', '#3b4a2a'] },
  dusk: { bg: '#241c26', amb: 0.55, sun: 1.2, sunColor: '#ffb377', hemi: ['#ffcfa8', '#2b2433'] },
  night: { bg: '#0d1220', amb: 0.45, sun: 0.7, sunColor: '#9db4ff', hemi: ['#6d7fb5', '#141a26'] },
  dungeon: { bg: '#0b0b0e', amb: 0.55, sun: 0.75, sunColor: '#ffd7a1', hemi: ['#8f8577', '#1a1612'] },
} as const

function Scene(props: MapViewProps & { resetSignal: number }) {
  const { width, height, terrain, fog, tokens, pings, labels } = props
  const amb = AMBIENTS[props.ambient ?? 'day']
  const ox = -width / 2 + 0.5
  const oz = -height / 2 + 0.5
  const world = useMemo(() => buildWorld(width, height, terrain, fog), [width, height, terrain, fog])
  useEffect(() => () => disposeGroup(world), [world])

  const { camera, size, controls, gl } = useThree() as any
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const painting = useRef<Set<string> | null>(null)
  const [hover, setHover] = useState<[number, number] | null>(null)

  // cadrage initial
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    const span = (width + height) * 0.62
    cam.zoom = Math.max(8, Math.min(size.width, size.height * 1.6) / span)
    cam.position.set(width * 0.9, Math.max(width, height) * 1.1, height * 0.9)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mapKey, props.resetSignal, controls])

  const tileFrom = (p: THREE.Vector3): [number, number] | null => {
    const x = Math.round(p.x - ox)
    const y = Math.round(p.z - oz)
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    return [x, y]
  }

  const setControls = (on: boolean) => {
    if (controls) controls.enabled = on
  }

  useEffect(() => {
    const up = () => {
      painting.current = null
      setControls(true)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  })

  const groundY = (x: number, y: number) => {
    const c = terrain[y]?.[x]
    const t = c && c !== ' ' ? TERRAIN[c] ?? TERRAIN['.'] : null
    return (t?.h ?? 0.2) + 0.02
  }

  const finishDrag = () => {
    if (drag) {
      props.onTokenMove(drag.id, drag.x, drag.y)
      setDrag(null)
    }
    setControls(true)
    document.body.style.cursor = ''
  }

  return (
    <>
      <color attach="background" args={[amb.bg]} />
      <ambientLight intensity={amb.amb} />
      <hemisphereLight args={[amb.hemi[0], amb.hemi[1], 0.5]} />
      <directionalLight
        position={[width * 0.4, Math.max(width, height) * 0.9, height * 0.25]}
        intensity={amb.sun}
        color={amb.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-Math.max(width, height) * 0.75}
        shadow-camera-right={Math.max(width, height) * 0.75}
        shadow-camera-top={Math.max(width, height) * 0.75}
        shadow-camera-bottom={-Math.max(width, height) * 0.75}
        shadow-bias={-0.0006}
      />
      <primitive object={world} />

      {/* plan invisible qui reçoit les clics / glisser */}
      <mesh
        position={[0, 0.25, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (props.brush && e.button === 0 && props.onTilePaint) {
            e.stopPropagation()
            setControls(false)
            painting.current = new Set()
            const t = tileFrom(e.point)
            if (t) {
              painting.current.add(t.join(','))
              props.onTilePaint(t[0], t[1])
            }
          }
        }}
        onPointerMove={(e) => {
          const t = tileFrom(e.point)
          setHover(t)
          if (!drag && !painting.current) document.body.style.cursor = t && props.onEnter && props.doors?.[t.join(',')] ? 'pointer' : ''
          if (drag && t && (t[0] !== drag.x || t[1] !== drag.y)) setDrag({ ...drag, x: t[0], y: t[1] })
          if (painting.current && t && props.onTilePaint) {
            const k = t.join(',')
            if (!painting.current.has(k)) {
              painting.current.add(k)
              props.onTilePaint(t[0], t[1])
            }
          }
        }}
        onPointerUp={() => {
          if (drag) finishDrag()
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 5 || props.brush) return
          const t = tileFrom(e.point)
          if (!t) return
          if (props.onEnter && props.doors?.[t.join(',')]) return props.onEnter(t[0], t[1])
          props.onTileClick?.(t[0], t[1], { shift: e.nativeEvent.shiftKey, alt: e.nativeEvent.altKey })
        }}
        onDoubleClick={(e) => {
          const t = tileFrom(e.point)
          if (t) props.onTilePing?.(t[0], t[1])
        }}
      >
        <planeGeometry args={[width + 40, height + 40]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {hover && (
        <mesh position={[hover[0] + ox, groundY(hover[0], hover[1]) + 0.01, hover[1] + oz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial
            color={props.brush === 'hide' ? '#e74c3c' : props.brush === 'reveal' ? '#ffd34d' : '#ffffff'}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      )}

      {hover && !props.brush && props.onEnter && props.doors?.[hover.join(',')] && (
        <Html position={[hover[0] + ox, 2.2, hover[1] + oz]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="door-tip">🚪 Entrer : {props.doors[hover.join(',')]}</div>
        </Html>
      )}

      {tokens.map((t) => {
        const dragging = drag?.id === t.id
        const draggable = props.canDrag(t)
        return (
          <group key={t.id}>
            <TokenMesh
              t={t}
              pos={[t.x + ox, groundY(t.x, t.y), t.y + oz]}
              selected={props.selectedTokenId === t.id}
              showHp={!!props.showHp || t.kind === 'pc'}
              draggable={draggable}
              onClick={() => props.onTokenClick?.(t)}
              onDown={(e) => {
                e.stopPropagation()
                if (!draggable || e.button !== 0) return
                setControls(false)
                setDrag({ id: t.id, x: t.x, y: t.y })
                document.body.style.cursor = 'grabbing'
                ;(gl.domElement as HTMLElement).setPointerCapture?.(e.pointerId)
              }}
            />
            {dragging && drag && (drag.x !== t.x || drag.y !== t.y) && (
              <TokenMesh t={t} ghost pos={[drag.x + ox, groundY(drag.x, drag.y), drag.y + oz]} selected={false} showHp={false} draggable={false} />
            )}
          </group>
        )
      })}

      {pings.map((p) => (
        <PingMesh key={p.id} p={p} pos={[p.x + ox, groundY(p.x, p.y) + 0.03, p.y + oz]} />
      ))}

      {labels.map((l, i) => (
        <Html key={i} position={[l.x + ox, 1.9, l.y + oz]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`map-label ${l.hidden ? 'is-hidden' : ''}`}>{l.hidden ? '🔒 ' : ''}{l.text}</div>
        </Html>
      ))}
    </>
  )
}

export default function MapView(props: MapViewProps) {
  const [reset, setReset] = useState(0)
  const ctrl = useRef<any>(null)
  const rotate = (dir: number) => {
    const c = ctrl.current
    if (!c) return
    const cam = c.object as THREE.Camera
    const off = cam.position.clone().sub(c.target)
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (dir * Math.PI) / 2)
    cam.position.copy(c.target).add(off)
    c.update()
  }
  const zoom = (k: number) => {
    const c = ctrl.current
    if (!c) return
    const cam = c.object as THREE.OrthographicCamera
    cam.zoom = Math.max(6, Math.min(200, cam.zoom * k))
    cam.updateProjectionMatrix()
    c.update()
  }
  return (
    <div className="mapview">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <OrthographicCamera makeDefault position={[30, 40, 30]} zoom={20} near={-500} far={2000} />
        <OrbitControls
          ref={ctrl}
          makeDefault
          enableDamping
          dampingFactor={0.15}
          screenSpacePanning={false}
          minPolarAngle={0.3}
          maxPolarAngle={1.15}
          minZoom={6}
          maxZoom={200}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        />
        <Scene {...props} resetSignal={reset} />
      </Canvas>
      <div className="map-tools">
        <button title="Pivoter à gauche" onClick={() => rotate(-1)}>⟲</button>
        <button title="Pivoter à droite" onClick={() => rotate(1)}>⟳</button>
        <button title="Zoomer" onClick={() => zoom(1.25)}>＋</button>
        <button title="Dézoomer" onClick={() => zoom(0.8)}>－</button>
        <button title="Recentrer" onClick={() => setReset((n) => n + 1)}>◎</button>
      </div>
    </div>
  )
}

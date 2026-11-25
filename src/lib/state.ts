import type {
  GameState,
  MapDef,
  MapState,
  PlayerAction,
  PlayerView,
  Scenario,
  Token,
  JournalEntry,
  DiceRoll,
} from '../types'
import { roll, isValidExpr } from './dice'
import { TERRAIN, VOID } from './terrain'

export const VIEW_VERSION = 1
const MAX_JOURNAL = 400
const MAX_ROLLS = 120
const PING_TTL = 6000

export function uid(prefix = ''): string {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  return prefix + a[0].toString(36) + a[1].toString(36).slice(0, 4)
}

export function roomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const a = new Uint32Array(6)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => alphabet[n % alphabet.length]).join('')
}

export function newMapState(map: MapDef): MapState {
  return { revealedZones: [...(map.startZones ?? [])], tiles: {} }
}

export function newGame(scenario: Scenario, room: string): GameState {
  const maps: Record<string, MapState> = {}
  for (const m of scenario.maps) maps[m.id] = newMapState(m)
  const characters: GameState['characters'] = {}
  for (const c of scenario.characters) {
    characters[c.id] = { hp: c.hpLevel1, hpMax: c.hpLevel1, level: 1, notes: '' }
  }
  const firstMap = scenario.parts[0]?.mapIds[0] ?? scenario.maps[0]?.id ?? null
  const g: GameState = {
    room,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    createdAt: Date.now(),
    activeMapId: firstMap,
    maps,
    tokens: [],
    revealed: { locations: [], npcs: [], clues: [] },
    journal: [
      {
        id: uid('j'),
        ts: Date.now(),
        author: 'Table',
        kind: 'system',
        text: `La partie « ${scenario.title} » commence. Bienvenue autour de la table !`,
      },
    ],
    rolls: [],
    players: {},
    characters,
    pings: [],
    requests: [],
    seeded: [],
  }
  seedNpcs(g, scenario)
  return g
}

/** Pose les PNJ prévus par le scénario dans les cartes (une seule fois par carte). */
export function seedNpcs(g: GameState, scenario: Scenario) {
  g.seeded ??= []
  for (const m of scenario.maps) {
    if (!m.npcs?.length || g.seeded.includes(m.id)) continue
    g.seeded.push(m.id)
    for (const n of m.npcs) {
      const def = scenario.npcs.find((d) => d.id === n.npcId)
      const name = def?.name ?? n.npcId
      g.tokens.push({
        id: uid('t'),
        mapId: m.id,
        x: n.x,
        y: n.y,
        kind: 'npc',
        name,
        label: n.label ?? name.replace(/^(Monsieur|Le|La|L')\s*/i, '').split(/[ ,]/)[0],
        color: '#d4a017',
        visible: true,
      })
    }
  }
}

/** Carte intérieure → zone de la carte extérieure qui y mène */
export function doorOf(scenario: Scenario, interiorId: string): { map: MapDef; zone: string } | null {
  for (const m of scenario.maps)
    for (const [z, info] of Object.entries(m.zoneInfo)) if (info.enterMapId === interiorId) return { map: m, zone: z }
  return null
}

/** Déplace les pions des personnages joués vers une carte (près d'une case donnée ou du départ). */
export function movePartyTo(g: GameState, scenario: Scenario, mapId: string, at?: [number, number]) {
  const map = scenario.maps.find((m) => m.id === mapId)
  if (!map) return
  const ids = Object.values(g.players)
    .map((p) => p.characterId)
    .filter(Boolean) as string[]
  const [sx, sy] = at ?? map.start ?? [Math.floor(map.width / 2), Math.floor(map.height / 2)]
  for (const id of ids) {
    let t = g.tokens.find((t) => t.kind === 'pc' && t.characterId === id && t.mapId === mapId)
    if (!t) {
      placePc(g, scenario, id, mapId)
      t = g.tokens.find((t) => t.kind === 'pc' && t.characterId === id && t.mapId === mapId)
    }
    if (!t) continue
    t.x = -99
    const [x, y] = freeSpotNear(g, map, sx, sy)
    t.x = x
    t.y = y
  }
}

/** Fait entrer (ou sortir) le groupe : change la carte des joueurs, révèle le lieu lié à la porte. */
export function goToMap(g: GameState, scenario: Scenario, mapId: string) {
  const map = scenario.maps.find((m) => m.id === mapId)
  if (!map) return
  const from = scenario.maps.find((m) => m.id === g.activeMapId)
  g.activeMapId = mapId
  g.requests = (g.requests ?? []).filter((r) => r.mapId !== mapId)
  // sortie d'un intérieur : on réapparaît devant la porte
  if (from?.exitTo && from.exitTo.mapId === mapId) {
    movePartyTo(g, scenario, mapId, [from.exitTo.x, from.exitTo.y])
    addJournal(g, { author: 'Table', kind: 'system', text: `Le groupe sort : **${map.name}**` })
    return
  }
  movePartyTo(g, scenario, mapId)
  const door = doorOf(scenario, mapId)
  if (door) {
    const locId = door.map.zoneInfo[door.zone].locationId
    const loc = scenario.locations.find((l) => l.id === locId)
    if (loc && !g.revealed.locations.includes(loc.id)) {
      g.revealed.locations.push(loc.id)
    }
    if (!g.maps[door.map.id].revealedZones.includes(door.zone)) g.maps[door.map.id].revealedZones.push(door.zone)
    addJournal(g, { author: 'Table', kind: 'system', text: `Le groupe entre : **${map.name}**` })
  } else {
    addJournal(g, { author: 'Table', kind: 'system', text: `Nouvelle carte : **${map.name}**` })
  }
}

/** Complète un état chargé si le scénario a gagné des cartes / personnages depuis. */
export function reconcile(game: GameState, scenario: Scenario): GameState {
  const g = structuredClone(game)
  for (const m of scenario.maps) if (!g.maps[m.id]) g.maps[m.id] = newMapState(m)
  for (const c of scenario.characters)
    if (!g.characters[c.id]) g.characters[c.id] = { hp: c.hpLevel1, hpMax: c.hpLevel1, level: 1, notes: '' }
  if (g.activeMapId && !scenario.maps.some((m) => m.id === g.activeMapId)) g.activeMapId = scenario.maps[0]?.id ?? null
  g.requests ??= []
  seedNpcs(g, scenario)
  return g
}

export function zoneAt(map: MapDef, x: number, y: number): string {
  return map.zones[y]?.[x] ?? VOID
}

export function isTileRevealed(map: MapDef, ms: MapState | undefined, x: number, y: number): boolean {
  if (!ms) return false
  const o = ms.tiles[`${x},${y}`]
  if (o !== undefined) return o
  return ms.revealedZones.includes(zoneAt(map, x, y))
}

export function revealedMask(map: MapDef, ms: MapState | undefined): boolean[][] {
  const out: boolean[][] = []
  for (let y = 0; y < map.height; y++) {
    const row: boolean[] = []
    for (let x = 0; x < map.width; x++) row.push(isTileRevealed(map, ms, x, y))
    out.push(row)
  }
  return out
}

export function zoneCentroids(map: MapDef): Record<string, { x: number; y: number; n: number }> {
  const acc: Record<string, { x: number; y: number; n: number }> = {}
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const z = zoneAt(map, x, y)
      if (!map.zoneInfo[z]) continue
      const a = (acc[z] ??= { x: 0, y: 0, n: 0 })
      a.x += x
      a.y += y
      a.n++
    }
  for (const k of Object.keys(acc)) {
    acc[k].x /= acc[k].n
    acc[k].y /= acc[k].n
  }
  return acc
}

export function tokenOnRevealedTile(scenario: Scenario, game: GameState, t: Token): boolean {
  const map = scenario.maps.find((m) => m.id === t.mapId)
  if (!map) return false
  return isTileRevealed(map, game.maps[t.mapId], t.x, t.y)
}

/** La seule fonction qui décide de ce qui part chez les joueurs. */
export function buildPlayerView(game: GameState, scenario: Scenario): PlayerView {
  const map = scenario.maps.find((m) => m.id === game.activeMapId) ?? null
  let mapView: PlayerView['map'] = null
  if (map) {
    const ms = game.maps[map.id]
    const mask = revealedMask(map, ms)
    const terrain = map.terrain.map((row, y) =>
      Array.from({ length: map.width }, (_, x) => (mask[y][x] ? row[x] ?? VOID : VOID)).join(''),
    )
    const cents = zoneCentroids(map)
    const labels = Object.entries(map.zoneInfo)
      .filter(([z, info]) => !info.nolabel && ms?.revealedZones.includes(z) && cents[z])
      .map(([z, info]) => ({ text: info.publicName ?? info.name, x: cents[z].x, y: cents[z].y }))
    const doors: Record<string, string> = {}
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const target = map.zoneInfo[zoneAt(map, x, y)]?.enterMapId
        const ch = map.terrain[y][x]
        if (target && mask[y][x] && (TERRAIN[ch]?.block || ch === '+')) doors[`${x},${y}`] = scenario.maps.find((m) => m.id === target)?.name ?? 'Entrer'
      }
    const exitName = map.exitTo ? scenario.maps.find((m) => m.id === map.exitTo!.mapId)?.name : undefined
    mapView = { id: map.id, name: map.name, width: map.width, height: map.height, ambient: map.ambient, terrain, labels, doors, exitName }
  }
  const tokens = map
    ? game.tokens.filter((t) => t.mapId === map.id && t.visible && tokenOnRevealedTile(scenario, game, t))
    : []
  const playersByChar: Record<string, { name: string; key: string }> = {}
  for (const p of Object.values(game.players)) if (p.characterId) playersByChar[p.characterId] = { name: p.name, key: p.key }
  const now = Date.now()
  return {
    v: VIEW_VERSION,
    title: scenario.title,
    map: mapView,
    tokens,
    locations: scenario.locations
      .filter((l) => game.revealed.locations.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, num: l.num, text: l.publicText })),
    npcs: scenario.npcs
      .filter((n) => game.revealed.npcs.includes(n.id))
      .map((n) => ({ id: n.id, name: n.name, role: n.role, text: n.publicText })),
    clues: scenario.clues
      .filter((c) => game.revealed.clues.includes(c.id))
      .map((c) => ({ id: c.id, kind: c.kind, title: c.title, text: c.text })),
    journal: game.journal.slice(-150),
    rolls: game.rolls.filter((r) => !r.secret).slice(-60),
    party: scenario.characters.map((c) => ({
      character: c,
      state: game.characters[c.id],
      player: playersByChar[c.id]?.name,
      playerKey: playersByChar[c.id]?.key,
    })),
    players: Object.values(game.players).map((p) => ({ key: p.key, name: p.name, characterId: p.characterId, online: p.online })),
    pings: game.pings.filter((p) => now - p.ts < PING_TTL && p.mapId === game.activeMapId),
  }
}

// ---------- Mutations ----------

export function addJournal(g: GameState, e: Omit<JournalEntry, 'id' | 'ts'>) {
  g.journal.push({ ...e, id: uid('j'), ts: Date.now() })
  if (g.journal.length > MAX_JOURNAL) g.journal.splice(0, g.journal.length - MAX_JOURNAL)
}

export function addRoll(g: GameState, author: string, expr: string, label?: string, secret?: boolean): DiceRoll {
  const r = roll(expr)
  const entry: DiceRoll = { id: uid('r'), ts: Date.now(), author, expr: r.expr, detail: r.detail, total: r.total, label, secret, nat: r.nat }
  g.rolls.push(entry)
  if (g.rolls.length > MAX_ROLLS) g.rolls.splice(0, g.rolls.length - MAX_ROLLS)
  return entry
}

export function addPing(g: GameState, mapId: string, x: number, y: number, color: string) {
  const now = Date.now()
  g.pings = g.pings.filter((p) => now - p.ts < PING_TTL)
  g.pings.push({ id: uid('p'), ts: now, mapId, x, y, color })
}

function clampText(s: unknown, n: number): string {
  return String(s ?? '').slice(0, n)
}

/**
 * Applique une action reçue d'un joueur. Le MJ reste l'autorité : tout ce qui
 * n'est pas explicitement autorisé est ignoré.
 */
export function applyPlayerAction(game: GameState, scenario: Scenario, key: string, a: PlayerAction): GameState | null {
  const g = structuredClone(game)
  const p = g.players[key]
  switch (a.t) {
    case 'hello': {
      const name = clampText(a.name, 40).trim() || 'Joueur'
      const existing = g.players[a.key]
      const isNew = !existing
      g.players[a.key] = {
        key: a.key,
        name,
        characterId: existing?.characterId ?? validChar(scenario, g, a.key, a.characterId),
        online: true,
        lastSeen: Date.now(),
      }
      if (isNew) addJournal(g, { author: 'Table', kind: 'system', text: `${name} rejoint la table.` })
      ensurePcToken(g, scenario, a.key)
      return g
    }
    case 'pick': {
      if (!p) return null
      p.characterId = a.characterId ? validChar(scenario, g, key, a.characterId) : undefined
      ensurePcToken(g, scenario, key)
      const c = scenario.characters.find((c) => c.id === p.characterId)
      if (c) addJournal(g, { author: 'Table', kind: 'system', text: `${p.name} incarne ${c.name}, ${c.title.toLowerCase()}.` })
      return g
    }
    case 'roll': {
      if (!p || !isValidExpr(a.expr)) return null
      const who = charName(scenario, p.characterId) ?? p.name
      addRoll(g, who, a.expr, clampText(a.label, 60) || undefined)
      return g
    }
    case 'note': {
      if (!p) return null
      const text = clampText(a.text, 2000).trim()
      if (!text) return null
      addJournal(g, { author: charName(scenario, p.characterId) ?? p.name, kind: 'note', text })
      return g
    }
    case 'move': {
      if (!p) return null
      const t = g.tokens.find((t) => t.id === a.tokenId)
      if (!t || t.kind !== 'pc' || t.characterId !== p.characterId) return null
      const map = scenario.maps.find((m) => m.id === t.mapId)
      if (!map || t.mapId !== g.activeMapId) return null
      const x = Math.round(a.x)
      const y = Math.round(a.y)
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null
      // un joueur ne peut poser son pion que sur une case qu'il voit
      if (!isTileRevealed(map, g.maps[map.id], x, y)) return null
      t.x = x
      t.y = y
      return g
    }
    case 'ping': {
      if (!p || !g.activeMapId) return null
      const c = scenario.characters.find((c) => c.id === p.characterId)
      addPing(g, g.activeMapId, Math.round(a.x), Math.round(a.y), c?.color ?? '#ffd34d')
      return g
    }
    case 'hp': {
      if (!p || p.characterId !== a.characterId) return null
      const cs = g.characters[a.characterId]
      if (!cs) return null
      cs.hp = Math.max(-99, Math.min(cs.hpMax, Math.round(a.hp)))
      syncTokenHp(g)
      return g
    }
    case 'enter':
    case 'exit': {
      if (!p || !g.activeMapId) return null
      const map = scenario.maps.find((m) => m.id === g.activeMapId)
      if (!map) return null
      let target: string | undefined
      if (a.t === 'enter') {
        const x = Math.round(a.x)
        const y = Math.round(a.y)
        if (!isTileRevealed(map, g.maps[map.id], x, y)) return null
        target = map.zoneInfo[zoneAt(map, x, y)]?.enterMapId
      } else target = map.exitTo?.mapId
      const tm = scenario.maps.find((m) => m.id === target)
      if (!tm) return null
      g.requests ??= []
      const who = charName(scenario, p.characterId) ?? p.name
      if (g.requests.some((r) => r.mapId === tm.id && r.player === who)) return null
      g.requests.push({ id: uid('q'), ts: Date.now(), player: who, mapId: tm.id, mapName: tm.name })
      addJournal(g, {
        author: 'Table',
        kind: 'system',
        text: `${who} veut ${a.t === 'enter' ? 'entrer' : 'aller'} : **${tm.name}**`,
      })
      return g
    }
    case 'charNotes': {
      if (!p || p.characterId !== a.characterId) return null
      const cs = g.characters[a.characterId]
      if (!cs) return null
      cs.notes = clampText(a.notes, 4000)
      return g
    }
  }
  return null
}

function validChar(scenario: Scenario, g: GameState, key: string, id?: string | null): string | undefined {
  if (!id || !scenario.characters.some((c) => c.id === id)) return undefined
  const taken = Object.values(g.players).some((p) => p.key !== key && p.characterId === id)
  return taken ? undefined : id
}

function charName(scenario: Scenario, id?: string): string | undefined {
  return scenario.characters.find((c) => c.id === id)?.name
}

export function syncTokenHp(g: GameState) {
  for (const t of g.tokens)
    if (t.kind === 'pc' && t.characterId && g.characters[t.characterId]) {
      t.hp = g.characters[t.characterId].hp
      t.hpMax = g.characters[t.characterId].hpMax
    }
}

/** Place le pion d'un personnage joueur sur la carte active s'il n'y est pas. */
export function ensurePcToken(g: GameState, scenario: Scenario, key: string) {
  const p = g.players[key]
  if (!p?.characterId || !g.activeMapId) return
  placePc(g, scenario, p.characterId, g.activeMapId)
}

export function placePc(g: GameState, scenario: Scenario, characterId: string, mapId: string) {
  const c = scenario.characters.find((c) => c.id === characterId)
  const map = scenario.maps.find((m) => m.id === mapId)
  if (!c || !map) return
  if (g.tokens.some((t) => t.kind === 'pc' && t.characterId === characterId && t.mapId === mapId)) return
  const idx = scenario.characters.indexOf(c)
  const [sx, sy] = map.start ?? [Math.floor(map.width / 2), Math.floor(map.height / 2)]
  const spot = freeSpotNear(g, map, sx + (idx % 3) - 1, sy + Math.floor(idx / 3))
  const cs = g.characters[c.id]
  g.tokens.push({
    id: uid('t'),
    mapId,
    x: spot[0],
    y: spot[1],
    kind: 'pc',
    name: c.name,
    label: c.name.slice(0, 2),
    color: c.color,
    characterId: c.id,
    hp: cs?.hp,
    hpMax: cs?.hpMax,
    visible: true,
  })
}

export function freeSpotNear(g: GameState, map: MapDef, x: number, y: number): [number, number] {
  const occupied = new Set(g.tokens.filter((t) => t.mapId === map.id).map((t) => `${t.x},${t.y}`))
  for (let r = 0; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue
        if (occupied.has(`${nx},${ny}`)) continue
        const c = map.terrain[ny][nx]
        const td = TERRAIN[c]
        if (!td || !td.walkable) continue
        return [nx, ny]
      }
  return [x, y]
}

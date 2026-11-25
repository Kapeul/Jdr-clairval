// ---------- Scénario (chargé uniquement par le MJ) ----------

export type StatKey = 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA'
export const STAT_KEYS: StatKey[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']

export interface Attack {
  name: string
  bonus: number
  dmg: string // ex. "1d8+3"
  note?: string
}

export interface MapZone {
  name: string
  locationId?: string
  /** Nom affiché aux joueurs (par défaut : name) */
  publicName?: string
  /** Pas d'étiquette sur la carte (grandes zones de fond) */
  nolabel?: boolean
  /** Bâtiment : carte intérieure ouverte d'un clic sur la zone */
  enterMapId?: string
}

export interface MapDef {
  id: string
  name: string
  partId?: string
  width: number
  height: number
  /** Une ligne par rangée, un caractère par case (voir src/lib/terrain.ts) */
  terrain: string[]
  /** Même taille que terrain : un caractère = un identifiant de zone */
  zones: string[]
  zoneInfo: Record<string, MapZone>
  ambient?: 'day' | 'dusk' | 'night' | 'dungeon'
  /** Zones révélées dès l'ouverture de la carte */
  startZones?: string[]
  /** Case de départ des personnages */
  start?: [number, number]
  /** Intérieur : carte et case où l'on ressort */
  exitTo?: { mapId: string; x: number; y: number }
  /** PNJ présents dès l'ouverture de la carte */
  npcs?: { npcId: string; x: number; y: number; label?: string }[]
}

export interface LocationDef {
  id: string
  partId: string
  mapId?: string
  zone?: string
  num?: string
  name: string
  /** Ce que les joueurs lisent dans leur onglet « Lieux » une fois révélé */
  publicText: string
  /** Texte à lire / résumer aux joueurs (le MJ peut l'envoyer au journal) */
  readAloud?: string
  gmNotes: string
  page?: number
}

export interface NpcDef {
  id: string
  name: string
  role: string
  publicText: string
  gmNotes: string
  partIds?: string[]
}

export interface ClueDef {
  id: string
  partId: string
  kind: 'indice' | 'objet' | 'document'
  title: string
  text: string
  gmNotes?: string
}

export interface MonsterDef {
  id: string
  name: string
  short: string // préfixe des pions, ex. "G" pour gobelin
  level?: string
  stats: Record<StatKey, number>
  init: number
  def: number
  hp: number
  rd?: string
  attacks: Attack[]
  abilities: string[]
  tactics?: string
  count?: string
  color?: string
  page?: number
}

export interface CharacterPathRank {
  name: string
  text: string
}
export interface CharacterPath {
  name: string
  ranks: CharacterPathRank[]
}

export interface CharacterDef {
  id: string
  name: string
  title: string // ex. "Guerrier demi-orque"
  hitDie: string
  hpLevel1: number
  def: number
  stats: Record<StatKey, [number, number]> // valeur, modificateur
  attackMods: { contact: number; distance: number; magique?: number }
  attacks: Attack[]
  armor: string[]
  paths: CharacterPath[]
  equipment: string[]
  description: string
  color: string
  meta: string // sexe, âge, taille…
}

export interface PartDef {
  id: string
  title: string
  level?: string
  summary: string
  /** Notes du MJ, format texte simple (paragraphes séparés par une ligne vide, "## " pour un sous-titre, "- " pour une liste) */
  gmNotes: string
  mapIds: string[]
  intro?: string
}

export interface Scenario {
  format: 'jdr25d-scenario'
  version: number
  id: string
  title: string
  subtitle?: string
  credits?: string
  parts: PartDef[]
  maps: MapDef[]
  locations: LocationDef[]
  npcs: NpcDef[]
  clues: ClueDef[]
  monsters: MonsterDef[]
  characters: CharacterDef[]
}

// ---------- État de partie (détenu par le navigateur du MJ) ----------

export interface Token {
  id: string
  mapId: string
  x: number
  y: number
  kind: 'pc' | 'npc' | 'monster'
  name: string
  label: string // texte court sur le pion
  color: string
  characterId?: string
  monsterId?: string
  hp?: number
  hpMax?: number
  visible: boolean
}

export interface JournalEntry {
  id: string
  ts: number
  author: string
  kind: 'narration' | 'note' | 'system' | 'clue'
  title?: string
  text: string
}

export interface DiceRoll {
  id: string
  ts: number
  author: string
  label?: string
  expr: string
  detail: string
  total: number
  secret?: boolean
  nat?: number // résultat naturel du d20 s'il y en a un seul
}

export interface Ping {
  id: string
  ts: number
  mapId: string
  x: number
  y: number
  color: string
}

export interface PlayerInfo {
  key: string
  name: string
  characterId?: string
  online: boolean
  lastSeen: number
}

export interface CharacterState {
  hp: number
  hpMax: number
  level: number
  notes: string
}

export interface MapState {
  revealedZones: string[]
  /** "x,y" -> true (révélée) / false (cachée), prioritaire sur les zones */
  tiles: Record<string, boolean>
}

export interface GameState {
  room: string
  scenarioId: string
  scenarioTitle: string
  createdAt: number
  activeMapId: string | null
  maps: Record<string, MapState>
  tokens: Token[]
  revealed: { locations: string[]; npcs: string[]; clues: string[] }
  journal: JournalEntry[]
  rolls: DiceRoll[]
  players: Record<string, PlayerInfo>
  characters: Record<string, CharacterState>
  pings: Ping[]
  /** Demandes d'entrée dans un bâtiment faites par les joueurs */
  requests?: { id: string; ts: number; player: string; mapId: string; mapName: string }[]
  /** Cartes dont les PNJ ont déjà été posés */
  seeded?: string[]
}

// ---------- Vue joueurs (seule chose envoyée sur le réseau) ----------

export interface PlayerMapView {
  id: string
  name: string
  width: number
  height: number
  ambient: MapDef['ambient']
  /** Cases non révélées remplacées par ' ' */
  terrain: string[]
  labels: { text: string; x: number; y: number }[]
  /** Cases de bâtiments où l'on peut entrer : "x,y" -> nom de l'intérieur */
  doors: Record<string, string>
  exitName?: string
}

export interface PlayerView {
  v: number
  title: string
  map: PlayerMapView | null
  tokens: Token[]
  locations: { id: string; name: string; num?: string; text: string }[]
  npcs: { id: string; name: string; role: string; text: string }[]
  clues: { id: string; kind: ClueDef['kind']; title: string; text: string }[]
  journal: JournalEntry[]
  rolls: DiceRoll[]
  party: {
    character: CharacterDef
    state: CharacterState
    player?: string
    playerKey?: string
  }[]
  players: { key: string; name: string; characterId?: string; online: boolean }[]
  pings: Ping[]
}

// ---------- Messages réseau ----------

export type PlayerAction =
  | { t: 'hello'; key: string; name: string; characterId?: string }
  | { t: 'roll'; expr: string; label?: string }
  | { t: 'note'; text: string }
  | { t: 'move'; tokenId: string; x: number; y: number }
  | { t: 'ping'; x: number; y: number }
  | { t: 'hp'; characterId: string; hp: number }
  | { t: 'charNotes'; characterId: string; notes: string }
  | { t: 'pick'; characterId: string | null }
  | { t: 'enter'; x: number; y: number }
  | { t: 'exit' }

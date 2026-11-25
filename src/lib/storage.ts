import type { GameState, Scenario } from '../types'
import { uid } from './state'
import { wantsLocal } from './net'

const P = 'jdr25d:'

function get<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(P + k)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}
function set(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(P + k, JSON.stringify(v))
    return true
  } catch {
    return false
  }
}
function del(k: string) {
  try {
    localStorage.removeItem(P + k)
  } catch {
    /* rien */
  }
}

// ----- Scénarios (côté MJ uniquement) -----

export function saveScenario(s: Scenario) {
  set(`scenario:${s.id}`, s)
  const list = listScenarioIds().filter((id) => id !== s.id)
  list.unshift(s.id)
  set('scenarios', list)
}
export function listScenarioIds(): string[] {
  return get<string[]>('scenarios') ?? []
}
export function loadScenario(id: string): Scenario | null {
  return get<Scenario>(`scenario:${id}`)
}
export function deleteScenario(id: string) {
  del(`scenario:${id}`)
  set('scenarios', listScenarioIds().filter((x) => x !== id))
}

export function validateScenario(raw: unknown): Scenario {
  const s = raw as Scenario
  if (!s || s.format !== 'jdr25d-scenario') throw new Error("Ce fichier n'est pas un scénario pour cette table (format inconnu).")
  for (const k of ['parts', 'maps', 'locations', 'npcs', 'clues', 'monsters', 'characters'] as const)
    if (!Array.isArray(s[k])) throw new Error(`Scénario incomplet : « ${k} » manquant.`)
  for (const m of s.maps) {
    if (m.terrain.length !== m.height || m.zones.length !== m.height)
      throw new Error(`Carte « ${m.name} » : nombre de lignes incorrect.`)
    if (m.terrain.some((r) => r.length !== m.width) || m.zones.some((r) => r.length !== m.width))
      throw new Error(`Carte « ${m.name} » : largeur de ligne incorrecte.`)
  }
  return s
}

// ----- Parties (côté MJ) -----

export interface GameSummary {
  room: string
  scenarioId: string
  scenarioTitle: string
  updatedAt: number
}

export function saveGame(g: GameState) {
  set(`game:${g.room}`, g)
  const list = listGames().filter((x) => x.room !== g.room)
  list.unshift({ room: g.room, scenarioId: g.scenarioId, scenarioTitle: g.scenarioTitle, updatedAt: Date.now() })
  set('games', list.slice(0, 20))
}
export function loadGame(room: string): GameState | null {
  return get<GameState>(`game:${room}`)
}
export function listGames(): GameSummary[] {
  return get<GameSummary[]>('games') ?? []
}
export function deleteGame(room: string) {
  del(`game:${room}`)
  set('games', listGames().filter((g) => g.room !== room))
}

// ----- Identité joueur (pas de compte : une clé aléatoire gardée dans le navigateur) -----

// En mode local (plusieurs onglets d'un même navigateur), chaque onglet est un joueur distinct.
function meStore(): Storage {
  return wantsLocal() ? sessionStorage : localStorage
}
export function playerIdentity(): { key: string; name: string } {
  try {
    const me = JSON.parse(meStore().getItem(P + 'me') ?? 'null')
    if (me?.key) return me
  } catch {
    /* rien */
  }
  const fresh = { key: uid('pl'), name: '' }
  try {
    meStore().setItem(P + 'me', JSON.stringify(fresh))
  } catch {
    /* rien */
  }
  return fresh
}
export function setPlayerName(name: string) {
  const me = playerIdentity()
  try {
    meStore().setItem(P + 'me', JSON.stringify({ ...me, name }))
  } catch {
    /* rien */
  }
}

export function loadNotebook(room: string): string {
  return get<string>(`notebook:${room}`) ?? ''
}
export function saveNotebook(room: string, text: string) {
  set(`notebook:${room}`, text)
}

export function getPref<T>(k: string, d: T): T {
  return get<T>(`pref:${k}`) ?? d
}
export function setPref(k: string, v: unknown) {
  set(`pref:${k}`, v)
}

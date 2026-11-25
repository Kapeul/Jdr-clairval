import { describe, expect, it } from 'vitest'
import { roll, isValidExpr } from '../dice'
import { applyPlayerAction, buildPlayerView, newGame } from '../state'
import demo from '../../../public/demo-scenario.json'
import type { Scenario } from '../../types'

const scenario = demo as unknown as Scenario

describe('dés', () => {
  it('lit les expressions', () => {
    expect(isValidExpr('1d20+3')).toBe(true)
    expect(isValidExpr('2d6-1')).toBe(true)
    expect(isValidExpr('d20')).toBe(true)
    expect(isValidExpr('bonjour')).toBe(false)
    expect(isValidExpr('5')).toBe(false)
  })
  it('calcule le total', () => {
    const r = roll('2d6+3', () => 4)
    expect(r.total).toBe(11)
    const k = roll('2d20kh1+1', (() => { const v = [5, 17]; let i = 0; return () => v[i++] })())
    expect(k.total).toBe(18)
    expect(k.nat).toBe(17)
  })
})

describe('vue joueurs', () => {
  it("ne contient rien de ce qui n'est pas révélé", () => {
    const g = newGame(scenario, 'TEST')
    const v = buildPlayerView(g, scenario)
    const json = JSON.stringify(v)
    for (const l of scenario.locations) expect(json).not.toContain(l.gmNotes)
    for (const n of scenario.npcs) expect(json).not.toContain(n.gmNotes)
    expect(v.locations).toHaveLength(0)
    // seules les cases des zones de départ sont visibles
    const map = scenario.maps[0]
    const visible = v.map!.terrain.join('').replace(/ /g, '').length
    let expected = 0
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.startZones!.includes(map.zones[y][x])) expected++
    expect(visible).toBe(expected)
  })
  it("refuse qu'un joueur déplace le pion d'un autre ou vers une case cachée", () => {
    let g = newGame(scenario, 'TEST')
    g = applyPlayerAction(g, scenario, 'a', { t: 'hello', key: 'a', name: 'Alice', characterId: 'pc-brune' })!
    g = applyPlayerAction(g, scenario, 'b', { t: 'hello', key: 'b', name: 'Bob', characterId: 'pc-pim' })!
    const brune = g.tokens.find((t) => t.characterId === 'pc-brune')!
    expect(applyPlayerAction(g, scenario, 'b', { t: 'move', tokenId: brune.id, x: 3, y: 11 })).toBeNull()
    expect(applyPlayerAction(g, scenario, 'a', { t: 'move', tokenId: brune.id, x: 25, y: 7 })).toBeNull()
    const ok = applyPlayerAction(g, scenario, 'a', { t: 'move', tokenId: brune.id, x: 4, y: 11 })
    expect(ok?.tokens.find((t) => t.id === brune.id)?.x).toBe(4)
  })
  it('un personnage ne peut pas être pris deux fois', () => {
    let g = newGame(scenario, 'TEST')
    g = applyPlayerAction(g, scenario, 'a', { t: 'hello', key: 'a', name: 'Alice', characterId: 'pc-brune' })!
    g = applyPlayerAction(g, scenario, 'b', { t: 'hello', key: 'b', name: 'Bob', characterId: 'pc-brune' })!
    expect(g.players.b.characterId).toBeUndefined()
  })
})

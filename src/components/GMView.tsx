import { useMemo, useRef, useState } from 'react'
import type { ClueDef, GameState, LocationDef, MonsterDef, NpcDef, Scenario, Token } from '../types'
import { STAT_KEYS } from '../types'
import { go, playerLink } from '../App'
import MapView, { type MapLabel } from './MapView'
import { CharacterSheet, CopyButton, DicePanel, Journal, RichText, Tabs } from './panels'
import { readScenarioFile } from './Home'
import { useGMSession } from '../lib/session'
import { addJournal, addPing, addRoll, freeSpotNear, placePc, reconcile, revealedMask, syncTokenHp, uid, zoneAt, zoneCentroids } from '../lib/state'
import { loadGame, loadScenario, saveScenario } from '../lib/storage'
import { modStr } from '../lib/dice'

export default function GMView({ room }: { room: string }) {
  const [, refresh] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const game = useMemo(() => loadGame(room), [room])
  const fileRef = useRef<HTMLInputElement>(null)
  if (!game)
    return (
      <div className="center-msg card">
        <h2>Partie introuvable</h2>
        <p>La table {room} n'existe pas dans ce navigateur. Le MJ doit ouvrir la partie depuis le navigateur où il l'a créée.</p>
        <p>
          Tu es joueur ? <button onClick={() => go(`/j/${room}`)}>Rejoindre la table {room}</button>
        </p>
        <button onClick={() => go('/')}>Accueil</button>
      </div>
    )
  const scenario = loadScenario(game.scenarioId)
  if (!scenario)
    return (
      <div className="center-msg card">
        <h2>Scénario manquant</h2>
        <p>Recharge le fichier du scénario « {game.scenarioTitle} » pour reprendre la partie.</p>
        <button
          className="primary"
          onClick={() => fileRef.current?.click()}
        >
          📂 Charger le fichier
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const s = await readScenarioFile(f)
              if (s.id !== game.scenarioId) throw new Error(`Ce fichier contient « ${s.title} », pas « ${game.scenarioTitle} ».`)
              saveScenario(s)
              refresh((n) => n + 1)
            } catch (er: any) {
              setErr(er.message)
            }
          }}
        />
        {err && <p className="error">{err}</p>}
      </div>
    )
  return <GMTable initial={reconcile(game, scenario)} scenario={scenario} />
}

type Mode = 'move' | 'zone' | 'reveal' | 'hide'
type LeftTab = 'scenario' | 'pnj' | 'indices' | 'bestiaire' | 'cartes'
type RightTab = 'journal' | 'des' | 'groupe' | 'pion'

function GMTable({ initial, scenario }: { initial: GameState; scenario: Scenario }) {
  const { game, update, peers, status, netKind } = useGMSession(initial, scenario)
  const [viewMapId, setViewMapId] = useState<string>(initial.activeMapId ?? scenario.maps[0]?.id)
  const [mode, setMode] = useState<Mode>('move')
  const [sel, setSel] = useState<string | null>(null)
  const [left, setLeft] = useState<LeftTab>('scenario')
  const [right, setRight] = useState<RightTab>('journal')
  const [partId, setPartId] = useState(() => scenario.maps.find((m) => m.id === initial.activeMapId)?.partId ?? scenario.parts[0]?.id)
  const [showLeft, setShowLeft] = useState(true)

  const map = scenario.maps.find((m) => m.id === viewMapId) ?? scenario.maps[0]
  const ms = game.maps[map.id]
  const fog = useMemo(() => revealedMask(map, ms), [map, ms])
  const cents = useMemo(() => zoneCentroids(map), [map])
  const labels: MapLabel[] = useMemo(
    () =>
      Object.entries(map.zoneInfo)
        .filter(([z, info]) => cents[z] && !info.nolabel)
        .map(([z, info]) => ({ text: info.name, x: cents[z].x, y: cents[z].y, hidden: !ms.revealedZones.includes(z) })),
    [map, cents, ms],
  )
  const tokens = game.tokens.filter((t) => t.mapId === map.id)
  const selected = game.tokens.find((t) => t.id === sel) ?? null
  const onlinePlayers = Object.values(game.players).filter((p) => p.online)
  const link = playerLink(game.room)

  // ---------- actions ----------
  const toggleZone = (mapId: string, z: string, on?: boolean) =>
    update((g) => {
      const s = g.maps[mapId]
      const has = s.revealedZones.includes(z)
      const want = on ?? !has
      if (want && !has) s.revealedZones.push(z)
      if (!want && has) s.revealedZones = s.revealedZones.filter((x) => x !== z)
      // les retouches manuelles de cette zone sont effacées
      const m = scenario.maps.find((m) => m.id === mapId)!
      for (const k of Object.keys(s.tiles)) {
        const [x, y] = k.split(',').map(Number)
        if (zoneAt(m, x, y) === z) delete s.tiles[k]
      }
    })

  const revealLocation = (l: LocationDef, on = true) =>
    update((g) => {
      const has = g.revealed.locations.includes(l.id)
      if (on && !has) {
        g.revealed.locations.push(l.id)
        addJournal(g, { author: 'Table', kind: 'system', text: `Lieu découvert : **${l.num ? l.num + '. ' : ''}${l.name}**` })
      }
      if (!on) g.revealed.locations = g.revealed.locations.filter((x) => x !== l.id)
      if (on && l.mapId && l.zone && g.maps[l.mapId] && !g.maps[l.mapId].revealedZones.includes(l.zone)) g.maps[l.mapId].revealedZones.push(l.zone)
    })

  const readAloud = (title: string, text: string) => update((g) => addJournal(g, { author: 'MJ', kind: 'narration', title, text }))

  const revealNpc = (n: NpcDef, on = true) =>
    update((g) => {
      const has = g.revealed.npcs.includes(n.id)
      if (on && !has) {
        g.revealed.npcs.push(n.id)
        addJournal(g, { author: 'Table', kind: 'system', text: `Nouvelle rencontre : **${n.name}**, ${n.role.toLowerCase()}` })
      }
      if (!on) g.revealed.npcs = g.revealed.npcs.filter((x) => x !== n.id)
    })

  const revealClue = (c: ClueDef, on = true) =>
    update((g) => {
      const has = g.revealed.clues.includes(c.id)
      if (on && !has) {
        g.revealed.clues.push(c.id)
        addJournal(g, { author: 'Table', kind: 'clue', title: `${c.kind === 'objet' ? 'Objet obtenu' : c.kind === 'document' ? 'Document' : 'Nouvel indice'} : ${c.title}`, text: c.text })
      }
      if (!on) g.revealed.clues = g.revealed.clues.filter((x) => x !== c.id)
    })

  const spawn = (m: MonsterDef, n: number, visible: boolean) =>
    update((g) => {
      const existing = g.tokens.filter((t) => t.mapId === map.id && t.monsterId === m.id).length
      const base = selected && selected.mapId === map.id ? [selected.x, selected.y] : map.start ?? [Math.floor(map.width / 2), Math.floor(map.height / 2)]
      for (let i = 0; i < n; i++) {
        const [x, y] = freeSpotNear(g, map, base[0] + 2, base[1])
        g.tokens.push({
          id: uid('t'),
          mapId: map.id,
          x,
          y,
          kind: 'monster',
          name: `${m.name} ${existing + i + 1}`,
          label: `${m.short}${existing + i + 1}`,
          color: m.color ?? '#b03a2e',
          monsterId: m.id,
          hp: m.hp,
          hpMax: m.hp,
          visible,
        })
      }
    })

  const addNpcToken = (n: NpcDef) =>
    update((g) => {
      const base = map.start ?? [Math.floor(map.width / 2), Math.floor(map.height / 2)]
      const [x, y] = freeSpotNear(g, map, base[0], base[1] + 2)
      g.tokens.push({ id: uid('t'), mapId: map.id, x, y, kind: 'npc', name: n.name, label: n.name.split(/[ ,]/)[0], color: '#d4a017', visible: true })
    })

  const showToPlayers = () =>
    update((g) => {
      g.activeMapId = map.id
      for (const p of Object.values(g.players)) if (p.characterId) placePc(g, scenario, p.characterId, map.id)
      addJournal(g, { author: 'Table', kind: 'system', text: `Nouvelle carte : **${map.name}**` })
    })

  const placeAllPcs = () =>
    update((g) => {
      const used = Object.values(g.players).map((p) => p.characterId).filter(Boolean) as string[]
      const ids = used.length ? used : scenario.characters.map((c) => c.id)
      for (const id of ids) placePc(g, scenario, id, map.id)
    })

  const setTileOverride = (x: number, y: number, on: boolean) =>
    update((g) => {
      const s = g.maps[map.id]
      const zoneOn = s.revealedZones.includes(zoneAt(map, x, y))
      const k = `${x},${y}`
      if (on === zoneOn) delete s.tiles[k]
      else s.tiles[k] = on
    })

  const exportGame = () => {
    const blob = new Blob([JSON.stringify(game, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `partie-${game.room}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const part = scenario.parts.find((p) => p.id === partId) ?? scenario.parts[0]
  const partLocations = scenario.locations.filter((l) => l.partId === part?.id)
  const partNpcs = scenario.npcs.filter((n) => n.partIds?.includes(part?.id))
  const partClues = scenario.clues.filter((c) => c.partId === part?.id)

  return (
    <div className={`table gm ${showLeft ? '' : 'no-left'}`}>
      <header className="topbar">
        <button className="ghost" onClick={() => go('/')} title="Accueil">
          ⌂
        </button>
        <div className="title">
          <b>{scenario.title}</b> <span className="pill gm-pill">MJ</span>
        </div>
        <div className="room">
          Table <code>{game.room}</code>
          <CopyButton text={link} label="Copier le lien joueurs" />
        </div>
        <div className={`net ${status === 'en ligne' ? 'ok' : status === 'erreur' ? 'bad' : ''}`} title={netKind === 'local' ? 'Mode local (onglets du même navigateur)' : 'Connexion directe entre navigateurs'}>
          ● {status === 'en ligne' ? `${onlinePlayers.length} joueur(s) connecté(s)` : status}
          {netKind === 'local' && ' · local'}
          <span className="muted small"> ({peers.length} lien(s))</span>
        </div>
        <button className="ghost" onClick={exportGame} title="Télécharger une sauvegarde de la partie">
          💾
        </button>
      </header>

      <aside className="left">
        <Tabs<LeftTab>
          value={left}
          onChange={setLeft}
          tabs={[
            { id: 'scenario', label: 'Scénario' },
            { id: 'cartes', label: 'Cartes' },
            { id: 'pnj', label: 'PNJ' },
            { id: 'indices', label: 'Indices' },
            { id: 'bestiaire', label: 'Bestiaire' },
          ]}
        />
        <div className="panel-body">
          {left === 'scenario' && part && (
            <>
              <div className="parts">
                {scenario.parts.map((p, i) => (
                  <button key={p.id} className={p.id === part.id ? 'active' : ''} onClick={() => setPartId(p.id)} title={p.title}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <h3>{part.title}</h3>
              {part.level && <div className="muted small">{part.level}</div>}
              <RichText text={part.summary} className="summary" />
              {part.intro && (
                <div className="readaloud">
                  <RichText text={part.intro} />
                  <button className="small" onClick={() => readAloud(part.title, part.intro!)}>
                    📜 Envoyer l'introduction au journal
                  </button>
                </div>
              )}
              <div className="row wrap">
                {part.mapIds.map((id) => {
                  const m = scenario.maps.find((m) => m.id === id)
                  return (
                    m && (
                      <button key={id} className={id === map.id ? 'active small' : 'small'} onClick={() => setViewMapId(id)}>
                        🗺 {m.name} {game.activeMapId === id ? '👁' : ''}
                      </button>
                    )
                  )
                })}
              </div>
              <details open>
                <summary>Notes du MJ</summary>
                <RichText text={part.gmNotes} />
              </details>
              <h4>Lieux</h4>
              {partLocations.map((l) => (
                <LocationCard
                  key={l.id}
                  l={l}
                  revealed={game.revealed.locations.includes(l.id)}
                  onReveal={(on) => revealLocation(l, on)}
                  onRead={() => l.readAloud && readAloud(`${l.num ? l.num + '. ' : ''}${l.name}`, l.readAloud)}
                  onShow={() => l.mapId && setViewMapId(l.mapId)}
                />
              ))}
              {partNpcs.length > 0 && <h4>Personnages de cette partie</h4>}
              {partNpcs.map((n) => (
                <NpcCard key={n.id} n={n} revealed={game.revealed.npcs.includes(n.id)} onReveal={(on) => revealNpc(n, on)} onToken={() => addNpcToken(n)} />
              ))}
              {partClues.length > 0 && <h4>Indices & objets</h4>}
              {partClues.map((c) => (
                <ClueCard key={c.id} c={c} revealed={game.revealed.clues.includes(c.id)} onReveal={(on) => revealClue(c, on)} />
              ))}
            </>
          )}

          {left === 'cartes' && (
            <>
              <h4>Cartes</h4>
              <ul className="list maps">
                {scenario.maps.map((m) => (
                  <li key={m.id} className={m.id === map.id ? 'active' : ''}>
                    <button className="linkish" onClick={() => setViewMapId(m.id)}>
                      {m.name}
                    </button>
                    {game.activeMapId === m.id && <span className="pill">vue des joueurs</span>}
                  </li>
                ))}
              </ul>
              <h4>Zones de « {map.name} »</h4>
              <div className="row wrap">
                <button className="small" onClick={() => update((g) => void (g.maps[map.id] = { revealedZones: uniqueZones(map), tiles: {} }))}>
                  Tout révéler
                </button>
                <button className="small" onClick={() => update((g) => void (g.maps[map.id] = { revealedZones: [], tiles: {} }))}>
                  Tout cacher
                </button>
              </div>
              <ul className="list zones">
                {uniqueZones(map).map((z) => (
                  <li key={z}>
                    <label className="check">
                      <input type="checkbox" checked={ms.revealedZones.includes(z)} onChange={(e) => toggleZone(map.id, z, e.target.checked)} />
                      {map.zoneInfo[z]?.name ?? (z === '.' ? 'Abords' : `Zone ${z}`)}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted small">Astuce : outil « Zone » puis clic sur la carte pour révéler/cacher une zone ; pinceaux pour retoucher case par case.</p>
            </>
          )}

          {left === 'pnj' &&
            scenario.npcs.map((n) => (
              <NpcCard key={n.id} n={n} revealed={game.revealed.npcs.includes(n.id)} onReveal={(on) => revealNpc(n, on)} onToken={() => addNpcToken(n)} />
            ))}

          {left === 'indices' &&
            scenario.clues.map((c) => <ClueCard key={c.id} c={c} revealed={game.revealed.clues.includes(c.id)} onReveal={(on) => revealClue(c, on)} />)}

          {left === 'bestiaire' &&
            scenario.monsters.map((m) => <MonsterCard key={m.id} m={m} onSpawn={(n, vis) => spawn(m, n, vis)} />)}
        </div>
      </aside>

      <main className="center">
        <div className="map-bar">
          <select value={map.id} onChange={(e) => setViewMapId(e.target.value)}>
            {scenario.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {game.activeMapId === m.id ? ' (joueurs)' : ''}
              </option>
            ))}
          </select>
          {game.activeMapId === map.id ? (
            <span className="pill ok">👁 Les joueurs voient cette carte</span>
          ) : (
            <button className="primary" onClick={showToPlayers}>
              Montrer aux joueurs
            </button>
          )}
          <div className="seg">
            {(
              [
                ['move', '✋ Déplacer'],
                ['zone', '▦ Zone'],
                ['reveal', '🖌 Révéler'],
                ['hide', '🖌 Cacher'],
              ] as [Mode, string][]
            ).map(([m, l]) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {l}
              </button>
            ))}
          </div>
          <button className="ghost small" onClick={() => setShowLeft((v) => !v)}>
            {showLeft ? '⇤ Masquer le panneau' : '⇥ Panneau'}
          </button>
        </div>
        <MapView
          mapKey={map.id}
          width={map.width}
          height={map.height}
          terrain={map.terrain}
          ambient={map.ambient}
          fog={fog}
          labels={labels}
          tokens={tokens}
          pings={game.pings.filter((p) => p.mapId === map.id && Date.now() - p.ts < 6000)}
          selectedTokenId={sel}
          showHp
          canDrag={() => mode === 'move'}
          onTokenMove={(id, x, y) =>
            update((g) => {
              const t = g.tokens.find((t) => t.id === id)
              if (t) {
                t.x = x
                t.y = y
              }
            })
          }
          onTokenClick={(t) => {
            setSel(t.id)
            setRight('pion')
          }}
          onTileClick={(x, y) => {
            if (mode === 'zone') toggleZone(map.id, zoneAt(map, x, y))
            else setSel(null)
          }}
          onTilePing={(x, y) => update((g) => addPing(g, map.id, x, y, '#ffffff'))}
          brush={mode === 'reveal' ? 'reveal' : mode === 'hide' ? 'hide' : null}
          onTilePaint={(x, y) => setTileOverride(x, y, mode === 'reveal')}
        />
        <div className="map-hint muted small">
          Glisser : déplacer la vue · clic droit : pivoter · molette : zoom · double-clic : signaler un point · les cases sombres sont invisibles pour les joueurs
        </div>
      </main>

      <aside className="right">
        <Tabs<RightTab>
          value={right}
          onChange={setRight}
          tabs={[
            { id: 'journal', label: 'Journal' },
            { id: 'des', label: 'Dés' },
            { id: 'groupe', label: 'Groupe', badge: onlinePlayers.length },
            { id: 'pion', label: 'Pion' },
          ]}
        />
        <div className="panel-body">
          {right === 'journal' && (
            <Journal entries={game.journal} onWrite={(text) => update((g) => addJournal(g, { author: 'MJ', kind: 'narration', text }))} placeholder="Narration du MJ (visible par tous)…" />
          )}
          {right === 'des' && (
            <DicePanel
              rolls={game.rolls}
              allowSecret
              onRoll={(expr, label, secret) => update((g) => void addRoll(g, 'MJ', expr, label, secret))}
              presets={selected?.monsterId ? monsterPresets(scenario.monsters.find((m) => m.id === selected.monsterId)!, selected.label) : undefined}
            />
          )}
          {right === 'groupe' && (
            <GroupPanel game={game} scenario={scenario} update={update} onPlace={placeAllPcs} mapName={map.name} />
          )}
          {right === 'pion' &&
            (selected ? (
              <TokenPanel
                t={selected}
                monster={scenario.monsters.find((m) => m.id === selected.monsterId)}
                update={update}
                onClose={() => setSel(null)}
              />
            ) : (
              <p className="muted">Clique sur un pion de la carte pour le gérer (PV, visibilité, suppression).</p>
            ))}
        </div>
      </aside>
    </div>
  )
}

function uniqueZones(map: Scenario['maps'][number]): string[] {
  const set = new Set<string>()
  for (const row of map.zones) for (const c of row) if (c !== ' ') set.add(c)
  const named = Object.keys(map.zoneInfo).filter((z) => set.has(z))
  return [...named, ...[...set].filter((z) => !map.zoneInfo[z]).sort()]
}

function monsterPresets(m: MonsterDef, label: string) {
  if (!m) return []
  const out = [{ label: `${label} initiative`, expr: `1d20+${Math.max(0, m.init - 10)}` }]
  for (const a of m.attacks) {
    out.push({ label: `${label} ${a.name}`, expr: `1d20${modStr(a.bonus)}` })
    out.push({ label: `${label} DM ${a.name}`, expr: a.dmg.replace(/\s/g, '') })
  }
  return out
}

// ---------- Cartes du panneau gauche ----------

function LocationCard({ l, revealed, onReveal, onRead, onShow }: { l: LocationDef; revealed: boolean; onReveal: (on: boolean) => void; onRead: () => void; onShow: () => void }) {
  return (
    <details className={`item ${revealed ? 'revealed' : ''}`}>
      <summary>
        <span className="num">{l.num ?? '•'}</span> {l.name}
        {revealed && <span className="pill ok">révélé</span>}
      </summary>
      <div className="item-body">
        <div className="row wrap">
          <button className={revealed ? 'small' : 'primary small'} onClick={() => onReveal(!revealed)}>
            {revealed ? 'Cacher aux joueurs' : 'Révéler aux joueurs'}
          </button>
          {l.readAloud && (
            <button className="small" onClick={onRead}>
              📜 Lire au journal
            </button>
          )}
          {l.mapId && (
            <button className="small ghost" onClick={onShow}>
              🗺 Voir
            </button>
          )}
          {l.page && <span className="muted small">livret p. {l.page}</span>}
        </div>
        {l.readAloud && (
          <div className="readaloud">
            <RichText text={l.readAloud} />
          </div>
        )}
        <div className="gmnote">
          <RichText text={l.gmNotes} />
        </div>
        <div className="muted small">Ce que voient les joueurs : {l.publicText}</div>
      </div>
    </details>
  )
}

function NpcCard({ n, revealed, onReveal, onToken }: { n: NpcDef; revealed: boolean; onReveal: (on: boolean) => void; onToken: () => void }) {
  return (
    <details className={`item ${revealed ? 'revealed' : ''}`}>
      <summary>
        👤 {n.name} <span className="muted small">{n.role}</span>
        {revealed && <span className="pill ok">connu</span>}
      </summary>
      <div className="item-body">
        <div className="row wrap">
          <button className={revealed ? 'small' : 'primary small'} onClick={() => onReveal(!revealed)}>
            {revealed ? 'Retirer des PNJ connus' : 'Présenter aux joueurs'}
          </button>
          <button className="small ghost" onClick={onToken}>
            + Pion
          </button>
        </div>
        <div className="muted small">Fiche joueurs : {n.publicText}</div>
        <div className="gmnote">
          <RichText text={n.gmNotes} />
        </div>
      </div>
    </details>
  )
}

function ClueCard({ c, revealed, onReveal }: { c: ClueDef; revealed: boolean; onReveal: (on: boolean) => void }) {
  return (
    <details className={`item ${revealed ? 'revealed' : ''}`}>
      <summary>
        {c.kind === 'objet' ? '💎' : c.kind === 'document' ? '📜' : '🔍'} {c.title}
        {revealed && <span className="pill ok">donné</span>}
      </summary>
      <div className="item-body">
        <button className={revealed ? 'small' : 'primary small'} onClick={() => onReveal(!revealed)}>
          {revealed ? 'Reprendre' : 'Donner aux joueurs'}
        </button>
        <RichText text={c.text} />
        {c.gmNotes && (
          <div className="gmnote">
            <RichText text={c.gmNotes} />
          </div>
        )}
      </div>
    </details>
  )
}

export function StatBlock({ m }: { m: MonsterDef }) {
  return (
    <div className="statblock">
      <div className="stats mini">
        {STAT_KEYS.map((k) => (
          <span key={k} className="stat">
            <span>{k}</span>
            <b>{modStr(m.stats[k])}</b>
          </span>
        ))}
      </div>
      <div className="kv">
        <span>
          Init <b>{m.init}</b>
        </span>
        <span>
          DÉF <b>{m.def}</b>
        </span>
        <span>
          PV <b>{m.hp}</b>
        </span>
        {m.rd && (
          <span>
            RD <b>{m.rd}</b>
          </span>
        )}
      </div>
      <ul className="atk">
        {m.attacks.map((a) => (
          <li key={a.name}>
            <b>{a.name}</b> {modStr(a.bonus)} · DM {a.dmg} {a.note && <span className="muted">({a.note})</span>}
          </li>
        ))}
      </ul>
      {m.abilities.map((a, i) => (
        <p key={i} className="small">
          {a}
        </p>
      ))}
      {m.tactics && <p className="small muted">{m.tactics}</p>}
    </div>
  )
}

function MonsterCard({ m, onSpawn }: { m: MonsterDef; onSpawn: (n: number, visible: boolean) => void }) {
  const [n, setN] = useState(1)
  const [vis, setVis] = useState(false)
  return (
    <details className="item">
      <summary>
        <span className="swatch" style={{ background: m.color ?? '#b03a2e' }} /> {m.name} {m.level && <span className="muted small">{m.level}</span>}
      </summary>
      <div className="item-body">
        {m.count && <p className="small">Nombre : {m.count}</p>}
        <StatBlock m={m} />
        <div className="row wrap">
          <input type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.max(1, Math.min(20, parseInt(e.target.value || '1', 10))))} style={{ width: 56 }} />
          <label className="check">
            <input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} /> visibles tout de suite
          </label>
          <button className="primary small" onClick={() => onSpawn(n, vis)}>
            Poser sur la carte
          </button>
        </div>
        {m.page && <span className="muted small">livret p. {m.page}</span>}
      </div>
    </details>
  )
}

// ---------- Panneaux de droite ----------

function GroupPanel({
  game,
  scenario,
  update,
  onPlace,
  mapName,
}: {
  game: GameState
  scenario: Scenario
  update: (fn: (g: GameState) => void) => void
  onPlace: () => void
  mapName: string
}) {
  const players = Object.values(game.players)
  return (
    <div className="group">
      <h4>Joueurs</h4>
      {players.length === 0 && <p className="muted small">Personne pour l'instant. Envoie le lien joueurs (en haut) à ta table.</p>}
      <ul className="list">
        {players.map((p) => (
          <li key={p.key}>
            <span className={`dot ${p.online ? 'on' : ''}`} /> <b>{p.name}</b>
            <select
              value={p.characterId ?? ''}
              onChange={(e) =>
                update((g) => {
                  const id = e.target.value || undefined
                  for (const o of Object.values(g.players)) if (o.characterId === id) o.characterId = undefined
                  g.players[p.key].characterId = id
                  if (id && g.activeMapId) placePc(g, scenario, id, g.activeMapId)
                })
              }
            >
              <option value="">— spectateur —</option>
              {scenario.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="ghost small"
              title="Retirer de la liste"
              onClick={() =>
                update((g) => {
                  delete g.players[p.key]
                })
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="small" onClick={onPlace}>
        Poser les pions des personnages sur « {mapName} »
      </button>
      <h4>Personnages</h4>
      {scenario.characters.map((c) => {
        const s = game.characters[c.id]
        const who = players.find((p) => p.characterId === c.id)
        return (
          <div key={c.id} className="pc-row">
            <div className="muted small">{who ? `joué par ${who.name}` : 'non attribué'}</div>
            <CharacterSheet
              c={c}
              s={s}
              compact
              editable
              onHp={(hp) =>
                update((g) => {
                  g.characters[c.id].hp = Math.min(g.characters[c.id].hpMax, hp)
                  syncTokenHp(g)
                })
              }
            />
            <div className="row wrap small">
              <label>
                Niveau{' '}
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={s.level}
                  style={{ width: 48 }}
                  onChange={(e) => update((g) => void (g.characters[c.id].level = Math.max(1, Math.min(9, parseInt(e.target.value || '1', 10)))))}
                />
              </label>
              <label>
                PV max{' '}
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={s.hpMax}
                  style={{ width: 56 }}
                  onChange={(e) =>
                    update((g) => {
                      g.characters[c.id].hpMax = Math.max(1, parseInt(e.target.value || '1', 10))
                      syncTokenHp(g)
                    })
                  }
                />
              </label>
              <button className="small ghost" onClick={() => update((g) => void ((g.characters[c.id].hp = g.characters[c.id].hpMax), syncTokenHp(g)))}>
                Soigner tout
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TokenPanel({ t, monster, update, onClose }: { t: Token; monster?: MonsterDef; update: (fn: (g: GameState) => void) => void; onClose: () => void }) {
  const mut = (fn: (t: Token, g: GameState) => void) =>
    update((g) => {
      const x = g.tokens.find((x) => x.id === t.id)
      if (x) fn(x, g)
    })
  const setHp = (hp: number) =>
    mut((x, g) => {
      x.hp = Math.min(x.hpMax ?? hp, hp)
      if (x.kind === 'pc' && x.characterId && g.characters[x.characterId]) g.characters[x.characterId].hp = x.hp
    })
  return (
    <div className="token-panel">
      <div className="row">
        <span className="swatch big" style={{ background: t.color }} />
        <input value={t.name} onChange={(e) => mut((x) => void (x.name = e.target.value.slice(0, 40)))} />
        <input value={t.label} style={{ width: 60 }} onChange={(e) => mut((x) => void (x.label = e.target.value.slice(0, 6)))} />
      </div>
      {t.hpMax !== undefined && (
        <div className="hp">
          <div className="hp-bar">
            <b style={{ width: `${Math.max(0, Math.min(1, (t.hp ?? 0) / t.hpMax)) * 100}%` }} />
            <span>
              ♥ {t.hp} / {t.hpMax}
            </span>
          </div>
          <div className="hp-btns">
            <button onClick={() => setHp((t.hp ?? 0) - 10)}>-10</button>
            <button onClick={() => setHp((t.hp ?? 0) - 5)}>-5</button>
            <button onClick={() => setHp((t.hp ?? 0) - 1)}>-1</button>
            <button onClick={() => setHp((t.hp ?? 0) + 1)}>+1</button>
            <button onClick={() => setHp((t.hp ?? 0) + 5)}>+5</button>
          </div>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={t.visible} onChange={(e) => mut((x) => void (x.visible = e.target.checked))} /> Visible par les joueurs (si la case est révélée)
      </label>
      <div className="row wrap">
        <label className="small">
          Couleur <input type="color" value={t.color} onChange={(e) => mut((x) => void (x.color = e.target.value))} />
        </label>
        <button
          className="danger small"
          onClick={() => {
            update((g) => void (g.tokens = g.tokens.filter((x) => x.id !== t.id)))
            onClose()
          }}
        >
          Retirer de la carte
        </button>
      </div>
      {monster && <StatBlock m={monster} />}
    </div>
  )
}

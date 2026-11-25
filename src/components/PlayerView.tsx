import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ping, PlayerView as PV } from '../types'
import { go } from '../App'
import MapView from './MapView'
import { CharacterSheet, DicePanel, Journal, RichText, Tabs, characterPresets } from './panels'
import { usePlayerSession } from '../lib/session'
import { loadNotebook, playerIdentity, saveNotebook, setPlayerName } from '../lib/storage'

type Tab = 'journal' | 'des' | 'fiche' | 'decouvertes' | 'groupe'

export default function PlayerView({ room }: { room: string }) {
  const [me, setMe] = useState(playerIdentity)
  const [nameInput, setNameInput] = useState(me.name)
  if (!me.name)
    return (
      <div className="center-msg card">
        <h2>Rejoindre la table {room}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const n = nameInput.trim().slice(0, 30)
            if (!n) return
            setPlayerName(n)
            setMe(playerIdentity())
          }}
        >
          <label>
            Ton prénom ou pseudo
            <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={30} />
          </label>
          <button className="primary" type="submit" disabled={!nameInput.trim()}>
            Entrer
          </button>
        </form>
        <p className="muted small">Pas de compte : ton navigateur se souviendra de toi pour cette table.</p>
      </div>
    )
  return <PlayerTable room={room} me={me} onRename={(n) => (setPlayerName(n), setMe(playerIdentity()))} />
}

function PlayerTable({ room, me, onRename }: { room: string; me: { key: string; name: string }; onRename: (n: string) => void }) {
  const { view, status, gmOnline, send } = usePlayerSession(room, me)
  const [tab, setTab] = useState<Tab>('journal')
  const [seenJournal, setSeenJournal] = useState(0)
  const pings = useLocalPings(view?.pings ?? [])

  const mine = view?.party.find((p) => p.playerKey === me.key)
  const myChar = mine?.character
  useEffect(() => {
    if (tab === 'journal' && view) setSeenJournal(view.journal.length)
  }, [tab, view])

  if (!view)
    return (
      <div className="center-msg card">
        <h2>Connexion à la table {room}…</h2>
        <p>{status === 'erreur' ? 'La connexion a échoué. Vérifie ta connexion internet et recharge la page.' : gmOnline ? 'MJ trouvé, chargement…' : 'En attente du MJ. Il doit avoir la partie ouverte dans son navigateur.'}</p>
        <div className="spinner" />
        <button className="ghost" onClick={() => go('/')}>
          Accueil
        </button>
      </div>
    )

  const taken = new Set(view.party.filter((p) => p.playerKey && p.playerKey !== me.key).map((p) => p.character.id))
  const map = view.map
  const unread = Math.max(0, view.journal.length - seenJournal)
  const discoveries = view.locations.length + view.npcs.length + view.clues.length

  return (
    <div className="table player">
      <header className="topbar">
        <button className="ghost" onClick={() => go('/')} title="Accueil">
          ⌂
        </button>
        <div className="title">
          <b>{view.title}</b>
          {myChar && (
            <span className="pill" style={{ background: myChar.color }}>
              {myChar.name}
            </span>
          )}
        </div>
        <div className={`net ${gmOnline ? 'ok' : 'bad'}`}>● {gmOnline ? 'connecté au MJ' : 'MJ déconnecté — en attente…'}</div>
        <button className="ghost small" onClick={() => {
          const n = prompt('Ton nom à la table :', me.name)
          if (n && n.trim()) {
            onRename(n.trim().slice(0, 30))
            send({ t: 'hello', key: me.key, name: n.trim().slice(0, 30) })
          }
        }}>
          {me.name} ✎
        </button>
      </header>

      {!myChar && (
        <div className="modal">
          <div className="card">
            <h2>Choisis ton personnage</h2>
            <div className="pick-grid">
              {view.party.map((p) => (
                <button key={p.character.id} disabled={taken.has(p.character.id)} className="pick" style={{ ['--pc' as any]: p.character.color }} onClick={() => send({ t: 'pick', characterId: p.character.id })}>
                  <b>{p.character.name}</b>
                  <span>{p.character.title}</span>
                  {taken.has(p.character.id) && <small>pris par {p.player}</small>}
                  <small className="desc">{p.character.description.slice(0, 160)}…</small>
                </button>
              ))}
            </div>
            <p className="muted small">Tu pourras lire toute la fiche ensuite. Le MJ peut aussi te l'attribuer.</p>
          </div>
        </div>
      )}

      <main className="center">
        {map ? (
          <>
            <div className="map-bar">
              <b>🗺 {map.name}</b>
              <span className="muted small">Fais glisser ton pion pour te déplacer · double-clic pour signaler un endroit</span>
            </div>
            <MapView
              mapKey={map.id}
              width={map.width}
              height={map.height}
              terrain={map.terrain}
              ambient={map.ambient}
              labels={map.labels}
              tokens={view.tokens}
              pings={pings}
              canDrag={(t) => t.kind === 'pc' && t.characterId === myChar?.id}
              onTokenMove={(id, x, y) => {
                if (map.terrain[y]?.[x] && map.terrain[y][x] !== ' ') send({ t: 'move', tokenId: id, x, y })
              }}
              onTilePing={(x, y) => send({ t: 'ping', x, y })}
            />
          </>
        ) : (
          <div className="center-msg">Le MJ n'a pas encore dévoilé de carte.</div>
        )}
      </main>

      <aside className="right">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'journal', label: 'Journal', badge: tab === 'journal' ? 0 : unread },
            { id: 'des', label: 'Dés' },
            { id: 'fiche', label: 'Ma fiche' },
            { id: 'decouvertes', label: 'Découvertes', badge: discoveries },
            { id: 'groupe', label: 'Groupe' },
          ]}
        />
        <div className="panel-body">
          {tab === 'journal' && <Journal entries={view.journal} onWrite={(text) => send({ t: 'note', text })} placeholder="Écrire une note pour toute la table…" />}
          {tab === 'des' && (
            <DicePanel
              rolls={view.rolls}
              onRoll={(expr, label) => send({ t: 'roll', expr, label })}
              presets={myChar && mine ? characterPresets(myChar, mine.state.level) : undefined}
            />
          )}
          {tab === 'fiche' &&
            (myChar && mine ? (
              <>
                <CharacterSheet
                  c={myChar}
                  s={mine.state}
                  editable
                  onHp={(hp) => send({ t: 'hp', characterId: myChar.id, hp })}
                  onNotes={(notes) => send({ t: 'charNotes', characterId: myChar.id, notes })}
                  onRoll={(expr, label) => {
                    send({ t: 'roll', expr, label })
                    setTab('des')
                  }}
                />
                <Notebook room={room} />
                <button className="ghost small" onClick={() => send({ t: 'pick', characterId: null })}>
                  Changer de personnage
                </button>
              </>
            ) : (
              <p className="muted">Pas encore de personnage.</p>
            ))}
          {tab === 'decouvertes' && <Discoveries view={view} />}
          {tab === 'groupe' && (
            <div className="group">
              {view.party
                .filter((p) => p.player)
                .map((p) => (
                  <div key={p.character.id} className="pc-row">
                    <div className="muted small">joué par {p.player}</div>
                    <CharacterSheet c={p.character} s={p.state} compact />
                  </div>
                ))}
              <h4>À la table</h4>
              <ul className="list">
                {view.players.map((p) => (
                  <li key={p.key}>
                    <span className={`dot ${p.online ? 'on' : ''}`} /> {p.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Discoveries({ view }: { view: PV }) {
  if (!view.locations.length && !view.npcs.length && !view.clues.length) return <p className="muted">Rien pour l'instant. Explorez, questionnez, fouillez !</p>
  return (
    <div className="discoveries">
      {view.clues.length > 0 && <h4>Indices & objets</h4>}
      {view.clues.map((c) => (
        <details key={c.id} className="item revealed" open>
          <summary>
            {c.kind === 'objet' ? '💎' : c.kind === 'document' ? '📜' : '🔍'} {c.title}
          </summary>
          <div className="item-body">
            <RichText text={c.text} />
          </div>
        </details>
      ))}
      {view.npcs.length > 0 && <h4>Personnages rencontrés</h4>}
      {view.npcs.map((n) => (
        <details key={n.id} className="item revealed">
          <summary>
            👤 {n.name} <span className="muted small">{n.role}</span>
          </summary>
          <div className="item-body">
            <RichText text={n.text} />
          </div>
        </details>
      ))}
      {view.locations.length > 0 && <h4>Lieux</h4>}
      {view.locations.map((l) => (
        <details key={l.id} className="item revealed">
          <summary>
            <span className="num">{l.num ?? '•'}</span> {l.name}
          </summary>
          <div className="item-body">
            <RichText text={l.text} />
          </div>
        </details>
      ))}
    </div>
  )
}

function Notebook({ room }: { room: string }) {
  const [text, setText] = useState(() => loadNotebook(room))
  const t = useRef<ReturnType<typeof setTimeout>>()
  return (
    <label className="notes">
      Mon carnet privé (reste dans ce navigateur)
      <textarea
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          clearTimeout(t.current)
          const v = e.target.value
          t.current = setTimeout(() => saveNotebook(room, v), 400)
        }}
      />
    </label>
  )
}

/** Les horloges des ordinateurs diffèrent : on date les signaux à leur réception. */
function useLocalPings(pings: Ping[]): Ping[] {
  const seen = useRef<Record<string, number>>({})
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  const now = Date.now()
  return useMemo(() => {
    for (const p of pings) seen.current[p.id] ??= Date.now()
    return pings.map((p) => ({ ...p, ts: seen.current[p.id] })).filter((p) => now - p.ts < 6000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pings, Math.floor(now / 1000)])
}

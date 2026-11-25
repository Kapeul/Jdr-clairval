import { useRef, useState } from 'react'
import type { Scenario } from '../types'
import { go } from '../App'
import { newGame, roomCode } from '../lib/state'
import { deleteGame, listGames, listScenarioIds, loadScenario, saveGame, saveScenario, validateScenario } from '../lib/storage'
import { fmtTime } from './panels'

export async function readScenarioFile(file: File): Promise<Scenario> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.")
  }
  return validateScenario(raw)
}

export default function Home() {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [, refresh] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const scenarios = listScenarioIds()
    .map((id) => loadScenario(id))
    .filter((s): s is Scenario => !!s)
  const games = listGames()

  const start = (s: Scenario) => {
    const g = newGame(s, roomCode())
    saveGame(g)
    go(`/mj/${g.room}`)
  }

  const importFile = async (f?: File) => {
    if (!f) return
    setErr(null)
    try {
      const s = await readScenarioFile(f)
      saveScenario(s)
      refresh((n) => n + 1)
    } catch (e: any) {
      setErr(e.message)
    }
  }

  const loadDemo = async () => {
    setErr(null)
    try {
      const r = await fetch('./demo-scenario.json')
      const s = validateScenario(await r.json())
      saveScenario(s)
      refresh((n) => n + 1)
    } catch (e: any) {
      setErr('Impossible de charger la démo : ' + e.message)
    }
  }

  return (
    <div className="home">
      <header className="home-hero">
        <h1>🎲 Table JDR 2.5D</h1>
        <p>Une table de jeu de rôle en ligne : cartes en perspective, brouillard de guerre, journal et dés partagés. Sans compte, sans installation.</p>
      </header>

      <div className="home-cols">
        <section className="card">
          <h2>Je suis joueur</h2>
          <p>Entre le code de la table donné par ton MJ (ou ouvre directement le lien qu'il t'a envoyé).</p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              const c = code.trim().toUpperCase()
              if (c.length >= 4) go(`/j/${c}`)
            }}
          >
            <input
              className="code-input"
              value={code}
              maxLength={8}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button className="primary" type="submit" disabled={code.trim().length < 4}>
              Rejoindre
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Je suis le MJ</h2>
          {games.length > 0 && (
            <>
              <h3>Reprendre une partie</h3>
              <ul className="list">
                {games.map((g) => (
                  <li key={g.room}>
                    <button className="linkish" onClick={() => go(`/mj/${g.room}`)}>
                      <b>{g.scenarioTitle}</b> · table {g.room}
                    </button>
                    <span className="muted small"> {new Date(g.updatedAt).toLocaleDateString('fr-FR')} {fmtTime(g.updatedAt)}</span>
                    <button
                      className="ghost small"
                      title="Supprimer cette partie"
                      onClick={() => {
                        if (confirm('Supprimer définitivement cette partie de ce navigateur ?')) {
                          deleteGame(g.room)
                          refresh((n) => n + 1)
                        }
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Nouvelle partie</h3>
          {scenarios.length === 0 && <p className="muted">Aucun scénario chargé dans ce navigateur pour l'instant.</p>}
          <ul className="list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <b>{s.title}</b> <span className="muted small">{s.subtitle}</span>
                <button className="primary small" onClick={() => start(s)}>
                  Créer la table
                </button>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button onClick={() => fileRef.current?.click()}>📂 Charger un fichier scénario (.json)</button>
            <button className="ghost" onClick={loadDemo}>
              Essayer le scénario de démo
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          {err && <p className="error">{err}</p>}
          <p className="muted small">
            Le scénario reste dans ton navigateur : les joueurs ne reçoivent que ce que tu leur révèles.
          </p>
        </section>
      </div>
    </div>
  )
}

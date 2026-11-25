import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CharacterDef, CharacterState, DiceRoll, JournalEntry, StatKey } from '../types'
import { STAT_KEYS } from '../types'
import { isValidExpr, modStr, withMod } from '../lib/dice'

// ---------- Texte enrichi minimal (sans HTML) ----------

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(m[1] ? <strong key={i++}>{m[1]}</strong> : <em key={i++}>{m[2]}</em>)
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = []
    let para: string[] = []
    let list: string[] = []
    let k = 0
    const flushPara = () => {
      if (para.length) out.push(<p key={k++}>{para.map((l, j) => [j > 0 && <br key={`b${j}`} />, ...inline(l)])}</p>)
      para = []
    }
    const flushList = () => {
      if (list.length)
        out.push(
          <ul key={k++}>
            {list.map((l, j) => (
              <li key={j}>{inline(l)}</li>
            ))}
          </ul>,
        )
      list = []
    }
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) {
        flushPara()
        flushList()
      } else if (line.startsWith('## ')) {
        flushPara()
        flushList()
        out.push(<h4 key={k++}>{inline(line.slice(3))}</h4>)
      } else if (line.trim().startsWith('- ')) {
        flushPara()
        list.push(line.trim().slice(2))
      } else if (line.startsWith('> ')) {
        flushPara()
        flushList()
        out.push(<blockquote key={k++}>{inline(line.slice(2))}</blockquote>)
      } else {
        flushList()
        para.push(line)
      }
    }
    flushPara()
    flushList()
    return out
  }, [text])
  return <div className={`rich ${className ?? ''}`}>{nodes}</div>
}

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ---------- Journal ----------

export function Journal({
  entries,
  onWrite,
  placeholder = 'Écrire dans le journal commun…',
  extra,
}: {
  entries: JournalEntry[]
  onWrite?: (text: string) => void
  placeholder?: string
  extra?: ReactNode
}) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [entries.length])
  return (
    <div className="journal">
      <div className="journal-list">
        {entries.map((e) => (
          <div key={e.id} className={`jentry j-${e.kind}`}>
            <div className="jmeta">
              <b>{e.author}</b> · {fmtTime(e.ts)}
            </div>
            {e.title && <div className="jtitle">{e.title}</div>}
            <RichText text={e.text} />
          </div>
        ))}
        <div ref={end} />
      </div>
      {onWrite && (
        <form
          className="journal-form"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (!text.trim()) return
            onWrite(text.trim())
            setText('')
          }}
        >
          <textarea
            value={text}
            placeholder={placeholder}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
              }
            }}
          />
          <div className="row">
            {extra}
            <button type="submit" className="primary">
              Envoyer
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ---------- Dés ----------

export function RollLine({ r }: { r: DiceRoll }) {
  const crit = r.nat === 20
  const fumble = r.nat === 1
  return (
    <div className={`roll ${crit ? 'crit' : ''} ${fumble ? 'fumble' : ''} ${r.secret ? 'secret' : ''}`}>
      <div className="roll-head">
        <b>{r.author}</b>
        {r.label && <span className="roll-label">{r.label}</span>}
        <span className="roll-time">{fmtTime(r.ts)}</span>
      </div>
      <div className="roll-body">
        <span className="roll-total">{r.total}</span>
        <span className="roll-detail">
          {r.expr} → {r.detail}
          {crit && ' · Réussite critique !'}
          {fumble && ' · Échec critique…'}
          {r.secret && ' · (secret)'}
        </span>
      </div>
    </div>
  )
}

const QUICK = ['1d20', '1d4', '1d6', '1d8', '1d10', '1d12', '2d6', '1d100']

export function DicePanel({
  rolls,
  onRoll,
  presets,
  allowSecret,
}: {
  rolls: DiceRoll[]
  onRoll: (expr: string, label?: string, secret?: boolean) => void
  presets?: { label: string; expr: string }[]
  allowSecret?: boolean
}) {
  const [expr, setExpr] = useState('1d20')
  const [mod, setMod] = useState(0)
  const [secret, setSecret] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [rolls.length])
  const valid = isValidExpr(expr)
  return (
    <div className="dice">
      <div className="dice-quick">
        {QUICK.map((q) => (
          <button key={q} onClick={() => onRoll(withMod(q, mod), undefined, secret)}>
            {q.replace(/^1d/, 'd')}
          </button>
        ))}
      </div>
      <div className="row dice-custom">
        <label className="mod">
          Mod.
          <input type="number" value={mod} onChange={(e) => setMod(parseInt(e.target.value || '0', 10))} />
        </label>
        <input className={valid ? '' : 'invalid'} value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="ex. 2d6+3" />
        <button className="primary" disabled={!valid} onClick={() => onRoll(withMod(expr, mod), undefined, secret)}>
          Lancer
        </button>
      </div>
      {allowSecret && (
        <label className="check">
          <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> Lancer en secret (visible du MJ seulement)
        </label>
      )}
      {presets && presets.length > 0 && (
        <div className="dice-presets">
          {presets.map((p) => (
            <button key={p.label} onClick={() => onRoll(p.expr, p.label, secret)} title={p.expr}>
              {p.label} <small>{p.expr}</small>
            </button>
          ))}
        </div>
      )}
      <div className="roll-list">
        {rolls.map((r) => (
          <RollLine key={r.id} r={r} />
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}

export function characterPresets(c: CharacterDef, level: number): { label: string; expr: string }[] {
  const lvl = Math.max(0, level - 1) // +1 en attaque par niveau au-delà du 1er
  const out: { label: string; expr: string }[] = []
  for (const k of STAT_KEYS) out.push({ label: `Test ${k}`, expr: withMod('1d20', c.stats[k][1]) })
  out.push({ label: 'Attaque contact', expr: withMod('1d20', c.attackMods.contact + lvl) })
  out.push({ label: 'Attaque distance', expr: withMod('1d20', c.attackMods.distance + lvl) })
  if (c.attackMods.magique !== undefined) out.push({ label: 'Attaque magique', expr: withMod('1d20', c.attackMods.magique + lvl) })
  for (const a of c.attacks) out.push({ label: `DM ${a.name}`, expr: a.dmg.replace(/\s/g, '') })
  return out
}

// ---------- Fiche de personnage ----------

export function CharacterSheet({
  c,
  s,
  editable,
  onHp,
  onNotes,
  onRoll,
  compact,
}: {
  c: CharacterDef
  s: CharacterState
  editable?: boolean
  onHp?: (hp: number) => void
  onNotes?: (n: string) => void
  onRoll?: (expr: string, label: string) => void
  compact?: boolean
}) {
  const [notes, setNotes] = useState(s.notes)
  useEffect(() => setNotes(s.notes), [s.notes])
  const pct = Math.max(0, Math.min(1, s.hp / Math.max(1, s.hpMax)))
  const lvl = Math.max(0, s.level - 1)
  const rollStat = (k: StatKey) => onRoll?.(withMod('1d20', c.stats[k][1]), `Test ${k}`)
  return (
    <div className="sheet" style={{ ['--pc' as any]: c.color }}>
      <div className="sheet-head">
        <div className="sheet-avatar">{c.name.slice(0, 1)}</div>
        <div>
          <div className="sheet-name">{c.name}</div>
          <div className="sheet-title">
            {c.title} · niveau {s.level} · dé de vie {c.hitDie}
          </div>
        </div>
      </div>
      <div className="hp">
        <div className="hp-bar">
          <b style={{ width: `${pct * 100}%` }} />
          <span>
            ♥ {s.hp} / {s.hpMax} PV
          </span>
        </div>
        {editable && onHp && (
          <div className="hp-btns">
            <button onClick={() => onHp(s.hp - 5)}>-5</button>
            <button onClick={() => onHp(s.hp - 1)}>-1</button>
            <button onClick={() => onHp(s.hp + 1)}>+1</button>
            <button onClick={() => onHp(s.hp + 5)}>+5</button>
          </div>
        )}
      </div>
      <div className="stats">
        {STAT_KEYS.map((k) => (
          <button key={k} className="stat" disabled={!onRoll} onClick={() => rollStat(k)} title={onRoll ? `Lancer 1d20${modStr(c.stats[k][1])}` : ''}>
            <span>{k}</span>
            <b>{modStr(c.stats[k][1])}</b>
            <small>{c.stats[k][0]}</small>
          </button>
        ))}
      </div>
      <div className="kv">
        <span>
          DÉF <b>{c.def}</b>
        </span>
        <span>
          Contact <b>{modStr(c.attackMods.contact + lvl)}</b>
        </span>
        <span>
          Distance <b>{modStr(c.attackMods.distance + lvl)}</b>
        </span>
        {c.attackMods.magique !== undefined && (
          <span>
            Magique <b>{modStr(c.attackMods.magique + lvl)}</b>
          </span>
        )}
      </div>
      <table className="attacks">
        <tbody>
          {c.attacks.map((a) => (
            <tr key={a.name}>
              <td>{a.name}</td>
              <td>
                <button disabled={!onRoll} onClick={() => onRoll?.(a.dmg, `DM ${a.name}`)}>
                  {a.dmg}
                </button>
              </td>
              <td className="muted">{a.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && (
        <>
          <div className="muted small">Protections : {c.armor.join(', ')}</div>
          <details>
            <summary>Capacités (voies)</summary>
            {c.paths.map((p) => (
              <div key={p.name} className="path">
                <h5>{p.name}</h5>
                <ol>
                  {p.ranks.map((r, i) => (
                    <li key={i} className={i < s.level ? '' : 'locked'}>
                      <b>{r.name}</b> — {r.text}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <p className="muted small">Au niveau 1, choisis 2 capacités de rang 1. Note-les ci-dessous.</p>
          </details>
          <details>
            <summary>Équipement & description</summary>
            <ul>
              {c.equipment.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="muted small">{c.meta}</p>
            <p>{c.description}</p>
          </details>
          {editable && onNotes ? (
            <label className="notes">
              Notes du personnage (capacités choisies, objets, or…)
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && onNotes(notes)} />
            </label>
          ) : (
            s.notes && (
              <div className="notes">
                <b>Notes :</b> {s.notes}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[]
  value: T
  onChange: (t: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {!!t.badge && <span className="badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          window.prompt('Copie ce lien :', text)
        }
        setOk(true)
        setTimeout(() => setOk(false), 1500)
      }}
    >
      {ok ? 'Copié ✓' : label}
    </button>
  )
}

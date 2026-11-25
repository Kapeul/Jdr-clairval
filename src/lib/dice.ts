// Lancer de dés : "1d20+3", "2d6+5", "d20", "1d4+1d6-1", "2d20kh1+8" (garder le meilleur)

export interface RollResult {
  expr: string
  total: number
  detail: string
  nat?: number
}

const TERM = /([+-]?)\s*(\d*)d(\d+)(k[hl]\d+)?|([+-]?)\s*(\d+)/gi

export function randInt(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % max) + 1
}

export function isValidExpr(expr: string): boolean {
  const s = expr.replace(/\s+/g, '')
  if (!s) return false
  return /^([+-]?(\d*d\d+(k[hl]\d+)?|\d+))+$/i.test(s) && /d\d+/i.test(s)
}

export function roll(expr: string, rng: (max: number) => number = randInt): RollResult {
  const clean = expr.replace(/\s+/g, '').toLowerCase()
  if (!isValidExpr(clean)) throw new Error(`Expression de dés invalide : ${expr}`)
  let total = 0
  const parts: string[] = []
  const d20s: number[] = []
  TERM.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TERM.exec(clean))) {
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1
      const count = Math.min(Math.max(parseInt(m[2] || '1', 10), 1), 100)
      const faces = Math.min(Math.max(parseInt(m[3], 10), 2), 1000)
      const dice = Array.from({ length: count }, () => rng(faces))
      let kept = dice
      if (m[4]) {
        const n = parseInt(m[4].slice(2), 10)
        const sorted = [...dice].sort((a, b) => (m![4][1] === 'h' ? b - a : a - b))
        kept = sorted.slice(0, n)
      }
      const sum = kept.reduce((a, b) => a + b, 0)
      if (faces === 20) d20s.push(...kept)
      total += sign * sum
      const shown = m[4] ? `[${dice.join(', ')} → ${kept.join(', ')}]` : `[${dice.join(', ')}]`
      parts.push(`${sign < 0 ? '- ' : parts.length ? '+ ' : ''}${count}d${faces}${m[4] ?? ''}${shown}`)
    } else if (m[6]) {
      const sign = m[5] === '-' ? -1 : 1
      const n = parseInt(m[6], 10)
      total += sign * n
      parts.push(`${sign < 0 ? '- ' : parts.length ? '+ ' : ''}${n}`)
    }
  }
  return { expr: clean, total, detail: parts.join(' '), nat: d20s.length === 1 ? d20s[0] : undefined }
}

export function modStr(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** "1d20" + modificateur → "1d20+3" */
export function withMod(base: string, mod: number): string {
  return mod === 0 ? base : `${base}${modStr(mod)}`
}

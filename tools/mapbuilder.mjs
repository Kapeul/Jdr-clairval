// Petit outil pour dessiner des cartes par programme (voir docs/SCENARIO.md).
// Chaque case a un caractère de terrain (légende : src/lib/terrain.ts) et un caractère de zone.

export class MapBuilder {
  constructor(width, height, fill = '.', zone = '.') {
    this.w = width
    this.h = height
    this.t = Array.from({ length: height }, () => Array(width).fill(fill))
    this.z = Array.from({ length: height }, () => Array(width).fill(zone))
    this.info = {}
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }
  set(x, y, c, zone) {
    if (!this.inside(x, y)) return this
    if (c != null) this.t[y][x] = c
    if (zone != null) this.z[y][x] = zone
    return this
  }
  get(x, y) {
    return this.inside(x, y) ? this.t[y][x] : null
  }
  rect(x, y, w, h, c, zone) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, zone)
    return this
  }
  outline(x, y, w, h, c, zone) {
    for (let i = x; i < x + w; i++) {
      this.set(i, y, c, zone)
      this.set(i, y + h - 1, c, zone)
    }
    for (let j = y; j < y + h; j++) {
      this.set(x, j, c, zone)
      this.set(x + w - 1, j, c, zone)
    }
    return this
  }
  zoneRect(x, y, w, h, zone) {
    return this.rect(x, y, w, h, null, zone)
  }
  /** Ligne / chemin à travers une liste de points, largeur w */
  path(points, c, w = 1, zone) {
    for (let k = 0; k < points.length - 1; k++) {
      let [x0, y0] = points[k]
      const [x1, y1] = points[k + 1]
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / (steps || 1))
        const y = Math.round(y0 + ((y1 - y0) * s) / (steps || 1))
        const r = Math.floor((w - 1) / 2)
        for (let dy = -r; dy < w - r; dy++) for (let dx = -r; dx < w - r; dx++) this.set(x + dx, y + dy, c, zone)
      }
    }
    return this
  }
  /** Bâtiment : murs pleins (H) avec une porte, intérieur facultatif */
  house(x, y, w, h, zone, door = 'S', wall = 'H') {
    this.rect(x, y, w, h, wall, zone)
    const dx = x + Math.floor(w / 2)
    const dy = y + Math.floor(h / 2)
    const d = { S: [dx, y + h - 1], N: [dx, y], E: [x + w - 1, dy], W: [x, dy] }[door]
    if (d) this.set(d[0], d[1], '+', zone)
    return this
  }
  /** Pièce intérieure : sol + murs (#) en bordure */
  room(x, y, w, h, floor, zone, wall = '#') {
    this.rect(x, y, w, h, floor, zone)
    this.outline(x, y, w, h, wall, zone)
    return this
  }
  disc(cx, cy, r, c, zone) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6) this.set(x, y, c, zone)
    return this
  }
  ring(cx, cy, r, c, zone) {
    for (let y = cy - r - 1; y <= cy + r + 1; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        if (Math.abs(d - r) < 0.55) this.set(x, y, c, zone)
      }
    return this
  }
  /** Parsème des caractères (pseudo-aléatoire déterministe) sur les cases dont le terrain est dans `on` */
  scatter(x, y, w, h, c, density, seed = 1, on = '.,') {
    let s = seed * 9301 + 49297
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.inside(i, j) && on.includes(this.t[j][i]) && rnd() < density) this.t[j][i] = c
    return this
  }
  name(zone, name, extra = {}) {
    this.info[zone] = { name, ...extra }
    return this
  }
  /** Zone : toutes les cases (de la zone `from` éventuellement) dans un rectangle */
  claim(x, y, w, h, zone, onlyFrom) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.inside(i, j) && (!onlyFrom || onlyFrom.includes(this.z[j][i]))) this.z[j][i] = zone
    return this
  }
  build({ id, name, partId, ambient = 'day', startZones = [], start }) {
    return {
      id,
      name,
      partId,
      width: this.w,
      height: this.h,
      ambient,
      startZones,
      start,
      terrain: this.t.map((r) => r.join('')),
      zones: this.z.map((r) => r.join('')),
      zoneInfo: this.info,
    }
  }
}

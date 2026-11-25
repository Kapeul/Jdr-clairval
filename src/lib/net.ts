// Couche réseau : connexion directe entre navigateurs (WebRTC via Trystero),
// sans serveur ni compte. Une variante « locale » (BroadcastChannel) sert aux
// tests et au jeu sur un seul ordinateur (plusieurs onglets) : ajouter ?local à l'URL.

type Handler = (data: any, peerId: string) => void

export interface Transport {
  selfId: string
  send(type: string, data: unknown, target?: string): void
  on(type: string, cb: Handler): void
  onPeerJoin(cb: (id: string) => void): void
  onPeerLeave(cb: (id: string) => void): void
  peers(): string[]
  leave(): void
  kind: 'p2p' | 'local'
}

const APP_ID = 'jdr25d-table-v1'

export function wantsLocal(): boolean {
  const q = new URLSearchParams(location.search)
  return q.has('local') || location.hash.includes('local')
}

export async function connect(room: string): Promise<Transport> {
  if (wantsLocal()) return localTransport(room)
  return p2pTransport(room)
}

async function p2pTransport(room: string): Promise<Transport> {
  const { joinRoom, selfId } = await import('trystero/nostr')
  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]
  const env = import.meta.env
  if (env.VITE_TURN_URL) {
    iceServers.push({ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS })
  }
  const r = joinRoom({ appId: APP_ID, password: `clef-${room}`, rtcConfig: { iceServers } }, room)
  const actions: Record<string, { send: (d: any, t?: string) => void }> = {}
  const getAction = (type: string) => {
    if (!actions[type]) {
      const [send, recv] = r.makeAction<any>(type)
      actions[type] = { send: (d, t) => void send(d, t ? t : undefined) }
      ;(actions[type] as any).recv = recv
    }
    return actions[type] as { send: (d: any, t?: string) => void; recv: (cb: Handler) => void }
  }
  const joins: ((id: string) => void)[] = []
  const leaves: ((id: string) => void)[] = []
  r.onPeerJoin((id) => joins.forEach((f) => f(id)))
  r.onPeerLeave((id) => leaves.forEach((f) => f(id)))
  return {
    kind: 'p2p',
    selfId,
    send: (type, data, target) => getAction(type).send(data, target),
    on: (type, cb) => getAction(type).recv(cb),
    onPeerJoin: (cb) => joins.push(cb),
    onPeerLeave: (cb) => leaves.push(cb),
    peers: () => Object.keys(r.getPeers()),
    leave: () => void r.leave(),
  }
}

function localTransport(room: string): Transport {
  const selfId = Math.random().toString(36).slice(2, 10)
  const bc = new BroadcastChannel(`jdr25d-${room}`)
  const handlers: Record<string, Handler[]> = {}
  const joins: ((id: string) => void)[] = []
  const leaves: ((id: string) => void)[] = []
  const known = new Set<string>()
  let closed = false
  const post = (m: any) => {
    if (!closed) bc.postMessage({ ...m, from: selfId })
  }
  const seen = (id: string) => {
    if (known.has(id)) return
    known.add(id)
    joins.forEach((f) => f(id))
  }
  bc.onmessage = (ev) => {
    const m = ev.data
    if (!m || m.from === selfId) return
    if (m.to && m.to !== selfId) return
    if (m.sys === 'hi') {
      post({ sys: 'here', to: m.from })
      seen(m.from)
      return
    }
    if (m.sys === 'here') return seen(m.from)
    if (m.sys === 'bye') {
      if (known.delete(m.from)) leaves.forEach((f) => f(m.from))
      return
    }
    seen(m.from)
    handlers[m.type]?.forEach((h) => h(m.data, m.from))
  }
  const bye = () => post({ sys: 'bye' })
  window.addEventListener('beforeunload', bye)
  setTimeout(() => post({ sys: 'hi' }), 30)
  return {
    kind: 'local',
    selfId,
    send: (type, data, to) => post({ type, data, to }),
    on: (type, cb) => (handlers[type] ??= []).push(cb),
    onPeerJoin: (cb) => joins.push(cb),
    onPeerLeave: (cb) => leaves.push(cb),
    peers: () => [...known],
    leave: () => {
      bye()
      window.removeEventListener('beforeunload', bye)
      closed = true
      bc.close()
    },
  }
}

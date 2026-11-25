import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState, PlayerAction, PlayerView, Scenario } from '../types'
import { connect, type Transport } from './net'
import { applyPlayerAction, buildPlayerView } from './state'
import { saveGame } from './storage'

export type NetStatus = 'connexion' | 'en ligne' | 'erreur'

// ---------- Côté MJ : autorité de la partie ----------

export function useGMSession(initial: GameState, scenario: Scenario) {
  const [game, setGame] = useState(initial)
  const gameRef = useRef(game)
  const tRef = useRef<Transport | null>(null)
  const peerKeys = useRef<Record<string, string>>({})
  const [peers, setPeers] = useState<string[]>([])
  const [status, setStatus] = useState<NetStatus>('connexion')
  const [netKind, setNetKind] = useState<'p2p' | 'local' | null>(null)

  const commit = useCallback((g: GameState) => {
    gameRef.current = g
    setGame(g)
  }, [])

  /** Modifie l'état : fn reçoit une copie à muter. */
  const update = useCallback(
    (fn: (g: GameState) => void) => {
      const g = structuredClone(gameRef.current)
      fn(g)
      commit(g)
    },
    [commit],
  )

  // réseau
  useEffect(() => {
    let alive = true
    let t: Transport | null = null
    connect(initial.room)
      .then((tr) => {
        if (!alive) return tr.leave()
        t = tr
        tRef.current = tr
        setNetKind(tr.kind)
        setStatus('en ligne')
        tr.onPeerJoin((id) => {
          setPeers(tr.peers())
          tr.send('role', { gm: true, room: initial.room }, id)
          tr.send('view', buildPlayerView(gameRef.current, scenario), id)
        })
        tr.onPeerLeave((id) => {
          setPeers(tr.peers())
          const key = peerKeys.current[id]
          delete peerKeys.current[id]
          if (key && gameRef.current.players[key] && !Object.values(peerKeys.current).includes(key)) {
            const g = structuredClone(gameRef.current)
            g.players[key].online = false
            g.players[key].lastSeen = Date.now()
            commit(g)
          }
        })
        tr.on('act', (a: PlayerAction, peerId: string) => {
          if (!a || typeof a !== 'object') return
          if (a.t === 'hello') {
            if (typeof a.key !== 'string' || a.key.length > 40) return
            peerKeys.current[peerId] = a.key
          }
          const key = peerKeys.current[peerId]
          if (!key) {
            tr.send('role', { gm: true, room: initial.room }, peerId)
            return
          }
          try {
            const next = applyPlayerAction(gameRef.current, scenario, key, a)
            if (next) commit(next)
          } catch (e) {
            console.warn('Action ignorée', e)
          }
        })
        // annonce périodique (utile si un joueur a raté le premier message)
        const iv = setInterval(() => tr.send('role', { gm: true, room: initial.room }), 15000)
        ;(tr as any)._iv = iv
      })
      .catch((e) => {
        console.error(e)
        setStatus('erreur')
      })
    return () => {
      alive = false
      if (t) {
        clearInterval((t as any)._iv)
        t.leave()
      }
      tRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.room])

  // diffusion de la vue joueurs + sauvegarde, regroupées
  useEffect(() => {
    const h = setTimeout(() => {
      tRef.current?.send('view', buildPlayerView(game, scenario))
      saveGame(game)
    }, 60)
    return () => clearTimeout(h)
  }, [game, scenario])

  return { game, update, peers, status, netKind }
}

// ---------- Côté joueur ----------

export function usePlayerSession(room: string, identity: { key: string; name: string }, characterId?: string) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [status, setStatus] = useState<NetStatus>('connexion')
  const [gmOnline, setGmOnline] = useState(false)
  const tRef = useRef<Transport | null>(null)
  const gmPeer = useRef<string | null>(null)
  const idRef = useRef(identity)
  idRef.current = identity
  const charRef = useRef(characterId)
  charRef.current = characterId

  const send = useCallback((a: PlayerAction) => {
    const t = tRef.current
    if (!t || !gmPeer.current) return false
    t.send('act', a, gmPeer.current)
    return true
  }, [])

  useEffect(() => {
    let alive = true
    let t: Transport | null = null
    let iv: ReturnType<typeof setInterval> | undefined
    let gotView = false
    const hello = () => {
      if (!t || !gmPeer.current) return
      t.send('act', { t: 'hello', key: idRef.current.key, name: idRef.current.name, characterId: charRef.current } satisfies PlayerAction, gmPeer.current)
    }
    connect(room)
      .then((tr) => {
        if (!alive) return tr.leave()
        t = tr
        tRef.current = tr
        setStatus('en ligne')
        tr.on('role', (d: any, peerId: string) => {
          if (!d?.gm) return
          const changed = gmPeer.current !== peerId
          gmPeer.current = peerId
          setGmOnline(true)
          if (changed || !gotView) hello()
        })
        tr.on('view', (v: PlayerView, peerId: string) => {
          if (peerId !== gmPeer.current || !v || typeof v !== 'object') return
          gotView = true
          setView(v)
        })
        tr.onPeerLeave((id) => {
          if (id === gmPeer.current) {
            gmPeer.current = null
            setGmOnline(false)
          }
        })
        iv = setInterval(() => {
          if (!gotView) hello()
        }, 3000)
      })
      .catch((e) => {
        console.error(e)
        setStatus('erreur')
      })
    return () => {
      alive = false
      clearInterval(iv)
      t?.leave()
      tRef.current = null
    }
  }, [room])

  return { view, status, gmOnline, send }
}

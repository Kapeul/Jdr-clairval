import { useEffect, useState } from 'react'
import Home from './components/Home'
import GMView from './components/GMView'
import PlayerView from './components/PlayerView'

export function parseRoute(): { page: 'home' | 'mj' | 'joueur'; room?: string } {
  const h = location.hash.replace(/^#\/?/, '')
  const [page, room] = h.split('/')
  const r = room?.split('?')[0]?.toUpperCase()
  if (page === 'mj' && r) return { page: 'mj', room: r }
  if (page === 'j' && r) return { page: 'joueur', room: r }
  return { page: 'home' }
}

export function go(path: string) {
  location.hash = path
}

export function playerLink(room: string): string {
  const base = location.href.split('#')[0]
  return `${base}#/j/${room}`
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  useEffect(() => {
    const f = () => setRoute(parseRoute())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  if (route.page === 'mj' && route.room) return <GMView key={route.room} room={route.room} />
  if (route.page === 'joueur' && route.room) return <PlayerView key={route.room} room={route.room} />
  return <Home />
}

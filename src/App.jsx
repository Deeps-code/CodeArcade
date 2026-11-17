import { useEffect, useMemo, useRef, useState } from 'react'
import Background from './components/Background.jsx'
import ProjectCard from './components/ProjectCard.jsx'
import Player from './components/Player.jsx'
import { CloseIcon, PlayIcon, SearchIcon } from './components/Icons.jsx'

// Simple hash routing: "#/play/<id>" opens a project, anything else shows the gallery.
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const match = hash.match(/^#\/play\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

export default function App() {
  const [projects, setProjects] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const searchRef = useRef(null)
  const playingId = useHashRoute()

  useEffect(() => {
    fetch('/projects.json')
      .then((r) => r.json())
      .then((list) =>
        setProjects(
          // Each project lives in projects/<folder>/ with an index.html inside.
          list.map((p) => ({
            ...p,
            path: `/${p.folder}/index.html`,
            thumbnail: `/${p.folder}/${p.thumbnail || 'thumb.png'}`,
          }))
        )
      )
      .catch(() => {
        setError('Could not load projects.json')
        setProjects([])
      })
  }, [])

  // Press "/" to jump to the search box, Esc to clear it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('')
        searchRef.current.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allTags = useMemo(() => {
    const set = new Set()
    for (const p of projects || []) for (const t of p.tags || []) set.add(t)
    return [...set].sort()
  }, [projects])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (projects || []).filter((p) => {
      const tags = p.tags || []
      if (activeTag && !tags.includes(activeTag)) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [projects, query, activeTag])

  const playing = projects?.find((p) => p.id === playingId)
  if (playingId && playing) return <Player key={playing.id} project={playing} />

  return (
    <>
      <Background />
      <div className="home">
        <nav className="nav">
          <a href="#/" className="logo">
            <span className="logo-mark"><PlayIcon width={14} height={14} /></span>
            CodeArcade
          </a>
          {projects && (
            <span className="nav-count">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </span>
          )}
        </nav>

        <header className="hero">
          <span className="eyebrow">
            <span className="pulse-dot" /> Insert coin to play
          </span>
          <h1 className="title">
            Code<span className="title-accent">Arcade</span>
          </h1>
          <p className="subtitle">
            A collection of little games and experiments I've built.
            Pick one and play it right in your browser.
          </p>

          <div className="search">
            <SearchIcon className="search-icon" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects"
            />
            {query ? (
              <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <CloseIcon width={16} height={16} />
              </button>
            ) : (
              <kbd className="search-kbd">/</kbd>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="chips" role="toolbar" aria-label="Filter by tag">
              <button
                className={`chip ${activeTag === null ? 'active' : ''}`}
                onClick={() => setActiveTag(null)}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`chip ${activeTag === t ? 'active' : ''}`}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </header>

        {error && <p className="notice">{error}</p>}

        <main className="grid">
          {projects === null &&
            Array.from({ length: 4 }, (_, i) => <div key={i} className="card skeleton" />)}

          {shown.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}

          {projects && projects.length > 0 && shown.length === 0 && (
            <div className="notice empty">
              <p>No projects match that.</p>
              <button
                className="chip"
                onClick={() => { setQuery(''); setActiveTag(null) }}
              >
                Clear filters
              </button>
            </div>
          )}
        </main>

        <footer className="footer">
          <span>Made with code &amp; curiosity</span>
          <span className="dot">•</span>
          <span>© {new Date().getFullYear()} CodeArcade</span>
        </footer>
      </div>
    </>
  )
}

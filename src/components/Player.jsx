import { useEffect, useRef, useState } from 'react'
import { BackIcon, ExpandIcon, ExternalIcon, ShrinkIcon } from './Icons.jsx'

// Full-screen view that runs one project inside an iframe.
export default function Player({ project }) {
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const stageRef = useRef(null)
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled

  useEffect(() => {
    window.scrollTo(0, 0)
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen()
  }

  return (
    <div className="player">
      <header className="player-bar">
        <a href="#/" className="btn btn-ghost" aria-label="Back to all projects">
          <BackIcon />
          <span className="wide-only">Back</span>
        </a>
        <div className="player-title">
          <h2>{project.title}</h2>
        </div>
        <div className="player-actions">
          {canFullscreen && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </button>
          )}
          <a
            href={project.path}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            aria-label="Open in a new tab"
            title="Open in a new tab"
          >
            <ExternalIcon />
          </a>
        </div>
      </header>

      <div className="stage" ref={stageRef}>
        {loading && (
          <div className="loader">
            <div className="spinner" />
            <span>Loading {project.title}…</span>
          </div>
        )}
        <iframe
          src={project.path}
          title={project.title}
          className="player-frame"
          allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope"
          onLoad={(e) => {
            setLoading(false)
            // Give the project keyboard focus right away so keys like Enter/Space work.
            e.currentTarget.contentWindow?.focus()
          }}
        />
      </div>
    </div>
  )
}

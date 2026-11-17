import { useRef } from 'react'
import { PlayIcon } from './Icons.jsx'

// A project card that tilts toward the mouse and shows a light glare.
export default function ProjectCard({ project, index }) {
  const ref = useRef(null)

  function onPointerMove(e) {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
  }

  function onPointerLeave() {
    const el = ref.current
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <a
      ref={ref}
      href={`#/play/${encodeURIComponent(project.id)}`}
      className="card"
      style={{ '--i': index }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="thumb-wrap">
        <img src={project.thumbnail} alt="" className="thumb" loading="lazy" />
        <span className="play-badge">
          <PlayIcon width={16} height={16} />
          <span className="play-text">Play</span>
        </span>
      </div>
      <div className="card-body">
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <div className="tags">
          {(project.tags || []).map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      </div>
      <span className="glare" aria-hidden="true" />
    </a>
  )
}

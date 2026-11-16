import { useEffect, useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { useBack } from '../lib/nav'

export function Sheet({ open, onClose, title, children, tall, action }) {
  useBack(open, onClose)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={'sheet' + (tall ? ' tall' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          {action}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Avatar({ p, size = 40, locked }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.55 }}>
      <span>{p?.avatar || '🙂'}</span>
      {locked && <span className="avatar-lock">🔒</span>}
    </div>
  )
}

export function Btn({ children, kind = 'primary', size, loading, className = '', ...rest }) {
  return (
    <button className={`btn btn-${kind} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : children}
    </button>
  )
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips" data-noswipe>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o
        const label = typeof o === 'object' ? o.label : o
        return (
          <button key={String(v)} type="button" className={'chip' + (value === v ? ' on' : '')} onClick={() => onChange(v)}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" data-noswipe>
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon}{o.label && <span>{o.label}</span>}{o.dot && <i className="seg-dot" />}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" className={'toggle' + (on ? ' on' : '')} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}>
      <span />
    </button>
  )
}

export function Row({ icon, title, sub, right, onClick, chevron }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="row" onClick={onClick}>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {right}
      {chevron && <ChevronRight size={18} className="muted" />}
    </Tag>
  )
}

export function EmojiGrid({ list, value, onChange, lockedSet }) {
  return (
    <div className="emoji-grid">
      {list.map((e) => {
        const locked = lockedSet?.has(e)
        return (
          <button key={e} type="button" disabled={locked}
            className={'emoji-cell' + (value === e ? ' on' : '') + (locked ? ' locked' : '')}
            onClick={() => onChange(e)}>{e}</button>
        )
      })}
    </div>
  )
}

export function Empty({ icon, title, sub, children }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <b>{title}</b>
      {sub && <p>{sub}</p>}
      {children}
    </div>
  )
}

export function Toasts({ items }) {
  return <div className="toasts">{items.map((t) => <div key={t.id} className={'toast toast-' + t.kind}>{t.text}</div>)}</div>
}

const BURST = ['🎉', '✨', '🔥', '⭐']
export function Confetti({ trigger }) {
  const [bits, setBits] = useState([])
  useEffect(() => {
    if (!trigger) return
    setBits(Array.from({ length: 16 }, (_, i) => ({
      id: trigger + '-' + i, e: BURST[i % BURST.length],
      x: (Math.random() - 0.5) * 280, y: -(100 + Math.random() * 220), r: (Math.random() - 0.5) * 400, d: 600 + Math.random() * 500
    })))
    const t = setTimeout(() => setBits([]), 1300)
    return () => clearTimeout(t)
  }, [trigger])
  if (!bits.length) return null
  return <div className="confetti">{bits.map((b) => <span key={b.id} style={{ '--x': b.x + 'px', '--y': b.y + 'px', '--r': b.r + 'deg', animationDuration: b.d + 'ms' }}>{b.e}</span>)}</div>
}

export function XpBar({ pct }) {
  return <div className="xpbar"><div className="xpbar-fill" style={{ width: pct + '%' }} /></div>
}

export function Photo({ src }) {
  if (!src) return null
  return <img className="proof-img" src={src} alt="proof" loading="lazy" onClick={() => window.open(src, '_blank')} />
}

export function Section({ title, action, children }) {
  return (
    <section className="section">
      {(title || action) && <div className="section-head"><h2>{title}</h2>{action}</div>}
      {children}
    </section>
  )
}

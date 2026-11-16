import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Send, Sticker, ArrowDown, X } from 'lucide-react'
import { useApp } from '../../App'
import { supabase, errText } from '../../supabase'
import { clock, REACTIONS, STICKERS } from '../../lib/utils'
import { Avatar } from '../../components/ui'

export default function Chat({ g }) {
  const { uid, people, shameOf, lockedOf, toast, markSeen } = useApp()
  const [msgs, setMsgs] = useState(null)
  const [reacts, setReacts] = useState({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [tray, setTray] = useState(false)
  const [picker, setPicker] = useState(null)
  const [newBelow, setNewBelow] = useState(0)
  const box = useRef(null)
  const atBottom = useRef(true)
  const stick = useRef(true)
  const press = useRef(null)

  const toBottom = (smooth) => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setNewBelow(0)
  }

  // load messages + reactions
  useEffect(() => {
    let alive = true
    setMsgs(null)
    ;(async () => {
      const { data } = await supabase.from('messages').select('*').eq('group_id', g.id).order('created_at', { ascending: false }).limit(150)
      const list = (data || []).reverse()
      const ids = list.map((m) => m.id)
      const map = {}
      if (ids.length) {
        const { data: rs } = await supabase.from('message_reactions').select('*').in('message_id', ids)
        for (const r of rs || []) (map[r.message_id] ||= []).push(r)
      }
      if (!alive) return
      stick.current = true
      setReacts(map)
      setMsgs(list)
      markSeen(g.id)
    })()
    return () => { alive = false }
  }, [g.id])

  // keep pinned to the newest message
  useLayoutEffect(() => {
    if (msgs && stick.current) { toBottom(false); stick.current = false }
  }, [msgs])

  // live messages + reactions
  useEffect(() => {
    const onMsg = (e) => {
      const m = e.detail
      if (m.group_id !== g.id) return
      setMsgs((cur) => {
        if (!cur || cur.some((x) => x.id === m.id)) return cur
        if (atBottom.current || m.user_id === uid) stick.current = true
        else setNewBelow((n) => n + 1)
        return [...cur, m]
      })
      if (atBottom.current) markSeen(g.id)
    }
    const onReact = (e) => {
      const { eventType, new: nw, old } = e.detail
      setReacts((cur) => {
        const next = { ...cur }
        const mid = (nw && nw.message_id) || (old && old.message_id)
        if (!mid) return cur
        const list = (next[mid] || []).filter((r) => r.user_id !== ((nw && nw.user_id) || (old && old.user_id)))
        if (eventType !== 'DELETE' && nw) list.push(nw)
        next[mid] = list
        return next
      })
    }
    window.addEventListener('pakka:msg', onMsg)
    window.addEventListener('pakka:react', onReact)
    return () => { window.removeEventListener('pakka:msg', onMsg); window.removeEventListener('pakka:react', onReact) }
  }, [g.id, uid])

  const onScroll = () => {
    const el = box.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom.current && newBelow) { setNewBelow(0); markSeen(g.id) }
  }

  const post = async (row) => {
    setSending(true)
    const { data, error } = await supabase.from('messages').insert({ group_id: g.id, user_id: uid, ...row }).select().single()
    setSending(false)
    if (error) { toast(errText(error), 'error'); return false }
    stick.current = true
    setMsgs((cur) => (cur && !cur.some((x) => x.id === data.id) ? [...cur, data] : cur))
    return true
  }
  const sendText = async (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    if (await post({ kind: 'text', content: content.slice(0, 2000) })) setText('')
  }
  const sendSticker = async (code) => { setTray(false); await post({ kind: 'sticker', content: code }) }

  const react = async (m, emoji) => {
    setPicker(null)
    const mine = (reacts[m.id] || []).find((r) => r.user_id === uid)
    setReacts((cur) => {
      const list = (cur[m.id] || []).filter((r) => r.user_id !== uid)
      if (!mine || mine.emoji !== emoji) list.push({ message_id: m.id, user_id: uid, emoji })
      return { ...cur, [m.id]: list }
    })
    const { error } = mine && mine.emoji === emoji
      ? await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', uid)
      : await supabase.from('message_reactions').upsert({ message_id: m.id, user_id: uid, emoji })
    if (error) toast(errText(error), 'error')
  }

  const startPress = (m) => { clearTimeout(press.current); press.current = setTimeout(() => { setPicker(m.id); navigator.vibrate?.(15) }, 420) }
  const endPress = () => clearTimeout(press.current)

  return (
    <div className="chat">
      <div className="msgs" ref={box} onScroll={onScroll} onClick={() => picker && setPicker(null)}>
        {msgs === null ? <div className="skeleton" /> : msgs.length === 0 ? <p className="muted center pad">Say salam 👋</p> :
          msgs.map((m, i) => {
            if (m.kind === 'system') return <div key={m.id} className="sys-msg">{m.content}</div>
            const mine = m.user_id === uid
            const prev = msgs[i - 1]
            const grouped = prev && prev.kind !== 'system' && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000
            const p = people[m.user_id]
            const rs = reacts[m.id] || []
            const counts = rs.reduce((a, r) => ({ ...a, [r.emoji]: (a[r.emoji] || 0) + 1 }), {})
            const sticker = m.kind === 'sticker' ? STICKERS[m.content] : null
            return (
              <div key={m.id} className={'msg' + (mine ? ' mine' : '') + (grouped ? ' grouped' : '')}>
                {!mine && <div className="msg-av">{!grouped && <Avatar p={p} size={28} locked={lockedOf(m.user_id)} />}</div>}
                <div className="msg-col">
                  {!mine && !grouped && <div className="msg-name">{p?.display_name || 'Someone'} {shameOf(m.user_id) && <span className="shame xs">{shameOf(m.user_id)}</span>}</div>}
                  <div className={sticker ? 'sticker' : 'bubble'}
                    onPointerDown={() => startPress(m)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                    onContextMenu={(e) => { e.preventDefault(); setPicker(m.id) }}>
                    {sticker ? <><span className="st-e">{sticker.e}</span><span className="st-t">{sticker.t}</span></> : <span className="msg-text">{m.content}</span>}
                    <span className="msg-time">{clock(m.created_at)}</span>
                  </div>
                  {Object.keys(counts).length > 0 && (
                    <div className="reacts">
                      {Object.entries(counts).map(([e, n]) => (
                        <button key={e} className={'react' + (rs.some((r) => r.user_id === uid && r.emoji === e) ? ' mine' : '')} onClick={() => react(m, e)}>
                          {e}{n > 1 && <small>{n}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                  {picker === m.id && (
                    <div className="react-picker" data-noswipe onClick={(e) => e.stopPropagation()}>
                      {REACTIONS.map((e) => <button key={e} onClick={() => react(m, e)}>{e}</button>)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>
      {newBelow > 0 && <button className="new-below" onClick={() => { toBottom(true); markSeen(g.id) }}><ArrowDown size={14} /> {newBelow} new</button>}
      {tray && (
        <div className="sticker-tray" data-noswipe>
          <div className="tray-head"><b>Stickers</b><button className="icon-btn ghost sm" onClick={() => setTray(false)}><X size={16} /></button></div>
          <div className="tray-grid">
            {Object.entries(STICKERS).map(([code, s]) => (
              <button key={code} className="sticker small" onClick={() => sendSticker(code)}><span className="st-e">{s.e}</span><span className="st-t">{s.t}</span></button>
            ))}
          </div>
        </div>
      )}
      <form className="chat-input" onSubmit={sendText} data-noswipe>
        <button type="button" className={'icon-btn ghost' + (tray ? ' active' : '')} onClick={() => setTray(!tray)} aria-label="Stickers"><Sticker size={20} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={2000} enterKeyHint="send" />
        <button type="submit" className="send" disabled={!text.trim() || sending} aria-label="Send"><Send size={18} /></button>
      </form>
    </div>
  )
}

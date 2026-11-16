import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Plus, Ticket, Settings, MessageCircle, ListChecks, Trophy, Users } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import { timeAgo, STICKERS } from '../lib/utils'
import { useBack } from '../lib/nav'
import { Btn, Empty, Sheet, Seg, EmojiGrid } from '../components/ui'
import Chat from './group/Chat'
import Tasks from './group/Tasks'
import Ranks from './group/Ranks'
import Members from './group/Members'

const GROUP_EMOJIS = ['🏠', '👨‍👩‍👧‍👦', '🔥', '🎮', '💪', '⭐', '📚', '🕌', '🏃', '🎬']

function preview(m, people, uid) {
  if (!m) return 'No messages yet'
  const who = m.user_id === uid ? 'You' : (people[m.user_id]?.display_name || '').split(' ')[0]
  if (m.kind === 'system') return m.content
  if (m.kind === 'sticker') return `${who}: ${STICKERS[m.content]?.e || '🎨'} Sticker`
  return `${who}: ${m.content}`
}

export default function Groups() {
  const { uid, myGroups, requestedGroups, lastMsgs, people, unreadGroups, adminRequests, membersOf, showGroup } = useApp()
  const [sheet, setSheet] = useState(null)
  const sorted = [...myGroups].sort((a, b) => (lastMsgs[b.id]?.created_at || b.created_at).localeCompare(lastMsgs[a.id]?.created_at || a.created_at))

  return (
    <div className="groups">
      <div className="row-btns top">
        <Btn kind="secondary" size="sm" onClick={() => setSheet('create')}><Plus size={15} /> New group</Btn>
        <Btn kind="secondary" size="sm" onClick={() => setSheet('join')}><Ticket size={15} /> Join</Btn>
      </div>
      {sorted.length === 0 && requestedGroups.length === 0 && (
        <Empty icon="👨‍👩‍👧‍👦" title="Koi group nahi" sub="Group banao ya invite code se join karo." />
      )}
      <div className="list">
        {sorted.map((g) => {
          const m = lastMsgs[g.id]
          const reqs = adminRequests.filter((r) => r.group_id === g.id).length
          return (
            <button key={g.id} className="group-row" onClick={() => showGroup(g.id)}>
              <span className="group-emoji">{g.emoji}</span>
              <span className="grow">
                <span className="row-line"><b>{g.name}</b><small className="muted">{m ? timeAgo(m.created_at) : ''}</small></span>
                <span className="row-line">
                  <small className={'preview' + (unreadGroups.includes(g.id) ? ' unread' : '')}>{preview(m, people, uid)}</small>
                  {unreadGroups.includes(g.id) && <span className="unread-dot" />}
                  {reqs > 0 && <span className="pill warn">{reqs} request</span>}
                </span>
                <small className="muted">{membersOf(g.id).length} members{g.kind === 'focused' ? ' · Focused' : ''}</small>
              </span>
            </button>
          )
        })}
        {requestedGroups.map((g) => (
          <div key={g.id} className="group-row dim">
            <span className="group-emoji">{g.emoji}</span>
            <span className="grow"><b>{g.name}</b><small className="muted">Request bheji hai, admin approve karega ⏳</small></span>
          </div>
        ))}
      </div>
      <CreateGroup open={sheet === 'create'} onClose={() => setSheet(null)} />
      <JoinGroup open={sheet === 'join'} onClose={() => setSheet(null)} />
    </div>
  )
}

export function CreateGroup({ open, onClose }) {
  const { toast, loadCore, showGroup } = useApp()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏠')
  const [kind, setKind] = useState('general')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!name.trim()) return toast('Naam likho', 'warn')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim(), p_emoji: emoji, p_kind: kind })
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    setName(''); await loadCore(); onClose(); showGroup(data.id, 'members')
  }
  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
      <EmojiGrid list={GROUP_EMOJIS} value={emoji} onChange={setEmoji} />
      <KindPicker value={kind} onChange={setKind} />
      <Btn className="wide" loading={busy} onClick={go}>Create</Btn>
    </Sheet>
  )
}

export function KindPicker({ value, onChange }) {
  return (
    <div className="seg-list">
      <button type="button" className={'seg-item' + (value === 'general' ? ' on' : '')} onClick={() => onChange('general')}>
        <b>General</b><small>Members see each other's habits (family)</small>
      </button>
      <button type="button" className={'seg-item' + (value === 'focused' ? ' on' : '')} onClick={() => onChange('focused')}>
        <b>Focused</b><small>Only the group's shared tasks (e.g. gym bros)</small>
      </button>
    </div>
  )
}

export function JoinGroup({ open, onClose }) {
  const { toast, loadCore } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('join_group', { p_code: code.trim() })
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast(data.status === 'member' ? `Tum pehle se "${data.name}" mein ho` : `Request bhej di. "${data.name}" ka admin approve karega`, 'success')
    setCode(''); loadCore(); onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Join a group">
      <input className="input code-input" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE12" />
      <Btn className="wide" loading={busy} disabled={code.trim().length < 6} onClick={go}>Send request</Btn>
    </Sheet>
  )
}

const SUBTABS = [
  { value: 'chat', label: 'Chat', icon: <MessageCircle size={16} /> },
  { value: 'tasks', label: 'Tasks', icon: <ListChecks size={16} /> },
  { value: 'ranks', label: 'Ranks', icon: <Trophy size={16} /> },
  { value: 'members', label: 'Members', icon: <Users size={16} /> }
]

export function GroupView({ gid, onClose }) {
  const { groups, membersOf, isAdmin, adminRequests, groupTab, setGroupTab } = useApp()
  const [settings, setSettings] = useState(false)
  useBack(true, onClose)
  const g = groups.find((x) => x.id === gid)
  const touch = useRef(null)

  useEffect(() => { if (groups.length && !g) onClose() }, [g, groups.length])
  if (!g) return null
  const reqs = adminRequests.filter((r) => r.group_id === gid).length

  const onTouchStart = (e) => {
    if (e.target.closest('[data-noswipe], input, textarea, .msgs')) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() }
  }
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.at > 700) return
    const order = SUBTABS.map((x) => x.value)
    const next = order[order.indexOf(groupTab) + (dx < 0 ? 1 : -1)]
    if (next) setGroupTab(next)
  }

  return (
    <div className="group-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="gv-head">
        <button className="icon-btn ghost" onClick={onClose} aria-label="Back"><ChevronLeft size={22} /></button>
        <span className="group-emoji sm">{g.emoji}</span>
        <div className="grow">
          <b>{g.name}</b>
          <small className="muted">{membersOf(gid).length} members{g.kind === 'focused' ? ' · Focused' : ''}</small>
        </div>
        {isAdmin(gid) && <button className="icon-btn ghost" onClick={() => setSettings(true)} aria-label="Settings"><Settings size={19} /></button>}
      </header>
      <Seg options={SUBTABS.map((t) => (t.value === 'members' && reqs ? { ...t, dot: true } : t))} value={groupTab} onChange={setGroupTab} />
      <div className={'gv-body' + (groupTab === 'chat' ? ' chat-mode' : '')}>
        {groupTab === 'chat' && <Chat g={g} />}
        {groupTab === 'tasks' && <Tasks g={g} />}
        {groupTab === 'ranks' && <Ranks g={g} />}
        {groupTab === 'members' && <Members g={g} />}
      </div>
      {settings && <GroupSettings g={g} onClose={() => setSettings(false)} />}
    </div>
  )
}

function GroupSettings({ g, onClose }) {
  const { toast, loadCore } = useApp()
  const [name, setName] = useState(g.name)
  const [emoji, setEmoji] = useState(g.emoji)
  const [kind, setKind] = useState(g.kind)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('groups').update({ name: name.trim().slice(0, 40), emoji, kind }).eq('id', g.id)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast('Saved', 'success'); loadCore(); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Group settings" tall>
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <EmojiGrid list={GROUP_EMOJIS} value={emoji} onChange={setEmoji} />
      <KindPicker value={kind} onChange={setKind} />
      <Btn className="wide" loading={busy} onClick={save}>Save</Btn>
    </Sheet>
  )
}

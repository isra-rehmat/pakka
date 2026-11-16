import { useEffect, useState } from 'react'
import { Check, Clock, RotateCcw, Camera, Flame, Pencil, Archive } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import {
  today, dayStr, addDays, isScheduled, streakFor, bestStreakFor, habitStart,
  PROOF, HABIT_EMOJIS, DAY_LETTERS, CHEERS, pickPhoto, uploadProof
} from '../lib/utils'
import { checkAchievements } from '../lib/achievements'
import { Btn, Chips, EmojiGrid, Sheet } from './ui'

export function useCheckin(onChange) {
  const { uid, toast, celebrate, loadCore, myPartners } = useApp()
  const [busyId, setBusyId] = useState(null)
  const hasPartner = myPartners.some((p) => p.status === 'active')

  const after = async (opts) => {
    loadCore()
    const unlocked = await checkAchievements(uid, opts)
    for (const a of unlocked) { toast(`🏅 ${a.name} unlocked! +25 XP`, 'success'); celebrate() }
  }

  const checkIn = async (h) => {
    let proof_url = null
    if (h.proof !== 'none') {
      if (h.proof === 'approval' && !hasPartner) toast('Approve karne ke liye pehle partner banao', 'warn')
      const file = await pickPhoto()
      if (!file) return
      setBusyId(h.id)
      try { proof_url = await uploadProof(uid, file) } catch (e) { setBusyId(null); return toast(errText(e), 'error') }
    }
    setBusyId(h.id)
    const { data, error } = await supabase.from('checkins').insert({ habit_id: h.id, user_id: uid, day: today(), proof_url }).select().single()
    setBusyId(null)
    if (error) return toast(errText(error), 'error')
    onChange?.(data)
    if (data.status === 'done') {
      celebrate()
      toast(data.xp_awarded ? `+${data.xp_awarded} XP · ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}` : 'Done, lekin XP locked hai 🔒', 'success')
    } else toast('Proof bhej diya. Partner approve karega ⏳', 'info')
    after({ checkedIn: true })
  }

  const undo = async (h, c) => {
    if (!confirm(c.status === 'rejected' ? 'Reject hua tha. Hata ke dobara karo?' : `"${h.title}" undo karna hai?`)) return
    setBusyId(h.id)
    const { error } = await supabase.from('checkins').delete().eq('id', c.id)
    setBusyId(null)
    if (error) return toast(errText(error), 'error')
    onChange?.(null, c.id)
    loadCore()
  }

  return { checkIn, undo, busyId, after }
}

export function Last7({ h, set }) {
  const base = new Date(); base.setHours(0, 0, 0, 0)
  const start = habitStart(h)
  return (
    <span className="dots">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(base, i - 6)
        let cls = 'd'
        if (d < start || !isScheduled(h, d)) cls += ' na'
        else if (set?.has(dayStr(d))) cls += ' ok'
        else if (i < 6) cls += ' miss'
        return <i key={i} className={cls} />
      })}
    </span>
  )
}

export function CheckButton({ h, c, busy, onCheck, onUndo }) {
  if (busy) return <span className="check-btn"><span className="spinner" /></span>
  if (!c) return <button className="check-btn" onClick={onCheck} aria-label="Check in">{h.proof !== 'none' && <Camera size={18} />}</button>
  if (c.status === 'done') return <button className="check-btn done" onClick={() => onUndo(c)} aria-label="Done"><Check size={22} strokeWidth={3} /></button>
  if (c.status === 'pending') return <button className="check-btn pending" onClick={() => onUndo(c)} aria-label="Waiting"><Clock size={18} /></button>
  return <button className="check-btn rejected" onClick={() => onUndo(c)} aria-label="Retry"><RotateCcw size={18} /></button>
}

export function HabitRow({ h, c, set, busy, onCheck, onUndo, onOpen, tag, off }) {
  const streak = streakFor(h, set || new Set())
  return (
    <div className={'habit' + (c?.status === 'done' ? ' done' : '')}>
      <button className="habit-main" onClick={onOpen}>
        <span className="habit-emoji">{h.emoji}</span>
        <span className="habit-info">
          <span className="habit-title">{h.title}</span>
          <span className="habit-meta">
            {tag && <span className="tag">{tag}</span>}
            {streak > 0 && <span className="streak"><Flame size={12} />{streak}</span>}
            <Last7 h={h} set={set} />
          </span>
        </span>
      </button>
      {!off && <CheckButton h={h} c={c} busy={busy} onCheck={onCheck} onUndo={onUndo} />}
    </div>
  )
}

export function HabitForm({ open, habit, groupId, onClose, onSaved }) {
  const { uid, toast } = useApp()
  const [emoji, setEmoji] = useState('💪')
  const [title, setTitle] = useState('')
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [proof, setProof] = useState('none')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmoji(habit?.emoji || '💪'); setTitle(habit?.title || ''); setDays(habit?.days || [0, 1, 2, 3, 4, 5, 6]); setProof(habit?.proof || 'none')
  }, [open, habit])

  const save = async () => {
    if (!title.trim()) return toast('Naam likho', 'warn')
    if (!days.length) return toast('Kam se kam 1 din chuno', 'warn')
    setBusy(true)
    const row = { emoji, title: title.trim().slice(0, 60), days: [...days].sort(), proof }
    const { error } = habit
      ? await supabase.from('habits').update(row).eq('id', habit.id)
      : await supabase.from('habits').insert({ ...row, user_id: uid, group_id: groupId || null })
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast(habit ? 'Saved' : groupId ? 'Group task ban gaya' : 'Habit ban gayi 🌱', 'success')
    onSaved()
  }

  return (
    <Sheet open={open} onClose={onClose} title={habit ? 'Edit' : groupId ? 'New group task' : 'New habit'} tall>
      <div className="title-row">
        <span className="title-emoji">{emoji}</span>
        <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={groupId ? 'e.g. Gym' : 'e.g. 10 page parhna'} />
      </div>
      <EmojiGrid list={HABIT_EMOJIS} value={emoji} onChange={setEmoji} />
      <label className="label">Days</label>
      <div className="days-row">
        {DAY_LETTERS.map((l, i) => (
          <button key={i} type="button" className={'day-btn' + (days.includes(i) ? ' on' : '')}
            onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])}>{l}</button>
        ))}
      </div>
      <Chips options={[{ value: 'all', label: 'Every day' }, { value: 'wk', label: 'Weekdays' }, { value: 'we', label: 'Weekend' }]} value=""
        onChange={(v) => setDays(v === 'all' ? [0, 1, 2, 3, 4, 5, 6] : v === 'wk' ? [1, 2, 3, 4, 5] : [0, 6])} />
      <label className="label">Proof</label>
      <div className="seg-list">
        {Object.entries(PROOF).map(([k, p]) => (
          <button key={k} type="button" className={'seg-item' + (proof === k ? ' on' : '')} onClick={() => setProof(k)}>
            <b>{p.label}</b><small>{p.hint} · +{p.xp} XP</small>
          </button>
        ))}
      </div>
      <Btn onClick={save} loading={busy} className="wide">{habit ? 'Save' : 'Create'}</Btn>
    </Sheet>
  )
}

export function HabitDetail({ h, set, total, canEdit, onClose, onEdit, onArchived }) {
  const { toast } = useApp()
  if (!h) return null
  const s = set || new Set()
  const base = new Date(); base.setHours(0, 0, 0, 0)
  const start = habitStart(h)
  const cells = Array.from({ length: 28 }, (_, i) => addDays(base, i - 27))
  const archive = async () => {
    if (!confirm(`"${h.title}" archive karna hai? XP safe rahega.`)) return
    const { error } = await supabase.from('habits').update({ archived: true }).eq('id', h.id)
    if (error) return toast(errText(error), 'error')
    onArchived()
  }
  return (
    <Sheet open onClose={onClose} title={`${h.emoji} ${h.title}`}>
      <div className="stats3">
        <div><b>{streakFor(h, s)}</b><small>Streak</small></div>
        <div><b>{bestStreakFor(h, s)}</b><small>Best</small></div>
        <div><b>{total ?? 0}</b><small>Done</small></div>
      </div>
      <div className="heat">
        {cells.map((d) => {
          const ds = dayStr(d)
          const cls = d < start || !isScheduled(h, d) ? 'na' : s.has(ds) ? 'ok' : ds === today() ? 'now' : 'miss'
          return <i key={ds} className={'heat-cell ' + cls} />
        })}
      </div>
      <p className="muted small">{PROOF[h.proof].label} · {h.days.length === 7 ? 'Every day' : h.days.map((d) => DAY_LETTERS[d]).join(' ')}</p>
      {canEdit && (
        <div className="row-btns">
          <Btn kind="secondary" size="sm" onClick={onEdit}><Pencil size={15} /> Edit</Btn>
          <Btn kind="ghost" size="sm" onClick={archive}><Archive size={15} /> Archive</Btn>
        </div>
      )}
    </Sheet>
  )
}

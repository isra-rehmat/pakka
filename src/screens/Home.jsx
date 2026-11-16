import { useEffect, useMemo, useState } from 'react'
import { Plus, Bell, X, Circle, CheckCircle2, Gavel, Camera, ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import { today, dayStr, addDays, isScheduled, doneSets, pickPhoto, uploadProof } from '../lib/utils'
import { pushState, enablePush } from '../lib/push'
import { Btn, Empty, Sheet, Photo, Section } from '../components/ui'
import { HabitRow, HabitForm, HabitDetail, useCheckin } from '../components/habits'

let checkedOnce = false

export default function Home() {
  const { uid, version, groups, activeSazasFor, people, toast } = useApp()
  const [habits, setHabits] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [showOff, setShowOff] = useState(false)
  const [push, setPush] = useState(null)

  const load = async () => {
    const since = dayStr(addDays(new Date(), -180))
    const [h, c] = await Promise.all([
      supabase.rpc('habits_for', { p_user: uid }),
      supabase.from('checkins').select('*').eq('user_id', uid).gte('day', since).order('day', { ascending: false }).limit(1000)
    ])
    setHabits(h.data || [])
    setCheckins(c.data || [])
  }
  useEffect(() => { load() }, [version])
  useEffect(() => { pushState().then(setPush) }, [])

  const { checkIn, undo, busyId, after } = useCheckin((row, removedId) => {
    if (row) setCheckins((c) => [row, ...c])
    if (removedId) setCheckins((c) => c.filter((x) => x.id !== removedId))
  })
  useEffect(() => { if (!checkedOnce) { checkedOnce = true; after({}) } }, [])

  const t = today()
  const now = new Date()
  const sets = useMemo(() => doneSets(checkins), [checkins])
  const todayMap = useMemo(() => Object.fromEntries(checkins.filter((c) => c.day === t).map((c) => [c.habit_id, c])), [checkins, t])
  const list = habits || []
  const scheduled = list.filter((h) => isScheduled(h, now))
  const off = list.filter((h) => !isScheduled(h, now))
  const done = scheduled.filter((h) => todayMap[h.id]?.status === 'done').length
  const groupName = (gid) => { const g = groups.find((x) => x.id === gid); return g ? `${g.emoji} ${g.name}` : null }
  const showPushPrompt = push === 'off' && !localStorage.getItem('pakka_push_dismissed')

  const turnOnPush = async () => {
    try { await enablePush(); setPush('on'); toast('Notifications on 🔔', 'success') } catch (e) { toast(errText(e), 'error') }
  }

  return (
    <div className="home">
      {activeSazasFor(uid).map((s) => <SazaBanner key={s.id} s={s} from={people[s.issued_by]} />)}

      {showPushPrompt && (
        <div className="notice">
          <Bell size={18} />
          <span>Notifications on karo taake pokes aur reminders milein</span>
          <Btn size="sm" onClick={turnOnPush}>On</Btn>
          <button className="icon-btn ghost" onClick={() => { localStorage.setItem('pakka_push_dismissed', '1'); setPush('dismissed') }}><X size={16} /></button>
        </div>
      )}

      <Section
        title={<>Today <span className="count">{done}/{scheduled.length}</span></>}
        action={<button className="icon-btn" onClick={() => setForm({})} aria-label="New habit"><Plus size={20} /></button>}>
        {habits === null ? <div className="skeleton" /> : list.length === 0 ? (
          <Empty icon="🌱" title="Pehli habit banao" sub="Choti si shuruaat bhi kaafi hai.">
            <Btn size="sm" onClick={() => setForm({})}>New habit</Btn>
          </Empty>
        ) : (
          <div className="list">
            {scheduled.map((h) => (
              <HabitRow key={h.id} h={h} c={todayMap[h.id]} set={sets[h.id]} busy={busyId === h.id} tag={h.group_id ? groupName(h.group_id) : null}
                onCheck={() => checkIn(h)} onUndo={(c) => undo(h, c)} onOpen={() => setDetail(h)} />
            ))}
            {scheduled.length === 0 && <p className="muted small pad">Aaj koi habit nahi 😌</p>}
          </div>
        )}
        {off.length > 0 && (
          <>
            <button className="link-btn" onClick={() => setShowOff(!showOff)}>
              {showOff ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Not today ({off.length})
            </button>
            {showOff && <div className="list dim">{off.map((h) => (
              <HabitRow key={h.id} h={h} set={sets[h.id]} off tag={h.group_id ? groupName(h.group_id) : null} onOpen={() => setDetail(h)} />
            ))}</div>}
          </>
        )}
      </Section>

      <Todos />

      <HabitForm open={!!form} habit={form?.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); after({}) }} />
      {detail && (
        <HabitDetail h={detail} set={sets[detail.id]} total={checkins.filter((c) => c.habit_id === detail.id && c.status === 'done').length}
          canEdit={!detail.group_id} onClose={() => setDetail(null)}
          onEdit={() => { setForm(detail); setDetail(null) }} onArchived={() => { setDetail(null); load() }} />
      )}
    </div>
  )
}

function Todos() {
  const { uid, toast } = useApp()
  const [items, setItems] = useState(null)
  const [text, setText] = useState('')

  useEffect(() => {
    supabase.from('todos').select('*').eq('user_id', uid).order('created_at').then(({ data }) => setItems(data || []))
  }, [uid])

  const t = today()
  const visible = (items || []).filter((x) => !x.done || (x.done_at && dayStr(new Date(x.done_at)) === t))
  const open = visible.filter((x) => !x.done)
  const closed = visible.filter((x) => x.done)

  const add = async (e) => {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    setText('')
    const { data, error } = await supabase.from('todos').insert({ user_id: uid, title: title.slice(0, 120) }).select().single()
    if (error) return toast(errText(error), 'error')
    setItems((x) => [...(x || []), data])
  }
  const toggle = async (it) => {
    const done = !it.done
    setItems((x) => x.map((y) => (y.id === it.id ? { ...y, done, done_at: done ? new Date().toISOString() : null } : y)))
    const { error } = await supabase.from('todos').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', it.id)
    if (error) toast(errText(error), 'error')
  }
  const remove = async (it) => {
    setItems((x) => x.filter((y) => y.id !== it.id))
    await supabase.from('todos').delete().eq('id', it.id)
  }

  return (
    <Section title={<>To-do {open.length > 0 && <span className="count">{open.length}</span>}</>}>
      <form className="todo-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task" maxLength={120} enterKeyHint="done" />
        <button type="submit" className="icon-btn" disabled={!text.trim()} aria-label="Add"><Plus size={18} /></button>
      </form>
      <div className="todos">
        {[...open, ...closed].map((it) => (
          <div key={it.id} className={'todo' + (it.done ? ' done' : '')}>
            <button className="todo-check" onClick={() => toggle(it)} aria-label="Toggle">
              {it.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </button>
            <span className="todo-title">{it.title}</span>
            <button className="icon-btn ghost sm" onClick={() => remove(it)} aria-label="Delete"><X size={15} /></button>
          </div>
        ))}
      </div>
    </Section>
  )
}

function SazaBanner({ s, from }) {
  const { uid, toast, loadCore } = useApp()
  const [busy, setBusy] = useState(false)
  const [appeal, setAppeal] = useState(false)
  const [reason, setReason] = useState('')
  const canAppeal = s.status === 'active' && !s.appealed_at && Date.now() - new Date(s.created_at).getTime() < 24 * 3600 * 1000

  const submit = async (withPhoto) => {
    let url = null
    if (withPhoto) {
      const file = await pickPhoto()
      if (!file) return
      setBusy(true)
      try { url = await uploadProof(uid, file) } catch (e) { setBusy(false); return toast(errText(e), 'error') }
    }
    setBusy(true)
    const { error } = await supabase.from('sazas').update({ status: 'submitted', proof_url: url }).eq('id', s.id)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast('Bhej diya. Partner check karega 🤞', 'success'); loadCore()
  }
  const sendAppeal = async () => {
    if (!reason.trim()) return toast('Wajah likho', 'warn')
    setBusy(true)
    const { error } = await supabase.from('sazas').update({ status: 'appealed', appeal_reason: reason.trim() }).eq('id', s.id)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast('Appeal bhej di ⚖️', 'success'); setAppeal(false); loadCore()
  }

  return (
    <div className="saza">
      <div className="saza-top"><b>😈 Saza</b><span className="muted small">from {from?.display_name || 'partner'}</span></div>
      {s.reason && <p className="saza-reason">{s.reason}</p>}
      <div className="pills">
        {s.xp_penalty > 0 && <span>-{s.xp_penalty} XP</span>}
        {s.dare && <span>🎯 {s.dare}</span>}
        {s.shame_badge && <span>{s.shame_badge}</span>}
        {s.lock_rewards && <span>🔒 Locked</span>}
      </div>
      {s.status === 'submitted' && <p className="saza-note">⏳ Partner check kar raha hai</p>}
      {s.status === 'appealed' && <p className="saza-note"><Gavel size={14} /> Appeal pending</p>}
      {s.status === 'active' && (
        <div className="row-btns">
          {s.dare && <Btn size="sm" kind="danger" loading={busy} onClick={() => submit(true)}><Camera size={15} /> Proof</Btn>}
          {s.dare && <Btn size="sm" kind="secondary" disabled={busy} onClick={() => submit(false)}>Done</Btn>}
          {canAppeal && <Btn size="sm" kind="ghost" disabled={busy} onClick={() => setAppeal(true)}><Gavel size={15} /> Appeal</Btn>}
        </div>
      )}
      <Photo src={s.proof_url} />
      <Sheet open={appeal} onClose={() => setAppeal(false)} title="Appeal">
        <p className="muted small">Ek neutral group member faisla karega. Jeet gaye to XP wapas.</p>
        <textarea className="input area" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Ye saza unfair kyun hai?" />
        <Btn className="wide" loading={busy} onClick={sendAppeal}>Send appeal</Btn>
      </Sheet>
    </div>
  )
}

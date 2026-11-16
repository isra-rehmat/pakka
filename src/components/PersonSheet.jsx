import { useEffect, useMemo, useState } from 'react'
import { Hand, PartyPopper, Check, X, ShieldCheck, UserMinus, Flame } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import {
  today, dayStr, addDays, isScheduled, doneSets, missedDays, streakFor, levelFromXp, timeAgo, shortDay,
  DARES, SHAME_BADGES, POKES, CHEERS
} from '../lib/utils'
import { checkAchievements } from '../lib/achievements'
import { Avatar, Btn, Chips, Sheet, Photo, Toggle } from './ui'

export async function loadPerson(id) {
  const since = dayStr(addDays(new Date(), -21))
  const [h, c] = await Promise.all([
    supabase.rpc('habits_for', { p_user: id }),
    supabase.from('checkins').select('*').eq('user_id', id).gte('day', since).order('created_at', { ascending: false }).limit(500)
  ])
  return { habits: h.data || [], checkins: c.data || [] }
}

export function summarize(sum) {
  if (!sum) return { done: 0, total: 0, missed: 0, pending: 0 }
  const sets = doneSets(sum.checkins)
  const now = new Date(), t = today()
  const sched = sum.habits.filter((h) => isScheduled(h, now))
  const done = sched.filter((h) => sum.checkins.some((c) => c.habit_id === h.id && c.day === t && c.status === 'done')).length
  const missed = sum.habits.reduce((n, h) => n + missedDays(h, sets[h.id] || new Set(), 7).length, 0)
  const pending = sum.checkins.filter((c) => c.status === 'pending').length
  return { done, total: sched.length, missed, pending }
}

export default function PersonSheet({ id, groupId, onClose }) {
  const { uid, me, people, partnerships, accountees, version, toast, loadCore, shameOf, lockedOf, activeSazasFor, celebrate, isAdmin, membersOf } = useApp()
  const p = people[id]
  const iCheckThem = accountees.includes(id)
  const theyCheckMe = partnerships.find((x) => x.user_id === uid && x.partner_id === id)
  const [sum, setSum] = useState(null)
  const [saza, setSaza] = useState(false)
  const [busy, setBusy] = useState(null)
  const [menu, setMenu] = useState(null)

  useEffect(() => { loadPerson(id).then(setSum) }, [id, version])
  const sets = useMemo(() => doneSets(sum?.checkins || []), [sum])
  if (!p) return null
  const sazas = activeSazasFor(id)
  const pending = (sum?.checkins || []).filter((c) => c.status === 'pending')
  const habitById = Object.fromEntries((sum?.habits || []).map((h) => [h.id, h]))
  const t = today()
  const memberRole = groupId ? membersOf(groupId).find((m) => m.user_id === id)?.role : null

  const send = async (type, text) => {
    setMenu(null)
    const key = `pakka_cd_${type}_${id}`
    if (Date.now() - Number(localStorage.getItem(key) || 0) < 60000) return toast('1 minute baad dobara', 'warn')
    const { error } = await supabase.from('notifications').insert({ user_id: id, from_id: uid, type, message: `${type === 'poke' ? '👉' : '🎉'} ${me.display_name}: ${text}` })
    if (error) return toast(errText(error), 'error')
    localStorage.setItem(key, String(Date.now()))
    toast(type === 'poke' ? 'Poke bheja 👉' : 'Cheer bheja 🎉', 'success')
    if (type === 'cheer') {
      const un = await checkAchievements(uid, {})
      for (const a of un) { toast(`🏅 ${a.name} unlocked!`, 'success'); celebrate() }
    }
  }
  const askPartner = async () => {
    const { error } = await supabase.from('partnerships').insert({ user_id: uid, partner_id: id })
    if (error) return toast(errText(error), 'error')
    toast('Request bhej di 🤝', 'success'); loadCore()
  }
  const review = async (c, status) => {
    setBusy(c.id)
    const { error } = await supabase.from('checkins').update({ status }).eq('id', c.id)
    setBusy(null)
    if (error) return toast(errText(error), 'error')
    toast(status === 'done' ? 'Approved' : 'Rejected', 'success')
    loadCore(); loadPerson(id).then(setSum)
  }
  const resolveSaza = async (s, status) => {
    const q = { done: 'Saza poori maan li?', forgiven: 'Maaf karna hai?', active: 'Proof reject karna hai?' }[status]
    if (!confirm(q)) return
    setBusy(s.id)
    const { error } = await supabase.from('sazas').update({ status }).eq('id', s.id)
    setBusy(null)
    if (error) return toast(errText(error), 'error')
    loadCore()
  }
  const release = async () => {
    const ps = partnerships.find((x) => x.user_id === id && x.partner_id === uid)
    if (!ps || !confirm(`${p.display_name} ki partnership khatam karni hai?`)) return
    const { error } = await supabase.from('partnerships').delete().eq('id', ps.id)
    if (error) return toast(errText(error), 'error')
    loadCore(); onClose()
  }
  const removeFromGroup = async () => {
    if (!confirm(`${p.display_name} ko group se nikalna hai?`)) return
    const { error } = await supabase.rpc('remove_member', { p_group: groupId, p_user: id })
    if (error) return toast(errText(error), 'error')
    toast('Remove kar diya', 'info'); loadCore(); onClose()
  }

  return (
    <Sheet open onClose={onClose} title="" tall>
      <div className="person-head">
        <Avatar p={p} size={60} locked={lockedOf(id)} />
        <div className="grow">
          <h3>{p.display_name}</h3>
          <div className="muted small">LVL {levelFromXp(p.xp)} · {p.title}</div>
          {p.bio && <p className="bio">{p.bio}</p>}
          {shameOf(id) && <span className="shame">{shameOf(id)}</span>}
        </div>
      </div>

      {id !== uid && (
        <div className="actions">
          <div className="menu-wrap">
            <Btn kind="secondary" size="sm" onClick={() => setMenu(menu === 'poke' ? null : 'poke')}><Hand size={15} /> Poke</Btn>
            {menu === 'poke' && <div className="menu-pop">{POKES.map((m) => <button key={m} onClick={() => send('poke', m)}>{m}</button>)}</div>}
          </div>
          <div className="menu-wrap">
            <Btn kind="secondary" size="sm" onClick={() => setMenu(menu === 'cheer' ? null : 'cheer')}><PartyPopper size={15} /> Cheer</Btn>
            {menu === 'cheer' && <div className="menu-pop">{CHEERS.map((m) => <button key={m} onClick={() => send('cheer', m)}>{m}</button>)}</div>}
          </div>
          {iCheckThem && <Btn kind="danger" size="sm" onClick={() => setSaza(true)}>😈 Saza</Btn>}
          {!theyCheckMe && <Btn kind="ghost" size="sm" onClick={askPartner}><ShieldCheck size={15} /> Make my partner</Btn>}
        </div>
      )}
      {theyCheckMe && <p className="muted small">{theyCheckMe.status === 'active' ? '🛡️ Ye tumhare partner hain' : '⏳ Partner request pending'}</p>}

      {iCheckThem && pending.length > 0 && (
        <>
          <h4 className="sub">Approve</h4>
          {pending.map((c) => (
            <div key={c.id} className="card col">
              <div className="row-line">
                <b>{habitById[c.habit_id]?.emoji} {habitById[c.habit_id]?.title || 'Habit'}</b>
                <span className="muted small">{c.day === t ? 'Today' : shortDay(c.day)} · {timeAgo(c.created_at)}</span>
              </div>
              <Photo src={c.proof_url} />
              <div className="row-btns">
                <Btn size="sm" loading={busy === c.id} onClick={() => review(c, 'done')}><Check size={15} /> Approve</Btn>
                <Btn size="sm" kind="ghost" disabled={busy === c.id} onClick={() => review(c, 'rejected')}><X size={15} /> Reject</Btn>
              </div>
            </div>
          ))}
        </>
      )}

      {sazas.length > 0 && (
        <>
          <h4 className="sub">Saza</h4>
          {sazas.map((s) => (
            <div key={s.id} className="card col saza-card">
              <div className="pills">
                {s.xp_penalty > 0 && <span>-{s.xp_penalty} XP</span>}
                {s.dare && <span>🎯 {s.dare}</span>}
                {s.shame_badge && <span>{s.shame_badge}</span>}
                {s.lock_rewards && <span>🔒</span>}
              </div>
              <small className="muted">by {people[s.issued_by]?.display_name} · {timeAgo(s.created_at)} · {{ active: 'active', submitted: 'proof sent', appealed: 'appeal pending' }[s.status] || s.status}</small>
              <Photo src={s.proof_url} />
              {iCheckThem && s.issued_by === uid && s.status !== 'appealed' && (
                <div className="row-btns">
                  {s.status === 'submitted' && <Btn size="sm" loading={busy === s.id} onClick={() => resolveSaza(s, 'done')}>Accept</Btn>}
                  {s.status === 'submitted' && <Btn size="sm" kind="ghost" disabled={busy === s.id} onClick={() => resolveSaza(s, 'active')}>Reject</Btn>}
                  {s.status === 'active' && <Btn size="sm" kind="ghost" disabled={busy === s.id} onClick={() => resolveSaza(s, 'forgiven')}>Forgive</Btn>}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {sum && sum.habits.length > 0 && (
        <>
          <h4 className="sub">Habits</h4>
          <div className="list">
            {sum.habits.map((h) => {
              const s = sets[h.id] || new Set()
              const miss = missedDays(h, s, 7)
              const tc = sum.checkins.find((c) => c.habit_id === h.id && c.day === t)
              const status = !isScheduled(h, new Date()) ? 'off' : !tc ? 'left' : tc.status
              return (
                <div key={h.id} className="mini">
                  <span className="habit-emoji sm">{h.emoji}</span>
                  <span className="grow">
                    <b>{h.title}</b>
                    <small className="muted">
                      {streakFor(h, s) > 0 && <><Flame size={11} /> {streakFor(h, s)} · </>}
                      {status === 'done' ? 'done ✓' : status === 'pending' ? 'waiting' : status === 'off' ? 'off today' : status === 'rejected' ? 'rejected' : 'not yet'}
                      {miss.length > 0 && <span className="bad"> · {miss.length} missed</span>}
                    </small>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="danger-zone">
        {iCheckThem && <button className="link-btn danger-text" onClick={release}>End partnership</button>}
        {groupId && isAdmin(groupId) && id !== uid && memberRole !== 'admin' && (
          <button className="link-btn danger-text" onClick={removeFromGroup}><UserMinus size={14} /> Remove from group</button>
        )}
      </div>
      {saza && <SazaForm target={p} onClose={() => setSaza(false)} />}
    </Sheet>
  )
}

function SazaForm({ target, onClose }) {
  const { toast, loadCore } = useApp()
  const [opts, setOpts] = useState(null)
  const [habitId, setHabitId] = useState(null)
  const [reason, setReason] = useState('')
  const [xp, setXp] = useState(0)
  const [dare, setDare] = useState('')
  const [custom, setCustom] = useState('')
  const [badge, setBadge] = useState('')
  const [lock, setLock] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('saza_options', { p_user: target.id }).then(({ data }) => {
      setOpts(data || { allowed: false, habits: [] })
      const first = data?.habits?.[0]
      if (first) pick(first)
    })
  }, [target.id])

  const pick = (h) => {
    setHabitId(h.habit_id)
    setReason(`${h.title}: ${h.missed.length} din miss (${h.missed.map(shortDay).join(', ')})`)
    setXp(Math.min(10, h.missed.length * 10))
  }
  const sel = opts?.habits?.find((h) => h.habit_id === habitId)
  const max = sel ? sel.missed.length * 10 : 0
  const xpOptions = [...new Set([0, 10, 20, 30, 50, max].filter((v) => v <= max))].sort((a, b) => a - b)
  const finalDare = dare === 'custom' ? custom.trim() : dare

  const send = async () => {
    if (!reason.trim()) return toast('Wajah likho', 'warn')
    if (!xp && !finalDare && !badge && !lock) return toast('Kuch to chuno', 'warn')
    setBusy(true)
    const { error } = await supabase.from('sazas').insert({
      target_id: target.id, habit_id: habitId, reason: reason.trim(), xp_penalty: xp,
      dare: finalDare || null, shame_badge: badge || null, lock_rewards: lock
    })
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast(`Saza bhej di 😈`, 'success'); loadCore(); onClose()
  }

  let body
  if (!opts) body = <div className="skeleton" />
  else if (!opts.allowed) body = <p className="muted">Aik din mein aik hi Saza. Agli baar {opts.next_at ? new Date(opts.next_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'kal'} ⏳</p>
  else if (!opts.habits.length) body = <p className="muted">Pichle 7 din mein koi miss nahi. Saza nahi de sakte 🙅</p>
  else body = (
    <>
      <label className="label">Missed habit</label>
      <Chips options={opts.habits.map((h) => ({ value: h.habit_id, label: `${h.emoji} ${h.title} · ${h.missed.length}d` }))} value={habitId}
        onChange={(v) => pick(opts.habits.find((h) => h.habit_id === v))} />
      <label className="label">Reason</label>
      <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      <label className="label">XP cut <span className="muted">(max {max})</span></label>
      <Chips options={xpOptions.map((v) => ({ value: v, label: v ? `-${v}` : 'None' }))} value={xp} onChange={setXp} />
      <label className="label">Dare</label>
      <Chips options={[{ value: '', label: 'None' }, ...DARES.map((d) => ({ value: d, label: d })), { value: 'custom', label: 'Custom' }]} value={dare} onChange={setDare} />
      {dare === 'custom' && <input className="input" value={custom} maxLength={200} onChange={(e) => setCustom(e.target.value)} placeholder="Apni dare likho" />}
      <label className="label">Shame badge</label>
      <Chips options={[{ value: '', label: 'None' }, ...SHAME_BADGES.map((b) => ({ value: b, label: b }))]} value={badge} onChange={setBadge} />
      <div className="toggle-row"><span><b>Lock rewards</b><small className="muted">No XP + no avatar change until done</small></span><Toggle on={lock} onChange={setLock} /></div>
      <Btn kind="danger" className="wide" loading={busy} onClick={send}>Send Saza</Btn>
      <p className="muted small center">Wo 24 ghante mein appeal kar sakte hain</p>
    </>
  )
  return <Sheet open onClose={onClose} title={`Saza · ${target.display_name}`} tall>{body}</Sheet>
}

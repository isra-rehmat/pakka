import { useEffect, useState } from 'react'
import { Pencil, Award, History, Bell, Download, Shield, LogOut } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import { AVATARS, TITLES, levelProgress, timeAgo } from '../lib/utils'
import { ACHIEVEMENTS } from '../lib/achievements'
import { pushState, enablePush, disablePush, isStandalone } from '../lib/push'
import { Avatar, Btn, Chips, EmojiGrid, Sheet, XpBar, Row, Toggle } from '../components/ui'

export default function Me() {
  const { uid, me, version, lockedOf, shameOf } = useApp()
  const [sheet, setSheet] = useState(null)
  const [ach, setAch] = useState([])
  const [canInstall, setCanInstall] = useState(!!window.__pakkaInstall)
  const lp = levelProgress(me.xp)

  useEffect(() => {
    supabase.from('achievements').select('*').eq('user_id', uid).then(({ data }) => setAch(data || []))
  }, [version, uid])
  useEffect(() => {
    const on = () => setCanInstall(true)
    window.addEventListener('pakka:installable', on)
    return () => window.removeEventListener('pakka:installable', on)
  }, [])

  const install = async () => {
    const p = window.__pakkaInstall
    if (!p) return
    p.prompt()
    await p.userChoice.catch(() => null)
    window.__pakkaInstall = null; setCanInstall(false)
  }

  return (
    <div className="me">
      <section className="profile">
        <Avatar p={me} size={64} locked={lockedOf(uid)} />
        <div className="grow">
          <h2>{me.display_name}</h2>
          <div className="muted small">LVL {lp.lvl} · {me.title}</div>
          {me.bio && <p className="bio">{me.bio}</p>}
          {shameOf(uid) && <span className="shame">{shameOf(uid)}</span>}
        </div>
        <button className="icon-btn" onClick={() => setSheet('edit')} aria-label="Edit"><Pencil size={17} /></button>
      </section>
      <div className="xp-block">
        <XpBar pct={lp.pct} />
        <small className="muted">{me.xp} XP · {lp.need - lp.into} to level {lp.lvl + 1}</small>
      </div>

      <div className="rows">
        <Row icon={<Award size={19} />} title="Achievements" sub={`${ach.length}/${ACHIEVEMENTS.length}`} chevron onClick={() => setSheet('ach')} />
        <Row icon={<History size={19} />} title="XP history" chevron onClick={() => setSheet('xp')} />
        <Row icon={<Bell size={19} />} title="Notifications" chevron onClick={() => setSheet('notif')} />
        {!isStandalone() && canInstall && <Row icon={<Download size={19} />} title="Install app" sub="Add Pakka to your home screen" onClick={install} />}
        <Row icon={<Shield size={19} />} title="Privacy" chevron onClick={() => window.open(`${import.meta.env.BASE_URL}privacy.html`, '_blank')} />
        <Row icon={<LogOut size={19} />} title="Log out" onClick={async () => { if (confirm('Log out?')) await supabase.auth.signOut() }} />
      </div>
      <p className="muted small center">Pakka v2.0</p>

      <EditProfile open={sheet === 'edit'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'ach'} onClose={() => setSheet(null)} title="Achievements" tall>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = ach.some((x) => x.code === a.code)
            return (
              <div key={a.code} className={'ach' + (got ? ' got' : '')}>
                <span className="ach-icon">{got ? a.icon : '🔒'}</span>
                <b>{a.name}</b>
                <small>{a.desc}</small>
              </div>
            )
          })}
        </div>
      </Sheet>
      {sheet === 'xp' && <XpHistory onClose={() => setSheet(null)} />}
      {sheet === 'notif' && <NotifSettings onClose={() => setSheet(null)} />}
    </div>
  )
}

function XpHistory({ onClose }) {
  const { uid } = useApp()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('xp_events').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(40).then(({ data }) => setRows(data || []))
  }, [uid])
  return (
    <Sheet open onClose={onClose} title="XP history" tall>
      {rows === null ? <div className="skeleton" /> : rows.length === 0 ? <p className="muted">Abhi koi XP nahi.</p> : rows.map((e) => (
        <div key={e.id} className="xp-row">
          <span className="grow">{e.reason}</span>
          <span className={e.amount >= 0 ? 'plus' : 'minus'}>{e.amount >= 0 ? '+' : ''}{e.amount}</span>
          <small className="muted">{timeAgo(e.created_at)}</small>
        </div>
      ))}
    </Sheet>
  )
}

function NotifSettings({ onClose }) {
  const { uid, me, toast, loadCore } = useApp()
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setState) }, [])

  const togglePush = async (on) => {
    setBusy(true)
    try {
      if (on) { await enablePush(); toast('Notifications on 🔔', 'success') } else { await disablePush(); toast('Notifications off', 'info') }
      setState(await pushState())
    } catch (e) { toast(errText(e), 'error') }
    setBusy(false)
  }
  const setPref = async (key, val) => {
    const { error } = await supabase.from('profiles').update({ [key]: val }).eq('id', uid)
    if (error) return toast(errText(error), 'error')
    loadCore()
  }
  const test = async () => {
    const { error } = await supabase.rpc('push_test')
    if (error) return toast(errText(error), 'error')
    toast('Test bheja. 5 second mein aana chahiye', 'info')
  }

  const note = {
    denied: 'Notifications blocked hain. Phone settings > Apps > Chrome/Pakka > Notifications se allow karo.',
    unsupported: 'Is browser mein notifications nahi chalti. Chrome use karo.',
    'ios-install': 'iPhone par: Safari mein Share > "Add to Home Screen", phir app wahan se kholo.'
  }[state]

  return (
    <Sheet open onClose={onClose} title="Notifications">
      <div className="toggle-row"><span><b>Phone notifications</b><small className="muted">Pokes, Saza, approvals, requests</small></span>
        <Toggle on={state === 'on'} disabled={busy || ['denied', 'unsupported', 'ios-install', 'loading'].includes(state)} onChange={togglePush} /></div>
      {note && <p className="notice-text">{note}</p>}
      <div className="toggle-row"><span><b>Group chat messages</b></span><Toggle on={me.push_chat} onChange={(v) => setPref('push_chat', v)} /></div>
      <div className="toggle-row"><span><b>9 PM reminder</b><small className="muted">Only if habits are left</small></span><Toggle on={me.push_reminder} onChange={(v) => setPref('push_reminder', v)} /></div>
      {state === 'on' && <Btn kind="secondary" className="wide" onClick={test}>Send test notification</Btn>}
    </Sheet>
  )
}

function EditProfile({ open, onClose }) {
  const { uid, me, toast, loadCore, lockedOf } = useApp()
  const [name, setName] = useState(me.display_name)
  const [bio, setBio] = useState(me.bio || '')
  const [avatar, setAvatar] = useState(me.avatar)
  const [title, setTitle] = useState(me.title)
  const [busy, setBusy] = useState(false)
  const lvl = levelProgress(me.xp).lvl
  const locked = lockedOf(uid)

  useEffect(() => { if (open) { setName(me.display_name); setBio(me.bio || ''); setAvatar(me.avatar); setTitle(me.title) } }, [open])

  const all = AVATARS.flatMap((a) => a.list)
  const lockedAv = new Set(AVATARS.filter((a) => a.lvl > lvl).flatMap((a) => a.list))

  const save = async () => {
    if (!name.trim()) return toast('Naam likho', 'warn')
    setBusy(true)
    const row = { display_name: name.trim().slice(0, 40), bio: bio.trim().slice(0, 120) || null }
    if (!locked) { row.avatar = avatar; row.title = title }
    const { error } = await supabase.from('profiles').update(row).eq('id', uid)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast('Saved', 'success'); loadCore(); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit profile" tall>
      <label className="label">Name</label>
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <label className="label">Bio <span className="muted">{bio.length}/120</span></label>
      <textarea className="input area" value={bio} maxLength={120} onChange={(e) => setBio(e.target.value)} placeholder="Apne baare mein ek line" />
      {locked ? <p className="notice-text">🔒 Saza khatam hone tak avatar aur title locked hain.</p> : (
        <>
          <label className="label">Avatar</label>
          <EmojiGrid list={all} value={avatar} onChange={setAvatar} lockedSet={lockedAv} />
          <label className="label">Title</label>
          <Chips options={TITLES.map((t) => ({ value: t.t, label: t.lvl <= lvl ? t.t : `🔒 LVL ${t.lvl}` }))} value={title}
            onChange={(v) => { if (TITLES.find((t) => t.t === v)?.lvl <= lvl) setTitle(v); else toast('Abhi locked hai', 'warn') }} />
        </>
      )}
      <Btn className="wide" loading={busy} onClick={save}>Save</Btn>
    </Sheet>
  )
}

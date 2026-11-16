import { useState } from 'react'
import { Crown, Share2, LogOut, Copy } from 'lucide-react'
import { useApp } from '../../App'
import { supabase, errText } from '../../supabase'
import { shareInvite, whatsappInvite, inviteText } from '../../lib/utils'
import { Avatar, Btn } from '../../components/ui'
import PersonSheet from '../../components/PersonSheet'

export default function Members({ g }) {
  const { uid, people, membersOf, isAdmin, adminRequests, toast, loadCore, closeGroup, lockedOf, shameOf } = useApp()
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const admin = isAdmin(g.id)
  const reqs = adminRequests.filter((r) => r.group_id === g.id)
  const list = [...membersOf(g.id)].sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.joined_at.localeCompare(b.joined_at))

  const respond = async (r, accept) => {
    setBusy(r.user_id)
    const { error } = await supabase.rpc('respond_join', { p_group: g.id, p_user: r.user_id, p_accept: accept })
    setBusy(null)
    if (error) return toast(errText(error), 'error')
    toast(accept ? 'Added to group' : 'Declined', 'success'); loadCore()
  }
  const leave = async () => {
    if (!confirm(`"${g.name}" chhorna hai?`)) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', uid)
    if (error) return toast(errText(error), 'error')
    closeGroup(); loadCore()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteText(g).text); toast('Copied', 'success') } catch { toast(g.invite_code) }
  }

  return (
    <div className="pad">
      {admin && reqs.length > 0 && (
        <>
          <h4 className="sub">Join requests</h4>
          {reqs.map((r) => (
            <div key={r.user_id} className="mini card">
              <Avatar p={people[r.user_id]} size={36} />
              <span className="grow"><b>{people[r.user_id]?.display_name || 'Someone'}</b>{people[r.user_id]?.bio && <small className="muted">{people[r.user_id].bio}</small>}</span>
              <Btn size="sm" loading={busy === r.user_id} onClick={() => respond(r, true)}>Accept</Btn>
              <Btn size="sm" kind="ghost" disabled={busy === r.user_id} onClick={() => respond(r, false)}>No</Btn>
            </div>
          ))}
        </>
      )}

      <div className="invite">
        <div><small className="muted">Invite code</small><b className="code">{g.invite_code}</b></div>
        <button className="icon-btn" onClick={copy} aria-label="Copy"><Copy size={17} /></button>
        <button className="pill wa" onClick={() => whatsappInvite(g)}>WhatsApp</button>
        <button className="icon-btn" onClick={() => shareInvite(g, toast)} aria-label="Share"><Share2 size={17} /></button>
      </div>
      {admin && <p className="muted small">New members need your approval.</p>}

      <h4 className="sub">{list.length} members</h4>
      <div className="list">
        {list.map((m) => {
          const p = people[m.user_id]
          return (
            <button key={m.user_id} className="mini" onClick={() => setOpen(m.user_id)}>
              <Avatar p={p} size={38} locked={lockedOf(m.user_id)} />
              <span className="grow">
                <b>{p?.display_name || 'Member'}{m.user_id === uid && <span className="muted"> (you)</span>}</b>
                <small className="muted">{p?.bio || p?.title}</small>
              </span>
              {shameOf(m.user_id) && <span className="shame xs">{shameOf(m.user_id)}</span>}
              {m.role === 'admin' && <span className="pill"><Crown size={12} /> Admin</span>}
            </button>
          )
        })}
      </div>
      <button className="link-btn danger-text" onClick={leave}><LogOut size={14} /> Leave group</button>
      {open && <PersonSheet id={open} groupId={g.id} onClose={() => setOpen(null)} />}
    </div>
  )
}

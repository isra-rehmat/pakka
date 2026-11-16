import { useEffect, useState } from 'react'
import { Plus, Gavel, ChevronRight } from 'lucide-react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import { timeAgo } from '../lib/utils'
import { Avatar, Btn, Empty, Sheet, Section } from '../components/ui'
import PersonSheet, { loadPerson, summarize } from '../components/PersonSheet'

export default function Partners() {
  const { uid, people, accountees, requests, myPartners, circle, appealsToJudge, version, toast, loadCore, shameOf, lockedOf, activeSazasFor } = useApp()
  const [open, setOpen] = useState(null)
  const [add, setAdd] = useState(false)
  const [judge, setJudge] = useState(null)
  const [sums, setSums] = useState({})

  useEffect(() => {
    let alive = true
    Promise.all(accountees.map(async (id) => [id, await loadPerson(id)])).then((r) => alive && setSums(Object.fromEntries(r)))
    return () => { alive = false }
  }, [version, accountees.join(',')])

  const accept = async (r) => {
    const { error } = await supabase.from('partnerships').update({ status: 'active' }).eq('id', r.id)
    if (error) return toast(errText(error), 'error')
    toast(`Ab tum ${people[r.user_id]?.display_name} ke partner ho 😈`, 'success'); loadCore()
  }
  const decline = async (r) => {
    const { error } = await supabase.from('partnerships').delete().eq('id', r.id)
    if (error) return toast(errText(error), 'error')
    loadCore()
  }
  const cancel = async (p) => {
    if (!confirm('Request cancel karni hai?')) return
    await supabase.from('partnerships').delete().eq('id', p.id)
    loadCore()
  }

  const nothing = !requests.length && !appealsToJudge.length && !accountees.length && !myPartners.length

  return (
    <div className="partners">
      {nothing && <Empty icon="🛡️" title="Koi partner nahi" sub="Partner tumhari habits check karta hai aur miss par Saza de sakta hai." />}

      {requests.length > 0 && (
        <Section title="Requests">
          {requests.map((r) => (
            <div key={r.id} className="mini card">
              <Avatar p={people[r.user_id]} size={36} />
              <span className="grow"><b>{people[r.user_id]?.display_name}</b><small className="muted">wants you as their partner</small></span>
              <Btn size="sm" onClick={() => accept(r)}>Accept</Btn>
              <Btn size="sm" kind="ghost" onClick={() => decline(r)}>No</Btn>
            </div>
          ))}
        </Section>
      )}

      {appealsToJudge.length > 0 && (
        <Section title="Appeals to judge">
          {appealsToJudge.map((s) => (
            <button key={s.id} className="mini card" onClick={() => setJudge(s)}>
              <Gavel size={18} />
              <span className="grow"><b>{people[s.target_id]?.display_name} vs {people[s.issued_by]?.display_name}</b><small className="muted">{timeAgo(s.appealed_at || s.created_at)} ago</small></span>
              <ChevronRight size={18} className="muted" />
            </button>
          ))}
        </Section>
      )}

      {accountees.length > 0 && (
        <Section title="You keep in check">
          <div className="list">
            {accountees.map((id) => {
              const s = summarize(sums[id])
              const sub = activeSazasFor(id).some((x) => x.status === 'submitted')
              return (
                <button key={id} className="mini" onClick={() => setOpen(id)}>
                  <Avatar p={people[id]} size={38} locked={lockedOf(id)} />
                  <span className="grow">
                    <b>{people[id]?.display_name}</b> {shameOf(id) && <span className="shame xs">{shameOf(id)}</span>}
                    <small className="stats-line">
                      <span>{s.done}/{s.total} today</span>
                      {s.missed > 0 && <span className="bad">{s.missed} missed</span>}
                      {s.pending > 0 && <span className="warn">{s.pending} to approve</span>}
                      {sub && <span className="warn">saza proof</span>}
                    </small>
                  </span>
                  <ChevronRight size={18} className="muted" />
                </button>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Your partners" action={<button className="icon-btn" onClick={() => setAdd(true)} aria-label="Add partner"><Plus size={20} /></button>}>
        {myPartners.length === 0 ? <p className="muted small">Kisi apne ko partner banao jo tumhe check kare.</p> : (
          <div className="list">
            {myPartners.map((p) => (
              <div key={p.id} className="mini">
                <Avatar p={people[p.partner_id]} size={36} />
                <span className="grow"><b>{people[p.partner_id]?.display_name || 'Someone'}</b><small className="muted">{p.status === 'active' ? 'Active' : 'Pending'}</small></span>
                {p.status === 'pending' && <button className="link-btn" onClick={() => cancel(p)}>Cancel</button>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Sheet open={add} onClose={() => setAdd(false)} title="Choose a partner">
        <p className="muted small">They can see your habits, approve proofs and give Saza for misses.</p>
        {circle.filter((id) => !myPartners.some((p) => p.partner_id === id)).map((id) => (
          <button key={id} className="mini" onClick={async () => {
            const { error } = await supabase.from('partnerships').insert({ user_id: uid, partner_id: id })
            if (error) return toast(errText(error), 'error')
            toast('Request bhej di 🤝', 'success'); setAdd(false); loadCore()
          }}>
            <Avatar p={people[id]} size={36} />
            <span className="grow"><b>{people[id]?.display_name}</b><small className="muted">{people[id]?.bio || people[id]?.title}</small></span>
            <span className="pill">Ask</span>
          </button>
        ))}
        {circle.length === 0 && <p className="muted small">Pehle family ko group mein bulao.</p>}
      </Sheet>
      {open && <PersonSheet id={open} onClose={() => setOpen(null)} />}
      {judge && <JudgeSheet s={judge} onClose={() => setJudge(null)} />}
    </div>
  )
}

function JudgeSheet({ s, onClose }) {
  const { people, toast, loadCore } = useApp()
  const [busy, setBusy] = useState(false)
  const decide = async (status) => {
    setBusy(true)
    const { error } = await supabase.from('sazas').update({ status }).eq('id', s.id)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    toast(status === 'overturned' ? 'Saza cancel kar di' : 'Saza qaim rakhi', 'success'); loadCore(); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Appeal">
      <div className="card col">
        <small className="muted">{people[s.issued_by]?.display_name} ne Saza di</small>
        <b>{s.reason}</b>
        <div className="pills">
          {s.xp_penalty > 0 && <span>-{s.xp_penalty} XP</span>}
          {s.dare && <span>🎯 {s.dare}</span>}
          {s.shame_badge && <span>{s.shame_badge}</span>}
          {s.lock_rewards && <span>🔒</span>}
        </div>
      </div>
      <div className="card col">
        <small className="muted">{people[s.target_id]?.display_name} ka jawab</small>
        <b>{s.appeal_reason}</b>
      </div>
      <p className="muted small">Tum neutral judge ho. Faisla final hai.</p>
      <div className="row-btns">
        <Btn loading={busy} onClick={() => decide('overturned')}>Cancel Saza</Btn>
        <Btn kind="secondary" disabled={busy} onClick={() => decide('active')}>Keep Saza</Btn>
      </div>
    </Sheet>
  )
}

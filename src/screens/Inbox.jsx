import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { supabase } from '../supabase'
import { timeAgo } from '../lib/utils'
import { Avatar, Empty, Sheet } from '../components/ui'

const TO_PARTNERS = ['approval_needed', 'saza_submitted', 'partner_request', 'saza_appeal']
const TO_GROUP = ['join_request', 'join_approved']

export default function Inbox({ open, onClose }) {
  const { uid, people, setTab, showGroup } = useApp()
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!open) return
    setItems(null)
    supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => {
        setItems(data || [])
        supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false).then(() => {})
      })
  }, [open, uid])

  const go = (n) => {
    onClose()
    setTimeout(() => {
      if (TO_PARTNERS.includes(n.type)) setTab('partners')
      else if (TO_GROUP.includes(n.type) && n.ref_id) { setTab('groups'); showGroup(n.ref_id, n.type === 'join_request' ? 'members' : 'chat') }
      else setTab('home')
    }, 50)
  }
  const clearAll = async () => {
    if (!confirm('Sab clear karna hai?')) return
    await supabase.from('notifications').delete().eq('user_id', uid)
    setItems([])
  }

  return (
    <Sheet open={open} onClose={onClose} title="Inbox" tall action={items?.length ? <button className="link-btn" onClick={clearAll}>Clear</button> : null}>
      {items === null ? <div className="skeleton" /> : items.length === 0 ? <Empty icon="📭" title="All quiet" /> : (
        <div className="list">
          {items.map((n) => (
            <button key={n.id} className={'mini notif' + (n.read ? '' : ' unread')} onClick={() => go(n)}>
              <Avatar p={people[n.from_id]} size={34} />
              <span className="grow"><span className="notif-msg">{n.message}</span><small className="muted">{timeAgo(n.created_at)}</small></span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../../App'
import { supabase } from '../../supabase'
import { today, dayStr, addDays, isScheduled, doneSets } from '../../lib/utils'
import { Avatar, Btn, Empty } from '../../components/ui'
import { HabitRow, HabitForm, HabitDetail, useCheckin } from '../../components/habits'

export default function Tasks({ g }) {
  const { uid, people, isAdmin, membersOf, version } = useApp()
  const [tasks, setTasks] = useState(null)
  const [checks, setChecks] = useState([])
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const admin = isAdmin(g.id)
  const members = membersOf(g.id)

  const load = async () => {
    const { data: hs } = await supabase.from('habits').select('*').eq('group_id', g.id).eq('archived', false).order('created_at')
    const ids = (hs || []).map((h) => h.id)
    const { data: cs } = ids.length
      ? await supabase.from('checkins').select('*').in('habit_id', ids).gte('day', dayStr(addDays(new Date(), -60))).limit(1000)
      : { data: [] }
    const myJoin = members.find((m) => m.user_id === uid)?.joined_at
    setTasks((hs || []).map((h) => ({ ...h, since: myJoin && myJoin > h.created_at ? myJoin : h.created_at })))
    setChecks(cs || [])
  }
  useEffect(() => { load() }, [g.id, version])

  const { checkIn, undo, busyId, after } = useCheckin((row, removedId) => {
    if (row) setChecks((c) => [row, ...c])
    if (removedId) setChecks((c) => c.filter((x) => x.id !== removedId))
  })

  const t = today()
  const mine = useMemo(() => checks.filter((c) => c.user_id === uid), [checks, uid])
  const sets = useMemo(() => doneSets(mine), [mine])

  if (tasks === null) return <div className="pad"><div className="skeleton" /></div>
  return (
    <div className="pad">
      {admin && <Btn kind="secondary" size="sm" onClick={() => setForm({})}><Plus size={15} /> New task</Btn>}
      {tasks.length === 0 ? (
        <Empty icon="📋" title="Koi shared task nahi" sub={admin ? 'Sab ke liye ek task banao, jaise Gym.' : 'Admin yahan shared tasks banayega.'} />
      ) : (
        <div className="list">
          {tasks.map((h) => {
            const todayDone = checks.filter((c) => c.habit_id === h.id && c.day === t && c.status === 'done')
            const sched = isScheduled(h, new Date())
            return (
              <div key={h.id} className="task">
                <HabitRow h={h} c={mine.find((c) => c.habit_id === h.id && c.day === t)} set={sets[h.id]} busy={busyId === h.id} off={!sched}
                  onCheck={() => checkIn(h)} onUndo={(c) => undo(h, c)} onOpen={() => setDetail(h)} />
                {sched && (
                  <div className="task-progress">
                    <span className="faces">{todayDone.slice(0, 6).map((c) => <Avatar key={c.id} p={people[c.user_id]} size={22} />)}</span>
                    <small className="muted">{todayDone.length}/{members.length} done today</small>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <HabitForm open={!!form} habit={form?.id ? form : null} groupId={g.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); after({}) }} />
      {detail && (
        <HabitDetail h={detail} set={sets[detail.id]} total={mine.filter((c) => c.habit_id === detail.id && c.status === 'done').length}
          canEdit={admin} onClose={() => setDetail(null)} onEdit={() => { setForm(detail); setDetail(null) }} onArchived={() => { setDetail(null); load() }} />
      )}
    </div>
  )
}

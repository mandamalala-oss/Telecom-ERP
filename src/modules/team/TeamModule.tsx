import { useState } from 'react'
import { Phone, Mail, Shield, Plus, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import type { User, Task, Project } from '@/types'

const ROLE_COLOR: Record<string, string> = {
  admin:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pm:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  engineer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  finance:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  viewer:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

export function TeamModule() {
  const { data: users, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<User>(TABLES.users, 'Team Member')
  const { data: tasks } = useEntity<Task>(TABLES.tasks)
  const { data: projects } = useEntity<Project>(TABLES.projects)
  const [selected, setSelected] = useState<User | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this team member?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelected(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Members', v: users.length,                                          color: 'text-blue-600' },
          { l: 'Engineers',     v: users.filter(u => u.role === 'engineer').length,        color: 'text-amber-600' },
          { l: 'Project Mgrs',  v: users.filter(u => u.role === 'pm' || u.role === 'admin').length, color: 'text-purple-600' },
          { l: 'Finance',       v: users.filter(u => u.role === 'finance').length,         color: 'text-green-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      <div className="flex justify-end">
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New Team Member</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map(user => {
          const assignedTasks    = tasks.filter(t => t.assigneeId === user.id)
          const activeTasks      = assignedTasks.filter(t => t.status !== 'done')
          const completedTasks   = assignedTasks.filter(t => t.status === 'done')
          const managedProjects  = projects.filter(p => p.pm === user.name || (p.team??[]).includes(user.name))

          return (
            <Card key={user.id} hover padding={false} onClick={() => setSelected(user)}>
              <div className="p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
                    {user.avatar}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{user.name}</h3>
                    <p className="text-sm text-slate-500 truncate">{user.department}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold capitalize ${ROLE_COLOR[user.role] ?? ROLE_COLOR.viewer}`}>
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{user.phone}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-center">
                  <div>
                    <p className="text-lg font-black text-amber-600">{activeTasks.length}</p>
                    <p className="text-xs text-slate-400">Active Tasks</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-green-600">{completedTasks.length}</p>
                    <p className="text-xs text-slate-400">Done</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-brand-600">{managedProjects.length}</p>
                    <p className="text-xs text-slate-400">Projects</p>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {selected && (
        <Modal open title={selected.name} onClose={() => setSelected(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-brand-600 flex items-center justify-center text-white text-3xl font-black flex-shrink-0">
                {selected.avatar}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{selected.name}</h2>
                <p className="text-slate-500">{selected.department}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${ROLE_COLOR[selected.role] ?? ROLE_COLOR.viewer}`}>{selected.role}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Email', v: selected.email },
                { l: 'Phone', v: selected.phone },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Assigned Tasks</p>
              {tasks.filter(t => t.assigneeId === selected.id).length === 0
                ? <p className="text-sm text-slate-400">No tasks assigned.</p>
                : <div className="space-y-2">
                  {tasks.filter(t => t.assigneeId === selected.id).map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{task.title}</p>
                        <p className="text-xs text-slate-500">{task.projectName}</p>
                      </div>
                      <Badge status={task.status} />
                      <Badge status={task.priority} />
                    </div>
                  ))}
                </div>
              }
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Projects Involved</p>
              {projects.filter(p => p.pm === selected.name || (p.team??[]).includes(selected.name)).length === 0
                ? <p className="text-sm text-slate-400">No projects assigned.</p>
                : projects.filter(p => p.pm === selected.name || (p.team??[]).includes(selected.name)).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg mb-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.pm === selected.name ? '👑 Project Manager' : '👷 Team Member'}</p>
                    </div>
                    <Badge status={p.status} />
                  </div>
                ))
              }
            </div>
          </div>
        </Modal>
      )}
      {modal}
    </div>
  )
}

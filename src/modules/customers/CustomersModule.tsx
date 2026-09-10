import { useState, useMemo } from 'react'
import { Plus, Search, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Company, Contact, Invoice } from '@/types'

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(0)}M Ar` : `${n.toLocaleString()} Ar`

const COMPANY_TYPE_LABEL: Record<string, string> = {
  telecom_operator: 'Telecom Operator',
  tower_company: 'Tower Company',
  vendor: 'Vendor',
  subcontractor: 'Subcontractor',
  government: 'Government',
}

type Tab = 'companies' | 'contacts'

export function CustomersModule() {
  const [tab, setTab] = useState<Tab>('companies')
  const { data: allCompanies, error: coErr, openCreate: newCo, openEdit: editCo, remove: removeCo, modal: coModal } = useEntityCrud<Company>(TABLES.companies, 'Company')
  const { data: allContacts, error: ctErr, openCreate: newCt, openEdit: editCt, remove: removeCt, modal: ctModal } = useEntityCrud<Contact>(TABLES.contacts, 'Contact')
  const { data: invoices } = useEntity<Invoice>(TABLES.invoices)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Company | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Customer revenue is derived from real invoice rows (paid / balance),
  // never stored on the company record — a company has many projects over
  // time, so a single revenue column on companies cannot be maintained.
  const finByCustomer = useMemo(() => {
    const m = new Map<string, { invoiced: number; paid: number; balance: number }>()
    for (const inv of invoices) {
      if (!inv.customerId || inv.status === 'cancelled') continue
      const cur = m.get(inv.customerId) ?? { invoiced: 0, paid: 0, balance: 0 }
      cur.invoiced += inv.total ?? 0
      cur.paid += inv.paid ?? 0
      cur.balance += inv.balance ?? 0
      m.set(inv.customerId, cur)
    }
    return m
  }, [invoices])

  const companies = allCompanies.filter(c =>
    (c.name??'').toLowerCase().includes(search.toLowerCase()) ||
    (c.city??'').toLowerCase().includes(search.toLowerCase())
  )

  const contacts = allContacts.filter(c =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    (c.companyName??'').toLowerCase().includes(search.toLowerCase())
  )

  const companyContacts = selected
    ? allContacts.filter(c => c.companyId === selected.id)
    : []

  const handleDeleteCo = async (id: string) => {
    if (!confirm('Delete this company?')) return
    try {
      setActionError(null)
      await Promise.all(allContacts.filter(c => c.companyId === id).map(c => removeCt(c.id!)))
      await removeCo(id)
      setSelected(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const handleDeleteCt = async (id: string) => {
    if (!confirm('Delete this contact?')) return
    try {
      setActionError(null)
      await removeCt(id)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['companies','contacts'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${tab}…`}
              className="pl-9 pr-3 py-2 text-sm input w-56" />
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={tab === 'companies' ? newCo : newCt}>
            New {tab === 'companies' ? 'Company' : 'Contact'}
          </Button>
        </div>
      </div>
      {(coErr || ctErr) && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{coErr || ctErr}</div>}

      {tab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map(co => {
            const fin = finByCustomer.get(co.id)
            return (
              <Card key={co.id} hover padding={false} onClick={() => setSelected(co)} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 font-bold text-sm flex-shrink-0">
                    {co.name.slice(0,2).toUpperCase()}
                  </div>
                  <Badge status={co.status} className="flex-shrink-0" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">{co.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{COMPANY_TYPE_LABEL[co.type]}</p>
                {co.vendor && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1">Vendor: {co.vendor}</p>}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Location</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{co.city}, {co.country}</p>
                  </div>
                  {(fin?.paid ?? 0) > 0 && (
                    <div>
                      <p className="text-xs text-slate-400">Revenue (paid)</p>
                      <p className="text-xs font-semibold text-green-600">{fmt(fin?.paid ?? 0)}</p>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'contacts' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Name','Title','Company','Email','Phone','Primary',''].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className="tr-hover">
                    <td className="td font-semibold">{c.firstName} {c.lastName}</td>
                    <td className="td text-slate-500">{c.title}</td>
                    <td className="td">
                      <span className="text-brand-600 dark:text-brand-400 text-xs font-semibold">{c.companyName}</span>
                    </td>
                    <td className="td text-slate-500 text-xs">{c.email}</td>
                    <td className="td text-slate-500 text-xs">{c.phone}</td>
                    <td className="td">{c.isPrimary && <Badge status="active">Primary</Badge>}</td>
                    <td className="td whitespace-nowrap">
                      <div className="flex gap-1">
                        <button onClick={() => editCt(c)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteCt(c.id!)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Company Detail Modal */}
      {selected && (
        <Modal open title={selected.name} onClose={() => setSelected(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteCo(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editCo(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { l: 'Type',     v: COMPANY_TYPE_LABEL[selected.type] },
                { l: 'Vendor',   v: selected.vendor ?? '—' },
                { l: 'Country',  v: selected.country },
                { l: 'City',     v: selected.city },
                { l: 'Website',  v: selected.website },
                { l: 'Status',   v: selected.status },
                { l: 'Since',    v: selected.createdAt },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Revenue & Invoices</p>
              {(() => {
                const fin = finByCustomer.get(selected.id)
                const invs = invoices.filter(i => i.customerId === selected.id && i.status !== 'cancelled')
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { l: 'Total Invoiced', v: fmt(fin?.invoiced ?? 0) },
                        { l: 'Total Paid',     v: fmt(fin?.paid ?? 0) },
                        { l: 'Open Balance',   v: fmt(fin?.balance ?? 0) },
                      ].map(item => (
                        <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{invs.length} invoice{invs.length !== 1 ? 's' : ''} — revenue is computed from invoices/payments, not stored on the company.</p>
                  </>
                )
              })()}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Contacts</p>
              {companyContacts.length === 0
                ? <p className="text-sm text-slate-400">No contacts yet.</p>
                : companyContacts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-200">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.firstName} {c.lastName}</p>
                      <p className="text-xs text-slate-500">{c.title} · {c.email}</p>
                    </div>
                    {c.isPrimary && <Badge status="active">Primary</Badge>}
                  </div>
                ))
              }
            </div>
          </div>
        </Modal>
      )}

      {coModal}
      {ctModal}
    </div>
  )
}

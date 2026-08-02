import { useState } from 'react'
import { Plus, Download, GitBranch, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { BOQ, BOQItem } from '@/types/v2'

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(2)}M Ar` : `${n.toLocaleString()} Ar`

// Totals are DERIVED from the JSONB items — never trust stored subtotal/grandTotal.
const subtotalOf = (boq: BOQ) => (boq.items ?? []).reduce((s, i) => s + (i.totalCost ?? 0), 0)
const grandTotalOf = (boq: BOQ) => subtotalOf(boq) + (boq.contingency ?? 0)

const CAT_COLORS: Record<string, string> = {
  civil:'bg-amber-100 text-amber-700', supply:'bg-blue-100 text-blue-700',
  installation:'bg-purple-100 text-purple-700', integration:'bg-cyan-100 text-cyan-700',
  testing:'bg-green-100 text-green-700', pm:'bg-indigo-100 text-indigo-700',
  hse:'bg-red-100 text-red-700', other:'bg-slate-100 text-slate-600',
}

export function BOQModule() {
  const { data: boqs, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<BOQ>(TABLES.boqs, 'BOQ')
  const [selBOQ, setSelBOQ] = useState<BOQ | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const totalValue = boqs.filter(b => b.status !== 'superseded').reduce((s, b) => s + grandTotalOf(b), 0)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this BOQ?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelBOQ(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total BOQs',    v: boqs.length,                                          color: 'text-blue-600' },
          { l: 'Approved',      v: boqs.filter(b => b.status === 'approved').length,      color: 'text-green-600' },
          { l: 'Draft / Pending',v: boqs.filter(b => b.status !== 'approved').length,    color: 'text-amber-600' },
          { l: 'Total Value',   v: fmt(totalValue),                                            color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="section-title">Bills of Quantities</h2>
        <div className="flex gap-2">
          <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New BOQ</Button>
        </div>
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      <div className="space-y-4">
        {boqs.map(boq => (
          <Card key={boq.id} padding={false}>
            <div className="p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <p className="font-mono text-xs font-bold text-brand-600">{boq.boqNumber}</p>
                    <Badge status={boq.status} />
                    <span className="flex items-center gap-1 text-xs text-slate-500"><GitBranch className="w-3 h-3"/>v{boq.version}</span>
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white text-lg">{boq.projectName}</p>
                  <p className="text-sm text-slate-500">{boq.customerName}{boq.siteName ? ` · ${boq.siteName}` : ''}</p>
                </div>
                <div className="flex gap-4 text-right flex-shrink-0">
                  <div><p className="text-xs text-slate-400">Subtotal</p><p className="font-bold">{fmt(subtotalOf(boq))}</p></div>
                  <div><p className="text-xs text-slate-400">Contingency ({boq.contingencyPct}%)</p><p className="font-bold text-amber-600">{fmt(boq.contingency ?? 0)}</p></div>
                  <div><p className="text-xs text-slate-400">Grand Total</p><p className="text-xl font-black text-brand-600">{fmt(grandTotalOf(boq))}</p></div>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(
                    (boq.items ?? []).reduce((acc, item) => {
                      acc[item.category] = (acc[item.category] ?? 0) + item.totalCost
                      return acc
                    }, {} as Record<string, number>)
                  ).map(([cat, val]) => (
                    <span key={cat} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${CAT_COLORS[cat] ?? 'bg-slate-100 text-slate-600'} dark:bg-opacity-20`}>
                      {cat}: {fmt(val)}
                    </span>
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => setSelBOQ(boq)}>View Details</Button>
                  <Button size="sm" variant="secondary" icon={<Pencil className="w-3.5 h-3.5"/>} onClick={() => openEdit(boq)}>Edit</Button>
                  <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5"/>} onClick={() => handleDelete(boq.id!)}>Delete</Button>
                  {boq.approvedBy && <p className="text-xs text-slate-400 self-center">Approved by {boq.approvedBy} · {boq.approvedAt}</p>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* BOQ Detail Modal */}
      {selBOQ && (
        <Modal open title={`${selBOQ.boqNumber} — ${selBOQ.projectName}`} onClose={() => setSelBOQ(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selBOQ.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selBOQ); setSelBOQ(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Badge status={selBOQ.status} />
              <span className="text-xs text-slate-500">v{selBOQ.version} · {(selBOQ.items??[]).length} items · Created by {selBOQ.createdBy}</span>
              {selBOQ.notes && <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">{selBOQ.notes}</p>}
            </div>

            {/* Items table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>{['Code','Description','Category','Unit','Qty','Unit Cost','Total'].map(h => <th key={h} className="th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(selBOQ.items??[]).map(item => (
                    <tr key={item.id} className="tr-hover">
                      <td className="td font-mono text-xs font-bold text-slate-600 dark:text-slate-400">{item.itemCode}</td>
                      <td className="td font-medium">{item.description}</td>
                      <td className="td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CAT_COLORS[item.category] ?? 'bg-slate-100 text-slate-600'}`}>{item.category}</span>
                      </td>
                      <td className="td text-xs text-slate-500">{item.unit}</td>
                      <td className="td font-bold text-center">{item.quantity}</td>
                      <td className="td text-xs">{fmt(item.unitCost)}</td>
                      <td className="td font-bold text-brand-600">{fmt(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-700/30">
                  <tr>
                    <td colSpan={6} className="td font-bold text-right">Subtotal</td>
                    <td className="td font-bold">{fmt(subtotalOf(selBOQ))}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="td text-right text-amber-600 font-semibold">Contingency ({selBOQ.contingencyPct}%)</td>
                    <td className="td font-bold text-amber-600">{fmt(selBOQ.contingency ?? 0)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="td text-right text-lg font-black">Grand Total</td>
                    <td className="td text-xl font-black text-brand-600">{fmt(grandTotalOf(selBOQ))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" icon={<Download className="w-4 h-4"/>}>Export Excel</Button>
              <Button>Approve BOQ</Button>
            </div>
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Quote, Invoice, PurchaseOrder, Payment } from '@/types'

const fmt = (n: number) => (n ?? 0) >= 1e6 ? `${((n ?? 0)/1e6).toFixed(2)}M Ar` : `${(n ?? 0).toLocaleString()} Ar`

type Tab = 'invoices' | 'quotes' | 'purchase_orders' | 'payments'

export function FinanceModule() {
  const [tab, setTab] = useState<Tab>('invoices')
  const { data: invoices, error: invErr, openCreate: newInv, update: updateInvoice, modal: invModal } = useEntityCrud<Invoice>(TABLES.invoices, 'Invoice')
  const { data: quotes, error: quoErr, openCreate: newQuo, modal: quoModal } = useEntityCrud<Quote>(TABLES.quotes, 'Quote')
  const { data: pos, error: poErr, openCreate: newPo, modal: poModal } = useEntityCrud<PurchaseOrder>(TABLES.purchaseOrders, 'Purchase Order')
  const { data: payments, error: payErr, openCreate: newPay, modal: payModal } = useEntityCrud<Payment>(
    TABLES.payments, 'Payment', undefined, async (payment) => {
      // Keep invoice.paid in sync: revenue KPIs and balances read the
      // invoice row, so a payment must update it or they drift apart.
      if (!payment.invoiceId) return
      const inv = invoices.find(i => i.id === payment.invoiceId)
      if (!inv) return
      await updateInvoice(inv.id!, { paid: (inv.paid ?? 0) + (payment.amount ?? 0) })
    }
  )
  const [selInv, setSelInv] = useState<Invoice | null>(null)

  const totalRevenue    = invoices.reduce((s, i) => s + (i.paid ?? 0), 0)
  const pendingAR       = invoices.reduce((s, i) => s + (i.balance ?? 0), 0)
  // Overdue is derived from the due date, not from a manually-set status —
  // invoices still labeled 'sent'/'partially_paid' past their due date count.
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const overdueInvoices = invoices.filter(i => {
    if (i.status === 'paid' || i.status === 'cancelled') return false
    return !!i.dueDate && (i.dueDate.slice(0, 10) < todayStr)
  })
  const totalPOs        = pos.reduce((s, p) => s + (p.total ?? 0), 0)

  const addForTab = () => {
    if (tab === 'invoices') newInv()
    else if (tab === 'quotes') newQuo()
    else if (tab === 'purchase_orders') newPo()
    else newPay()
  }

  const errorForTab = tab === 'invoices' ? invErr : tab === 'quotes' ? quoErr : tab === 'purchase_orders' ? poErr : payErr

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Revenue Collected', v: fmt(totalRevenue), color: 'text-green-600' },
          { l: 'Pending A/R',       v: fmt(pendingAR),    color: pendingAR > 0 ? 'text-amber-600' : 'text-green-600' },
          { l: 'Overdue Invoices',  v: overdueInvoices.length, color: overdueInvoices.length > 0 ? 'text-red-600' : 'text-green-600' },
          { l: 'Total POs Issued',  v: fmt(totalPOs),     color: 'text-blue-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex-wrap">
          {(['invoices','quotes','purchase_orders','payments'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded capitalize transition-all whitespace-nowrap ${tab===t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {t.replace('_',' ')}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={addForTab}>
          New {tab === 'invoices' ? 'Invoice' : tab === 'quotes' ? 'Quote' : tab === 'purchase_orders' ? 'PO' : 'Payment'}
        </Button>
      </div>
      {errorForTab && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{errorForTab}</div>}

      {tab === 'invoices' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Number','Customer','Subtotal','Tax','Total','Paid','Balance','Issue Date','Due Date','Status'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="tr-hover cursor-pointer" onClick={() => setSelInv(inv)}>
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{inv.number}</td>
                    <td className="td font-semibold">{inv.customerName}</td>
                    <td className="td text-xs">{fmt(inv.subtotal)}</td>
                    <td className="td text-xs text-slate-500">{fmt(inv.tax)}</td>
                    <td className="td font-bold">{fmt(inv.total)}</td>
                    <td className="td text-green-600 font-bold">{fmt(inv.paid)}</td>
                    <td className={`td font-bold ${(inv.balance ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(inv.balance)}</td>
                    <td className="td text-xs text-slate-500">{inv.issueDate}</td>
                    <td className="td text-xs text-slate-500">{inv.dueDate}</td>
                    <td className="td"><Badge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'quotes' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Number','Customer','Items','Subtotal','Tax','Total','Valid Until','Status'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="tr-hover">
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{q.number}</td>
                    <td className="td font-semibold">{q.customerName}</td>
                    <td className="td text-center">{(q.items ?? []).length}</td>
                    <td className="td">{fmt(q.subtotal)}</td>
                    <td className="td text-slate-500 text-xs">{fmt(q.tax)}</td>
                    <td className="td font-bold text-green-600">{fmt(q.total)}</td>
                    <td className="td text-xs text-slate-500">{q.validUntil}</td>
                    <td className="td"><Badge status={q.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'purchase_orders' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Number','Vendor','Items','Total','Order Date','Expected Delivery','Status'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} className="tr-hover">
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{po.number}</td>
                    <td className="td font-semibold">{po.vendorName}</td>
                    <td className="td text-center">{(po.items ?? []).length}</td>
                    <td className="td font-bold">{fmt(po.total)}</td>
                    <td className="td text-xs text-slate-500">{po.orderDate}</td>
                    <td className="td text-xs text-slate-500">{po.expectedDelivery}</td>
                    <td className="td"><Badge status={po.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'payments' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Date','Invoice','Customer','Amount','Method','Reference'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {payments.map(pay => (
                  <tr key={pay.id} className="tr-hover">
                    <td className="td text-xs text-slate-500">{pay.date}</td>
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{pay.invoiceNumber}</td>
                    <td className="td font-semibold">{pay.customerName}</td>
                    <td className="td font-bold text-green-600">{fmt(pay.amount)}</td>
                    <td className="td capitalize text-xs"><Badge status="sent">{pay.method?.replace('_',' ')}</Badge></td>
                    <td className="td font-mono text-xs text-slate-400">{pay.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invoice Detail Modal */}
      {selInv && (
        <Modal open title={`Invoice ${selInv.number}`} onClose={() => setSelInv(null)} size="xl">
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{selInv.number}</p>
                <p className="text-sm text-slate-500">{selInv.customerName}</p>
              </div>
              <Badge status={selInv.status} className="text-sm px-3 py-1" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'Issue Date',  v: selInv.issueDate },
                { l: 'Due Date',    v: selInv.dueDate },
                { l: 'Tax Rate',    v: `${selInv.taxRate}%` },
                { l: 'Project',     v: selInv.projectId ?? '—' },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>{['Description','Qty','Unit','Unit Price','Total'].map(h => <th key={h} className="th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(selInv.items ?? []).map(item => (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="td">{item.description}</td>
                      <td className="td text-center">{item.quantity}</td>
                      <td className="td text-xs text-slate-500">{item.unit}</td>
                      <td className="td">{fmt(item.unitPrice)}</td>
                      <td className="td font-bold">{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 dark:bg-slate-700/30 p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex flex-col items-end gap-1.5 text-sm">
                  <div className="flex gap-8"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{fmt(selInv.subtotal)}</span></div>
                  <div className="flex gap-8"><span className="text-slate-500">Tax ({selInv.taxRate}%)</span><span className="font-semibold">{fmt(selInv.tax)}</span></div>
                  <div className="flex gap-8 text-lg font-black"><span>Total</span><span className="text-brand-600">{fmt(selInv.total)}</span></div>
                  <div className="flex gap-8"><span className="text-green-600">Paid</span><span className="text-green-600 font-semibold">{fmt(selInv.paid)}</span></div>
                  <div className="flex gap-8"><span className={(selInv.balance ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}>Balance Due</span><span className={`font-bold ${(selInv.balance ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(selInv.balance)}</span></div>
                </div>
              </div>
            </div>
            {selInv.notes && <p className="text-sm text-slate-500 italic">{selInv.notes}</p>}
          </div>
        </Modal>
      )}

      {invModal}
      {quoModal}
      {poModal}
      {payModal}
    </div>
  )
}

import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import { resolvePaidOnStatusChange } from '@/lib/invoiceStatus'
import { autoPaymentForPaid, poFromAcceptedQuote, invoiceFromReceivedPo, isAutoPayment, nextNumberFor, hasAutoDoc } from '@/lib/financeWorkflows'
import type { Quote, Invoice, PurchaseOrder, Payment } from '@/types'

const fmt = (n: number) => (n ?? 0) >= 1e6 ? `${((n ?? 0)/1e6).toFixed(2)}M Ar` : `${(n ?? 0).toLocaleString()} Ar`

const INVOICE_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired']
const PO_STATUSES = ['draft', 'approved', 'sent', 'partial', 'received', 'cancelled']

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  sent: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  partially_paid: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  paid: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  overdue: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  cancelled: 'bg-slate-100 dark:bg-slate-700 text-slate-500',
  accepted: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  rejected: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  expired: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  approved: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  partial: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  received: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
}

type Tab = 'invoices' | 'quotes' | 'purchase_orders' | 'payments'

export function FinanceModule() {
  const [tab, setTab] = useState<Tab>('invoices')
  const { data: invoices, error: invErr, openCreate: newInv, openEdit: editInv, remove: removeInv, update: updateInvoice, create: createInvoice, modal: invModal, editable } = useEntityCrud<Invoice>(TABLES.invoices, 'Invoice')
  const { data: quotes, error: quoErr, openCreate: newQuo, openEdit: editQuo, remove: removeQuo, update: updateQuote, modal: quoModal } = useEntityCrud<Quote>(TABLES.quotes, 'Quote')
  const { data: pos, error: poErr, openCreate: newPo, openEdit: editPo, remove: removePo, update: updatePo, create: createPo, modal: poModal } = useEntityCrud<PurchaseOrder>(TABLES.purchaseOrders, 'Purchase Order')
  const { data: payments, error: payErr, openCreate: newPay, openEdit: editPay, remove: removePay, create: createPayment, modal: payModal } = useEntityCrud<Payment>(
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
  const [actionError, setActionError] = useState<string | null>(null)
  // Row id whose status update is in flight — guards against double-firing a
  // transition (and thus duplicating the auto-created child doc).
  const [statusBusy, setStatusBusy] = useState<string | null>(null)

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

  // Quick status change straight from the table — no edit modal needed.
  // Status transitions also drive the automation: paid → payment,
  // accepted → PO (sent), received → invoice (draft).
  const changeStatus = async (inv: Invoice, status: string) => {
    if (status === inv.status || statusBusy === inv.id) return
    setStatusBusy(inv.id)
    try {
      setActionError(null)
      const invoicePayments = payments.filter(p => p.invoiceId === inv.id)
      // Manual-only total: the auto "settlement" payment is excluded so paid
      // and balance reconcile correctly when leaving 'paid' again.
      const manualPayments = invoicePayments.filter(p => !isAutoPayment(p))
      const recordedManual = manualPayments.reduce((s, p) => s + (p.amount ?? 0), 0)
      const autoPayments = invoicePayments.filter(isAutoPayment)
      const goingToPaid = status === 'paid'
      const leavingPaid = inv.status === 'paid' && !goingToPaid

      if (goingToPaid) {
        // Create the settlement record FIRST — if it fails, the invoice stays
        // unpaid (no phantom "paid" state). Skip when an auto record already
        // lingers (e.g. from a failed leave-paid).
        const pay = autoPaymentForPaid(inv, recordedManual, todayStr)
        if (pay && autoPayments.length === 0) await createPayment(pay)
        await updateInvoice(inv.id!, { status: 'paid', paid: inv.total ?? 0 })
      } else if (leavingPaid) {
        // Settle the invoice state first, then drop the auto record.
        await updateInvoice(inv.id!, { status: status as Invoice['status'], paid: recordedManual })
        for (const p of autoPayments) await removePay(p.id!)
      } else {
        await updateInvoice(inv.id!, {
          status: status as Invoice['status'],
          paid: resolvePaidOnStatusChange(status, inv.total ?? 0, recordedManual),
        })
      }
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    } finally {
      setStatusBusy(null)
    }
  }

  // Accepted quote → auto-create a Purchase Order (default status "sent").
  const changeQuoteStatus = async (q: Quote, status: string) => {
    if (status === q.status || statusBusy === q.id) return
    setStatusBusy(q.id)
    try {
      setActionError(null)
      await updateQuote(q.id!, { status: status as Quote['status'] })
      if (status === 'accepted' && !hasAutoDoc(pos, q.number)) {
        await createPo(poFromAcceptedQuote(q, nextNumberFor('PO', pos, todayStr), todayStr))
      }
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    } finally {
      setStatusBusy(null)
    }
  }

  // Received PO → auto-create an Invoice (default status "draft").
  const changePoStatus = async (po: PurchaseOrder, status: string) => {
    if (status === po.status || statusBusy === po.id) return
    setStatusBusy(po.id)
    try {
      setActionError(null)
      await updatePo(po.id!, { status: status as PurchaseOrder['status'] })
      if (status === 'received' && !hasAutoDoc(invoices, po.number)) {
        const due = new Date()
        due.setDate(due.getDate() + 30)
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
        await createInvoice(invoiceFromReceivedPo(po, nextNumberFor('INV', invoices, todayStr), todayStr, dueStr))
      }
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    } finally {
      setStatusBusy(null)
    }
  }

  // Deleting a payment must undo its effect on the invoice's paid amount.
  const removePayment = async (pay: Payment) => {
    const inv = pay.invoiceId ? invoices.find(i => i.id === pay.invoiceId) : undefined
    await removePay(pay.id!)
    if (inv) await updateInvoice(inv.id!, { paid: Math.max(0, (inv.paid ?? 0) - (pay.amount ?? 0)) })
  }

  const handleDelete = async (label: string, doDelete: () => Promise<void> | void) => {
    if (!confirm(`Delete this ${label}?`)) return
    try {
      setActionError(null)
      await doDelete()
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
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
        {editable && (
          <Button icon={<Plus className="w-4 h-4"/>} onClick={addForTab}>
            New {tab === 'invoices' ? 'Invoice' : tab === 'quotes' ? 'Quote' : tab === 'purchase_orders' ? 'PO' : 'Payment'}
          </Button>
        )}
      </div>
      {errorForTab && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{errorForTab}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}

      {tab === 'invoices' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Number','Customer','Subtotal','Tax','Total','Paid','Balance','Issue Date','Due Date','Status',''].map(h => <th key={h} className="th">{h}</th>)}
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
                    <td className="td">
                      {editable ? (
                        <select
                          value={inv.status}
                          onChange={e => changeStatus(inv, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          disabled={statusBusy === inv.id}
                          className={`text-xs font-semibold rounded-full border-0 px-2 py-1 cursor-pointer focus:outline-none ${STATUS_COLOR[inv.status] ?? 'bg-slate-100 text-slate-600'}`}
                          title="Change status"
                        >
                          {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                        </select>
                      ) : (
                        <Badge status={inv.status} />
                      )}
                    </td>
                    <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {editable && (
                        <div className="flex gap-1">
                          <button onClick={() => editInv(inv)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete('invoice', async () => { await removeInv(inv.id!); if (selInv?.id === inv.id) setSelInv(null) })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
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
                {['Number','Customer','Items','Subtotal','Tax','Total','Valid Until','Status',''].map(h => <th key={h} className="th">{h}</th>)}
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
                    <td className="td">
                      {editable ? (
                        <select
                          value={q.status}
                          onChange={e => changeQuoteStatus(q, e.target.value)}
                          disabled={statusBusy === q.id}
                          className={`text-xs font-semibold rounded-full border-0 px-2 py-1 cursor-pointer focus:outline-none ${STATUS_COLOR[q.status] ?? 'bg-slate-100 text-slate-600'}`}
                          title="Change status"
                        >
                          {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                        </select>
                      ) : (
                        <Badge status={q.status} />
                      )}
                    </td>
                    <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {editable && (
                        <div className="flex gap-1">
                          <button onClick={() => editQuo(q)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete('quote', () => removeQuo(q.id!))} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
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
                {['Number','Vendor','Items','Total','Order Date','Expected Delivery','Status',''].map(h => <th key={h} className="th">{h}</th>)}
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
                    <td className="td">
                      {editable ? (
                        <select
                          value={po.status}
                          onChange={e => changePoStatus(po, e.target.value)}
                          disabled={statusBusy === po.id}
                          className={`text-xs font-semibold rounded-full border-0 px-2 py-1 cursor-pointer focus:outline-none ${STATUS_COLOR[po.status] ?? 'bg-slate-100 text-slate-600'}`}
                          title="Change status"
                        >
                          {PO_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                        </select>
                      ) : (
                        <Badge status={po.status} />
                      )}
                    </td>
                    <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {editable && (
                        <div className="flex gap-1">
                          <button onClick={() => editPo(po)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete('PO', () => removePo(po.id!))} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
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
                {['Date','Invoice','Customer','Amount','Method','Reference',''].map(h => <th key={h} className="th">{h}</th>)}
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
                    <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {editable && !isAutoPayment(pay) && (
                        <div className="flex gap-1">
                          <button onClick={() => editPay(pay)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete('payment', () => removePayment(pay))} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
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

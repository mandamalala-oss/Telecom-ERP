import { useState } from 'react'
import { Plus, CheckCircle, XCircle, MinusCircle, Download, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import { generateInvoiceForCertificate } from '@/lib/paymentAutomation'
import type { ATPRecord, ATPTemplate, ATPResult, AcceptanceCertificate } from '@/types/v2'
import { clsx } from 'clsx'

const STATUS_FLOW = ['draft','submitted','reviewed','approved','customer_accepted','failed']
const CERT_STATUS_FLOW = ['draft','submitted','reviewed','issued','signed','rejected']
const CERT_TABS = ['records','templates','pac','fac'] as const
type CertTab = typeof CERT_TABS[number]
const TAB_LABEL: Record<CertTab, string> = { records: 'Records', templates: 'Templates', pac: 'PAC', fac: 'FAC' }

function ResultIcon({ result }: { result: ATPResult['result'] }) {
  if (result === 'pass') return <CheckCircle className="w-4 h-4 text-green-500" />
  if (result === 'fail') return <XCircle className="w-4 h-4 text-red-500" />
  if (result === 'na')   return <MinusCircle className="w-4 h-4 text-slate-400" />
  return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
}

export function ATPModule() {
  const { data: records, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<ATPRecord>(TABLES.atpRecords, 'ATP Record')
  const { data: templates, openCreate: newTemplate, openEdit: editTemplate, remove: removeTemplate, modal: templateModal } = useEntityCrud<ATPTemplate>(TABLES.atpTemplates, 'ATP Template')
  const [tab, setTab] = useState<CertTab>('records')
  const [actionError, setActionError] = useState<string | null>(null)
  // A signed PAC/FAC bills the project's matching payment milestone. Side
  // effect failures are surfaced, not thrown, so a saved certificate stays
  // saved even when the invoice cannot be generated.
  const certSaved = async (row: AcceptanceCertificate, previous?: AcceptanceCertificate | null) => {
    if (row.status !== 'signed' || previous?.status === 'signed') return
    try {
      await generateInvoiceForCertificate(row)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  // PAC/FAC share one table; the active tab drives the certificate type on
  // create, while edits keep whatever type the row already has.
  const { data: certData, loading: certLoading, error: certError, openCreate: openCertCreate, openEdit: openCertEdit, remove: removeCert, modal: certModal } = useEntityCrud<AcceptanceCertificate>(
    TABLES.acceptanceCertificates,
    'Certificate',
    undefined,
    (row) => certSaved(row),
    (v, editing) => ({ ...v, type: editing?.type ?? v.type ?? (tab === 'fac' ? 'FAC' : 'PAC') }),
    (row, _values, previous) => certSaved(row, previous)
  )
  const [selRecord, setSelRecord] = useState<ATPRecord | null>(null)
  const [selTemplate, setSelTemplate] = useState<ATPTemplate | null>(null)
  const [selCert, setSelCert] = useState<AcceptanceCertificate | null>(null)

  const isCertTab = tab === 'pac' || tab === 'fac'
  const certs = certData.filter(c => c.type === (tab === 'fac' ? 'FAC' : 'PAC'))

  const totalPass = records.filter(r => r.overallResult === 'pass').length
  const totalFail = records.filter(r => r.overallResult === 'fail').length
  const totalPartial = records.filter(r => r.overallResult === 'partial').length
  const successRate = records.length > 0 ? Math.round(totalPass / records.length * 100) : 0

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ATP record?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelRecord(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return
    try {
      setActionError(null)
      await removeTemplate(id)
      setSelTemplate(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const handleDeleteCert = async (id: string) => {
    if (!confirm('Delete this certificate?')) return
    try {
      setActionError(null)
      await removeCert(id)
      setSelCert(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total ATPs',    v: records.length,  color: 'text-blue-600' },
          { l: 'Success Rate',  v: `${successRate}%`,        color: successRate >= 90 ? 'text-green-600' : successRate >= 70 ? 'text-amber-600' : 'text-red-600' },
          { l: 'Failed',        v: totalFail + totalPartial,  color: totalFail > 0 ? 'text-red-600' : 'text-green-600' },
          { l: 'Accepted',      v: records.filter(r => r.status === 'customer_accepted').length, color: 'text-green-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {CERT_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${tab===t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>}
          onClick={tab === 'records' ? openCreate : tab === 'templates' ? newTemplate : openCertCreate}>
          New {tab === 'records' ? 'ATP' : tab === 'templates' ? 'Template' : tab === 'pac' ? 'PAC' : 'FAC'}
        </Button>
      </div>
      {(isCertTab ? certError : error) && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{isCertTab ? certError : error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {(isCertTab ? certLoading : loading) && <p className="text-xs text-slate-500">Loading…</p>}

      {tab === 'records' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['ATP Number','Site','Project','Template','Result','Pass','Fail','Status','Engineer','Date'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {records.map(atp => (
                  <tr key={atp.id} className="tr-hover cursor-pointer" onClick={() => setSelRecord(atp)}>
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{atp.atpNumber}</td>
                    <td className="td"><p className="font-semibold text-sm">{atp.siteName}</p><p className="text-xs text-slate-400">{atp.siteCode}</p></td>
                    <td className="td text-xs text-slate-500">{atp.projectId}</td>
                    <td className="td text-xs text-slate-500">{atp.templateName}</td>
                    <td className="td">
                      <span className={clsx('inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
                        atp.overallResult==='pass'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':
                        atp.overallResult==='fail'?'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400':
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>
                        {atp.overallResult === 'pass' ? '✓ PASS' : atp.overallResult === 'fail' ? '✗ FAIL' : '⚠ PARTIAL'}
                      </span>
                    </td>
                    <td className="td text-green-600 font-bold">{atp.passCount}</td>
                    <td className="td text-red-600 font-bold">{atp.failCount}</td>
                    <td className="td"><Badge status={atp.status} /></td>
                    <td className="td text-xs text-slate-500">{atp.engineerName}</td>
                    <td className="td text-xs text-slate-400">{atp.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(tpl => (
            <Card key={tpl.id} hover padding={false} onClick={() => setSelTemplate(tpl)} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{tpl.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">v{tpl.version} · {tpl.customer}</p>
                </div>
                {tpl.isActive && <Badge status="active">Active</Badge>}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {(tpl.technologies??[]).map(t => <Badge key={t} status={t}>{t}</Badge>)}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">Sections</p><p className="font-bold">{(tpl.sections??[]).length}</p></div>
                <div><p className="text-slate-400">Test Items</p><p className="font-bold">{(tpl.sections??[]).reduce((s,sec)=>s+sec.items.length,0)}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isCertTab && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Certificate','Site','Project','ATP','Status','DLP End','Customer Rep','Signed','Issued'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {certs.map(c => (
                  <tr key={c.id} className="tr-hover cursor-pointer" onClick={() => setSelCert(c)}>
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{c.certificateNumber}</td>
                    <td className="td"><p className="font-semibold text-sm">{c.siteName ?? '—'}</p><p className="text-xs text-slate-400">{c.siteCode}</p></td>
                    <td className="td text-xs text-slate-500">{c.projectName ?? '—'}</td>
                    <td className="td text-xs text-slate-500">{c.atpNumber ?? '—'}</td>
                    <td className="td"><Badge status={c.status} /></td>
                    <td className="td text-xs text-slate-500">{c.dlpEndDate ?? '—'}</td>
                    <td className="td text-xs text-slate-500">{c.customerRepresentative ?? '—'}</td>
                    <td className="td text-xs">{c.customerSignature ? <span className="text-green-600 font-bold">✓</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="td text-xs text-slate-400">{c.issuedAt ?? '—'}</td>
                  </tr>
                ))}
                {certs.length === 0 && (
                  <tr><td colSpan={9} className="td text-center text-sm text-slate-400 py-8">No {tab.toUpperCase()} certificates yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ATP Record Detail */}
      {selRecord && (
        <Modal open title={`ATP ${selRecord.atpNumber}`} onClose={() => setSelRecord(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selRecord.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selRecord); setSelRecord(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            {/* Status flow */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STATUS_FLOW.map((st, i) => {
                const isFailed = selRecord.status === 'failed'
                const idx = isFailed ? STATUS_FLOW.length - 1 : STATUS_FLOW.indexOf(selRecord.status)
                const done = isFailed ? false : i <= idx
                const failedStep = isFailed && st === 'failed'
                return (
                  <div key={st} className="flex items-center flex-shrink-0">
                    <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold',
                      failedStep ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      done ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-700')}>
                      {failedStep ? '✗' : done ? '✓' : i + 1} {st.replace('_',' ')}
                    </div>
                    {i < STATUS_FLOW.length - 1 && <div className="w-4 h-0.5 bg-slate-200 dark:bg-slate-700 mx-0.5 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Site',v:selRecord.siteName},{l:'Code',v:selRecord.siteCode},
                {l:'Engineer',v:selRecord.engineerName},{l:'Customer Rep',v:selRecord.customerRepresentative??'—'},
                {l:'Template',v:selRecord.templateName},{l:'Submitted',v:selRecord.submittedAt??'—'},
                {l:'Approved',v:selRecord.approvedAt??'—'},{l:'Accepted',v:selRecord.customerAcceptedAt??'—'},
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>

            {/* Overall result banner */}
            <div className={clsx('rounded-xl p-4 flex items-center justify-between',
              selRecord.overallResult==='pass'?'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800':
              selRecord.overallResult==='fail'?'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800':
              'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800')}>
              <div className="flex items-center gap-3">
                {selRecord.overallResult==='pass' ? <CheckCircle className="w-8 h-8 text-green-500" /> : <XCircle className="w-8 h-8 text-red-500" />}
                <div>
                  <p className={clsx('text-lg font-black', selRecord.overallResult==='pass'?'text-green-700 dark:text-green-400':'text-red-700 dark:text-red-400')}>
                    {selRecord.overallResult?.toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-500">{selRecord.comments}</p>
                </div>
              </div>
              <div className="flex gap-4 text-center">
                <div><p className="text-2xl font-black text-green-600">{selRecord.passCount}</p><p className="text-xs text-slate-500">Pass</p></div>
                <div><p className="text-2xl font-black text-red-600">{selRecord.failCount}</p><p className="text-xs text-slate-500">Fail</p></div>
                <div><p className="text-2xl font-black text-slate-400">{selRecord.naCount}</p><p className="text-xs text-slate-500">N/A</p></div>
              </div>
            </div>

            {/* Test Results */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Test Results</p>
              <div className="space-y-2">
                {(selRecord.results??[]).map(r => {
                  const template = templates.find(t => t.id === selRecord.templateId)
                  const item = template?.sections?.flatMap(s => s.items).find(i => i.id === r.itemId)
                  return (
                    <div key={r.itemId} className={clsx('flex items-start gap-3 p-3 rounded-lg border',
                      r.result==='pass'?'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30':
                      r.result==='fail'?'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30':
                      'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700')}>
                      <ResultIcon result={r.result} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{item?.testName ?? r.itemId}</p>
                        <p className="text-xs text-slate-500">{item?.passCriteria}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{r.actualValue}</p>
                        {r.notes && <p className="text-xs text-slate-400 mt-0.5 max-w-[150px] text-right">{r.notes}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className={clsx('rounded-lg p-3 text-center', selRecord.engineerSignature ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700/30')}>
                <p className="text-xs text-slate-500 mb-1">Engineer Signature</p>
                {selRecord.engineerSignature ? <p className="text-sm font-bold text-green-700 dark:text-green-400">✓ {selRecord.engineerName}</p> : <p className="text-sm text-slate-400 italic">Pending</p>}
              </div>
              <div className={clsx('rounded-lg p-3 text-center', selRecord.customerSignature ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700/30')}>
                <p className="text-xs text-slate-500 mb-1">Customer Signature</p>
                {selRecord.customerSignature ? <p className="text-sm font-bold text-green-700 dark:text-green-400">✓ {selRecord.customerRepresentative}</p> : <p className="text-sm text-slate-400 italic">Pending</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" icon={<Download className="w-4 h-4"/>}>Export PDF</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Template Detail */}
      {selTemplate && (
        <Modal open title={selTemplate.name} onClose={() => setSelTemplate(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteTemplate(selTemplate.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editTemplate(selTemplate); setSelTemplate(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-2">
              {(selTemplate.technologies??[]).map(t => <Badge key={t} status={t}>{t}</Badge>)}
              <span className="text-xs text-slate-500 self-center">Version {selTemplate.version} · {(selTemplate.sections??[]).reduce((s,sec)=>s+sec.items.length,0)} tests</span>
            </div>
            {(selTemplate.sections??[]).map(sec => (
              <div key={sec.id}>
                <p className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-600 text-xs flex items-center justify-center font-black">{sec.order}</span>
                  {sec.title}
                </p>
                <div className="space-y-1.5 ml-7">
                  {sec.items.map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-2.5 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <div className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', item.mandatory ? 'bg-red-500' : 'bg-slate-400')} />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.testName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Expected: {item.expectedResult}</p>
                        <p className="text-xs text-slate-400">Criteria: {item.passCriteria}</p>
                      </div>
                      <span className={clsx('text-xs px-1.5 py-0.5 rounded font-bold', item.mandatory ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500')}>{item.mandatory ? 'MANDATORY' : 'optional'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* PAC / FAC Certificate Detail */}
      {selCert && (
        <Modal open title={`${selCert.type} ${selCert.certificateNumber}`} onClose={() => setSelCert(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteCert(selCert.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openCertEdit(selCert); setSelCert(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {CERT_STATUS_FLOW.map((st, i) => {
                const isRejected = selCert.status === 'rejected'
                const idx = isRejected ? CERT_STATUS_FLOW.length - 1 : CERT_STATUS_FLOW.indexOf(selCert.status)
                const done = isRejected ? false : i <= idx
                const rejectedStep = isRejected && st === 'rejected'
                return (
                  <div key={st} className="flex items-center flex-shrink-0">
                    <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold',
                      rejectedStep ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      done ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-700')}>
                      {rejectedStep ? '✗' : done ? '✓' : i + 1} {st.replace('_',' ')}
                    </div>
                    {i < CERT_STATUS_FLOW.length - 1 && <div className="w-4 h-0.5 bg-slate-200 dark:bg-slate-700 mx-0.5 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Site',v:selCert.siteName ?? '—'},{l:'Code',v:selCert.siteCode ?? '—'},
                {l:'Project',v:selCert.projectName ?? '—'},{l:'ATP Record',v:selCert.atpNumber ?? '—'},
                {l:'Engineer',v:selCert.engineerName ?? '—'},{l:'Customer Rep',v:selCert.customerRepresentative ?? '—'},
                {l:'DLP Start',v:selCert.dlpStartDate ?? '—'},{l:'DLP End',v:selCert.dlpEndDate ?? '—'},
                {l:'Issued',v:selCert.issuedAt ?? '—'},{l:'Signed',v:selCert.signedAt ?? '—'},
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>

            {/* Punch list — FAC cannot be issued while items are still open */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Punch List ({(selCert.punchList??[]).length})</p>
              {(selCert.punchList??[]).length === 0
                ? <p className="text-sm text-green-600 font-semibold">✓ No punch list items</p>
                : (selCert.punchList??[]).map(item => (
                    <div key={item.id} className={clsx('flex items-start gap-3 p-3 rounded-lg border mb-2',
                      item.status==='resolved' ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30')}>
                      <Badge status={item.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.description}</p>
                        <p className="text-xs text-slate-500">{item.status === 'resolved' ? `Resolved${item.resolvedBy ? ` by ${item.resolvedBy}` : ''}${item.resolvedAt ? ` · ${item.resolvedAt}` : ''}` : 'Open'}</p>
                      </div>
                    </div>
                  ))}
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className={clsx('rounded-lg p-3 text-center', selCert.engineerSignature ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700/30')}>
                <p className="text-xs text-slate-500 mb-1">Engineer Signature</p>
                {selCert.engineerSignature ? <p className="text-sm font-bold text-green-700 dark:text-green-400">✓ {selCert.engineerName}</p> : <p className="text-sm text-slate-400 italic">Pending</p>}
              </div>
              <div className={clsx('rounded-lg p-3 text-center', selCert.customerSignature ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700/30')}>
                <p className="text-xs text-slate-500 mb-1">Customer Signature</p>
                {selCert.customerSignature ? <p className="text-sm font-bold text-green-700 dark:text-green-400">✓ {selCert.customerRepresentative}</p> : <p className="text-sm text-slate-400 italic">Pending</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" icon={<Download className="w-4 h-4"/>}>Export PDF</Button>
            </div>
          </div>
        </Modal>
      )}

      {modal}
      {templateModal}
      {certModal}
    </div>
  )
}

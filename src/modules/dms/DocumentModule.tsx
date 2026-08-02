import { useState } from 'react'
import { Search, Upload, Download, Lock, Eye, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { DocumentRecord, DocType } from '@/types/v2'
import { clsx } from 'clsx'

const DOC_ICONS: Record<DocType, string> = {
  contract:'📋', po:'🛒', atp_report:'✅', survey_report:'📍', drawing:'📐',
  as_built:'🏗️', sow:'📝', boq:'💰', invoice:'💵', nda:'🔒',
  safety_plan:'⛑️', method_statement:'📖', other:'📄',
}

const TYPE_COLOR: Record<string, string> = {
  contract:'bg-purple-100 text-purple-700', po:'bg-blue-100 text-blue-700',
  atp_report:'bg-green-100 text-green-700', survey_report:'bg-cyan-100 text-cyan-700',
  drawing:'bg-amber-100 text-amber-700', as_built:'bg-orange-100 text-orange-700',
  sow:'bg-indigo-100 text-indigo-700', boq:'bg-emerald-100 text-emerald-700',
  invoice:'bg-rose-100 text-rose-700', other:'bg-slate-100 text-slate-600',
}

const fmtSize = (bytes: number) => bytes > 1e6 ? `${(bytes/1e6).toFixed(1)} MB` : `${(bytes/1024).toFixed(0)} KB`

export function DocumentModule() {
  const { data: documents, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<DocumentRecord>(TABLES.documents, 'Document')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [selDoc, setSelDoc] = useState<DocumentRecord | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = documents.filter(d => {
    const q = search.toLowerCase()
    const match = (d.name??'').toLowerCase().includes(q) || (d.docNumber??'').toLowerCase().includes(q) ||
      (d.tags??[]).some(t => t.toLowerCase().includes(q))
    return match && (filterType === 'all' || d.type === filterType)
  })

  const docTypes = [...new Set(documents.map(d => d.type))]

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelDoc(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l:'Total Documents', v:documents.length, color:'text-blue-600' },
          { l:'Approved',        v:documents.filter(d=>d.status==='approved').length, color:'text-green-600' },
          { l:'Confidential',    v:documents.filter(d=>d.isConfidential).length, color:'text-red-600' },
          { l:'Total Size',      v:`${(documents.reduce((s,d)=>s+(d.fileSize??0),0)/1e6).toFixed(1)} MB`, color:'text-purple-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, tag…" className="input pl-9 w-56"/>
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="select w-44">
            <option value="all">All Types</option>
            {docTypes.map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
          </select>
        </div>
        <Button icon={<Upload className="w-4 h-4"/>} onClick={openCreate}>Add Document</Button>
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(doc => (
          <Card key={doc.id} hover padding={false} onClick={() => setSelDoc(doc)} className="p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl flex-shrink-0">
                {DOC_ICONS[doc.type] ?? '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {doc.isConfidential && <Lock className="w-3 h-3 text-red-500 flex-shrink-0"/>}
                  <p className="font-bold text-slate-900 dark:text-white text-sm leading-snug truncate">{doc.name}</p>
                </div>
                <p className="font-mono text-xs text-slate-400 mt-0.5">{doc.docNumber}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold capitalize', TYPE_COLOR[doc.type]??'bg-slate-100 text-slate-600')}>
                {doc.type.replace('_',' ')}
              </span>
              <Badge status={doc.status} />
              <span className="text-xs text-slate-400 ml-auto">v{doc.version}</span>
            </div>

            <div className="flex flex-wrap gap-1 mb-3">
              {(doc.tags??[]).map(tag => (
                <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">#{tag}</span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
              <span>{doc.uploadedByName}</span>
              <span>{doc.uploadedAt?.slice(0,10) ?? '—'} · {fmtSize(doc.fileSize??0)}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Document Detail Modal */}
      {selDoc && (
        <Modal open title={selDoc.name} onClose={() => setSelDoc(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selDoc.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selDoc); setSelDoc(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
              <div className="text-4xl">{DOC_ICONS[selDoc.type] ?? '📄'}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge status={selDoc.status} />
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold capitalize', TYPE_COLOR[selDoc.type]??'bg-slate-100 text-slate-600')}>{selDoc.type.replace('_',' ')}</span>
                  {selDoc.isConfidential && <span className="flex items-center gap-1 text-xs text-red-600 font-bold"><Lock className="w-3 h-3"/>Confidential</span>}
                  <span className="text-xs text-slate-400">Version {selDoc.version} · {fmtSize(selDoc.fileSize)}</span>
                </div>
                {selDoc.description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{selDoc.description}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Doc Number',  v:selDoc.docNumber},
                {l:'Uploaded By', v:selDoc.uploadedByName},
                {l:'Upload Date', v:selDoc.uploadedAt?.slice(0,10)??'—'},
                {l:'Approved By', v:selDoc.approvedBy??'Pending'},
                {l:'Approved At', v:selDoc.approvedAt?.slice(0,10)??'—'},
                {l:'Expires',     v:selDoc.expiresAt?.slice(0,10)??'—'},
                {l:'MIME Type',   v:selDoc.mimeType?.split('/')[1]?.toUpperCase()??'—'},
                {l:'Access',      v:(selDoc.accessRoles??[]).join(', ')||'—'},
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>

            {(selDoc.links??[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Linked To</p>
                <div className="flex flex-wrap gap-2">
                  {(selDoc.links??[]).map((link, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-xs font-semibold rounded-lg">
                      <span className="capitalize">{link.entityType}</span>: {link.entityName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {(selDoc.tags??[]).map(tag => <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded">#{tag}</span>)}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" icon={<Eye className="w-4 h-4"/>} onClick={() => selDoc.fileUrl && window.open(selDoc.fileUrl, '_blank', 'noopener')} disabled={!selDoc.fileUrl} title={selDoc.fileUrl ? undefined : 'No file attached'}>Preview</Button>
              <Button icon={<Download className="w-4 h-4"/>} onClick={() => selDoc.fileUrl && window.open(selDoc.fileUrl, '_blank', 'noopener')} disabled={!selDoc.fileUrl} title={selDoc.fileUrl ? undefined : 'No file attached'}>Download</Button>
            </div>
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}

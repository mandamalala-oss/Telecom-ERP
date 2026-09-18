import { useRef, useState } from 'react'
import { AlertTriangle, Plus, Trash2, Pencil, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import { supabase } from '@/lib/supabase'
import type { Subcontractor } from '@/types/v2'
import { clsx } from 'clsx'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import * as XLSX from 'xlsx'

// ─── Import Excel ────────────────────────────────────────────────
// Doit correspondre exactement aux en-têtes du modèle "Sous-traitants"
const EXCEL_HEADERS = {
  company: 'Entreprise*',
  contact: 'Personne de contact*',
  email: 'Email*',
  phone: 'Téléphone',
  specializations: 'Spécialisations',
  technologies: 'Technologies',
  regions: 'Régions',
  contractValue: 'Valeur du contrat (Ar)',
  activeProjects: 'Projets actifs',
  completedProjects: 'Projets terminés',
  certifications: 'Certifications',
  approved: 'Approuvé',
} as const

type ImportRow = Record<string, any>

function splitList(value: unknown): string[] {
  if (!value) return []
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toBool(value: unknown): boolean {
  const v = String(value ?? '').trim().toUpperCase()
  return v === 'VRAI' || v === 'TRUE' || v === '1'
}

interface ImportResult {
  inserted: number
  skipped: { row: number; reason: string }[]
}

async function parseAndMapExcel(file: File): Promise<{ payload: any[]; skipped: ImportResult['skipped'] }> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  // Cherche l'onglet "Sous-traitants", sinon prend le premier onglet
  const sheetName = workbook.SheetNames.includes('Sous-traitants')
    ? 'Sous-traitants'
    : workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: ImportRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  const payload: any[] = []
  const skipped: ImportResult['skipped'] = []

  rows.forEach((row, idx) => {
    const excelRowNumber = idx + 2 // +1 pour l'en-tête, +1 pour l'index 0-based
    const companyName = String(row[EXCEL_HEADERS.company] ?? '').trim()
    const contactPerson = String(row[EXCEL_HEADERS.contact] ?? '').trim()
    const email = String(row[EXCEL_HEADERS.email] ?? '').trim()

    if (!companyName || !contactPerson || !email) {
      skipped.push({
        row: excelRowNumber,
        reason: !companyName ? 'Entreprise manquante' : !contactPerson ? 'Contact manquant' : 'Email manquant',
      })
      return
    }

    payload.push({
      company_name: companyName,
      contact_person: contactPerson,
      email,
      phone: String(row[EXCEL_HEADERS.phone] ?? '').trim() || null,
      specializations: splitList(row[EXCEL_HEADERS.specializations]),
      technologies: splitList(row[EXCEL_HEADERS.technologies]),
      regions: splitList(row[EXCEL_HEADERS.regions]),
      contract_value: toNumber(row[EXCEL_HEADERS.contractValue]),
      active_projects: toNumber(row[EXCEL_HEADERS.activeProjects]),
      completed_projects: toNumber(row[EXCEL_HEADERS.completedProjects]),
      certifications: splitList(row[EXCEL_HEADERS.certifications]),
      is_approved: toBool(row[EXCEL_HEADERS.approved]),
    })
  })

  return { payload, skipped }
}

const RATING_COLOR: Record<string,string> = { A:'bg-green-100 text-green-700', B:'bg-blue-100 text-blue-700', C:'bg-amber-100 text-amber-700', D:'bg-red-100 text-red-700', F:'bg-red-200 text-red-900' }
const fmt = (n: number) => `${((n??0)/1e6).toFixed(1)}M Ar`

function scoresOf(sub: Subcontractor) {
  const raw: any = sub.scores ?? {}
  return {
    atpSuccessRate: raw.atpSuccessRate ?? 0,
    onTimeDelivery: raw.onTimeDelivery ?? 0,
    qualityScore: raw.qualityScore ?? 0,
    safetyScore: raw.safetyScore ?? 0,
    responseTime: raw.responseTime ?? 0,
    overallScore: raw.overallScore ?? 0,
    rating: raw.rating ?? 'C',
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-32 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
        <div className={clsx('h-2 rounded-full transition-all', value>=80?'bg-green-500':value>=60?'bg-amber-500':'bg-red-500')} style={{width:`${value}%`}} />
      </div>
      <span className="text-xs font-bold text-slate-900 dark:text-white w-8 text-right">{value}</span>
    </div>
  )
}

export function SubcontractorModule() {
  const { data: subs, loading, error, openCreate, openEdit, remove, modal, refresh } = useEntityCrud<Subcontractor>(TABLES.subcontractors, 'Subcontractor')
  const [selSub, setSelSub] = useState<Subcontractor | null>(null)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de réimporter le même fichier deux fois de suite
    if (!file) return

    setImporting(true)
    setImportSummary(null)
    try {
      const { payload, skipped } = await parseAndMapExcel(file)

      if (payload.length > 0) {
        const { error: insertError } = await supabase.from('subcontractors').insert(payload)
        if (insertError) throw insertError
      }

      await refresh?.()

      const parts = [`${payload.length} sous-traitant(s) importé(s)`]
      if (skipped.length > 0) parts.push(`${skipped.length} ignoré(s) : ${skipped.map(s => `ligne ${s.row} (${s.reason})`).join(', ')}`)
      setImportSummary(parts.join(' — '))
    } catch (err: any) {
      setImportSummary(`Échec de l'import : ${err.message ?? 'erreur inconnue'}`)
    } finally {
      setImporting(false)
    }
  }

  const avgScore  = subs.length > 0 ? Math.round(subs.reduce((s,sub)=>s+scoresOf(sub).overallScore,0)/subs.length) : 0
  const topSub    = [...subs].sort((a,b)=>scoresOf(b).overallScore-scoresOf(a).overallScore)[0]
  const incidents = subs.reduce((s,sub)=>s+(sub.incidents??[]).filter(inc=>!inc.resolved).length,0)

  const handleDelete = async (id: string) => { if (confirm('Delete this subcontractor?')) { await remove(id); setSelSub(null) } }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l:'Subcontractors',  v:subs.length,    color:'text-blue-600' },
          { l:'Avg Score',       v:`${avgScore}/100`,             color:avgScore>=80?'text-green-600':'text-amber-600' },
          { l:'Top Performer',   v:topSub?.companyName?.split(' ')[0] ?? '—', color:'text-green-600' },
          { l:'Open Incidents',  v:incidents,                     color:incidents>0?'text-red-600':'text-green-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {importSummary && (
        <div className={clsx('text-sm rounded-lg p-3', importSummary.startsWith('Échec') ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-green-700 bg-green-50 dark:bg-green-900/20')}>
          {importSummary}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden" />
        <Button variant="secondary" icon={<Upload className="w-4 h-4"/>} onClick={handleImportClick} disabled={importing}>
          {importing ? 'Import en cours…' : 'Importer Excel'}
        </Button>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New Subcontractor</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subs.map(sub => {
          const sc = scoresOf(sub)
          return (
            <Card key={sub.id} hover padding={false} onClick={() => setSelSub(sub)} className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900 dark:text-white">{sub.companyName}</p>
                    <span className={clsx('text-sm font-black px-2 py-0.5 rounded-lg', RATING_COLOR[sc.rating])}>
                      {sc.rating}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{sub.contactPerson} · {sub.email}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(sub.specializations??[]).map(sp=><span key={sp} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{sp}</span>)}
                  </div>
                </div>
                <div className="text-center flex-shrink-0 ml-3">
                  <p className={clsx('text-4xl font-black', sc.overallScore>=80?'text-green-600':sc.overallScore>=60?'text-amber-600':'text-red-600')}>
                    {sc.overallScore}
                  </p>
                  <p className="text-xs text-slate-400">/ 100</p>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                <ScoreBar label="ATP Success Rate" value={sc.atpSuccessRate} />
                <ScoreBar label="On-Time Delivery" value={sc.onTimeDelivery} />
                <ScoreBar label="Quality"          value={sc.qualityScore} />
                <ScoreBar label="Safety"           value={sc.safetyScore} />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">Active</p><p className="font-bold">{sub.activeProjects ?? 0} proj</p></div>
                <div><p className="text-slate-400">Completed</p><p className="font-bold">{sub.completedProjects ?? 0} proj</p></div>
                <div><p className="text-slate-400">Incidents</p><p className={clsx('font-bold',(sub.incidents??[]).length>0?'text-red-600':'text-green-600')}>{(sub.incidents??[]).length}</p></div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Subcontractor Detail Modal */}
      {selSub && (
        <Modal open title={selSub.companyName} onClose={() => setSelSub(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selSub.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selSub); setSelSub(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            {(() => { const sc = scoresOf(selSub); return (<>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className={clsx('text-5xl font-black', sc.overallScore>=80?'text-green-600':sc.overallScore>=60?'text-amber-600':'text-red-600')}>{sc.overallScore}</p>
                <p className="text-xs text-slate-500">Overall Score</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-bold text-xl text-slate-900 dark:text-white">{selSub.companyName}</h2>
                  <span className={clsx('text-lg font-black px-3 py-1 rounded-lg', RATING_COLOR[sc.rating])}>{sc.rating}</span>
                  {selSub.isApproved && <Badge status="active">Approved</Badge>}
                </div>
                <p className="text-slate-500 text-sm">{selSub.contactPerson} · {selSub.email} · {selSub.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Performance Scorecard</p>
                <div className="space-y-2">
                  <ScoreBar label="ATP Success Rate" value={sc.atpSuccessRate} />
                  <ScoreBar label="On-Time Delivery" value={sc.onTimeDelivery} />
                  <ScoreBar label="Quality Score"    value={sc.qualityScore} />
                  <ScoreBar label="Safety Score"     value={sc.safetyScore} />
                  <ScoreBar label="Response Time"    value={sc.responseTime} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={[
                  {metric:'ATP',     value:sc.atpSuccessRate},
                  {metric:'OnTime',  value:sc.onTimeDelivery},
                  {metric:'Quality', value:sc.qualityScore},
                  {metric:'Safety',  value:sc.safetyScore},
                  {metric:'Response',value:sc.responseTime},
                ]}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{fontSize:11}} />
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Incidents ({(selSub.incidents??[]).length})</p>
              {(selSub.incidents??[]).length === 0
                ? <p className="text-sm text-green-600 font-semibold">✓ No incidents recorded</p>
                : (selSub.incidents??[]).map(inc => (
                  <div key={inc.id} className={clsx('flex items-start gap-3 p-3 rounded-lg mb-2 border', inc.resolved?'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700':'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900')}>
                    <AlertTriangle className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', inc.resolved?'text-slate-400':'text-red-500')} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge status={inc.severity} />
                        <span className="text-xs text-slate-400 capitalize">{inc.type}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{inc.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-400">{inc.date}</p>
                      {inc.resolved && <p className="text-xs text-green-600 font-semibold">Resolved</p>}
                    </div>
                  </div>
                ))
              }
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Certifications</p>
              <div className="flex flex-wrap gap-2">
                {(selSub.certifications??[]).map(cert => <span key={cert} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-xs font-semibold">✓ {cert}</span>)}
              </div>
            </div>
            </>) })()}
          </div>
        </Modal>
      )}
      {modal}
    </div>
  )
}

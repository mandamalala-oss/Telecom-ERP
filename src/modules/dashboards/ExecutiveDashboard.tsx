import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Project, Site, Invoice, Task, EVMMetrics, Opportunity, Payment } from '@/types'

const fmt = (n: number | null | undefined) => {
  const v = n ?? 0
  return v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(2)}B Ar`
    : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M Ar`
    : `${v.toLocaleString()} Ar`
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

export function ExecutiveDashboard() {
  const { data: projects, loading: lp } = useEntity<Project>(TABLES.projects)
  const { data: sites, loading: ls } = useEntity<Site>(TABLES.sites)
  const { data: invoices, loading: li } = useEntity<Invoice>(TABLES.invoices)
  const { data: tasks, loading: lt } = useEntity<Task>(TABLES.tasks)
  const { data: evm, loading: le } = useEntity<EVMMetrics>(TABLES.evmMetrics)
  const { data: opportunities, loading: lo } = useEntity<Opportunity>(TABLES.opportunities)
  const { data: payments, loading: lpay } = useEntity<Payment>(TABLES.payments)

  const totalRevenue = useMemo(() =>
    invoices.reduce((s, i) => s + (i.paid ?? 0), 0), [invoices])

  const pendingAR = useMemo(() =>
    invoices.reduce((s, i) => s + (i.balance ?? 0), 0), [invoices])

  const activeSites = sites.filter(s => s.status !== 'decommissioned').length
  const liveSites   = sites.filter(s => s.status === 'live').length

  const activePrj = projects.filter(p => p.status === 'in_progress').length
  const openTasks = tasks.filter(t => !['done'].includes(t.status)).length

  // Monthly revenue, grouped from real payment rows (month: 'Jan', …).
  const revenueTrend = useMemo(() => {
    const byMonth = new Map<string, number>()
    for (const pay of payments) {
      const ym = (pay.date ?? '').slice(0, 7) // YYYY-MM
      if (!ym) continue
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + (pay.amount ?? 0))
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, revenue]) => ({
        month: new Date(`${ym}-01T00:00:00`).toLocaleString('en', { month: 'short' }),
        revenue,
      }))
  }, [payments])

  // Real month-over-month delta for the Total Revenue KPI.
  const revenueChange = useMemo(() => {
    const values = revenueTrend.map(t => t.revenue)
    if (values.length < 2) return 0
    const prev = values[values.length - 2]
    const last = values[values.length - 1]
    return prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0
  }, [revenueTrend])

  if (lp || ls || li || lt || le || lo || lpay) return <p className="text-xs text-slate-500">Loading…</p>

  // Site status breakdown
  const siteStatusData = [
    { name: 'Live',          value: sites.filter(s => s.status === 'live').length },
    { name: 'Installation',  value: sites.filter(s => s.status === 'installation').length },
    { name: 'Survey',        value: sites.filter(s => s.status === 'survey').length },
    { name: 'Integration',   value: sites.filter(s => s.status === 'integration').length },
    { name: 'ATP',           value: sites.filter(s => s.status === 'atp').length },
    { name: 'Planned',       value: sites.filter(s => s.status === 'planned').length },
    { name: 'Acceptance',    value: sites.filter(s => s.status === 'acceptance').length },
    { name: 'Decommissioned',value: sites.filter(s => s.status === 'decommissioned').length },
  ].filter(d => d.value > 0)

  // Pipeline by stage
  const pipelineData = [
    { stage: 'Prospecting', value: opportunities.filter(o => o.stage === 'prospecting').reduce((s, o) => s + (o.value??0), 0) / 1e6 },
    { stage: 'Proposal',    value: opportunities.filter(o => o.stage === 'proposal').reduce((s, o) => s + (o.value??0), 0) / 1e6 },
    { stage: 'Negotiation', value: opportunities.filter(o => o.stage === 'negotiation').reduce((s, o) => s + (o.value??0), 0) / 1e6 },
    { stage: 'Closed Won',  value: opportunities.filter(o => o.stage === 'closed_won').reduce((s, o) => s + (o.value??0), 0) / 1e6 },
  ]

  // EVM summary — null-safe (DB rows may carry NULL cpi/spi/percentComplete)
  const avgCPI = evm.length > 0 ? (evm.reduce((s, e) => s + (e.cpi ?? 0), 0) / evm.length).toFixed(2) : '1.00'
  const avgSPI = evm.length > 0 ? (evm.reduce((s, e) => s + (e.spi ?? 0), 0) / evm.length).toFixed(2) : '1.00'

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Revenue"   value={fmt(totalRevenue)}   change={revenueChange} changeLabel="vs last month" icon="💰" color="green"  />
        <StatCard label="Pending A/R"     value={fmt(pendingAR)}      icon="⏳"    color="amber"  />
        <StatCard label="Active Projects" value={activePrj}           icon="📁" color="blue"   />
        <StatCard label="Active Sites"    value={activeSites}         subtitle={`${liveSites} live`}            icon="📡" color="cyan"   />
        <StatCard label="Open Tasks"      value={openTasks}           icon="✅" color="purple" />
        <StatCard label="Avg CPI"         value={avgCPI}              subtitle={`Avg SPI: ${avgSPI}`}           icon="📊" color={Number(avgCPI) >= 1 ? 'green' : 'red'} />
      </div>

      {/* Revenue + Pipeline */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <div>
              <h3 className="section-title">Monthly Revenue</h3>
              <p className="text-xs text-slate-500 mt-0.5">Collected payments (Ariary)</p>
            </div>
          </div>
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-slate-500" />
                <YAxis tickFormatter={v => `${v/1e6}M`} tick={{ fontSize: 11 }} width={45} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="section-title">Site Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">{sites.length} total sites</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={siteStatusData} cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                dataKey="value" nameKey="name" paddingAngle={2}>
                {siteStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Pipeline + EVM + Projects */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sales Pipeline */}
        <Card padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="section-title">Sales Pipeline</h3>
            <p className="text-xs text-slate-500 mt-0.5">Value in M Ar by stage</p>
          </div>
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pipelineData} layout="vertical" margin={{ left: 0, right: 15 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v}M`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}M Ar`} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Value (M Ar)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* EVM Summary */}
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="section-title">EVM Summary</h3>
            <p className="text-xs text-slate-500 mt-0.5">Cost & Schedule Performance</p>
          </div>
          <div className="px-5 space-y-3 pb-4">
            {evm.map(e => (
              <div key={`${e.projectId}-${e.dataDate ?? ''}`} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate pr-2">{(e.projectName??'').split(' ').slice(0,3).join(' ')}</p>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${(e.cpi ?? 0) >= 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>CPI {(e.cpi ?? 0).toFixed(2)}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${(e.spi ?? 0) >= 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>SPI {(e.spi ?? 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                  <div className="bg-brand-600 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, e.percentComplete ?? 0)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{e.percentComplete ?? 0}% complete</span>
                  <span>EAC: {fmt(e.eac)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Active Projects */}
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="section-title">Active Projects</h3>
              <p className="text-xs text-slate-500 mt-0.5">{projects.length} total</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {projects.map(p => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.customerName} · {p.region}</p>
                  </div>
                  <Badge status={p.status} className="flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${(p.progress ?? 0) > 80 ? 'bg-green-500' : (p.progress ?? 0) > 40 ? 'bg-brand-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, p.progress ?? 0)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-8 text-right">{p.progress ?? 0}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{fmt(p.spent??0)} of {fmt(p.budget??0)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="section-title">Recent Payments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['Invoice','Customer','Amount','Method','Date','Status'].map(h => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {payments.map(pay => (
                <tr key={pay.id} className="tr-hover">
                  <td className="td font-mono text-xs font-semibold text-brand-600">{pay.invoiceNumber}</td>
                  <td className="td font-medium">{pay.customerName}</td>
                  <td className="td font-bold text-green-600 dark:text-green-400">{fmt(pay.amount)}</td>
                  <td className="td"><Badge status="sent">{pay.method?.replace('_',' ')}</Badge></td>
                  <td className="td text-slate-500">{pay.date}</td>
                  <td className="td"><Badge status="paid" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

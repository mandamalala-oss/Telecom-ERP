import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  emptyMessage?: string
  loading?: boolean
}

export function DataTable<T extends { id: string }>({ columns, data, onRowClick, emptyMessage = 'No data found', loading }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className={`th ${col.className ?? ''}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="td text-center py-12 text-slate-500">Loading…</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="td text-center py-12 text-slate-500">{emptyMessage}</td></tr>
          ) : data.map(row => (
            <tr key={row.id} className={`tr-hover ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(row)}>
              {columns.map(col => (
                <td key={col.key} className={`td ${col.className ?? ''}`}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

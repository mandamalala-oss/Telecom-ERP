import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useEntity } from './useEntity'
import { EntityFormModal, type FieldConfig } from '@/components/crud/EntityFormModal'
import { FIELD_CONFIGS, TABLE_MODULE } from '@/lib/api/entityConfigs'
import { stripVirtualFields } from '@/lib/formPayload'

// Drop-in hook used by every module: real Supabase list + working
// New/Edit/Delete, backed by the generic form modal. Modules just
// render `<>{modal}</>` once and call openCreate()/openEdit(row)/remove(id).
export function useEntityCrud<T extends { id?: string }>(
  table: string,
  entityLabel: string,
  fieldsOverride?: FieldConfig[],
  onCreated?: (row: T, values: Record<string, any>) => Promise<void>,
  transformPayload?: (values: Record<string, any>, editing: T | null) => Record<string, any>,
  onUpdated?: (row: T, values: Record<string, any>, previous: T | null) => Promise<void>,
  modalExtraLookup?: Record<string, any[]>,
  validate?: (values: Record<string, any>, editing: T | null) => string | null
) {
  const { canEdit } = useAuth()
  // Per-member module grant: only members with 'edit' may create/update/
  // delete. The CEO always has edit; other members get exactly what was
  // granted in the Team matrix. Tables not in TABLE_MODULE are not gated
  // (e.g. junction rows).
  const moduleKey = TABLE_MODULE[table]
  const editable = moduleKey ? canEdit(moduleKey) : true

  const entity = useEntity<T>(table)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const fields = fieldsOverride ?? FIELD_CONFIGS[table] ?? []

  const blocked = () => {
    console.warn(`[useEntityCrud] Edit blocked for "${table}" — user lacks 'edit' on module '${moduleKey}'`)
    return undefined
  }

  const openCreate = () => {
    if (!editable) { blocked(); return }
    setEditing(null); setModalOpen(true)
  }
  const openEdit = (row: T) => {
    if (!editable) { blocked(); return }
    setEditing(row); setModalOpen(true)
  }
  const close = () => setModalOpen(false)

  // Guarded CRUD surface: same signatures, but a no-op (undefined) when the
  // member lacks 'edit' on this table's module.
  const create = (payload: Partial<T>) => (editable ? entity.create(payload) : blocked())
  const update = (id: string, payload: Partial<T>) => (editable ? entity.update(id, payload) : blocked())
  const remove = (id: string) => (editable ? entity.remove(id) : blocked())

  const handleSubmit = async (values: Record<string, any>) => {
    if (!editable) return blocked()
    // Optional pre-save transform (e.g. EVM derives CPI/SPI/EAC from
    // BAC/PV/EV/AC before the row is written).
    const transformed = transformPayload ? transformPayload(values, editing) : values
    // Virtual fields (e.g. multiSelect site links) never touch the table row —
    // they are handled as side effects by onCreated/onUpdated.
    const payload = stripVirtualFields(transformed, fields)
    if (editing && editing.id) {
      const row = await entity.update(editing.id, payload as Partial<T>)
      // Keep the modal's `initial` in sync with what was actually saved so a
      // reopen of the same record shows fresh values, not the pre-save ones.
      setEditing(row)
      // Optional post-update side effects (same contract as onCreated).
      // `editing` is still the pre-save row at this point, so callbacks can
      // release resources that were removed by the edit (e.g. swapped crew).
      await onUpdated?.(row, values, editing)
    } else {
      const row = await entity.create(payload as Partial<T>)
      // Optional post-create side effects (e.g. inventory movement → adjust
      // item quantity, payment → update invoice paid, project → link sites).
      // Errors surface in the modal, like any other submit failure.
      await onCreated?.(row, values)
    }
  }

  const modal = (
    <EntityFormModal
      open={modalOpen}
      onClose={close}
      title={editing ? `Edit ${entityLabel}` : `New ${entityLabel}`}
      fields={fields}
      initial={editing ?? undefined}
      onSubmit={handleSubmit}
      extraLookup={modalExtraLookup}
      validate={(values) => validate?.(values, editing) ?? null}
    />
  )

  return { ...entity, create, update, remove, openCreate, openEdit, modal, editing, editable }
}

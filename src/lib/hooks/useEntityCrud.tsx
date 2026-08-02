import { useState } from 'react'
import { useEntity } from './useEntity'
import { EntityFormModal, type FieldConfig } from '@/components/crud/EntityFormModal'
import { FIELD_CONFIGS } from '@/lib/api/entityConfigs'

// Drop-in hook used by every module: real Supabase list + working
// New/Edit/Delete, backed by the generic form modal. Modules just
// render `<>{modal}</>` once and call openCreate()/openEdit(row)/remove(id).
export function useEntityCrud<T extends { id?: string }>(
  table: string,
  entityLabel: string,
  fieldsOverride?: FieldConfig[],
  onCreated?: (row: T, values: Record<string, any>) => Promise<void>
) {
  const entity = useEntity<T>(table)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const fields = fieldsOverride ?? FIELD_CONFIGS[table] ?? []

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (row: T) => { setEditing(row); setModalOpen(true) }
  const close = () => setModalOpen(false)

  const handleSubmit = async (values: Record<string, any>) => {
    if (editing && editing.id) {
      const row = await entity.update(editing.id, values as Partial<T>)
      // Keep the modal's `initial` in sync with what was actually saved so a
      // reopen of the same record shows fresh values, not the pre-save ones.
      setEditing(row)
    } else {
      const row = await entity.create(values as Partial<T>)
      // Optional post-create side effects (e.g. inventory movement → adjust
      // item quantity, payment → update invoice paid). Errors surface in the
      // modal, like any other submit failure.
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
    />
  )

  return { ...entity, openCreate, openEdit, modal, editing }
}

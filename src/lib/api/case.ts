// Converts between the DB's snake_case columns and the app's camelCase types.
export function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

export function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

export function keysToCamel<T = any>(input: unknown): T {
  if (Array.isArray(input)) return input.map((v) => keysToCamel(v)) as unknown as T
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      out[toCamel(k)] = keysToCamel(v)
    }
    return out as T
  }
  return input as T
}

export function keysToSnake<T = any>(input: unknown): T {
  if (Array.isArray(input)) return input.map((v) => keysToSnake(v)) as unknown as T
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      out[toSnake(k)] = v // don't recurse into JSONB payload values — keep their inner shape (already flat arrays of objects with their own keys, fine either way, but avoid mangling free-text keys)
    }
    return out as T
  }
  return input as T
}

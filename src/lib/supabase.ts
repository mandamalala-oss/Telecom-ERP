import { createClient } from '@supabase/supabase-js'

// Credentials come exclusively from the environment. There is intentionally
// NO fallback here: silently connecting to a hardcoded project used to ship
// live anon keys in the bundle. If the env vars are missing, fail loudly so
// the misconfiguration cannot go unnoticed.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials. Create a .env file from .env.example with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

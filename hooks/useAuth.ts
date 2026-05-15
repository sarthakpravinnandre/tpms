import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    async function getSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted) {
          setUser(session?.user || null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to get session')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user || null)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [supabase])

  return { user, loading, error }
}

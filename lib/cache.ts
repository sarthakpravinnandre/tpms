import { createClient } from '@/lib/supabase/server'

export interface CacheEntry {
  key: string
  value: any
  ttl?: number // in seconds
}

const CACHE_TTL = {
  VERY_SHORT: 60, // 1 minute
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 hour
  LONG: 86400, // 24 hours
}

/**
 * Set a value in cache with TTL
 */
export async function setCacheValue(key: string, value: any, ttl: number = CACHE_TTL.MEDIUM): Promise<void> {
  const supabase = await createClient()

  const expiresAt = new Date(Date.now() + ttl * 1000)

  await supabase.from('cache').upsert(
    [
      {
        key,
        value,
        created_at: new Date(),
        expires_at: expiresAt,
      },
    ],
    { onConflict: 'key' }
  )
}

/**
 * Get a value from cache
 */
export async function getCacheValue(key: string): Promise<any | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cache')
    .select('value, expires_at')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) return null

  // Check if cache has expired
  if (new Date(data.expires_at) < new Date()) {
    // Delete expired cache entry
    await supabase.from('cache').delete().eq('key', key)
    return null
  }

  return data.value
}

/**
 * Delete a cache entry
 */
export async function deleteCacheValue(key: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('cache').delete().eq('key', key)
}

/**
 * Clear all expired cache entries
 */
export async function clearExpiredCache(): Promise<void> {
  const supabase = await createClient()

  await supabase.from('cache').delete().lt('expires_at', new Date().toISOString())
}

/**
 * Get or compute a cached value
 */
export async function getOrComputeCacheValue<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
  // Try to get from cache first
  const cached = await getCacheValue(key)
  if (cached !== null) {
    return cached as T
  }

  // Compute the value
  const value = await computeFn()

  // Store in cache
  await setCacheValue(key, value, ttl)

  return value
}

export const CACHE_TTL_CONFIG = CACHE_TTL

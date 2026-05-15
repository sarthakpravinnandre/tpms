import { createServiceClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/** Comma-separated emails (case-insensitive) that always receive admin + approved on login. */
export function parseBootstrapAdminEmails(): string[] {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS?.trim()
  if (!raw) return []
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/**
 * If the signed-in user is listed in BOOTSTRAP_ADMIN_EMAILS and the service role key is set,
 * removes all existing admin role assignments, then assigns admin + approval to every
 * bootstrap email that has a row in public.users (and always the current auth user id).
 */
export async function ensureBootstrapAdmin(user: User | null): Promise<void> {
  if (!user?.email) return
  const bootstrapEmails = parseBootstrapAdminEmails()
  if (bootstrapEmails.length === 0) return
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      'BOOTSTRAP_ADMIN_EMAILS is set but SUPABASE_SERVICE_ROLE_KEY is missing; bootstrap admin skipped.',
    )
    return
  }

  const emailNorm = user.email.trim().toLowerCase()
  if (!bootstrapEmails.includes(emailNorm)) return

  const serviceSupabase = await createServiceClient()

  const { data: adminRole, error: roleErr } = await serviceSupabase
    .from('roles')
    .select('id')
    .eq('name', 'admin')
    .single()

  if (roleErr || !adminRole) {
    console.error('ensureBootstrapAdmin: admin role not found', roleErr)
    return
  }

  const { error: delErr } = await serviceSupabase
    .from('user_roles')
    .delete()
    .eq('role_id', adminRole.id)

  if (delErr) {
    console.error('ensureBootstrapAdmin: failed to clear admin roles', delErr)
    return
  }

  const userIds = new Set<string>()
  userIds.add(user.id)

  for (const em of bootstrapEmails) {
    const { data: row } = await serviceSupabase
      .from('users')
      .select('id')
      .ilike('email', em)
      .maybeSingle()
    if (row?.id) userIds.add(row.id)
  }

  for (const uid of userIds) {
    const { error: insErr } = await serviceSupabase.from('user_roles').insert({
      user_id: uid,
      role_id: adminRole.id,
    })
    if (insErr && !insErr.message?.includes('duplicate')) {
      console.error('ensureBootstrapAdmin: insert user_roles failed', insErr)
    }
  }

  const now = new Date().toISOString()
  for (const uid of userIds) {
    await serviceSupabase
      .from('users')
      .update({
        approval_status: 'approved',
        approved_by: user.id,
        approved_at: now,
        requested_role: 'admin',
      })
      .eq('id', uid)

    await serviceSupabase
      .from('role_requests')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: now,
      })
      .eq('user_id', uid)
      .eq('status', 'pending')
  }
}

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ensureBootstrapAdmin } from '@/lib/bootstrap-admin'
import {
  OAUTH_REQUESTED_ROLE_COOKIE,
  parseOAuthRequestedRole,
} from '@/lib/oauth-role-cookie'
import { createSupabaseAdmin } from '@/lib/supabase/admin-client'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function authRedirect(origin: string, path: string) {
  const res = NextResponse.redirect(`${origin}${path}`)
  res.cookies.set(OAUTH_REQUESTED_ROLE_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      const cookieStore = await cookies()
      const oauthRole = parseOAuthRequestedRole(
        cookieStore.get(OAUTH_REQUESTED_ROLE_COOKIE)?.value,
      )

      if (user && oauthRole) {
        const admin = createSupabaseAdmin()
        if (admin) {
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              requested_role: oauthRole,
            },
          })
        }
      }

      const effectiveRole =
        user?.user_metadata?.requested_role ?? oauthRole

      if (user && effectiveRole) {
        const serviceSupabase = await createServiceClient()

        const { count: roleReqCount } = await serviceSupabase
          .from('role_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        const { count: assignedRoles } = await serviceSupabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        const alreadyOnboarded =
          (roleReqCount ?? 0) > 0 || (assignedRoles ?? 0) > 0

        if (alreadyOnboarded) {
          // Avoid duplicate inserts on every OAuth code exchange / repeat callback
        } else if (effectiveRole === 'admin') {
          const { data: existingAdmins } = await serviceSupabase
            .from('user_roles')
            .select('user_id')
            .eq(
              'role_id',
              (await serviceSupabase.from('roles').select('id').eq('name', 'admin').single())
                .data?.id,
            )

          const hasAdmins = existingAdmins && existingAdmins.length > 0

          if (!hasAdmins) {
            const { data: roleData } = await serviceSupabase
              .from('roles')
              .select('id')
              .eq('name', 'admin')
              .single()

            if (roleData) {
              await serviceSupabase.from('user_roles').insert({
                user_id: user.id,
                role_id: roleData.id,
              })

              await serviceSupabase
                .from('users')
                .update({
                  approval_status: 'approved',
                  approved_by: user.id,
                  approved_at: new Date().toISOString(),
                  requested_role: 'admin',
                })
                .eq('id', user.id)

              await serviceSupabase
                .from('role_requests')
                .update({
                  status: 'approved',
                  reviewed_by: user.id,
                  reviewed_at: new Date().toISOString(),
                })
                .eq('user_id', user.id)
                .eq('requested_role', 'admin')
            }
          } else {
            const { error: roleError } = await serviceSupabase
              .from('role_requests')
              .insert({
                user_id: user.id,
                requested_role: 'admin',
                reason_for_request: `User requested admin role on signup`,
                status: 'pending',
              })
            if (roleError) {
              console.error('Error creating role request:', roleError)
            }
          }
        } else {
            const { error: roleError } = await serviceSupabase
              .from('role_requests')
              .insert({
                user_id: user.id,
                requested_role: effectiveRole,
                reason_for_request: `User requested ${effectiveRole} role on signup`,
                status: 'pending',
              })
            if (roleError) {
              console.error('Error creating role request:', roleError)
            }
        }
      }
      if (user) {
        await ensureBootstrapAdmin(user)
      }
      return authRedirect(origin, next)
    }
  }

  return authRedirect(origin, '/auth/error')
}

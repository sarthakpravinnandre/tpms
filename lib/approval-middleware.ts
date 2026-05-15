import { createClient } from '@/lib/supabase/server'

export async function checkUserApprovalStatus(userId: string) {
  try {
    const supabase = await createClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('approval_status, requested_role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error checking approval status:', error)
      return null
    }

    return user
  } catch (error) {
    console.error('Error in checkUserApprovalStatus:', error)
    return null
  }
}

export function shouldRedirectToPendingApproval(
  pathname: string,
  approvalStatus: string
): boolean {
  // Pages that don't require approval
  const publicPaths = [
    '/auth',
    '/pending-approval',
    '/api',
    '/sign-out',
  ]

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

  // If user is not approved and trying to access dashboard (except pending-approval), redirect
  if (
    approvalStatus !== 'approved' &&
    pathname.startsWith('/dashboard') &&
    !pathname.includes('pending-approval')
  ) {
    return true
  }

  return false
}

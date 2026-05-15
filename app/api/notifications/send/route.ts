import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const { event, userEmail, userName, requestedRole, rejectionReason } = payload

    // In production, integrate with email service like SendGrid, Resend, etc.
    // For now, we'll log the notification and store it in the database

    const supabase = await createClient()

    // Store notification in database for in-app notifications
    if (event === 'role_approved' || event === 'role_rejected') {
      // Get user by email
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', userEmail)
        .single()

      if (user) {
        const notificationType = event === 'role_approved' ? 'approval_granted' : 'approval_rejected'
        const message =
          event === 'role_approved'
            ? 'Your role request has been approved. You can now access the full system.'
            : `Your role request was not approved. Reason: ${rejectionReason}`

        await supabase.from('notifications').insert({
          user_id: user.id,
          title: event === 'role_approved' ? 'Role Approved' : 'Role Request Rejected',
          message,
          notification_type: notificationType,
          is_read: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    // Log notification event
    console.log('[NOTIFICATION]', {
      event,
      userEmail,
      requestedRole,
      timestamp: new Date().toISOString(),
    })

    // TODO: Integrate with actual email service
    // Example with Resend:
    // const { data, error } = await resend.emails.send({
    //   from: 'noreply@tpms.example.com',
    //   to: userEmail,
    //   subject: getNotificationTemplate(event).subject,
    //   html: getNotificationTemplate(event).template,
    // })

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
      event,
      userEmail,
    })
  } catch (error) {
    console.error('Error sending notification:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to send notification',
      },
      { status: 500 }
    )
  }
}

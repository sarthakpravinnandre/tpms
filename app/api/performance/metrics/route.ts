import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = request.nextUrl.searchParams.get('userId')
    const period = request.nextUrl.searchParams.get('period') || 'monthly'

    // Check permissions
    if (userId && userId !== user.id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('roles:role_id(name)')
        .eq('user_id', user.id)

      const isAdmin = roles?.some((r: any) => r.roles?.name === 'admin')
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        )
      }
    }

    const targetUserId = userId || user.id

    const { data, error } = await supabase
      .from('performance_metrics')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('period', period)
      .order('metric_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching performance metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Calculate performance metrics for a user
async function calculateUserMetrics(
  supabase: any,
  userId: string,
  period: string = 'monthly'
) {
  try {
    // Get user tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, status, created_at, updated_at, due_date')
      .eq('assigned_to', userId)

    if (!tasks || tasks.length === 0) {
      return null
    }

    const now = new Date()
    const totalTasks = tasks.length
    const completedTasks = tasks.filter((t: any) => t.status === 'completed').length
    const onTimeTasks = tasks.filter((t: any) => {
      if (t.status !== 'completed') return false
      return new Date(t.updated_at) <= new Date(t.due_date)
    }).length

    const completionRate = (completedTasks / totalTasks) * 100
    const onTimePercentage = (onTimeTasks / completedTasks) * 100 || 0

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const metricDate = today.toISOString().split('T')[0]

    return {
      completion_rate: parseFloat(completionRate.toFixed(2)),
      on_time_percentage: parseFloat(onTimePercentage.toFixed(2)),
      metric_date: metricDate,
    }
  } catch (error) {
    console.error('Error calculating metrics:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin permissions for calculating metrics for other users
    if (userId && userId !== user.id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('roles:role_id(name)')
        .eq('user_id', user.id)

      const isAdmin = roles?.some((r: any) => r.roles?.name === 'admin')
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        )
      }
    }

    const targetUserId = userId || user.id
    const metrics = await calculateUserMetrics(supabase, targetUserId)

    if (!metrics) {
      return NextResponse.json(
        { error: 'No tasks found to calculate metrics' },
        { status: 400 }
      )
    }

    // Store metrics
    const { data, error } = await supabase
      .from('performance_metrics')
      .insert({
        user_id: targetUserId,
        metric_type: 'completion_rate',
        period: 'monthly',
        metric_date: metrics.metric_date,
        metric_value: metrics.completion_rate,
      })
      .select()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error calculating and storing metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

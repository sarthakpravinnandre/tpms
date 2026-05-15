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

    const taskId = request.nextUrl.searchParams.get('taskId')

    let query = supabase
      .from('time_entries')
      .select('*, users:user_id(first_name, last_name, email)')
      .eq('user_id', user.id)

    if (taskId) {
      query = query.eq('task_id', taskId)
    }

    const { data, error } = await query.order('work_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching time entries:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { taskId, hoursWorked, description, workDate } = await request.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate input
    if (!taskId || !hoursWorked || !workDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (hoursWorked <= 0) {
      return NextResponse.json(
        { error: 'Hours worked must be greater than 0' },
        { status: 400 }
      )
    }

    // Verify task exists and user is assigned
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check if user is assigned to task
    if (task.assigned_to !== user.id && task.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Not assigned to this task' },
        { status: 403 }
      )
    }

    // Create time entry
    const { data: entry, error: createError } = await supabase
      .from('time_entries')
      .insert({
        task_id: taskId,
        user_id: user.id,
        hours_worked: hoursWorked,
        description,
        work_date: workDate,
        entry_type: 'actual',
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    // Update task actual_hours
    const currentActualHours = task.actual_hours || 0
    await supabase
      .from('tasks')
      .update({
        actual_hours: currentActualHours + hoursWorked,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating time entry:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { status } = await request.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate status transition
    const validStatuses = ['todo', 'in_progress', 'review', 'completed', 'blocked']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get current task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()

    if (taskError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions (must be creator or assignee)
    if (task.created_by !== user.id && task.assigned_to !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Update task status
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }

    // Record history
    await supabase.from('task_history').insert({
      task_id: id,
      action: 'status_changed',
      old_value: task.status,
      new_value: status,
      changed_by: user.id,
    })

    // Create notification if task completed
    if (status === 'completed' && task.assigned_to) {
      await supabase.from('notifications').insert({
        user_id: task.assigned_to,
        title: 'Task Completed',
        message: `Task "${task.title}" has been completed`,
        notification_type: 'task_updated',
        related_entity_type: 'task',
        related_entity_id: id,
      })
    }

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('Error updating task status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { createClient } from '@/lib/supabase/server'
import { recommendTaskAssignees, autoAssignTask } from '@/lib/task-assignment'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify task exists and user has access
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions
    if (task.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const recommendations = await recommendTaskAssignees(id, 5)

    return NextResponse.json(recommendations)
  } catch (error) {
    console.error('Error getting task recommendations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { action, assigneeId } = await request.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify task exists
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions
    if (task.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    if (action === 'auto-assign') {
      const assignedTo = await autoAssignTask(id)
      return NextResponse.json({ assigned_to: assignedTo })
    } else if (action === 'assign' && assigneeId) {
      const { error } = await supabase
        .from('tasks')
        .update({
          assigned_to: assigneeId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }

      // Record history
      await supabase.from('task_history').insert({
        task_id: id,
        action: 'assigned',
        new_value: assigneeId,
        changed_by: user.id,
      })

      // Create notification
      await supabase.from('notifications').insert({
        user_id: assigneeId,
        title: 'Task Assigned',
        message: `You have been assigned a new task: "${task.title}"`,
        notification_type: 'task_assigned',
        related_entity_type: 'task',
        related_entity_id: id,
      })

      return NextResponse.json({ assigned_to: assigneeId })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error assigning task:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

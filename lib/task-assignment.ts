import { createClient } from '@/lib/supabase/server'

interface UserCandidate {
  userId: string
  score: number
  qualifications: number
  experience: number
  workload: number
  department: number
}

export async function calculateTaskAssignmentScore(
  candidates: any[],
  task: any,
  weights = {
    qualification: 0.4,
    experience: 0.3,
    workload: 0.2,
    department: 0.1,
  }
): Promise<UserCandidate[]> {
  const supabase = await createClient()

  const scoredCandidates: UserCandidate[] = []

  for (const candidate of candidates) {
    let qualScore = 0
    let expScore = 0
    let workloadScore = 0
    let deptScore = 0

    // Calculate qualification score
    if (task.required_qualifications && task.required_qualifications.length > 0) {
      const { data: userQuals } = await supabase
        .from('user_qualifications')
        .select('qualification_id')
        .eq('user_id', candidate.id)
        .eq('verified', true)

      const matchedQuals = userQuals?.filter((q: any) =>
        task.required_qualifications.includes(q.qualification_id)
      ).length || 0

      qualScore = (matchedQuals / task.required_qualifications.length) * 100
    }

    // Calculate experience score based on completed tasks
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('assigned_to', candidate.id)
      .eq('status', 'completed')

    expScore = Math.min((completedTasks?.length || 0) / 10 * 100, 100)

    // Calculate workload score (lower is better)
    const { data: activeTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('assigned_to', candidate.id)
      .in('status', ['todo', 'in_progress', 'review'])

    const activeTaskCount = activeTasks?.length || 0
    workloadScore = Math.max(100 - (activeTaskCount * 20), 0)

    // Calculate department match score
    if (task.department_id && candidate.department_id) {
      deptScore = task.department_id === candidate.department_id ? 100 : 50
    }

    const totalScore =
      qualScore * weights.qualification +
      expScore * weights.experience +
      workloadScore * weights.workload +
      deptScore * weights.department

    scoredCandidates.push({
      userId: candidate.id,
      score: Math.round(totalScore),
      qualifications: Math.round(qualScore),
      experience: Math.round(expScore),
      workload: Math.round(workloadScore),
      department: Math.round(deptScore),
    })
  }

  return scoredCandidates.sort((a, b) => b.score - a.score)
}

export async function recommendTaskAssignees(
  taskId: string,
  numberOfSuggestions = 3
): Promise<UserCandidate[]> {
  const supabase = await createClient()

  // Get task details
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!task) {
    throw new Error('Task not found')
  }

  // Get all active users
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)

  if (!users || users.length === 0) {
    throw new Error('No active users found')
  }

  // Calculate scores for all users
  const scoredUsers = await calculateTaskAssignmentScore(users, task)

  // Return top N suggestions
  return scoredUsers.slice(0, numberOfSuggestions)
}

export async function autoAssignTask(taskId: string): Promise<string | null> {
  const recommendations = await recommendTaskAssignees(taskId, 1)

  if (recommendations.length === 0) {
    return null
  }

  const supabase = await createClient()
  const assigneeId = recommendations[0].userId

  // Update task with assignment
  const { error } = await supabase
    .from('tasks')
    .update({
      assigned_to: assigneeId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    throw error
  }

  // Record history
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('task_history').insert({
    task_id: taskId,
    action: 'assigned',
    new_value: assigneeId,
    changed_by: user?.id,
  })

  // Create notification
  await supabase.from('notifications').insert({
    user_id: assigneeId,
    title: 'Task Assigned',
    message: `You have been assigned a new task`,
    notification_type: 'task_assigned',
    related_entity_type: 'task',
    related_entity_id: taskId,
  })

  return assigneeId
}

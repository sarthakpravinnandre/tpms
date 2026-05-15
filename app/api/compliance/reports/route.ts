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

    const projectId = request.nextUrl.searchParams.get('projectId')
    const complianceType = request.nextUrl.searchParams.get('complianceType')

    let query = supabase
      .from('compliance_reports')
      .select('*, projects:project_id(name), reviewed_by:reviewed_by(first_name, last_name)')

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    if (complianceType) {
      query = query.eq('compliance_type', complianceType)
    }

    const { data, error } = await query.order('generated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching compliance reports:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, complianceType } = await request.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!projectId || !complianceType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify project exists and user owns it
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Calculate compliance score based on type
    let score = 0
    let status = 'pass'
    let findings = ''
    let recommendations = ''

    if (complianceType === 'deadline_adherence') {
      // Calculate deadline adherence
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status, due_date, updated_at')
        .eq('project_id', projectId)

      if (tasks && tasks.length > 0) {
        const onTimeTasks = tasks.filter((t: any) => {
          if (t.status !== 'completed') return false
          return new Date(t.updated_at) <= new Date(t.due_date)
        }).length

        score = (onTimeTasks / tasks.length) * 100
        status = score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail'

        if (score < 80) {
          findings = `${Math.round(100 - score)}% of tasks were completed late`
          recommendations = 'Consider improving deadline management and task prioritization'
        }
      }
    } else if (complianceType === 'resource_utilization') {
      // Calculate resource utilization
      const { data: members } = await supabase
        .from('project_team_members')
        .select('user_id')
        .eq('project_id', projectId)

      const { data: tasks } = await supabase
        .from('tasks')
        .select('assigned_to')
        .eq('project_id', projectId)

      if (members && tasks) {
        const utilizedMembers = new Set(tasks.map((t: any) => t.assigned_to)).size
        score = (utilizedMembers / members.length) * 100
        status = score >= 70 ? 'pass' : 'warning'

        if (score < 70) {
          findings = `Only ${utilizedMembers}/${members.length} team members are actively assigned`
          recommendations = 'Better distribute tasks among team members'
        }
      }
    } else if (complianceType === 'quality_assurance') {
      // Quality based on tasks in review vs completed
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status')
        .eq('project_id', projectId)

      if (tasks && tasks.length > 0) {
        const reviewTasks = tasks.filter((t: any) => t.status === 'review').length
        const completedTasks = tasks.filter((t: any) => t.status === 'completed').length

        score = completedTasks > 0 ? ((completedTasks - reviewTasks) / completedTasks) * 100 : 50
        status = score >= 85 ? 'pass' : score >= 70 ? 'warning' : 'fail'

        if (score < 85) {
          findings = `${reviewTasks} tasks pending review - potential quality concerns`
          recommendations = 'Implement stricter QA processes before task completion'
        }
      }
    }

    const { data: report, error: createError } = await supabase
      .from('compliance_reports')
      .insert({
        project_id: projectId,
        compliance_type: complianceType,
        score: Math.round(score),
        status,
        findings,
        recommendations,
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    console.error('Error creating compliance report:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

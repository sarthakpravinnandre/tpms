import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getMLRecommendations, getCachedRecommendations, cacheRecommendations } from '@/lib/ml-recommendations'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await request.json()

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if user owns the task
    const { data: task } = await supabase
      .from('tasks')
      .select('id, project_id')
      .eq('id', taskId)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', task.project_id)
      .maybeSingle()

    if (project?.owner_id !== currentUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check cache first
    const cachedRecommendations = await getCachedRecommendations(taskId)
    if (cachedRecommendations) {
      return NextResponse.json({
        recommendations: cachedRecommendations,
        cached: true,
      })
    }

    // Get task features
    const { data: taskFeatures } = await supabase
      .from('task_feature_vectors')
      .select('*')
      .eq('task_id', taskId)
      .maybeSingle()

    if (!taskFeatures) {
      return NextResponse.json({ error: 'Task features not found' }, { status: 404 })
    }

    // Get all user vectors
    const { data: userVectors } = await supabase.from('user_feature_vectors').select('*').limit(100)

    if (!userVectors || userVectors.length === 0) {
      return NextResponse.json({ error: 'No user vectors available' }, { status: 400 })
    }

    // Generate recommendations
    const recommendations = await getMLRecommendations(
      taskId,
      {
        taskId,
        featureVector: taskFeatures.feature_vector,
        complexityScore: taskFeatures.complexity_score,
        requiredSkills: taskFeatures.required_skills,
        requiredQualifications: taskFeatures.required_qualifications,
        teamSizeRequirement: taskFeatures.team_size_requirement,
      },
      userVectors.map((v) => ({
        userId: v.user_id,
        featureVector: v.feature_vector,
        skillTags: v.skill_tags,
        experienceScore: v.experience_score,
        performanceScore: v.performance_score,
        workloadPreference: v.workload_preference,
      }))
    )

    // Cache the recommendations
    await cacheRecommendations(taskId, recommendations)

    return NextResponse.json({
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
      cached: false,
    })
  } catch (error) {
    console.error('ML recommendations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  predictCompletionTime,
  predictFailureRisk,
  predictQualityScore,
  storePrediction,
} from '@/lib/predictive-analytics'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId, userId, predictionType } = await request.json()

    if (!taskId || !userId || !predictionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get task details
    const { data: task } = await supabase
      .from('tasks')
      .select('id, project_id, estimated_hours, priority, due_date')
      .eq('id', taskId)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check authorization
    const { data: project } = await supabase.from('projects').select('owner_id').eq('id', task.project_id).maybeSingle()

    if (project?.owner_id !== currentUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get user details
    const { data: user } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let predictions: any = {}

    // Generate predictions based on type
    if (predictionType === 'all' || predictionType === 'completion_time') {
      const completionPrediction = await predictCompletionTime(
        task.estimated_hours || 8,
        userId,
        task.priority === 'critical' ? 'high' : task.priority === 'low' ? 'low' : 'medium'
      )

      predictions.completionTime = completionPrediction

      await storePrediction(
        taskId,
        userId,
        'completion_time',
        completionPrediction.estimatedHours,
        completionPrediction.confidenceScore,
        completionPrediction.factors
      )
    }

    if (predictionType === 'all' || predictionType === 'failure_risk') {
      const days = task.due_date
        ? Math.ceil(
            (new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          )
        : 7

      // Get user experience score
      const { data: userMetrics } = await supabase
        .from('task_metrics')
        .select('quality_score')
        .eq('assigned_user_id', userId)
        .limit(1)

      const experienceScore = userMetrics?.[0]?.quality_score || 75

      const failureRiskPrediction = await predictFailureRisk(
        task.priority === 'critical' ? 'high' : task.priority === 'low' ? 'low' : 'medium',
        days,
        userId,
        experienceScore
      )

      predictions.failureRisk = failureRiskPrediction

      await storePrediction(
        taskId,
        userId,
        'failure_risk',
        failureRiskPrediction.riskScore,
        failureRiskPrediction.confidenceScore,
        {
          riskLevel: failureRiskPrediction.riskLevel,
          factors: failureRiskPrediction.factors,
          mitigationStrategies: failureRiskPrediction.mitigationStrategies,
        }
      )
    }

    if (predictionType === 'all' || predictionType === 'quality_score') {
      // Simple skill match placeholder
      const skillMatch = 0.8

      const qualityPrediction = await predictQualityScore(
        userId,
        skillMatch,
        task.priority === 'critical' ? 'high' : task.priority === 'low' ? 'low' : 'medium'
      )

      predictions.qualityScore = qualityPrediction

      await storePrediction(
        taskId,
        userId,
        'quality_score',
        qualityPrediction.expectedScore,
        qualityPrediction.confidenceScore,
        qualityPrediction.factors
      )
    }

    return NextResponse.json({ predictions })
  } catch (error) {
    console.error('Predictions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

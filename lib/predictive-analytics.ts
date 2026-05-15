import { createClient } from '@/lib/supabase/server'

export interface CompletionTimePrediction {
  estimatedHours: number
  confidenceScore: number
  factors: {
    userSpeedMultiplier: number
    workloadAdjustment: number
    complexityFactor: number
  }
  historicalData: {
    averageCompletionTime: number
    userAverageTime: number
    similarTasksAverage: number
  }
}

export interface FailureRiskPrediction {
  riskScore: number // 0-1
  riskLevel: 'low' | 'medium' | 'high'
  confidenceScore: number
  factors: {
    userExperience: number
    taskComplexity: number
    teamCapacity: number
    deadline: number
  }
  mitigationStrategies: string[]
}

export interface QualityScorePrediction {
  expectedScore: number // 0-100
  confidenceScore: number
  factors: {
    userQualityHistory: number
    skillMatch: number
    complexityMatch: number
  }
}

/**
 * Predict task completion time based on historical data and user patterns
 */
export async function predictCompletionTime(
  estimatedHours: number,
  userId: string,
  taskComplexity: 'low' | 'medium' | 'high'
): Promise<CompletionTimePrediction> {
  const supabase = await createClient()

  // Get user's historical task metrics
  const { data: userMetrics } = await supabase
    .from('task_metrics')
    .select('estimated_hours, actual_hours, task_complexity')
    .eq('assigned_user_id', userId)
    .limit(20)

  let userAverageTime = estimatedHours
  let userSpeedMultiplier = 1

  if (userMetrics && userMetrics.length > 0) {
    const totalRatio = userMetrics.reduce((sum, m) => {
      if (m.estimated_hours && m.actual_hours) {
        return sum + m.actual_hours / m.estimated_hours
      }
      return sum
    }, 0)

    userSpeedMultiplier = totalRatio / userMetrics.length
    userAverageTime = estimatedHours * userSpeedMultiplier
  }

  // Get similar task complexity average
  const { data: complexitySimilar } = await supabase
    .from('task_metrics')
    .select('actual_hours')
    .eq('task_complexity', taskComplexity)
    .limit(50)

  let similarTasksAverage = estimatedHours
  if (complexitySimilar && complexitySimilar.length > 0) {
    const avgHours = complexitySimilar.reduce((sum, m) => sum + (m.actual_hours || 0), 0) / complexitySimilar.length
    similarTasksAverage = avgHours || estimatedHours
  }

  // Calculate workload adjustment (reduce estimate if user has low current workload)
  const workloadAdjustment = 0.95 // Could be dynamic based on current assignments

  // Complexity factor
  const complexityFactor = taskComplexity === 'high' ? 1.3 : taskComplexity === 'medium' ? 1.0 : 0.8

  // Final prediction
  const finalEstimate =
    (userAverageTime * 0.5 + (similarTasksAverage * 0.5 + estimatedHours * 0.1) * 0.5) * workloadAdjustment * complexityFactor

  // Confidence based on historical data points
  const confidence = Math.min((userMetrics?.length || 0) / 20, 1) * 0.8 + 0.2

  return {
    estimatedHours: Math.round(finalEstimate * 10) / 10,
    confidenceScore: confidence,
    factors: {
      userSpeedMultiplier,
      workloadAdjustment,
      complexityFactor,
    },
    historicalData: {
      averageCompletionTime: similarTasksAverage,
      userAverageTime,
      similarTasksAverage,
    },
  }
}

/**
 * Predict likelihood of task failure or delay
 */
export async function predictFailureRisk(
  taskComplexity: 'low' | 'medium' | 'high',
  estimatedDays: number,
  userId: string,
  userExperienceScore: number
): Promise<FailureRiskPrediction> {
  const supabase = await createClient()

  // Get user's on-time completion rate
  const { data: userHistory } = await supabase
    .from('task_metrics')
    .select('on_time')
    .eq('assigned_user_id', userId)
    .limit(30)

  const onTimeRate =
    userHistory && userHistory.length > 0
      ? userHistory.filter((m) => m.on_time).length / userHistory.length
      : 0.5

  // Calculate risk factors (0-1 scale)
  const complexityRisk = taskComplexity === 'high' ? 0.7 : taskComplexity === 'medium' ? 0.4 : 0.2
  const userExperienceRisk = 1 - Math.min(userExperienceScore / 100, 1)
  const deadlineRisk = estimatedDays < 3 ? 0.6 : estimatedDays < 7 ? 0.3 : 0.1
  const userHistoryRisk = 1 - onTimeRate

  // Weighted risk score
  const riskScore =
    complexityRisk * 0.25 + userExperienceRisk * 0.25 + deadlineRisk * 0.25 + userHistoryRisk * 0.25

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high'
  if (riskScore < 0.3) riskLevel = 'low'
  else if (riskScore < 0.6) riskLevel = 'medium'
  else riskLevel = 'high'

  // Generate mitigation strategies
  const mitigationStrategies: string[] = []
  if (complexityRisk > 0.5) mitigationStrategies.push('Break down task into smaller subtasks')
  if (userExperienceRisk > 0.5) mitigationStrategies.push('Provide mentorship or additional support')
  if (deadlineRisk > 0.5) mitigationStrategies.push('Consider extending deadline')
  if (userHistoryRisk > 0.5) mitigationStrategies.push('Increase monitoring frequency')

  // Confidence score
  const confidence = Math.min((userHistory?.length || 0) / 30, 1) * 0.7 + 0.3

  return {
    riskScore: Math.round(riskScore * 100) / 100,
    riskLevel,
    confidenceScore: confidence,
    factors: {
      userExperience: userExperienceRisk,
      taskComplexity: complexityRisk,
      teamCapacity: 0.5, // Could be dynamic
      deadline: deadlineRisk,
    },
    mitigationStrategies,
  }
}

/**
 * Predict expected quality score for a task
 */
export async function predictQualityScore(
  userId: string,
  skillMatch: number,
  taskComplexity: 'low' | 'medium' | 'high'
): Promise<QualityScorePrediction> {
  const supabase = await createClient()

  // Get user's average quality score
  const { data: qualityHistory } = await supabase
    .from('task_metrics')
    .select('quality_score')
    .eq('assigned_user_id', userId)
    .not('quality_score', 'is', null)
    .limit(20)

  let userQualityHistory = 75
  if (qualityHistory && qualityHistory.length > 0) {
    const avgQuality = qualityHistory.reduce((sum, m) => sum + (m.quality_score || 0), 0) / qualityHistory.length
    userQualityHistory = avgQuality
  }

  // Skill match contributes significantly to quality
  const skillBonus = skillMatch * 20 // Up to 20 point boost

  // Complexity factor
  const complexityFactor = taskComplexity === 'high' ? 0.9 : taskComplexity === 'medium' ? 0.95 : 1

  // Calculate expected quality
  const expectedScore = Math.min(Math.round((userQualityHistory + skillBonus) * complexityFactor), 100)

  // Confidence
  const confidence = Math.min((qualityHistory?.length || 0) / 20, 1) * 0.8 + skillMatch * 0.2

  return {
    expectedScore,
    confidenceScore: confidence,
    factors: {
      userQualityHistory,
      skillMatch,
      complexityMatch: complexityFactor,
    },
  }
}

/**
 * Store prediction in database
 */
export async function storePrediction(
  taskId: string,
  userId: string,
  predictionType: 'completion_time' | 'failure_risk' | 'quality_score',
  predictedValue: number,
  confidenceScore: number,
  metadata: Record<string, any>
): Promise<void> {
  const supabase = await createClient()

  await supabase.from('predictions').insert([
    {
      task_id: taskId,
      user_id: userId,
      prediction_type: predictionType,
      predicted_value: predictedValue,
      confidence_score: confidenceScore,
      prediction_metadata: metadata,
    },
  ])
}

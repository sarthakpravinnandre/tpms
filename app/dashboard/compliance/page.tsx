'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function CompliancePage() {
  const supabase = createClient()
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('user')

  useEffect(() => {
    const fetchCompliance = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return

        // Check user role
        const { data: roles } = await supabase
          .from('user_roles')
          .select('roles:role_id(name)')
          .eq('user_id', user.id)

        if (roles && roles.length > 0) {
          const roleName = roles[0]?.roles?.name
          setUserRole(roleName)

          // Only managers and admins can access compliance
          if (roleName !== 'manager' && roleName !== 'admin') {
            throw new Error('Insufficient permissions')
          }
        }

        // Fetch compliance reports
        const { data: complianceData } = await supabase
          .from('compliance_reports')
          .select('*, projects:project_id(name)')
          .order('generated_at', { ascending: false })
          .limit(10)

        setReports(complianceData || [])
      } catch (error) {
        console.error('Error fetching compliance reports:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCompliance()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Loading compliance reports...</p>
        </div>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />
      case 'fail':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'fail':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compliance & Monitoring</h1>
        <p className="text-muted-foreground mt-2">
          Project compliance reports and status ({userRole === 'admin' ? 'Admin View' : 'Manager View'})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reports.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Passing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reports.filter(r => r.status === 'pass').length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{reports.filter(r => r.status === 'warning').length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Compliance Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(report.status)}
                        <p className="font-medium">{report.projects?.name || 'Unknown Project'}</p>
                        <Badge className="text-xs capitalize">{report.compliance_type.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{report.findings}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(report.status)} capitalize`}>
                      {report.status} - {report.score}%
                    </div>
                  </div>
                  {report.recommendations && (
                    <p className="text-sm bg-muted p-2 rounded italic">
                      Recommendation: {report.recommendations}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No compliance reports available</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

class RealtimeManager {
  private supabase = createClient()
  private channels: Map<string, RealtimeChannel> = new Map()

  subscribeToTable(
    tableName: string,
    callback: (event: any) => void,
    filter?: string
  ) {
    const channelName = `${tableName}_changes`

    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)
    }

    let channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter,
        },
        callback
      )
      .subscribe()

    this.channels.set(channelName, channel)
    return channel
  }

  subscribeToProjects(userId: string, callback: (event: any) => void) {
    const channelName = `projects_${userId}`

    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)
    }

    let channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
        },
        callback
      )
      .subscribe()

    this.channels.set(channelName, channel)
    return channel
  }

  subscribeToTasks(projectId: string, callback: (event: any) => void) {
    const channelName = `tasks_${projectId}`

    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)
    }

    let channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`,
        },
        callback
      )
      .subscribe()

    this.channels.set(channelName, channel)
    return channel
  }

  subscribeToDepartments(callback: (event: any) => void) {
    const channelName = 'departments_changes'

    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)
    }

    let channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'departments',
        },
        callback
      )
      .subscribe()

    this.channels.set(channelName, channel)
    return channel
  }

  unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName)
    if (channel) {
      this.supabase.removeChannel(channel)
      this.channels.delete(channelName)
    }
  }

  unsubscribeAll() {
    this.channels.forEach((channel) => {
      this.supabase.removeChannel(channel)
    })
    this.channels.clear()
  }

  getChannel(channelName: string) {
    return this.channels.get(channelName)
  }
}

export const realtimeManager = new RealtimeManager()

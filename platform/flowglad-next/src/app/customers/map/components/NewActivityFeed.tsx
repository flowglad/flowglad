import React, { useState } from 'react'
import { ActivityItem } from '../utils/types'

export interface NewActivityFeedProps {
  activities: ActivityItem[]
  onDismiss: (id: string) => void
  onClearAll: () => void
}

export function NewActivityFeed({
  activities,
  onDismiss,
  onClearAll,
}: NewActivityFeedProps) {
  const [isHidden, setIsHidden] = useState(false)

  return (
    <div className="absolute bottom-3 right-3 z-30 max-w-sm min-w-64">
      <div className="bg-container/95 backdrop-blur-sm border border-stroke rounded-radius shadow-lg p-2 gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            New Activity ({activities.length})
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setIsHidden(!isHidden)}
              className="text-blue-400 hover:text-blue-300 underline text-xs"
            >
              {isHidden ? 'Show' : 'Hide'}
            </button>
            <button
              onClick={onClearAll}
              className="text-blue-400 hover:text-blue-300 underline text-xs"
              disabled={activities.length === 0}
              aria-disabled={activities.length === 0}
              style={{ opacity: activities.length === 0 ? 0.5 : 1 }}
            >
              Clear
            </button>
          </div>
        </div>

        {!isHidden && (
          <div className="min-h-12 mt-2">
            {activities.length === 0 ? (
              <div className="border-2 border-dashed border-stroke rounded p-3 text-center">
                <p className="text-xs text-secondary">
                  No new activity
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onDismiss={onDismiss}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityCard({
  activity,
  onDismiss,
}: {
  activity: ActivityItem
  onDismiss: (id: string) => void
}) {
  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const seconds = Math.floor(
      (now.getTime() - date.getTime()) / 1000
    )

    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="bg-container/95 backdrop-blur-sm border border-stroke rounded-radius shadow-lg p-2">
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-full border border-stroke bg-cover bg-center flex-shrink-0"
          style={{
            backgroundImage: `url(https://avatar.iran.liara.run/public?id=${activity.customer.id})`,
            backgroundSize: '100%',
          }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground truncate">
              {activity.customer.name || 'Unnamed Customer'}
            </p>
            <button
              onClick={() => onDismiss(activity.id)}
              className="text-secondary hover:text-foreground text-xs ml-1"
              title="Dismiss"
            >
              ×
            </button>
          </div>

          <p className="text-xs text-secondary">
            {formatTimeAgo(activity.timestamp)}
          </p>
        </div>
      </div>
    </div>
  )
}

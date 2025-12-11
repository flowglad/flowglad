import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Props = {
  active: boolean
}

const StatusBadge = ({ active }: Props) => {
  if (active) {
    return (
      <div className="w-20">
        <Badge
          variant="secondary"
          className="w-full bg-jade-background text-jade-foreground text-xs"
        >
          <Check
            className="w-3 h-3 mr-1 text-jade-foreground"
            strokeWidth={2}
          />
          Active
        </Badge>
      </div>
    )
  }

  return (
    <div className="w-20">
      <Badge
        variant="secondary"
        className="w-full bg-gray-100 text-gray-800 text-xs"
      >
        <X className="w-3 h-3 mr-1" strokeWidth={2} />
        Inactive
      </Badge>
    </div>
  )
}

export default StatusBadge

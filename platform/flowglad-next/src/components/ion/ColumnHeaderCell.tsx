import { cn } from '@/utils/core'
import { ChevronsUpDown } from 'lucide-react'
import { Column } from '@tanstack/react-table'

const ColumnHeaderCell = ({
  column,
  title,
  className,
}: {
  column: Column<any, any>
  title: string
  className?: string
}) => {
  return (
    <button
      className={cn(
        'flex items-center gap-3 whitespace-nowrap text-sm font-normal',
        className
      )}
    >
      <h4>{title}</h4>
    </button>
  )
}

export default ColumnHeaderCell

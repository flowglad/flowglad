import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TablePaginationProps {
  pageIndex: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  isLoading?: boolean
  isFetching?: boolean
}

export function TablePagination({
  pageIndex,
  pageSize,
  total,
  onPageChange,
  isLoading,
  isFetching,
}: TablePaginationProps) {
  const pageCount = Math.ceil(total / pageSize)
  const showingStart = total === 0 ? 0 : pageIndex * pageSize + 1
  const showingEnd = Math.min((pageIndex + 1) * pageSize, total)

  // Ensure previous button is disabled on first page
  const canGoPrevious = pageIndex > 0 && !isLoading && !isFetching
  const canGoNext =
    pageIndex < pageCount - 1 && !isLoading && !isFetching

  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-sm text-muted-foreground/50 font-mono">
        {isLoading || isFetching ? (
          <span>Loading...</span>
        ) : total === 0 ? null : (
          <span>
            {showingStart}-{showingEnd} of {total}
          </span>
        )}
      </p>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={!canGoPrevious}
          style={total <= 10 ? { opacity: 0 } : undefined}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={!canGoNext}
          style={total <= 10 ? { opacity: 0 } : undefined}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

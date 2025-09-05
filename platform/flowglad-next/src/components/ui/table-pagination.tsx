import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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

  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-sm text-muted-foreground">
        {isLoading || isFetching ? (
          <span>Loading...</span>
        ) : (
          <span>
            Showing {showingStart} to {showingEnd} of {total} results
          </span>
        )}
      </p>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={pageIndex === 0 || isLoading || isFetching}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={
            pageIndex >= pageCount - 1 || isLoading || isFetching
          }
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// Tremor usePaginatedTableState [v0.0.0]
'use client'

import { TRPCClientErrorLike } from '@trpc/client'
import {
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '@trpc/react-query/shared'
import { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import'
import { useState, useEffect } from 'react'

export interface PaginatedTableStateParams<
  TData extends {},
  TFilters extends {},
> {
  initialCurrentCursor?: string
  pageSize?: number
  initialNextCursor?: string
  initialPreviousCursor?: string
  filters: TFilters
  searchQuery?: string
  useQuery: (
    params: {
      pageAfter?: string
      pageBefore?: string
      pageSize?: number
      filters: TFilters
      searchQuery?: string
      goToFirst?: boolean
      goToLast?: boolean
    },
    options?:
      | UseTRPCQueryOptions<
          {},
          {
            data: TData[]
            nextCursor: string | undefined
            hasMore: boolean
            total: number
          },
          TRPCClientErrorLike<{
            errorShape: DefaultErrorShape
            transformer: true
          }>
        >
      | undefined
      | any
  ) => UseTRPCQueryResult<
    {
      items: TData[]
      startCursor: string | null
      endCursor: string | null
      hasNextPage: boolean
      hasPreviousPage: boolean
      total: number
    },
    TRPCClientErrorLike<{
      errorShape: DefaultErrorShape
      transformer: true
    }>
  >
}

export const usePaginatedTableState = <
  TData extends {},
  TFilters extends {},
>({
  initialCurrentCursor,
  pageSize = 10,
  filters,
  useQuery,
  searchQuery,
}: PaginatedTableStateParams<TData, TFilters>) => {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageAfter, setPageAfter] = useState<string | undefined>(
    initialCurrentCursor
  )
  const [pageBefore, setPageBefore] = useState<string | undefined>()
  const [goToFirst, setGoToFirst] = useState(false)
  const [goToLast, setGoToLast] = useState(false)

  const params = {
    pageAfter,
    pageBefore,
    pageSize,
    filters,
    searchQuery,
    goToFirst,
    goToLast,
  }
  const { data, isLoading, isFetching } = useQuery(params)

  // Reset navigation flags after successful query
  useEffect(() => {
    if (!isLoading && !isFetching && (goToFirst || goToLast)) {
      setGoToFirst(false)
      setGoToLast(false)
    }
  }, [isLoading, isFetching, goToFirst, goToLast])

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
    // Reset navigation flags
    setGoToFirst(false)
    setGoToLast(false)

    if (
      newPageIndex > pageIndex &&
      data?.hasNextPage &&
      data?.endCursor
    ) {
      setPageAfter(data.endCursor)
      setPageBefore(undefined)
    } else if (
      newPageIndex < pageIndex &&
      data?.hasPreviousPage &&
      data?.startCursor
    ) {
      setPageBefore(data.startCursor)
      setPageAfter(undefined)
    }
  }

  const goToFirstPage = () => {
    setPageIndex(0)
    setPageAfter(undefined)
    setPageBefore(undefined)
    setGoToFirst(true)
    setGoToLast(false)
  }

  const goToLastPage = () => {
    if (data?.total) {
      const lastPageIndex = Math.ceil(data.total / pageSize) - 1
      setPageIndex(lastPageIndex)
      setPageAfter(undefined)
      setPageBefore(undefined)
      setGoToFirst(false)
      setGoToLast(true)
    }
  }

  return {
    pageIndex,
    pageAfter,
    pageBefore,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    goToLastPage,
    data,
    isLoading,
    isFetching,
  }
}

// Tremor usePaginatedTableState [v0.0.0]
'use client'

import { TRPCClientErrorLike } from '@trpc/client'
import {
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '@trpc/react-query/shared'
import { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import'
import * as React from 'react'
import { useState } from 'react'

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
  const params = {
    pageAfter,
    pageBefore,
    pageSize,
    filters,
    searchQuery,
  }
  const { data, isLoading, isFetching } = useQuery(params)

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
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

  return {
    pageIndex,
    pageAfter,
    pageBefore,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  }
}

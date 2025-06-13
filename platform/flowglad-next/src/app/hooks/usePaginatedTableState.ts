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
import { type NavigationCommand } from '@/db/tableUtils'

interface PaginatedTableStateParams<
  TData extends {},
  TFilters extends {},
> {
  initialCurrentCursor?: string
  pageSize?: number
  filters?: TFilters
  useQuery: (params: {
    navigation: NavigationCommand
    pageSize: number
    filters?: TFilters
    searchQuery?: string
  }) => {
    data?: {
      items: TData[]
      hasNextPage: boolean
      hasPreviousPage: boolean
      total: number
      startCursor: string | null
      endCursor: string | null
    }
    isLoading: boolean
    isFetching: boolean
  }
  searchQuery?: string
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
  const [currentCursor, setCurrentCursor] = useState<
    string | undefined
  >(initialCurrentCursor)
  const [navigationDirection, setNavigationDirection] = useState<
    'forward' | 'backward'
  >('forward')

  const params = {
    navigation: currentCursor
      ? navigationDirection === 'forward'
        ? { type: 'forward' as const, pageAfter: currentCursor }
        : { type: 'backward' as const, pageBefore: currentCursor }
      : { type: 'toStart' as const },
    pageSize,
    filters,
    searchQuery,
  }

  const { data, isLoading, isFetching } = useQuery(params)

  const handleNavigation = (navigation: NavigationCommand) => {
    if (navigation.type === 'toStart') {
      setCurrentCursor(undefined)
      setNavigationDirection('forward')
    } else if (navigation.type === 'toEnd') {
      setCurrentCursor(undefined)
      setNavigationDirection('backward')
    } else if (navigation.type === 'forward') {
      setNavigationDirection('forward')
      if (data?.endCursor) {
        setCurrentCursor(data.endCursor)
      }
    } else if (navigation.type === 'backward') {
      setNavigationDirection('backward')
      if (data?.startCursor) {
        setCurrentCursor(data.startCursor)
      }
    }
  }

  return {
    currentCursor,
    navigationDirection,
    pageSize,
    handleNavigation,
    data,
    isLoading,
    isFetching,
  }
}

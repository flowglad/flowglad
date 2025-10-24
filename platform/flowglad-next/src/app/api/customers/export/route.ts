import { NextRequest, NextResponse } from 'next/server'

import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  CustomerTableRowData,
  CustomersPaginatedTableRowInput,
} from '@/db/schema/customers'
import { selectCustomersCursorPaginatedWithTableRowData } from '@/db/tableMethods/customerMethods'
import { getSession } from '@/utils/auth'
import { createCustomersCsv } from '@/utils/csv-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

const buildFiltersFromRequest = (
  request: NextRequest
): CustomersPaginatedTableRowInput['filters'] => {
  const url = new URL(request.url)
  const filters: NonNullable<
    CustomersPaginatedTableRowInput['filters']
  > = {}

  const archivedParam = url.searchParams.get('archived')
  if (archivedParam !== null) {
    filters.archived = archivedParam === 'true'
  }

  const organizationId = url.searchParams.get('organizationId')
  if (organizationId) {
    filters.organizationId = organizationId
  }

  const pricingModelId = url.searchParams.get('pricingModelId')
  if (pricingModelId) {
    filters.pricingModelId = pricingModelId
  }

  return Object.keys(filters).length > 0 ? filters : undefined
}

const parseSearchQuery = (request: NextRequest) => {
  const url = new URL(request.url)
  const searchQuery = url.searchParams.get('searchQuery')
  return searchQuery?.trim() ? searchQuery : undefined
}

export async function GET(request: NextRequest) {
  const session = await getSession()

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const filters = buildFiltersFromRequest(request)
    const searchQuery = parseSearchQuery(request)

    const items = await authenticatedTransaction<
      CustomerTableRowData[]
    >(async ({ transaction }) => {
      const rows: CustomerTableRowData[] = []
      let pageAfter: string | undefined

      while (true) {
        const response =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageAfter,
              pageSize: PAGE_SIZE,
              filters,
              searchQuery,
            },
            transaction,
          })

        rows.push(...response.items)

        if (!response.hasNextPage || !response.endCursor) {
          break
        }

        pageAfter = response.endCursor
      }

      return rows
    })

    const { csv, filename } = createCustomersCsv(items)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to export customers CSV', error)
    return NextResponse.json(
      { error: 'Failed to export customers CSV' },
      { status: 500 }
    )
  }
}

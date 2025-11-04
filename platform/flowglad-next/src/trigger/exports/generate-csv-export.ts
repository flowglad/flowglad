import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomersCursorPaginatedWithTableRowData } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectUserById } from '@/db/tableMethods/userMethods'
import type {
  CustomerTableRowData,
  CustomersPaginatedTableRowInput,
} from '@/db/schema/customers'
import { createCustomersCsv } from '@/utils/csv-export'
import { sendCustomersCsvExportReadyEmail } from '@/utils/email'
import { logger, task } from '@trigger.dev/sdk'
import { format } from 'date-fns'

type CustomerTableFilters = CustomersPaginatedTableRowInput['filters']

const PAGE_SIZE = 100

interface GenerateCsvExportPayload {
  userId: string
  organizationId: string
  filters?: CustomerTableFilters
  searchQuery?: string
}

export const generateCsvExportTask = task({
  id: 'generate-csv-export',
  run: async (payload: GenerateCsvExportPayload, { ctx }) => {
    const { userId, organizationId, filters, searchQuery } = payload

    logger.log('Starting generateCsvExportTask', {
      organizationId,
      userId,
      ctx,
    })

    if (!userId || !organizationId) {
      logger.error('Missing identifiers for CSV export task', {
        userId,
        organizationId,
      })
      throw new Error(
        'userId and organizationId are required to generate CSV export'
      )
    }

    try {
      const {
        rows,
        totalCustomers,
        organizationCurrency,
        organizationName,
        userEmail,
      } = await adminTransaction(async ({ transaction }) => {
        const normalizedFilters: CustomerTableFilters = {
          ...(filters ?? {}),
          organizationId,
        }

        const initialResponse =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: PAGE_SIZE,
              filters: normalizedFilters,
              searchQuery,
            },
            transaction,
          })

        const total = initialResponse.total ?? 0

        const organization = await selectOrganizationById(
          organizationId,
          transaction
        )
        const user = await selectUserById(userId, transaction)

        const rows: CustomerTableRowData[] = [
          ...initialResponse.items,
        ]

        let hasNextPage = initialResponse.hasNextPage
        let pageAfter = initialResponse.endCursor

        while (hasNextPage && pageAfter) {
          const response =
            await selectCustomersCursorPaginatedWithTableRowData({
              input: {
                pageAfter,
                pageSize: PAGE_SIZE,
                filters: normalizedFilters,
                searchQuery,
              },
              transaction,
            })

          rows.push(...response.items)
          hasNextPage = response.hasNextPage
          pageAfter = response.endCursor
        }

        return {
          rows,
          totalCustomers: total,
          organizationCurrency: organization.defaultCurrency,
          organizationName: organization.name,
          userEmail: user.email,
        }
      })

      if (!userEmail || !organizationName) {
        logger.error(
          'User email or organization name not found for CSV export',
          {
            userId,
            organizationId,
          }
        )
        throw new Error('User email or organization name not found')
      }

      const generationTimestamp = new Date()
      const { csv } = createCustomersCsv(
        rows,
        organizationCurrency,
        generationTimestamp
      )

      const attachmentFilename = `customers_${format(
        generationTimestamp,
        'yyyy-MM-dd_HH-mm-ss'
      )}.csv`
      const emailResult = await sendCustomersCsvExportReadyEmail({
        to: [userEmail],
        organizationName,
        csvContent: csv,
        filename: attachmentFilename,
      })

      if (emailResult?.error) {
        logger.error('Error sending CSV export email', {
          error: emailResult.error,
          filename: attachmentFilename,
        })
        throw new Error('Failed to send CSV export email')
      }

      logger.log('CSV export email sent successfully', {
        filename: attachmentFilename,
        totalCustomers,
      })

      return {
        message: 'CSV export email sent successfully',
        filename: attachmentFilename,
        totalCustomers,
      }
    } catch (error) {
      logger.error('generateCsvExportTask failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
        organizationId,
        userId,
      })
      throw error
    }
  },
})

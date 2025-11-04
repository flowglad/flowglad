import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomersCursorPaginatedWithTableRowData } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectUserById } from '@/db/tableMethods/userMethods'
import type {
  CustomerTableRowData,
  CustomersPaginatedTableRowInput,
} from '@/db/schema/customers'
import { CSV_EXPORT_LIMITS } from '@/constants/csv-export'
import { createCustomersCsv } from '@/utils/csv-export'
import { safeSend } from '@/utils/email'
import { CustomersCsvExportReadyEmail } from '@/email-templates/organization/customers-csv-export-ready'
import { logger, task } from '@trigger.dev/sdk'

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
        exceedsLimit,
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

        if (total > CSV_EXPORT_LIMITS.CUSTOMER_LIMIT) {
          return {
            rows: [] as CustomerTableRowData[],
            totalCustomers: total,
            organizationCurrency: undefined,
            organizationName: undefined,
            userEmail: undefined,
            exceedsLimit: true,
          }
        }

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
          exceedsLimit: false,
        }
      })

      if (exceedsLimit) {
        const limit = CSV_EXPORT_LIMITS.CUSTOMER_LIMIT
        logger.error('CSV export exceeds allowed limit', {
          limit,
          totalCustomers,
        })
        throw new Error(
          `CSV export exceeds the limit of ${limit} customers`
        )
      }

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

      const { csv, filename } = createCustomersCsv(
        rows,
        organizationCurrency
      )

      const emailResult = await safeSend({
        from: 'Flowglad <notifications@flowglad.com>',
        to: [userEmail],
        subject: 'Your customers CSV export is ready',
        react: CustomersCsvExportReadyEmail({
          organizationName,
          totalCustomers: rows.length,
          filename,
        }),
        attachments: [
          {
            filename,
            content: Buffer.from(csv, 'utf-8'),
            contentType: 'text/csv',
          },
        ],
      })

      if (emailResult?.error) {
        logger.error('Error sending CSV export email', {
          error: emailResult.error,
          filename,
        })
        throw new Error('Failed to send CSV export email')
      }

      logger.log('CSV export email sent successfully', {
        filename,
        totalCustomers: rows.length,
      })

      return {
        message: 'CSV export email sent successfully',
        filename,
        totalCustomers: rows.length,
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

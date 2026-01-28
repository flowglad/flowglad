import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { format } from 'date-fns'
import { adminTransaction } from '@/db/adminTransaction'
import type {
  CustomersPaginatedTableRowInput,
  CustomerTableRowData,
} from '@/db/schema/customers'
import { selectCustomersCursorPaginatedWithTableRowData } from '@/db/tableMethods/customerMethods'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectUserById } from '@/db/tableMethods/userMethods'
import { createCustomersCsv } from '@/utils/csv-export'
import { sendCustomersCsvExportReadyEmail } from '@/utils/email'

type CustomerTableFilters = CustomersPaginatedTableRowInput['filters']

const PAGE_SIZE = 100

interface GenerateCsvExportPayload {
  userId: string
  organizationId: string
  filters?: CustomerTableFilters
  searchQuery?: string
  livemode: boolean
}

export const generateCsvExportTask = task({
  id: 'generate-csv-export',
  run: async (payload: GenerateCsvExportPayload, { ctx }) => {
    const { userId, organizationId, filters, searchQuery, livemode } =
      payload

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
      } = (
        await adminTransaction(async ({ transaction }) => {
          const normalizedFilters: CustomerTableFilters = {
            ...(filters ?? {}),
            organizationId,
            livemode,
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

          const organization = (
            await selectOrganizationById(organizationId, transaction)
          ).unwrap()
          const user = (
            await selectUserById(userId, transaction)
          ).unwrap()

          // Verify membership exists for userId + organizationId
          const memberships = await selectMemberships(
            {
              userId,
              organizationId,
            },
            transaction
          )
          if (memberships.length === 0) {
            throw new Error(
              `User ${userId} is not a member of organization ${organizationId}`
            )
          }

          const rows: CustomerTableRowData[] = [
            ...initialResponse.items,
          ]

          let hasNextPage = initialResponse.hasNextPage
          let pageAfter = initialResponse.endCursor

          // Intentionally foregoing test coverage for this pagination loop.
          // This is a straightforward extension of existing pagination logic:
          // - The underlying selectCustomersCursorPaginatedWithTableRowData function is already tested
          // - This loop simply calls it repeatedly until all pages are fetched
          // - The logic is straightforward and low-stakes (CSV export)
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

          return Result.ok({
            rows,
            totalCustomers: rows.length,
            organizationCurrency: organization.defaultCurrency,
            organizationName: organization.name,
            userEmail: user.email,
          })
        })
      ).unwrap()

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
        livemode,
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

import { describe, it, expect } from 'vitest'
import { adminTransaction } from '@/db/databaseMethods'
import {
  setupOrg,
  setupCustomerProfile,
  setupInvoice,
} from '../../seedDatabase'
import { updateInvoiceTransaction } from './invoiceHelpers'
import { InvoiceStatus, InvoiceType } from '@/types'
import { core } from '@/utils/core'

describe('updateInvoiceTransaction', () => {
  describe('Invoice Status Tests', () => {
    //     it('should successfully update a non-terminal invoice', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await adminTransaction(async ({ transaction }) => {
    //         const result = await updateInvoiceTransaction(
    //           {
    //             invoice: {
    //               id: invoice.id,
    //               status: InvoiceStatus.Open,
    //               type: InvoiceType.Purchase,
    //               billingPeriodId: null,
    //               purchaseId: invoice.purchaseId!,
    //             },
    //             invoiceLineItems: [
    //               {
    //                 invoiceId: invoice.id,
    //                 description: 'Updated line item',
    //                 quantity: 1,
    //                 price: 2000,
    //               },
    //             ],
    //           },
    //           true,
    //           transaction
    //         )

    //         expect(result.invoice.status).toBe(InvoiceStatus.Open)
    //         expect(result.invoiceLineItems).toHaveLength(1)
    //         expect(result.invoiceLineItems[0].price).toBe(2000)
    //       })
    //     })

    //     it('should throw error when updating terminal state invoice', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Paid,
    //         variantId: variant.id,
    //       })

    //       await expect(
    //         adminTransaction(async ({ transaction }) => {
    //           return updateInvoiceTransaction(
    //             {
    //               invoice: {
    //                 id: invoice.id,
    //                 status: InvoiceStatus.Open,
    //                 type: InvoiceType.Purchase,
    //                 billingPeriodId: null,
    //                 purchaseId: invoice.purchaseId!,
    //               },
    //               invoiceLineItems: [],
    //             },
    //             true,
    //             transaction
    //           )
    //         })
    //       ).rejects.toThrow(/terminal state/)
    //     })

    //     it('should throw error when updating to terminal state', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await expect(
    //         adminTransaction(async ({ transaction }) => {
    //           return updateInvoiceTransaction(
    //             {
    //               invoice: {
    //                 id: invoice.id,
    //                 status: InvoiceStatus.Paid,
    //                 type: InvoiceType.Purchase,
    //                 billingPeriodId: null,
    //                 purchaseId: invoice.purchaseId!,
    //               },
    //               invoiceLineItems: [],
    //             },
    //             true,
    //             transaction
    //           )
    //         })
    //       ).rejects.toThrow(/Cannot update a paid invoice/)
    //     })
    //   })

    //   describe('Line Item Management Tests', () => {
    //     it('should update invoice metadata without changing line items', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await adminTransaction(async ({ transaction }) => {
    //         const result = await updateInvoiceTransaction(
    //           {
    //             invoice: {
    //               id: invoice.id,
    //               memo: 'Updated memo',
    //               type: InvoiceType.Purchase,
    //               billingPeriodId: null,
    //               purchaseId: invoice.purchaseId!,
    //             },
    //             invoiceLineItems: [
    //               {
    //                 invoiceId: invoice.id,
    //                 description: 'Test Description',
    //                 quantity: 1,
    //                 price: 1000,
    //               },
    //             ],
    //           },
    //           true,
    //           transaction
    //         )

    //         expect(result.invoice.memo).toBe('Updated memo')
    //         expect(result.invoiceLineItems).toHaveLength(1)
    //         expect(result.invoiceLineItems[0].price).toBe(1000)
    //       })
    //     })

    //     it('should modify existing line items', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await adminTransaction(async ({ transaction }) => {
    //         const result = await updateInvoiceTransaction(
    //           {
    //             invoice: {
    //               id: invoice.id,
    //               type: InvoiceType.Purchase,
    //               billingPeriodId: null,
    //               purchaseId: invoice.purchaseId!,
    //             },
    //             invoiceLineItems: [
    //               {
    //                 invoiceId: invoice.id,
    //                 description: 'Modified description',
    //                 quantity: 2,
    //                 price: 2000,
    //               },
    //             ],
    //           },
    //           true,
    //           transaction
    //         )

    //         expect(result.invoiceLineItems).toHaveLength(1)
    //         expect(result.invoiceLineItems[0].description).toBe(
    //           'Modified description'
    //         )
    //         expect(result.invoiceLineItems[0].quantity).toBe(2)
    //         expect(result.invoiceLineItems[0].price).toBe(2000)
    //       })
    //     })

    //     it('should add new line items', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await adminTransaction(async ({ transaction }) => {
    //         const result = await updateInvoiceTransaction(
    //           {
    //             invoice: {
    //               id: invoice.id,
    //               type: InvoiceType.Purchase,
    //               billingPeriodId: null,
    //               purchaseId: invoice.purchaseId!,
    //             },
    //             invoiceLineItems: [
    //               {
    //                 invoiceId: invoice.id,
    //                 description: 'New line item 1',
    //                 quantity: 1,
    //                 price: 1000,
    //               },
    //               {
    //                 invoiceId: invoice.id,
    //                 description: 'New line item 2',
    //                 quantity: 2,
    //                 price: 2000,
    //               },
    //             ],
    //           },
    //           true,
    //           transaction
    //         )

    //         expect(result.invoiceLineItems).toHaveLength(2)
    //         expect(result.invoiceLineItems[0].description).toBe(
    //           'New line item 1'
    //         )
    //         expect(result.invoiceLineItems[1].description).toBe(
    //           'New line item 2'
    //         )
    //       })
    //     })

    //     it('should delete existing line items', async () => {
    //       const { organization, variant } = await setupOrg()
    //       const customerProfile = await setupCustomerProfile({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerProfileId: customerProfile.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         variantId: variant.id,
    //       })

    //       await adminTransaction(async ({ transaction }) => {
    //         const result = await updateInvoiceTransaction(
    //           {
    //             invoice: {
    //               id: invoice.id,
    //               type: InvoiceType.Purchase,
    //               billingPeriodId: null,
    //               purchaseId: invoice.purchaseId!,
    //             },
    //             invoiceLineItems: [], // Empty array should delete all line items
    //           },
    //           true,
    //           transaction
    //         )

    //         expect(result.invoiceLineItems).toHaveLength(0)
    //       })
    //     })

    it('should handle mixed changes to line items', async () => {
      const { organization, variant } = await setupOrg()
      const customerProfile = await setupCustomerProfile({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        customerProfileId: customerProfile.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        variantId: variant.id,
      })

      await adminTransaction(async ({ transaction }) => {
        // First update to set up multiple line items
        const { invoiceLineItems: updatedInvoiceLineItems } =
          await updateInvoiceTransaction(
            {
              id: invoice.id,
              invoice: {
                id: invoice.id,
                type: InvoiceType.Purchase,
                billingPeriodId: null,
                purchaseId: invoice.purchaseId!,
              },
              invoiceLineItems: [
                {
                  invoiceId: invoice.id,
                  description: 'Item 1',
                  quantity: 1,
                  price: 1000,
                },
                {
                  invoiceId: invoice.id,
                  description: 'Item 2',
                  quantity: 1,
                  price: 2000,
                },
              ],
            },
            true,
            transaction
          )
        // Second update with mixed changes
        const result = await updateInvoiceTransaction(
          {
            id: invoice.id,
            invoice: {
              id: invoice.id,
              type: InvoiceType.Purchase,
              billingPeriodId: null,
              purchaseId: invoice.purchaseId!,
            },
            invoiceLineItems: [
              {
                id: updatedInvoiceLineItems[0].id, // Modify existing
                invoiceId: invoice.id,
                description: 'Modified Item 1',
                quantity: 2,
                price: 1500,
              },
              {
                invoiceId: invoice.id, // Add new
                description: 'New Item 3',
                quantity: 1,
                price: 3000,
              },
            ],
          },
          true,
          transaction
        )

        expect(result.invoiceLineItems).toHaveLength(2)
        expect(result.invoiceLineItems[0].description).toBe(
          'Modified Item 1'
        )
        expect(result.invoiceLineItems[0].price).toBe(1500)
        expect(result.invoiceLineItems[1].description).toBe(
          'New Item 3'
        )
      })
    })
  })

  //   describe('Error Handling & Edge Cases', () => {
  //     it('should throw error for non-existent invoice', async () => {
  //       const { organization } = await setupOrg()

  //       await expect(
  //         adminTransaction(async ({ transaction }) => {
  //           return updateInvoiceTransaction(
  //             {
  //               invoice: {
  //                 id: 'non-existent-id',
  //                 type: InvoiceType.Purchase,
  //                 billingPeriodId: null,
  //                 purchaseId: core.nanoid(),
  //               },
  //               invoiceLineItems: [],
  //             },
  //             true,
  //             transaction
  //           )
  //         })
  //       ).rejects.toThrow()
  //     })

  //     it('should maintain data integrity across operations', async () => {
  //       const { organization, variant } = await setupOrg()
  //       const customerProfile = await setupCustomerProfile({
  //         organizationId: organization.id,
  //       })
  //       const invoice = await setupInvoice({
  //         customerProfileId: customerProfile.id,
  //         organizationId: organization.id,
  //         status: InvoiceStatus.Draft,
  //         variantId: variant.id,
  //       })

  //       // Attempt an update that should fail
  //       await expect(
  //         adminTransaction(async ({ transaction }) => {
  //           return updateInvoiceTransaction(
  //             {
  //               invoice: {
  //                 id: invoice.id,
  //                 status: InvoiceStatus.Paid, // This should cause failure
  //                 type: InvoiceType.Purchase,
  //                 billingPeriodId: null,
  //                 purchaseId: invoice.purchaseId!,
  //               },
  //               invoiceLineItems: [
  //                 {
  //                   invoiceId: invoice.id,
  //                   description: 'New Item',
  //                   quantity: 1,
  //                   price: 1000,
  //                 },
  //               ],
  //             },
  //             true,
  //             transaction
  //           )
  //         })
  //       ).rejects.toThrow()

  //       // Verify the invoice wasn't changed
  //       await adminTransaction(async ({ transaction }) => {
  //         const result = await updateInvoiceTransaction(
  //           {
  //             invoice: {
  //               id: invoice.id,
  //               type: InvoiceType.Purchase,
  //               billingPeriodId: null,
  //               purchaseId: invoice.purchaseId!,
  //             },
  //             invoiceLineItems: [
  //               {
  //                 invoiceId: invoice.id,
  //                 description: 'Test Description',
  //                 quantity: 1,
  //                 price: 1000,
  //               },
  //             ],
  //           },
  //           true,
  //           transaction
  //         )

  //         expect(result.invoice.status).toBe(InvoiceStatus.Draft)
  //         expect(result.invoiceLineItems).toHaveLength(1)
  //       })
  //     })
  //   })

  //   describe('Livemode Tests', () => {
  //     it('should propagate livemode flag to new line items', async () => {
  //       const { organization, variant } = await setupOrg()
  //       const customerProfile = await setupCustomerProfile({
  //         organizationId: organization.id,
  //       })
  //       const invoice = await setupInvoice({
  //         customerProfileId: customerProfile.id,
  //         organizationId: organization.id,
  //         status: InvoiceStatus.Draft,
  //         variantId: variant.id,
  //         livemode: false,
  //       })

  //       await adminTransaction(async ({ transaction }) => {
  //         const result = await updateInvoiceTransaction(
  //           {
  //             invoice: {
  //               id: invoice.id,
  //               type: InvoiceType.Purchase,
  //               billingPeriodId: null,
  //               purchaseId: invoice.purchaseId!,
  //             },
  //             invoiceLineItems: [
  //               {
  //                 invoiceId: invoice.id,
  //                 description: 'Test Item',
  //                 quantity: 1,
  //                 price: 1000,
  //               },
  //             ],
  //           },
  //           false,
  //           transaction
  //         )

  //         expect(result.invoiceLineItems[0].livemode).toBe(false)
  //       })
  //     })
  //   })
})

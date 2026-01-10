import { describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  InvoiceStatus,
  InvoiceType,
  SubscriptionItemType,
} from '@/types'
import { core } from '@/utils/core'
import { updateInvoiceTransaction } from './invoiceHelpers'

describe('updateInvoiceTransaction', () => {
  describe('ID Mismatch Security Tests', () => {
    it('should throw error when id parameter does not match invoice.id', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      // Create a draft invoice (non-terminal)
      const draftInvoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
      })
      // Create a paid invoice (terminal)
      const paidInvoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
      })

      // Attempt to exploit by passing draft invoice ID for validation
      // but paid invoice ID in the invoice object for the actual update
      await expect(
        adminTransaction(async ({ transaction }) => {
          return updateInvoiceTransaction(
            {
              id: draftInvoice.id, // Use draft invoice ID for terminal check
              invoice: {
                id: paidInvoice.id, // But try to update paid invoice
                type: InvoiceType.Purchase,
                status: InvoiceStatus.Open,
                currency: paidInvoice.currency,
                dueDate: paidInvoice.dueDate,
                invoiceDate: paidInvoice.invoiceDate,
              },
              invoiceLineItems: [],
            },
            true,
            transaction
          )
        })
      ).rejects.toThrow(/ID mismatch/)
    })

    it('should succeed when id parameter matches invoice.id', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
      })

      await adminTransaction(async ({ transaction }) => {
        const result = await updateInvoiceTransaction(
          {
            id: invoice.id,
            invoice: {
              id: invoice.id, // IDs match
              type: InvoiceType.Purchase,
              status: InvoiceStatus.Open,
              currency: invoice.currency,
              dueDate: invoice.dueDate,
              invoiceDate: invoice.invoiceDate,
            },
            invoiceLineItems: [
              {
                invoiceId: invoice.id,
                description: 'Test line item',
                quantity: 1,
                price: 1000,
                type: SubscriptionItemType.Static,
                priceId: null,
              },
            ],
          },
          true,
          transaction
        )

        expect(result.invoice.id).toBe(invoice.id)
        expect(result.invoice.status).toBe(InvoiceStatus.Open)
      })
    })
  })

  describe('Invoice Status Tests', () => {
    //     it('should successfully update a non-terminal invoice', async () => {
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Paid,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
    //       const { organization, price } = await setupOrg()
    //       const customer = await setupCustomer({
    //         organizationId: organization.id,
    //       })
    //       const invoice = await setupInvoice({
    //         customerId: customer.id,
    //         organizationId: organization.id,
    //         status: InvoiceStatus.Draft,
    //         priceId: price.id,
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
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
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
                status: invoice.status,
                currency: invoice.currency,
                dueDate: invoice.dueDate,
                invoiceDate: invoice.invoiceDate,
              },
              invoiceLineItems: [
                {
                  invoiceId: invoice.id,
                  description: 'Item 1',
                  quantity: 1,
                  price: 1000,
                  type: SubscriptionItemType.Static,
                  priceId: null,
                },
                {
                  invoiceId: invoice.id,
                  description: 'Item 2',
                  quantity: 1,
                  price: 2000,
                  type: SubscriptionItemType.Static,
                  priceId: null,
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
              status: invoice.status,
              currency: invoice.currency,
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate,
            },
            invoiceLineItems: [
              {
                id: updatedInvoiceLineItems[0].id, // Modify existing
                invoiceId: invoice.id,
                description: 'Modified Item 1',
                quantity: 2,
                price: 1500,
                type: SubscriptionItemType.Static,
                priceId: null,
              },
              {
                invoiceId: invoice.id, // Add new
                description: 'New Item 3',
                quantity: 1,
                price: 3000,
                type: SubscriptionItemType.Static,
                priceId: null,
              },
            ],
          },
          true,
          transaction
        )

        expect(result.invoiceLineItems).toHaveLength(2)
        const modifiedItem = result.invoiceLineItems.find(
          (item) => item.description === 'Modified Item 1'
        )
        const newItem = result.invoiceLineItems.find(
          (item) => item.description === 'New Item 3'
        )
        expect(modifiedItem).toMatchObject({ price: 1500 })
        expect(modifiedItem!.price).toBe(1500)
        expect(modifiedItem!.quantity).toBe(2)
        expect(newItem).toMatchObject({ price: 3000 })
        expect(newItem!.price).toBe(3000)
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
  //       const { organization, price } = await setupOrg()
  //       const customer = await setupCustomer({
  //         organizationId: organization.id,
  //       })
  //       const invoice = await setupInvoice({
  //         customerId: customer.id,
  //         organizationId: organization.id,
  //         status: InvoiceStatus.Draft,
  //         priceId: price.id,
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
  //       const { organization, price } = await setupOrg()
  //       const customer = await setupCustomer({
  //         organizationId: organization.id,
  //       })
  //       const invoice = await setupInvoice({
  //         customerId: customer.id,
  //         organizationId: organization.id,
  //         status: InvoiceStatus.Draft,
  //         priceId: price.id,
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

import { FlowgladServer } from '@flowglad/server'

/**
 * Factory function that creates a scoped FlowgladServer instance for a specific customer.
 *
 * @param customerExternalId - The customer's external ID from your app's database
 * @returns A FlowgladServer instance scoped to that customer
 */
export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    baseURL: 'http://localhost:3000',
    customerExternalId,
    getCustomerDetails: async () => {
      // In production, fetch from your database:
      // const user = await db.users.findOne({ id: customerExternalId })
      // return { email: user.email, name: user.name }

      return {
        email: '', // Would need to fetch from DB
        name: '',
      }
    },
  })
}

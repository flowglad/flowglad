import type { StandardLogger } from '@/types'
import { verifyCheckoutSessionContract } from './checkoutSessionContract'
import { verifyCustomerContract } from './customerContract'

const verifyApiContract = async (logger: StandardLogger) => {
  const { customer } = await verifyCustomerContract(logger)
  await verifyCheckoutSessionContract(
    {
      customer,
    },
    logger
  )
}

export default verifyApiContract

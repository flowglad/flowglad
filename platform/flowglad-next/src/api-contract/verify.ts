import { StandardLogger } from '@/types'
import { verifyCustomerContract } from './customerContract'
import { verifyCheckoutSessionContract } from './checkoutSessionContract'

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

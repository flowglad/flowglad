import { StandardLogger } from '@/types'
import { verifyCustomerContract } from './customerContract'

const verifyApiContract = async (logger: StandardLogger) => {
  await verifyCustomerContract(logger)
}

export default verifyApiContract

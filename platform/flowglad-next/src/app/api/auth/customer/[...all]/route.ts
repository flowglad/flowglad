import { toNextJsHandler } from 'better-auth/next-js'
import { customerAuth } from '@/utils/auth/customerAuth'

export const { POST, GET } = toNextJsHandler(customerAuth)

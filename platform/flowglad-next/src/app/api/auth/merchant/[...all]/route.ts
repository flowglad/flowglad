import { toNextJsHandler } from 'better-auth/next-js'
import { merchantAuth } from '@/utils/auth/merchantAuth'

export const { POST, GET } = toNextJsHandler(merchantAuth)

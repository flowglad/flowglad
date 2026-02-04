/**
 * Customer auth API route handler.
 * Handles all auth endpoints for billing portal customers at /api/auth/customer/*.
 *
 * Supports:
 * - Email OTP authentication
 * - Magic link authentication
 *
 * Note: Password and social login are intentionally NOT supported for customer auth.
 * Customer sessions expire after 24 hours for security.
 */
import { toNextJsHandler } from 'better-auth/next-js'
import { customerAuth } from '@/utils/auth/customerAuth'

export const { POST, GET } = toNextJsHandler(customerAuth)

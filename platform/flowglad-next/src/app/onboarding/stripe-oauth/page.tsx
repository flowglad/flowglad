import { redirect } from 'next/navigation'
import { getStripeOAuthUrl } from '@/utils/stripe'

export default function StripeOAuthPage() {
  redirect(getStripeOAuthUrl())
}

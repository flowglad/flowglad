import Pricing from '@/components/ui/Pricing/Pricing'
import { getUser } from '@/utils/supabase/queries'
import { createClient } from '@/utils/supabase/server'

export default async function PricingPage() {
  const supabase = await createClient()
  const user = await getUser(supabase)

  return <Pricing user={user} />
}

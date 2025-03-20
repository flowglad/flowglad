import Pricing from '@/components/ui/Pricing/Pricing';
import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/queries';

export default async function PricingPage() {
  const supabase = await createClient();
  const user = await getUser(supabase);

  return <Pricing user={user} />;
}

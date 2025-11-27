import { createClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types_db'
import { toDateTime } from '@/utils/helpers'

type Product = Tables<'products'>
type Price = Tables<'prices'>

// Change to control trial period length
const TRIAL_PERIOD_DAYS = 0

// Note: supabaseAdmin uses the SERVICE_ROLE_KEY which you must only use in a secure server-side context
// as it has admin privileges and overwrites RLS policies!
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const upsertCustomerToSupabase = async (
  uuid: string,
  customerId: string
) => {
  const { error: upsertError } = await supabaseAdmin
    .from('customers')
    .upsert([{ id: uuid, stripe_customer_id: customerId }])

  if (upsertError)
    throw new Error(
      `Supabase customer record creation failed: ${upsertError.message}`
    )

  return customerId
}

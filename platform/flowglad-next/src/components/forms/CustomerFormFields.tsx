import { useFormContext } from 'react-hook-form'
import { z } from 'zod'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { Customer } from '@/db/schema/customers'

/**
 * Zod schemas for customer form validation
 */
const nameSchema = z
  .string()
  .min(2, `Please enter the customer's full name`)

const emailSchema = z
  .string()
  .email('Please enter a valid email address')

export const customerSchema = z.object({
  customer: z.object({
    name: nameSchema,
    email: emailSchema,
  }),
})

export type CustomerFormValues = z.infer<typeof customerSchema>

const CustomerFormFields = () => {
  const form = useFormContext<{
    customer: Customer.ClientInsert
  }>()

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="customer.name"
         
        render={({ field }) => (
          <FormItem>
            <FormLabel>Customer Name</FormLabel>
            <FormControl>
              <Input placeholder="Apple Inc." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="customer.email"
        
        render={({ field }) => (
          <FormItem>
            <FormLabel>Customer Email</FormLabel>
            <FormControl>
              <Input placeholder="steve@apple.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export default CustomerFormFields

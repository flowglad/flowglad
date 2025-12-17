import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { Customer } from '@/db/schema/customers'

const CustomerFormFields = () => {
  const form = useFormContext<{
    customer: Customer.ClientInsert
  }>()

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="customer.name"
        rules={{
          required: true,
          validate: (value) => {
            if (value && value.length < 2) {
              return `Please enter the customer's full name`
            }
          },
        }}
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
        rules={{
          required: true,
          validate: (value) => {
            if (
              value &&
              !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
                value
              )
            ) {
              return 'Please enter a valid email address'
            }
          },
        }}
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

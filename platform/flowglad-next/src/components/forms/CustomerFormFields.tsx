import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { Customer } from '@/db/schema/customers'

interface CustomerFormFieldsProps {
  showExternalId?: boolean
}

const CustomerFormFields = ({
  showExternalId = false,
}: CustomerFormFieldsProps) => {
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
      {showExternalId && (
        <FormField
          control={form.control}
          name="customer.externalId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>External ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="cust_abc123"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                Your own identifier for this customer. If left blank,
                one will be generated automatically.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}

export default CustomerFormFields

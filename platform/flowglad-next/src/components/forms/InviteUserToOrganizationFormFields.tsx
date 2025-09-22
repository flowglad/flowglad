import React from 'react'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { InviteUserToOrganizationInput } from '@/db/schema/memberships'

const InviteUserToOrganizationFormFields: React.FC = () => {
  const form = useFormContext<InviteUserToOrganizationInput>()

  return (
    <div className="flex flex-col gap-3">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Email <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="Enter email"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Name <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="Enter name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export default InviteUserToOrganizationFormFields

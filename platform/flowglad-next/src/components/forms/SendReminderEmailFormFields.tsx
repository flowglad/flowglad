'use client'

import { trpc } from '@/app/_trpc/client'
import { sendInvoiceReminderSchema } from '@/db/schema/invoiceLineItems'
import { Controller, useFormContext } from 'react-hook-form'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

type SendReminderEmailFormFields = z.infer<
  typeof sendInvoiceReminderSchema
>

const SendReminderEmailFormFields = () => {
  const { control, register, setValue, watch } =
    useFormContext<SendReminderEmailFormFields>()
  const to = watch('to')
  const cc = watch('cc')
  return (
    <>
      <FormField
        control={control}
        name="to"
        render={({ field }) => (
          <FormItem>
            <FormLabel>To (comma separated)</FormLabel>
            <FormControl>
              <Input
                value={field.value?.join(', ') ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  const emails = value
                    .split(',')
                    .map((email) => email.trim())
                  field.onChange(emails)
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="cc"
        render={({ field }) => (
          <FormItem>
            <FormLabel>CC (comma separated)</FormLabel>
            <FormControl>
              <Input
                value={field.value?.join(', ') ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  const emails = value
                    .split(',')
                    .map((email) => email.trim())
                  field.onChange(emails)
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

export default SendReminderEmailFormFields

'use client'

import { trpc } from '@/app/_trpc/client'
import { sendInvoiceReminderSchema } from '@/db/schema/invoiceLineItems'
import { Controller, useFormContext } from 'react-hook-form'
import { z } from 'zod'
import Input from '../ion/Input'

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
      <Controller
        control={control}
        name="to"
        render={({ field }) => (
          <Input
            label="To (comma separated)"
            value={field.value?.join(', ') ?? ''}
            onChange={(e) => {
              const value = e.target.value
              const emails = value
                .split(',')
                .map((email) => email.trim())
              field.onChange(emails)
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="cc"
        render={({ field }) => (
          <Input
            label="CC (comma separated)"
            value={field.value?.join(', ') ?? ''}
            onChange={(e) => {
              const value = e.target.value
              const emails = value
                .split(',')
                .map((email) => email.trim())
              field.onChange(emails)
            }}
          />
        )}
      />
    </>
  )
}

export default SendReminderEmailFormFields

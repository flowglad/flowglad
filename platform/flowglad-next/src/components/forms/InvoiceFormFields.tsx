import { Calendar, ChevronDown } from 'lucide-react'
import { encodeCursor } from '@/db/tableUtils'
import Input from '@/components/ion/Input'
import Select from '@/components/ion/Select'
import Textarea from '@/components/ion/Textarea'
import { InvoiceFormLineItemsField } from './InvoiceFormLineItemsField'

import { Invoice } from '@/db/schema/invoices'
import { Controller, useFormContext } from 'react-hook-form'
import { useAuthenticatedContext } from '../../contexts/authContext'
import Datepicker from '../ion/Datepicker'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Customer } from '@/db/schema/customers'
import { trpc } from '@/app/_trpc/client'
import Switch from '@/components/ion/Switch'
import Label from '../ion/Label'
import Badge from '../ion/Badge'
import ConnectedSelect from './ConnectedSelect'
import core from '@/utils/core'

const selectOptionsFromCustomers = (
  customer?: Customer.ClientRecord,
  data?: Customer.PaginatedList
) => {
  if (customer) {
    return [
      {
        label: customer.name as string,
        value: customer.id,
      },
    ]
  }
  return (
    data?.data.map((customer) => ({
      label: customer.name as string,
      value: customer.id as string,
    })) ?? []
  )
}

const InvoiceFormFields = ({
  customer,
  editMode = false,
}: {
  customer?: Customer.ClientRecord
  editMode?: boolean
}) => {
  const { organization } = useAuthenticatedContext()
  const { data } = trpc.customers.list.useQuery({
    cursor: encodeCursor({
      parameters: {
        organizationId: organization!.id,
      },
    }),
  })
  const { refetch } = trpc.organizations.getMembers.useQuery(
    undefined,
    {
      enabled: false,
    }
  )
  const customerOptions = selectOptionsFromCustomers(customer, data)
  const { control, register, watch, setValue } = useFormContext<{
    invoice: Invoice.Insert
    autoSend: boolean
  }>()
  const customerId = watch('invoice.customerId')
  const { data: associatedCustomerData } =
    trpc.customers.internal__getById.useQuery(
      { id: customerId! },
      { enabled: !!customerId }
    )
  const { data: invoicesForCustomer } = trpc.invoices.list.useQuery(
    {
      cursor: encodeCursor({
        parameters: {
          customerId: customerId,
        },
      }),
    },
    {
      enabled: !!customerId,
    }
  )
  const totalInvoicesForCustomer = invoicesForCustomer?.total ?? 0
  const invoiceNumberBase =
    associatedCustomerData?.customer.invoiceNumberBase ?? ''
  const [dueOption, setDueOption] = useState('On Receipt')
  useEffect(() => {
    if (totalInvoicesForCustomer > 0 && invoiceNumberBase) {
      setValue(
        'invoice.invoiceNumber',
        core.createInvoiceNumber(
          invoiceNumberBase,
          totalInvoicesForCustomer + 1
        )
      )
    }
  }, [totalInvoicesForCustomer, invoiceNumberBase, setValue])
  return (
    <>
      <div className="w-full flex items-start gap-2.5">
        <Input
          label="Bill From"
          value={organization!.name}
          className="flex-1"
          disabled
        />
        <Controller
          name="invoice.customerId"
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              placeholder="placeholder"
              options={customerOptions}
              label="Bill To"
              className="flex-1"
              defaultValue={customer?.id}
              disabled={!!customer}
              value={field.value?.toString()}
              onValueChange={(value) => field.onChange(Number(value))}
            />
          )}
        />
      </div>
      <div className="w-full flex items-start gap-2.5">
        <Controller
          name="invoice.invoiceDate"
          control={control}
          render={({ field }) => (
            <Datepicker
              {...field}
              onSelect={(value) =>
                field.onChange(value ? value.toISOString() : '')
              }
              value={field.value ? new Date(field.value) : undefined}
              iconTrailing={<ChevronDown size={16} />}
              iconLeading={<Calendar size={16} />}
              label="Issued On"
              className="flex-1 w-full"
            />
          )}
        />
        <Input
          {...register('invoice.invoiceNumber')}
          placeholder="0000"
          label="Invoice #"
          className="flex-1 w-full"
        />
      </div>
      <div className="w-full flex flex-row items-start gap-2.5">
        <Controller
          name="invoice.ownerMembershipId"
          control={control}
          render={({ field }) => (
            <ConnectedSelect
              {...field}
              value={field.value?.toString()}
              fetchOptionData={async () => {
                const { data } = await refetch()
                return data?.data
              }}
              label="Owner"
              mapDataToOptions={(data) => {
                return (
                  data?.members.map((member) => ({
                    label: member.user.name ?? '',
                    value: member.membership.id,
                  })) ?? []
                )
              }}
              className="flex-1"
              defaultValueFromData={(data) => {
                return data?.members[0]?.membership.id ?? ''
              }}
              onValueChange={(value) => field.onChange(value ?? '')}
            />
          )}
        />
        <Controller
          name="invoice.bankPaymentOnly"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col items-start gap-2 flex-1">
              <Label>Bank Payment Only</Label>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                label={
                  <div className="cursor-pointer w-full">
                    Only accept payment via ACH or Wire.
                  </div>
                }
              />
            </div>
          )}
        />
      </div>
      <div className="w-full flex flex-row items-start gap-2.5">
        <Select
          placeholder="placeholder"
          options={[
            {
              label: 'On Receipt',
              value: 'On Receipt',
            },
            {
              label: 'Custom Date',
              value: 'Custom Date',
            },
          ]}
          label="Due"
          className="flex-1"
          value={dueOption}
          onValueChange={(value) => setDueOption(value)}
        />
        <Controller
          name="invoice.dueDate"
          control={control}
          render={({ field }) => (
            <Datepicker
              {...field}
              onSelect={(value) =>
                field.onChange(value ? value.toISOString() : '')
              }
              value={field.value ? new Date(field.value) : undefined}
              iconTrailing={<ChevronDown size={16} />}
              iconLeading={<Calendar size={16} />}
              label="Due Date"
              className={clsx(
                'flex-1',
                dueOption !== 'Custom Date' && 'opacity-0'
              )}
              disabled={dueOption !== 'Custom Date'}
            />
          )}
        />
      </div>
      {!editMode && (
        <Controller
          name="autoSend"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                id="auto-send"
              />
              <Label htmlFor="auto-send">
                Email invoice to customer after creation
              </Label>
            </div>
          )}
        />
      )}
      <div className="w-full border-opacity-[0.07] flex items-start py-6 border-b border-white">
        <div className="flex-1 w-full flex flex-col justify-center gap-6">
          <div className="w-full flex flex-col gap-3">
            <InvoiceFormLineItemsField />
          </div>
        </div>
      </div>
      <div className="w-full flex items-start py-6">
        <div className="flex-1 w-full flex flex-col justify-center gap-6">
          <Controller
            name="invoice.memo"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                placeholder="Add scope of work and other notes"
                label="Memo"
                className="w-full"
                value={field.value ?? ''}
              />
            )}
          />
        </div>
      </div>
    </>
  )
}

export default InvoiceFormFields

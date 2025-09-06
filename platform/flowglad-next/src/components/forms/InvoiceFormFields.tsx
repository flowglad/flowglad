import { Calendar, ChevronDown } from 'lucide-react'
import { encodeCursor } from '@/db/tableUtils'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { InvoiceFormLineItemsField } from './InvoiceFormLineItemsField'

import { Invoice } from '@/db/schema/invoices'
import { useFormContext } from 'react-hook-form'
import { useAuthenticatedContext } from '../../contexts/authContext'
import Datepicker from '../ion/Datepicker'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Customer } from '@/db/schema/customers'
import { trpc } from '@/app/_trpc/client'
import { Switch } from '@/components/ui/switch'
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
  const { data } = trpc.customers.list.useQuery(
    {
      cursor: encodeCursor({
        parameters: {
          organizationId: organization!.id,
        },
      }),
      limit: '100',
    },
    {
      refetchOnMount: 'always',
      staleTime: 0,
    }
  )

  const { refetch } = trpc.organizations.getMembers.useQuery(
    {},
    {
      enabled: false,
    }
  )
  const customerOptions = selectOptionsFromCustomers(customer, data)
  const form = useFormContext<{
    invoice: Invoice.Insert
    autoSend: boolean
  }>()
  const customerId = form.watch('invoice.customerId')
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
      form.setValue(
        'invoice.invoiceNumber',
        core.createInvoiceNumber(
          invoiceNumberBase,
          totalInvoicesForCustomer + 1
        )
      )
    }
  }, [
    totalInvoicesForCustomer,
    invoiceNumberBase,
    form.setValue,
    form,
  ])
  return (
    <>
      <div className="w-full flex items-start gap-2.5">
        <div className="flex-1">
          <FormItem>
            <FormLabel>Bill From</FormLabel>
            <FormControl>
              <Input
                value={organization!.name}
                disabled
                className="w-full"
              />
            </FormControl>
          </FormItem>
        </div>
        <FormField
          control={form.control}
          name="invoice.customerId"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Bill To</FormLabel>
              <FormControl>
                <Select
                  value={field.value?.toString()}
                  onValueChange={(value) =>
                    field.onChange(Number(value))
                  }
                  disabled={!!customer}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="placeholder" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="w-full flex items-start gap-2.5">
        <FormField
          control={form.control}
          name="invoice.invoiceDate"
          render={({ field }) => (
            <FormItem className="flex-1 w-full">
              <FormLabel>Issued On</FormLabel>
              <FormControl>
                <Datepicker
                  {...field}
                  onSelect={(value) =>
                    field.onChange(value ? value.toISOString() : '')
                  }
                  value={
                    field.value ? new Date(field.value) : undefined
                  }
                  iconTrailing={<ChevronDown size={16} />}
                  iconLeading={<Calendar size={16} />}
                  className="flex-1 w-full"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="invoice.invoiceNumber"
          render={({ field }) => (
            <FormItem className="flex-1 w-full">
              <FormLabel>Invoice #</FormLabel>
              <FormControl>
                <Input placeholder="0000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="w-full flex flex-row items-start gap-2.5">
        <FormField
          control={form.control}
          name="invoice.ownerMembershipId"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Owner</FormLabel>
              <FormControl>
                <ConnectedSelect
                  {...field}
                  value={field.value?.toString()}
                  fetchOptionData={async () => {
                    const { data: membersData } = await refetch()
                    return membersData?.data
                  }}
                  mapDataToOptions={(data) => {
                    return (
                      data?.map((member) => ({
                        label: member.user.name ?? '',
                        value: member.membership.id,
                      })) ?? []
                    )
                  }}
                  className="flex-1"
                  defaultValueFromData={(data) => {
                    return (data ?? [])[0]?.membership.id ?? ''
                  }}
                  onValueChange={(value) =>
                    field.onChange(value ?? '')
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="invoice.bankPaymentOnly"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Bank Payment Only</FormLabel>
              <FormControl>
                <Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  label={
                    <div className="cursor-pointer w-full">
                      Only accept payment via ACH or Wire.
                    </div>
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="w-full flex flex-row items-start gap-2.5">
        <div className="flex-1">
          <FormLabel>Due</FormLabel>
          <Select
            value={dueOption}
            onValueChange={(value) => setDueOption(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="placeholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="On Receipt">On Receipt</SelectItem>
              <SelectItem value="Custom Date">Custom Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FormField
          control={form.control}
          name="invoice.dueDate"
          render={({ field }) => (
            <FormItem
              className={clsx(
                'flex-1',
                dueOption !== 'Custom Date' && 'opacity-0'
              )}
            >
              <FormLabel>Due Date</FormLabel>
              <FormControl>
                <Datepicker
                  {...field}
                  onSelect={(value) =>
                    field.onChange(value ? value.toISOString() : '')
                  }
                  value={
                    field.value ? new Date(field.value) : undefined
                  }
                  iconTrailing={<ChevronDown size={16} />}
                  iconLeading={<Calendar size={16} />}
                  className="flex-1"
                  disabled={dueOption !== 'Custom Date'}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {!editMode && (
        <FormField
          control={form.control}
          name="autoSend"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="auto-send"
                  />
                </FormControl>
                <FormLabel htmlFor="auto-send">
                  Email invoice to customer after creation
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
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
          <FormField
            control={form.control}
            name="invoice.memo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Memo</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Add scope of work and other notes"
                    className="w-full"
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </>
  )
}

export default InvoiceFormFields

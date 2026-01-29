import { encodeCursor } from '@db-core/tableUtils'
import { format } from 'date-fns'
import { Calendar, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
import { cn } from '@/lib/utils'
import core from '@/utils/core'
import { useAuthenticatedContext } from '../../contexts/authContext'
import ConnectedSelect from './ConnectedSelect'
import { InvoiceFormLineItemsField } from './InvoiceFormLineItemsField'

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
      <div className="w-full flex flex-col md:flex-row items-start gap-2.5">
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
      <div className="w-full flex flex-col md:flex-row items-start gap-2.5">
        <FormField
          control={form.control}
          name="invoice.invoiceDate"
          render={({ field }) => (
            <FormItem className="flex-1 w-full">
              <FormLabel>Issued On</FormLabel>
              <FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'flex-1 w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <Calendar size={16} className="mr-2" />
                      {field.value
                        ? format(new Date(field.value), 'PPP')
                        : 'Select issue date'}
                      <ChevronDown size={16} className="ml-auto" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0"
                    align="start"
                  >
                    <CalendarComponent
                      mode="single"
                      selected={
                        field.value
                          ? new Date(field.value)
                          : undefined
                      }
                      onSelect={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
      <div className="w-full flex flex-col md:flex-row items-start gap-2.5">
        <FormField
          control={form.control}
          name="invoice.ownerMembershipId"
          render={({ field }) => (
            <FormItem className="w-full md:flex-1">
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
                <div className="flex items-center space-x-2">
                  <Switch
                    id="bank-payment-only"
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="bank-payment-only"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Only accept payment via ACH or Wire.
                  </Label>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="w-full flex flex-col md:flex-row items-start gap-2.5">
        <div className="w-full md:flex-1">
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
              className={cn(
                'flex-1',
                dueOption !== 'Custom Date' && 'opacity-0'
              )}
            >
              <FormLabel>Due Date</FormLabel>
              <FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={dueOption !== 'Custom Date'}
                      className={cn(
                        'flex-1 justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <Calendar size={16} className="mr-2" />
                      {field.value
                        ? format(new Date(field.value), 'PPP')
                        : 'Select due date'}
                      <ChevronDown size={16} className="ml-auto" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0"
                    align="start"
                  >
                    <CalendarComponent
                      mode="single"
                      selected={
                        field.value
                          ? new Date(field.value)
                          : undefined
                      }
                      onSelect={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      disabled={(date) => dueOption !== 'Custom Date'}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
      <div className="w-full flex items-start py-6 border-b border-border">
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

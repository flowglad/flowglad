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
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { trpc } from '@/app/_trpc/client'
import Switch from '@/components/ion/Switch'
import Label from '../ion/Label'
import Badge from '../ion/Badge'
import ConnectedSelect from './ConnectedSelect'
import core from '@/utils/core'

const customerProfileOptions = (
  customerProfile?: CustomerProfile.ClientRecord,
  data?: CustomerProfile.PaginatedList
) => {
  if (customerProfile) {
    return [
      {
        label: customerProfile.name as string,
        value: customerProfile.id,
      },
    ]
  }
  return (
    data?.data.map((customerProfile) => ({
      label: customerProfile.name as string,
      value: customerProfile.id as string,
    })) ?? []
  )
}

const InvoiceFormFields = ({
  customerProfile,
  editMode = false,
}: {
  customerProfile?: CustomerProfile.ClientRecord
  editMode?: boolean
}) => {
  const { organization } = useAuthenticatedContext()
  const { data } = trpc.customerProfiles.list.useQuery({
    cursor: encodeCursor({
      parameters: {
        OrganizationId: organization!.id,
      },
    }),
  })
  const { refetch } = trpc.organizations.getMembers.useQuery(
    undefined,
    {
      enabled: false,
    }
  )
  const customerOptions = customerProfileOptions(
    customerProfile,
    data
  )
  const { control, register, watch, setValue } = useFormContext<{
    invoice: Invoice.Insert
    autoSend: boolean
  }>()
  const CustomerProfileId = watch('invoice.CustomerProfileId')
  const { data: associatedCustomerProfileData } =
    trpc.customerProfiles.internal__getById.useQuery(
      { id: CustomerProfileId! },
      { enabled: !!CustomerProfileId }
    )
  const { data: invoicesForCustomerProfile } =
    trpc.invoices.list.useQuery(
      {
        cursor: encodeCursor({
          parameters: {
            CustomerProfileId: CustomerProfileId,
          },
        }),
      },
      {
        enabled: !!CustomerProfileId,
      }
    )
  const totalInvoicesForCustomerProfile =
    invoicesForCustomerProfile?.total ?? 0
  const invoiceNumberBase =
    associatedCustomerProfileData?.customerProfile
      .invoiceNumberBase ?? ''
  const [dueOption, setDueOption] = useState('On Receipt')
  useEffect(() => {
    if (totalInvoicesForCustomerProfile > 0 && invoiceNumberBase) {
      setValue(
        'invoice.invoiceNumber',
        core.createInvoiceNumber(
          invoiceNumberBase,
          totalInvoicesForCustomerProfile + 1
        )
      )
    }
  }, [totalInvoicesForCustomerProfile, invoiceNumberBase])
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
          name="invoice.CustomerProfileId"
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              placeholder="placeholder"
              options={customerOptions}
              label="Bill To"
              className="flex-1"
              defaultValue={customerProfile?.id}
              disabled={!!customerProfile}
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

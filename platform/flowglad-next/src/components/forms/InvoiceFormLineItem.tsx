'use client'
import type { CreateInvoiceInput } from '@db-core/schema/invoiceLineItems'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { Controller, useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { CurrencyInput } from '@/components/ui/currency-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { cn } from '@/lib/utils'
import {
  currencyCharacter,
  isCurrencyZeroDecimal,
} from '@/registry/lib/currency'
import {
  rawStringAmountToCountableCurrencyAmount,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
} from '@/utils/stripe'

interface InvoiceFormLineItemProps {
  id: string
  index: number
  onRemove: (id: string) => void
  disableRemove?: boolean
}

const InvoiceFormLineItem = ({
  id,
  index,
  onRemove,
  disableRemove = false,
}: InvoiceFormLineItemProps) => {
  const form = useFormContext<CreateInvoiceInput>()
  const { organization } = useAuthenticatedContext()
  const quantity = form.watch(`invoiceLineItems.${index}.quantity`)
  const price = form.watch(`invoiceLineItems.${index}.price`)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const xOnClickHandler = () => {
    onRemove(id)
  }

  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'w-full flex items-center gap-2 bg-background pb-2 border border-transparent z-0',
        isDragging && 'z-20  border-muted rounded-md'
      )}
    >
      <div className="flex flex-row gap-2 min-w-80">
        <FormField
          control={form.control}
          name={`invoiceLineItems.${index}.description`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-20">
              <FormControl>
                <Input
                  {...field}
                  placeholder="Item/Service name"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value)
                  }}
                  className="h-9"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
      <FormField
        name={`invoiceLineItems.${index}.quantity`}
        control={form.control}
        render={({ field }) => {
          return (
            <FormItem className="w-20 min-w-20">
              <FormControl>
                <Input
                  type="number"
                  placeholder="1"
                  min={0}
                  max={1000}
                  step={1}
                  className="h-9 text-center"
                  value={field.value?.toString() ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    const numValue = Number(value)
                    if (!isNaN(numValue)) {
                      field.onChange(numValue)
                    }
                  }}
                />
              </FormControl>
            </FormItem>
          )
        }}
      />
      <FormField
        name={`invoiceLineItems.${index}.price`}
        control={form.control}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-32">
            <FormLabel>Price</FormLabel>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currencyCharacter(organization!.defaultCurrency)}
              </span>
              <FormControl>
                <CurrencyInput
                  value={field.value?.toString() ?? ''}
                  onValueChange={(value) => {
                    if (!value) {
                      field.onChange('0')
                      return
                    }
                    field.onChange(
                      rawStringAmountToCountableCurrencyAmount(
                        organization!.defaultCurrency,
                        value.toString()
                      )
                    )
                  }}
                  allowDecimals={!zeroDecimal}
                />
              </FormControl>
            </div>
          </FormItem>
        )}
      />
      <div className="w-20 flex items-center">
        <p className="text-md">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            organization!.defaultCurrency,
            quantity * price
          )}
        </p>
      </div>
      <Button
        {...attributes}
        {...listeners}
        variant="ghost"
        size="default"
        className={cn('cursor-grab', isDragging && 'cursor-grabbing')}
      >
        <GripVertical className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="default"
        onClick={() => onRemove(id)}
        disabled={disableRemove}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}

export default InvoiceFormLineItem

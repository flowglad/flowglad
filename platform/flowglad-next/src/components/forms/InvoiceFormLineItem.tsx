// Generated with Ion on 10/11/2024, 4:13:18 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=770:28007
'use client'
import { GripVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormControl,
} from '@/components/ui/form'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import NumberInput from '../ion/NumberInput'
import { CreateInvoiceInput } from '@/db/schema/invoiceLineItems'
import { useFormContext, Controller } from 'react-hook-form'
import { CurrencyInput } from '../ion/CurrencyInput'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'w-full flex items-center gap-8 bg-background pb-2 border border-transparent z-0',
        isDragging && 'z-20  border-muted rounded-radius-sm'
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
      <Controller
        name={`invoiceLineItems.${index}.quantity`}
        control={form.control}
        render={({ field }) => {
          return (
            <NumberInput
              placeholder="1"
              {...field}
              onChange={(e) => {
                field.onChange(Number(e.target.value))
              }}
              max={1000}
              min={0}
              className="w-20"
              inputClassName="h-9"
              showControls={false}
            />
          )
        }}
      />
      <Controller
        name={`invoiceLineItems.${index}.price`}
        control={form.control}
        render={({ field }) => (
          <CurrencyInput {...field} className="w-[100px]" />
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
        className={clsx(
          'cursor-grab',
          isDragging && 'cursor-grabbing'
        )}
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

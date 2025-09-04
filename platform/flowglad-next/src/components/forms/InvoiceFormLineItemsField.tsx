import React from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import InvoiceFormLineItem from './InvoiceFormLineItem'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Plus, GripVertical } from 'lucide-react'

import { useFieldArray, useFormContext } from 'react-hook-form'
import {
  CreateInvoiceInput,
  InvoiceLineItem,
} from '@/db/schema/invoiceLineItems'
import { useAuthContext } from '@/contexts/authContext'
import { SubscriptionItemType } from '@/types'

export const newInvoiceLineItem: InvoiceLineItem.ClientInsert = {
  type: SubscriptionItemType.Static,
  description: '',
  quantity: 1,
  price: 0,
  priceId: null,
}
export const InvoiceFormLineItemsField = () => {
  const { livemode } = useAuthContext()
  const { control, setValue, watch } =
    useFormContext<CreateInvoiceInput>()
  const { fields, append, update, remove } = useFieldArray({
    control,
    name: 'invoiceLineItems',
  })

  const invoiceLineItems = watch('invoiceLineItems') || []
  const sensors = useSensors(
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = invoiceLineItems.findIndex(
        (item) =>
          (item as InvoiceLineItem.ClientRecord).id === active.id
      )
      const newIndex = invoiceLineItems.findIndex(
        (item) =>
          (item as InvoiceLineItem.ClientRecord).id === over.id
      )

      const newItems = arrayMove(invoiceLineItems, oldIndex, newIndex)
      setValue('invoiceLineItems', newItems)
    }
  }

  const addAnItemClickHandler = () => {
    append(newInvoiceLineItem)
  }

  return (
    <div className="space-y-2">
      <div className="w-full flex items-end gap-8">
        <div className="flex flex-row gap-2 min-w-80 items-end">
          <Button
            variant="ghost"
            size="default"
            className="opacity-0"
          >
            <GripVertical size={16} />
          </Button>
          <Label className="flex-1">Item</Label>
        </div>
        <Label className="w-20">Qty</Label>
        <Label className="w-[100px]">Rate</Label>
        <Label className="w-20">Total</Label>
        <div className="w-9" /> {/* Spacer for remove button */}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={fields.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {fields.map((item, index) => (
            <InvoiceFormLineItem
              id={item.id}
              key={item.id}
              index={index}
              onRemove={() => {
                remove(index)
              }}
              disableRemove={invoiceLineItems.length === 1}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        variant="ghost"
        size="sm"
        onClick={addAnItemClickHandler}
      >
        <Plus size={16} />
        Add Item
      </Button>
    </div>
  )
}

'use client'

import React from 'react'
import { useForm } from 'react-hook-form'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

interface FormData {
  message: string
}

const DemoModal: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false)
  const form = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    // Create a promise that resolves after 10 seconds
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 10000)
    }).then(() => {
      // Close the modal after the promise resolves
      setIsOpen(false)
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Open Demo Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hello World Modal</DialogTitle>
        </DialogHeader>
        <form
          id="helloWorldForm"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="message"
            rules={{ required: 'This field is required' }}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="Enter a message" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="helloWorldForm"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DemoModal

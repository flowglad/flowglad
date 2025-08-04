'use client'

import React from 'react'
import { useForm } from 'react-hook-form'
import Modal from '@/components/ion/Modal'
import { Button } from '@/components/ui/button'

interface FormData {
  message: string
}

const DemoModal: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isLoading },
  } = useForm<FormData>()
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
    <>
      <Button onClick={() => setIsOpen(true)}>Open Demo Modal</Button>
      <Modal
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Hello World Modal"
        showClose
        footer={
          <Button
            type="submit"
            form="helloWorldForm"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        }
      >
        <form id="helloWorldForm" onSubmit={handleSubmit(onSubmit)}>
          <input
            {...register('message', {
              required: 'This field is required',
            })}
            placeholder="Enter a message"
            className="w-full p-2 border rounded"
          />
          {errors.message && (
            <p className="text-red-500 text-sm mt-1">
              {errors.message.message}
            </p>
          )}
        </form>
      </Modal>
    </>
  )
}

export default DemoModal

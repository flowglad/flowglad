import { useFormContext } from 'react-hook-form'
import Input from '../ion/Input'
import { Customer } from '@/db/schema/customers'

const CustomerFormFields = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<{
    customer: Customer.ClientInsert
  }>()
  return (
    <>
      {' '}
      <Input
        label="Customer Name"
        {...register('customer.name', {
          required: true,
          validate: (value) => {
            if (value && value.length < 2) {
              return `Please enter the customer's full name`
            }
          },
        })}
        placeholder="Apple Inc."
        error={errors.customer?.name?.message}
      />
      <Input
        label="Customer Email"
        {...register('customer.email', {
          required: true,
          validate: (value) => {
            if (
              value &&
              !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
                value
              )
            ) {
              return 'Please enter a valid email address'
            }
          },
        })}
        placeholder="steve@apple.com"
        error={errors.customer?.email?.message}
      />
    </>
  )
}

export default CustomerFormFields

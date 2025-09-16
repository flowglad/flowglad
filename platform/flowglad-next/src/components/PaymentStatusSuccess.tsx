'use client'
import { Check } from 'lucide-react'

const PaymentStatusSuccess: React.FC<{
  children?: React.ReactNode
}> = ({ children }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full">
      <div className="flex items-center justify-center rounded-full bg-green-500 p-4">
        <Check size={64} color="white" />
      </div>
      <div className="flex flex-col items-center justify-center pb-8">
        <h1 className="text-2xl font-bold mt-4">Order Complete!</h1>
      </div>
      {children}
    </div>
  )
}

export default PaymentStatusSuccess

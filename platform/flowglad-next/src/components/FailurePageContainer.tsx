import { XCircleIcon } from 'lucide-react'

interface FailurePageContainerProps {
  title: string
  message: string
}

const FailurePageContainer = ({
  title,
  message,
}: FailurePageContainerProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="text-center max-w-[400px]">
        <div className="mb-8">
          <div className="h-16 w-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircleIcon className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

export default FailurePageContainer

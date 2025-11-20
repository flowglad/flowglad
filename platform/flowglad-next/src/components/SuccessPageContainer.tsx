import { CheckCircleIcon } from 'lucide-react'

interface SuccessPageContainerProps {
  title: string
  message: string
  customerEmail?: string | null
}

const SuccessPageContainer = ({
  title,
  message,
  customerEmail,
}: SuccessPageContainerProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center max-w-[480px] w-full">
        <div className="mb-8">
          <div className="h-16 w-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>

        <div className="space-y-4">
          <p className="text-muted-foreground">{message}</p>

          {customerEmail && (
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>
                  Confirmation sent to{' '}
                  <span className="font-medium text-foreground">
                    {customerEmail}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SuccessPageContainer

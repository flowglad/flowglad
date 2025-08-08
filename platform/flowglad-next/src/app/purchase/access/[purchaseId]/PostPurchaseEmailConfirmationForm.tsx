'use client'
import { Button } from '@/components/ui/button'
import { trpc } from '@/app/_trpc/client'

const PostPurchaseEmailConfirmationForm = ({
  purchaseId,
  maskedEmail,
  livemode,
}: {
  purchaseId: string
  maskedEmail: string
  livemode: boolean
}) => {
  const requestPurchaseAccessSession =
    trpc.purchases.requestAccess.useMutation()
  const { isSuccess, isPending } = requestPurchaseAccessSession
  let title = 'Session Expired'
  let description = 'We can send a fresh link to'
  if (isSuccess) {
    title = 'New Link Sent!'
    description = `Check your ${maskedEmail} inbox for a fresh link.`
  }
  return (
    <div className="flex justify-between items-center w-full h-full">
      <div className="w-full flex flex-col items-center gap-6">
        <div className="flex flex-col gap-3 text-3xl leading-[54px] text-center text-foreground">
          <div className="font-semibold text-5xl w-full">{title}</div>
          <div>
            {description}
            <br />
            {!isSuccess ? maskedEmail : ''}
          </div>
        </div>
        {isSuccess ? (
          <></>
        ) : (
          <Button
            onClick={() =>
              requestPurchaseAccessSession.mutateAsync({
                purchaseId,
                livemode,
              })
            }
            disabled={isPending}
          >
            {isPending ? 'Sending...' : 'Email Magic Link'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default PostPurchaseEmailConfirmationForm

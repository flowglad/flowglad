import { Button } from '@/components/ui/button'

interface TableHeaderButtonProps {
  buttonLabel: string
  buttonIcon: React.ReactNode
  buttonOnClick: () => void
  buttonDisabled?: boolean
  buttonDisabledTooltip?: string

  secondaryButtonLabel?: string
  secondaryButtonIcon?: React.ReactNode
  secondaryButtonOnClick?: () => void
  secondaryButtonDisabled?: boolean
  secondaryButtonDisabledTooltip?: string
}

interface NoButtons {
  noButtons: true
}

export type TableHeaderButtonSettingProps =
  | NoButtons
  | TableHeaderButtonProps

type TableHeaderProps = {
  title: string
} & TableHeaderButtonSettingProps

export function TableHeader({ title, ...props }: TableHeaderProps) {
  const hasButtons = !(props as NoButtons).noButtons
  const buttonProps = props as TableHeaderButtonProps

  return (
    <div className="w-full flex justify-between items-start">
      <div className="text-xl font-normal text-foreground">
        {title}
      </div>
      {hasButtons && (
        <div className="flex flex-row gap-2">
          {buttonProps.secondaryButtonLabel && (
            <Button
              variant="outline"
              size="sm"
              onClick={buttonProps.secondaryButtonOnClick}
              disabled={buttonProps.secondaryButtonDisabled}
            >
              {buttonProps.secondaryButtonIcon}
              {buttonProps.secondaryButtonLabel}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={buttonProps.buttonOnClick}
            disabled={buttonProps.buttonDisabled}
          >
            {buttonProps.buttonIcon}
            {buttonProps.buttonLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

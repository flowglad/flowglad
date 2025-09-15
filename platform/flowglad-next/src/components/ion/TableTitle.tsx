import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TableTitleButtonProps {
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

const TableTitleButtonStrip = ({
  buttonLabel,
  buttonIcon,
  buttonOnClick,
  buttonDisabled,
  buttonDisabledTooltip,
  secondaryButtonLabel,
  secondaryButtonIcon,
  secondaryButtonOnClick,
  secondaryButtonDisabled,
  secondaryButtonDisabledTooltip,
}: TableTitleButtonProps) => {
  const renderButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled?: boolean,
    disabledTooltip?: string,
    className?: string
  ) => {
    const button = (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
        {label}
      </Button>
    )

    if (disabled && disabledTooltip) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-not-allowed">
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{disabledTooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return button
  }

  return (
    <div className="flex flex-row gap-2">
      {secondaryButtonLabel &&
        renderButton(
          secondaryButtonLabel,
          secondaryButtonIcon!,
          secondaryButtonOnClick!,
          secondaryButtonDisabled,
          secondaryButtonDisabledTooltip
        )}
      {renderButton(
        buttonLabel,
        buttonIcon,
        buttonOnClick,
        buttonDisabled,
        buttonDisabledTooltip,
        'border-primary'
      )}
    </div>
  )
}

interface NoButtons {
  noButtons: true
}
export type TableTitleButtonSettingProps =
  | NoButtons
  | TableTitleButtonProps

type TableTitleProps = {
  title: string
} & TableTitleButtonSettingProps

const TableTitle = ({ title, ...props }: TableTitleProps) => {
  return (
    <div className="w-full flex justify-between items-start">
      <div className="text-xl font-semibold text-on-primary-hover">
        {title}
      </div>
      {(props as NoButtons).noButtons ? null : (
        <TableTitleButtonStrip
          {...(props as TableTitleButtonProps)}
        />
      )}
    </div>
  )
}

export default TableTitle

import { MigrationButton as Button } from '@/components/ui/button-migration'

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
  return (
    <div className="flex flex-row gap-2">
      {secondaryButtonLabel && (
        <Button
          iconLeading={secondaryButtonIcon}
          variant="outline"
          color="primary"
          size="sm"
          onClick={secondaryButtonOnClick}
          disabled={secondaryButtonDisabled}
          disabledTooltip={secondaryButtonDisabledTooltip}
        >
          {secondaryButtonLabel}
        </Button>
      )}
      <Button
        iconLeading={buttonIcon}
        variant="outline"
        color="primary"
        size="sm"
        className="border-primary"
        onClick={buttonOnClick}
        disabled={buttonDisabled}
        disabledTooltip={buttonDisabledTooltip}
      >
        {buttonLabel}
      </Button>
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

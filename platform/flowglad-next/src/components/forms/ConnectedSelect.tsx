import { useEffect } from 'react'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Label from '@/components/ion/Label'

interface Option {
  label: string
  value: string
  iconLeading?: React.ReactNode
  suffix?: React.ReactNode
  description?: string
  disabled?: boolean
  className?: string
}

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

interface ConnectedSelectProps<T>
  extends Omit<SelectProps, 'options' | 'defaultValue'> {
  fetchOptionData: () => Promise<T>
  mapDataToOptions: (data: T) => Option[]
  defaultValueFromData: (data: T) => string
  label?: string
}

const ConnectedSelect = <T,>({
  fetchOptionData,
  mapDataToOptions,
  defaultValueFromData,
  label,
  ...props
}: ConnectedSelectProps<T>) => {
  const [options, setOptions] = useState<Option[]>([])
  const [defaultValue, setDefaultValue] = useState<
    string | undefined
  >(undefined)
  useEffect(() => {
    fetchOptionData().then((data) => {
      setOptions(mapDataToOptions(data))
      setDefaultValue(defaultValueFromData(data))
    })
  }, [fetchOptionData, mapDataToOptions, defaultValueFromData])

  return (
    <div className="w-full">
      {label && <Label className="mb-1">{label}</Label>}
      <Select value={defaultValue} {...props}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

ConnectedSelect.displayName = 'ConnectedSelect'
export default ConnectedSelect

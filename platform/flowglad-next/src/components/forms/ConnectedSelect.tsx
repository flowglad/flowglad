import { useEffect } from 'react'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
}

const ConnectedSelect = <T,>({
  fetchOptionData,
  mapDataToOptions,
  defaultValueFromData,
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
  )
}

ConnectedSelect.displayName = 'ConnectedSelect'
export default ConnectedSelect

import { useEffect } from 'react'
import { useState } from 'react'
import Select, { Option, SelectProps } from '../ion/Select'

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
    <Select
      options={options}
      defaultValue={defaultValue}
      {...props}
    />
  )
}

ConnectedSelect.displayName = 'ConnectedSelect'
export default ConnectedSelect

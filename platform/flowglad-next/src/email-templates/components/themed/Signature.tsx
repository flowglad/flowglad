import { Text } from '@react-email/components'
import * as React from 'react'

const signature = {
  fontSize: '14px',
  margin: '0 0 4px',
  color: '#333',
}

export const Signature = ({
  greeting,
  name,
  greetingDataTestId,
  nameDataTestId,
}: {
  greeting: string
  name: string
  greetingDataTestId?: string
  nameDataTestId?: string
}) => {
  return (
    <>
      <Text
        style={{ ...signature, marginTop: '30px' }}
        data-testid={greetingDataTestId}
      >
        {greeting}
      </Text>
      <Text style={signature} data-testid={nameDataTestId}>
        {name}
      </Text>
    </>
  )
}

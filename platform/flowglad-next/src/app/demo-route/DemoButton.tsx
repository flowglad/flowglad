'use client'

import { trpc } from '@/app/_trpc/client'

const DemoButton = () => {
  const pongMutation = trpc.utils.pong.useMutation()

  const handlePong = async () => {
    try {
      await pongMutation.mutateAsync({ foo: 'bar' })
    } catch (error) {
      console.error('Error calling pong:', error)
    }
  }

  return <button onClick={handlePong}>Call Pong</button>
}

export default DemoButton

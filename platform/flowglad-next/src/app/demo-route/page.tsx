import core from '@/utils/core'
import { notFound } from 'next/navigation'
import InternalDemoPage from './InternalDemoPage'

const DemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return (
    <div>
      <h1>Demo Page</h1>
      <InternalDemoPage />
    </div>
  )
}

export default DemoPage
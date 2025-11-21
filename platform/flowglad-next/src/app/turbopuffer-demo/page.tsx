import core from '@/utils/core'
import { notFound } from 'next/navigation'
import InternalTurbopufferDemoPage from './InternalTurbopufferDemoPage'

const TurbopufferDemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return <InternalTurbopufferDemoPage />
}

export default TurbopufferDemoPage

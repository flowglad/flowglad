import core from '@/utils/core'
import { notFound } from 'next/navigation'
import InternalDemoPage from './InternalDemoPage'

const RecurringProductWITHOUTTrialPeriod = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return <div>Lol testing</div>
}

export default RecurringProductWITHOUTTrialPeriod

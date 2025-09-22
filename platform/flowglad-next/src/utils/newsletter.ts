import { LoopsClient } from 'loops'
import core from './core'

const loops = () => new LoopsClient(core.envVariable('LOOPS_API_KEY'))

export const subscribeToNewsletter = async (email: string) => {
  if (!core.IS_PROD) {
    return
  }
  return loops().createContact(email)
}

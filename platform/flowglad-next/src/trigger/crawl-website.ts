import { task } from '@trigger.dev/sdk'

export const crawlWebsiteTask = task({
  id: 'crawl-website',
  run: async (payload: { url: string }, { ctx }) => {
    return payload
  },
})

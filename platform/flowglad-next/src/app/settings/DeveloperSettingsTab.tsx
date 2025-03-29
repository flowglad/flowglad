import { trpc } from '@/app/_trpc/client'
import ApiKeysTable, { ApiKeysTableProps } from './ApiKeysTable'

const DeveloperSettingsPage = () => {
  const { data: apiKeys, isPending } = trpc.apiKeys.get.useQuery({})
  const apiKeysTableProps: ApiKeysTableProps = isPending
    ? { data: undefined, loading: true }
    : {
        data: apiKeys?.data.apiKeys ?? [],
        loading: false,
      }
  return <ApiKeysTable {...apiKeysTableProps} />
}

export default DeveloperSettingsPage

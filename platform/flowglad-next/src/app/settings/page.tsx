import { redirect } from 'next/navigation'

const SettingsPage = async () => {
  redirect('/settings/organization-details')
}

export default SettingsPage

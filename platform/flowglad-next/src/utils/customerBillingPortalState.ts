import { cookies } from "next/headers"

const cookieName = 'customer-billing-organization-id'
export const clearCustomerBillingPortalOrganizationId = async () => {
    const cookieStore = await cookies()
    await cookieStore.delete(cookieName)
}

export const setCustomerBillingPortalOrganizationId = async (organizationId: string) => {
    const cookieStore = await cookies()
    await cookieStore.set(cookieName, organizationId)
}

export const getCustomerBillingPortalOrganizationId = async () => {
    const cookieStore = await cookies()
    return cookieStore.get(cookieName)?.value
}
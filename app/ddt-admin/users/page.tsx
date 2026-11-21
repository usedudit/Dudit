import { AdminHeader } from "@/components/admin/admin-header"
import UserEnforcementList from "@/components/admin/users/UserEnforcementList"
import { getUsers, getAdminUserStats } from "@/app/actions/admin/enforcement"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
    const [initialData, initialStats] = await Promise.all([
        getUsers(null, 10),
        getAdminUserStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Usuários" />
            <UserEnforcementList initialData={initialData} initialStats={initialStats} />
        </>
    )
}

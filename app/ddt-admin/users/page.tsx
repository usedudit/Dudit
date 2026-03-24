import { AdminHeader } from "@/components/admin/admin-header"
import UserEnforcementList from "@/components/admin/UserEnforcementList"
import { getUsers } from "@/app/actions/admin/enforcement"

export default async function UsersPage() {
    const initialData = await getUsers(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Usuários e Punições" />
            <UserEnforcementList initialData={initialData} />
        </>
    )
}

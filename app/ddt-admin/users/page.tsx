import { AdminHeader } from "@/components/admin/admin-header"
import UserEnforcementList from "@/components/admin/users/UserEnforcementList"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
    return (
        <>
            <AdminHeader pageTitle="Usuários" />
            <UserEnforcementList
                initialData={{ data: [], nextCursor: null, prevCursor: null, hasMore: false }}
            />
        </>
    )
}

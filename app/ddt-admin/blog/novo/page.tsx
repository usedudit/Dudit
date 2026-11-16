import { AdminHeader } from "@/components/admin/admin-header"
import BlogPostEditor from "@/components/admin/blog/BlogPostEditor"

export const dynamic = "force-dynamic"

export default function AdminNewBlogPostPage() {
    return (
        <>
            <AdminHeader pageTitle="Novo post" backHref="/ddt-admin/blog" isSubPage />
            <BlogPostEditor />
        </>
    )
}

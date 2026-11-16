import { notFound } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import BlogPostEditor from "@/components/admin/blog/BlogPostEditor"
import { getAdminBlogPost } from "@/app/actions/admin/blog"

export const dynamic = "force-dynamic"

export default async function AdminEditBlogPostPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const post = await getAdminBlogPost(id)

    if (!post) notFound()

    return (
        <>
            <AdminHeader pageTitle="Editar post" backHref="/ddt-admin/blog" isSubPage />
            <BlogPostEditor post={post} />
        </>
    )
}

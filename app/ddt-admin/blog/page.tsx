import { AdminHeader } from "@/components/admin/admin-header"
import BlogPostsList from "@/components/admin/blog/BlogPostsList"
import { getAdminBlogPosts, getAdminBlogStats } from "@/app/actions/admin/blog"

export const dynamic = "force-dynamic"

export default async function AdminBlogPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminBlogPosts(),
        getAdminBlogStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Blog do Dino" />
            <BlogPostsList initialData={initialData} initialStats={initialStats} />
        </>
    )
}

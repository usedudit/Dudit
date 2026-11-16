"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
    AlertModal,
    Badge,
    Button,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
    PlusIcon,
    SearchIcon,
    EditIcon,
    TrashIcon,
    EyeIcon,
    FileTextIcon,
    CalendarIcon,
    ArchiveIcon,
    CheckCircleIcon,
    ClockIcon,
    GridIcon,
    ListIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    deleteAdminBlogPost,
    updateAdminBlogPostStatus,
} from "@/app/actions/admin/blog"
import { getBlogCategory } from "@/lib/blog/categories"
import type {
    AdminBlogPostListRow,
    BlogPostStats,
    BlogPostStatus,
} from "@/lib/blog/types"
import {
    formatBlogDateShort,
    getStatusLabel,
    statusBadgeVariant,
} from "@/lib/blog/utils"

interface BlogPostsListProps {
    initialData: AdminBlogPostListRow[]
    initialStats: BlogPostStats
}

type TabId = "all" | "published" | "draft" | "scheduled" | "archived"

const TABS: { id: TabId; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "published", label: "Publicados" },
    { id: "draft", label: "Rascunhos" },
    { id: "scheduled", label: "Agendados" },
    { id: "archived", label: "Arquivados" },
]

export default function BlogPostsList({ initialData, initialStats }: BlogPostsListProps) {
    const [posts, setPosts] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [tab, setTab] = useState<TabId>("all")
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [pendingDelete, setPendingDelete] = useState<AdminBlogPostListRow | null>(null)
    const [isPending, startTransition] = useTransition()

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return posts.filter((post) => {
            if (tab !== "all" && post.display_status !== tab) return false
            if (!term) return true
            const category = getBlogCategory(post.category)
            return [
                post.title,
                post.subtitle || "",
                post.slug,
                post.author_name,
                category.label,
                ...(post.tags || []),
            ]
                .join(" ")
                .toLowerCase()
                .includes(term)
        })
    }, [posts, tab, search])

    const tabCounts: Record<TabId, number> = {
        all: stats.total,
        published: stats.published,
        draft: stats.draft,
        scheduled: stats.scheduled,
        archived: stats.archived,
    }

    function recomputeStats(next: AdminBlogPostListRow[]) {
        setStats({
            total: next.length,
            published: next.filter((p) => p.display_status === "published").length,
            draft: next.filter((p) => p.display_status === "draft").length,
            scheduled: next.filter((p) => p.display_status === "scheduled").length,
            archived: next.filter((p) => p.display_status === "archived").length,
        })
    }

    function handleStatusChange(post: AdminBlogPostListRow, nextStatus: BlogPostStatus) {
        startTransition(async () => {
            const result = await updateAdminBlogPostStatus(post.id, nextStatus)
            if (!result.success) {
                toast({ title: "Erro ao alterar status", description: result.error, variant: "destructive" })
                return
            }

            const displayStatus: AdminBlogPostListRow["display_status"] =
                nextStatus === "published" && post.published_at && new Date(post.published_at).getTime() > Date.now()
                    ? "scheduled"
                    : nextStatus === "published"
                        ? "published"
                        : nextStatus === "archived"
                            ? "archived"
                            : "draft"

            const nextPosts = posts.map((item) =>
                item.id === post.id
                    ? {
                          ...item,
                          status: nextStatus,
                          display_status: displayStatus,
                          published_at:
                              nextStatus === "published"
                                  ? item.published_at || new Date().toISOString()
                                  : null,
                      }
                    : item,
            )
            setPosts(nextPosts)
            recomputeStats(nextPosts)
            toast({ title: "Status atualizado", description: `"${post.title}" agora está ${getStatusLabel(displayStatus).toLowerCase()}.` })
        })
    }

    function handleDelete() {
        if (!pendingDelete) return
        const target = pendingDelete
        startTransition(async () => {
            const result = await deleteAdminBlogPost(target.id)
            if (!result.success) {
                toast({ title: "Erro ao excluir", description: result.error, variant: "destructive" })
                return
            }
            const nextPosts = posts.filter((item) => item.id !== target.id)
            setPosts(nextPosts)
            recomputeStats(nextPosts)
            setPendingDelete(null)
            toast({ title: "Post excluído", description: `"${target.title}" foi removido.` })
        })
    }

    const statCards = [
        { label: "Total", value: stats.total, icon: FileTextIcon, tone: "text-brand-dark dark:text-dark-heading" },
        { label: "Publicados", value: stats.published, icon: CheckCircleIcon, tone: "text-brand-green" },
        { label: "Rascunhos", value: stats.draft, icon: EditIcon, tone: "text-brand-inactive-text dark:text-dark-body" },
        { label: "Agendados", value: stats.scheduled, icon: ClockIcon, tone: "text-brand-orange" },
        { label: "Arquivados", value: stats.archived, icon: ArchiveIcon, tone: "text-brand-red" },
    ]

    return (
        <FadeIn className="w-full max-w-[1700px] mx-auto space-y-6 px-4 pb-16 pt-4 md:px-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {statCards.map((card) => {
                    const Icon = card.icon
                    return (
                        <div
                            key={card.label}
                            className="rounded-2xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                    {card.label}
                                </span>
                                <Icon size={16} className={card.tone} />
                            </div>
                            <p className={`mt-2 text-2xl font-black ${card.tone}`}>{card.value}</p>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {TABS.map((item) => {
                        const active = tab === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setTab(item.id)}
                                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                                    active
                                        ? "bg-brand-dark text-white shadow-sm dark:bg-white dark:text-brand-dark"
                                        : "text-brand-inactive-text hover:bg-brand-gray dark:text-dark-body dark:hover:bg-dark-border/40"
                                }`}
                            >
                                {item.label}
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                        active
                                            ? "bg-white/20 text-white dark:bg-brand-dark/10 dark:text-brand-dark"
                                            : "bg-brand-gray text-brand-inactive-text dark:bg-dark-border/40 dark:text-dark-body"
                                    }`}
                                >
                                    {tabCounts[item.id]}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-[220px]">
                        <SearchIcon
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-inactive-text"
                        />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar por título, tag, autor..."
                            aria-label="Buscar posts"
                            className="h-10 w-full rounded-full border border-brand-border bg-white pl-9 pr-4 text-sm text-brand-dark outline-none transition-colors placeholder:text-brand-inactive-text focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading"
                        />
                    </div>

                    <div className="flex items-center gap-1 rounded-full border border-brand-border p-1 dark:border-dark-border">
                        <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            aria-label="Visualizar em lista"
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                viewMode === "list"
                                    ? "bg-brand-dark text-white dark:bg-white dark:text-brand-dark"
                                    : "text-brand-inactive-text hover:bg-brand-gray dark:text-dark-body dark:hover:bg-dark-border/40"
                            }`}
                        >
                            <ListIcon size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            aria-label="Visualizar em grade"
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                viewMode === "grid"
                                    ? "bg-brand-dark text-white dark:bg-white dark:text-brand-dark"
                                    : "text-brand-inactive-text hover:bg-brand-gray dark:text-dark-body dark:hover:bg-dark-border/40"
                            }`}
                        >
                            <GridIcon size={16} />
                        </button>
                    </div>

                    <Button asChild leftIcon={<PlusIcon size={16} />}>
                        <Link href="/ddt-admin/blog/novo">Novo post</Link>
                    </Button>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-brand-border bg-white p-12 text-center dark:border-dark-border dark:bg-dark-surface">
                    <FileTextIcon size={36} className="mx-auto text-brand-inactive-text" />
                    <h3 className="mt-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                        {posts.length === 0 ? "Nenhum post criado ainda" : "Nenhum post encontrado"}
                    </h3>
                    <p className="mt-2 text-sm text-brand-inactive-text dark:text-dark-body">
                        {posts.length === 0
                            ? "Comece criando a primeira dica do Blog do Dino."
                            : "Tente outro termo ou selecione outra aba."}
                    </p>
                    {posts.length === 0 && (
                        <Button asChild className="mt-5" leftIcon={<PlusIcon size={16} />}>
                            <Link href="/ddt-admin/blog/novo">Criar primeiro post</Link>
                        </Button>
                    )}
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((post, index) => {
                        const category = getBlogCategory(post.category)
                        return (
                            <motion.article
                                key={post.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.2) }}
                                className="flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface"
                            >
                                <div className="relative aspect-[16/9] bg-brand-gray dark:bg-dark-border/30">
                                    {post.cover_image_url ? (
                                        <img
                                            src={post.cover_image_url}
                                            alt={post.cover_image_alt || post.title}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-4xl">
                                            {category.emoji}
                                        </div>
                                    )}
                                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                                        <Badge variant={statusBadgeVariant(post.display_status)} icon={null}>
                                            {getStatusLabel(post.display_status)}
                                        </Badge>
                                        {post.is_featured && (
                                            <Badge variant="green" icon={null}>⭐ Destaque</Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-1 flex-col p-4">
                                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {category.emoji} {category.shortLabel}
                                    </p>
                                    <h3 className="mt-1 line-clamp-2 text-base font-bold text-brand-dark dark:text-dark-heading">
                                        {post.title}
                                    </h3>
                                    <p className="mt-1 line-clamp-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                        {post.excerpt || post.subtitle || "Sem resumo."}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between text-xs text-brand-inactive-text dark:text-dark-body">
                                        <span className="flex items-center gap-1.5">
                                            <CalendarIcon size={13} />
                                            {formatBlogDateShort(post.published_at || post.updated_at)}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <ClockIcon size={13} />
                                            {post.reading_time_minutes} min
                                        </span>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-brand-border pt-3 dark:border-dark-border">
                                        <div className="flex items-center gap-1">
                                            <Button asChild size="sm" variant="ghost">
                                                <Link href={`/ddt-admin/blog/${post.id}`} aria-label={`Editar ${post.title}`}>
                                                    <EditIcon size={15} />
                                                </Link>
                                            </Button>
                                            {post.display_status === "published" && (
                                                <Button asChild size="sm" variant="ghost">
                                                    <a
                                                        href={`/blog/${post.slug}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-label={`Ver ${post.title}`}
                                                    >
                                                        <EyeIcon size={15} />
                                                    </a>
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghostred"
                                                onClick={() => setPendingDelete(post)}
                                                aria-label={`Excluir ${post.title}`}
                                            >
                                                <TrashIcon size={15} />
                                            </Button>
                                        </div>
                                        <StatusAction post={post} disabled={isPending} onChange={handleStatusChange} />
                                    </div>
                                </div>
                            </motion.article>
                        )
                    })}
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                    <div className="hidden grid-cols-[minmax(0,3fr)_1fr_1fr_0.8fr_auto] gap-4 border-b border-brand-border px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text dark:border-dark-border dark:text-dark-body lg:grid">
                        <span>Post</span>
                        <span>Categoria</span>
                        <span>Status</span>
                        <span>Atualizado</span>
                        <span className="text-right">Ações</span>
                    </div>
                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                        {filtered.map((post) => {
                            const category = getBlogCategory(post.category)
                            return (
                                <div
                                    key={post.id}
                                    className="grid gap-3 px-4 py-4 transition-colors hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 lg:grid-cols-[minmax(0,3fr)_1fr_1fr_0.8fr_auto] lg:items-center lg:gap-4 lg:px-5"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-gray dark:bg-dark-border/30">
                                            {post.cover_image_url ? (
                                                <img
                                                    src={post.cover_image_url}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xl">
                                                    {category.emoji}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <Link
                                                href={`/ddt-admin/blog/${post.id}`}
                                                className="line-clamp-1 font-bold text-brand-dark hover:text-brand-green dark:text-dark-heading"
                                            >
                                                {post.title}
                                            </Link>
                                            <p className="mt-0.5 line-clamp-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                                /blog/{post.slug}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                <span>{post.author_name}</span>
                                                <span>•</span>
                                                <span>{post.reading_time_minutes} min</span>
                                                {post.is_featured && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="font-semibold text-brand-green">⭐ Destaque</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        <span className="lg:hidden">Categoria: </span>
                                        {category.emoji} {category.shortLabel}
                                    </div>

                                    <div>
                                        <Badge variant={statusBadgeVariant(post.display_status)} icon={null}>
                                            {getStatusLabel(post.display_status)}
                                        </Badge>
                                        {post.display_status === "scheduled" && post.published_at && (
                                            <p className="mt-1 text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                {formatBlogDateShort(post.published_at)}
                                            </p>
                                        )}
                                    </div>

                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        {formatBlogDateShort(post.updated_at)}
                                    </div>

                                    <div className="flex items-center gap-1 lg:justify-end">
                                        <Button asChild size="sm" variant="ghost">
                                            <Link href={`/ddt-admin/blog/${post.id}`} aria-label={`Editar ${post.title}`}>
                                                <EditIcon size={15} />
                                            </Link>
                                        </Button>
                                        {post.display_status === "published" && (
                                            <Button asChild size="sm" variant="ghost">
                                                <a
                                                    href={`/blog/${post.slug}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    aria-label={`Ver ${post.title}`}
                                                >
                                                    <EyeIcon size={15} />
                                                </a>
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghostred"
                                            onClick={() => setPendingDelete(post)}
                                            aria-label={`Excluir ${post.title}`}
                                        >
                                            <TrashIcon size={15} />
                                        </Button>
                                        <StatusAction post={post} disabled={isPending} onChange={handleStatusChange} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <AlertModal
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={handleDelete}
                title="Excluir post"
                message={
                    pendingDelete
                        ? `Tem certeza que deseja excluir "${pendingDelete.title}"? Essa ação não pode ser desfeita.`
                        : ""
                }
                confirmText="Excluir post"
                variant="danger"
                isDestructive
                isLoading={isPending}
            />
        </FadeIn>
    )
}

function StatusAction({
    post,
    disabled,
    onChange,
}: {
    post: AdminBlogPostListRow
    disabled: boolean
    onChange: (post: AdminBlogPostListRow, status: BlogPostStatus) => void
}) {
    if (post.display_status === "published" || post.display_status === "scheduled") {
        return (
            <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(post, "draft")}
            >
                Despublicar
            </Button>
        )
    }

    if (post.status === "archived") {
        return (
            <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(post, "draft")}
            >
                Restaurar
            </Button>
        )
    }

    return (
        <Button size="sm" disabled={disabled} onClick={() => onChange(post, "published")}>
            Publicar
        </Button>
    )
}

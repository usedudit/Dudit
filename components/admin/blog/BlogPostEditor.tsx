"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    Button,
    Checkbox,
    FormDropdown,
    FormTextarea,
    Input,
    RichTextEditor,
    TagsInput,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
    ArrowLeftIcon,
    ClockIcon,
    EyeIcon,
    ImageIcon,
    PlusIcon,
    SaveIcon,
    SparklesIcon,
    TrashIcon,
} from "@/lib/icons"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { BLOG_CATEGORIES } from "@/lib/blog/categories"
import type { AdminBlogPostRow, BlogPostInput, BlogPostStatus } from "@/lib/blog/types"
import { estimateReadingTime, slugifyBlog } from "@/lib/blog/utils"
import {
    createAdminBlogPost,
    updateAdminBlogPost,
} from "@/app/actions/admin/blog"

interface BlogPostEditorProps {
    post?: AdminBlogPostRow | null
}

const STATUS_OPTIONS = [
    { value: "draft", label: "Rascunho" },
    { value: "published", label: "Publicado / Agendado" },
    { value: "archived", label: "Arquivado" },
]

const CATEGORY_OPTIONS = BLOG_CATEGORIES.map((category) => ({
    value: category.id,
    label: `${category.emoji} ${category.label}`,
}))

function toDateTimeLocal(value: string | null | undefined): string {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60_000)
    return local.toISOString().slice(0, 16)
}

function buildInitialState(post?: AdminBlogPostRow | null): BlogPostInput {
    return {
        title: post?.title || "",
        slug: post?.slug || "",
        subtitle: post?.subtitle || "",
        excerpt: post?.excerpt || "",
        content: post?.content || "",
        cover_image_url: post?.cover_image_url || "",
        cover_image_alt: post?.cover_image_alt || "",
        category: post?.category || "geral",
        tags: post?.tags || [],
        author_name: post?.author_name || "Equipe Dudit",
        author_role: post?.author_role || "Time Dudit",
        status: post?.status || "draft",
        is_featured: Boolean(post?.is_featured),
        seo_title: post?.seo_title || "",
        seo_description: post?.seo_description || "",
        seo_keywords: post?.seo_keywords || [],
        key_takeaways: post?.key_takeaways || [""],
        faq: post?.faq?.length ? post.faq : [],
        published_at: post?.published_at || null,
    }
}

function BlogPostEditorInner({ post }: BlogPostEditorProps) {
    const router = useRouter()
    const [form, setForm] = useState<BlogPostInput>(() => buildInitialState(post))
    const [publishedAtLocal, setPublishedAtLocal] = useState(() => toDateTimeLocal(post?.published_at))
    const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const readingTime = useMemo(() => estimateReadingTime(form.content), [form.content])
    const isEditing = Boolean(post)

    function update<K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) {
        setForm((current) => ({ ...current, [key]: value }))
    }

    function handleTitleChange(value: string) {
        setForm((current) => ({
            ...current,
            title: value,
            slug: slugTouched ? current.slug : slugifyBlog(value),
        }))
    }

    function handleSlugChange(value: string) {
        setSlugTouched(true)
        update("slug", slugifyBlog(value))
    }

    function updateTakeaway(index: number, value: string) {
        setForm((current) => {
            const items = [...current.key_takeaways]
            items[index] = value
            return { ...current, key_takeaways: items }
        })
    }

    function addTakeaway() {
        setForm((current) => ({ ...current, key_takeaways: [...current.key_takeaways, ""] }))
    }

    function removeTakeaway(index: number) {
        setForm((current) => ({
            ...current,
            key_takeaways: current.key_takeaways.filter((_, itemIndex) => itemIndex !== index),
        }))
    }

    function updateFaq(index: number, field: "question" | "answer", value: string) {
        setForm((current) => {
            const faq = current.faq.map((item, itemIndex) =>
                itemIndex === index ? { ...item, [field]: value } : item,
            )
            return { ...current, faq }
        })
    }

    function addFaq() {
        setForm((current) => ({ ...current, faq: [...current.faq, { question: "", answer: "" }] }))
    }

    function removeFaq(index: number) {
        setForm((current) => ({
            ...current,
            faq: current.faq.filter((_, itemIndex) => itemIndex !== index),
        }))
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        setError(null)

        if (form.title.trim().length < 5) {
            setError("O título precisa ter pelo menos 5 caracteres.")
            return
        }
        if (form.content.trim().length < 20) {
            setError("Escreva um conteúdo com pelo menos 20 caracteres.")
            return
        }

        let publishedAt: string | null = null
        if (publishedAtLocal) {
            const parsed = new Date(publishedAtLocal)
            if (Number.isNaN(parsed.getTime())) {
                setError("Data de publicação inválida.")
                return
            }
            publishedAt = parsed.toISOString()
        }

        const payload: BlogPostInput = {
            ...form,
            slug: form.slug || slugifyBlog(form.title),
            published_at: form.status === "draft" ? null : publishedAt,
            key_takeaways: form.key_takeaways.map((item) => item.trim()).filter(Boolean),
            faq: form.faq
                .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
                .filter((item) => item.question && item.answer),
        }

        setSaving(true)
        try {
            const result = isEditing && post
                ? await updateAdminBlogPost(post.id, payload)
                : await createAdminBlogPost(payload)

            if (!result.success) {
                setError(result.error)
                toast({ title: "Não foi possível salvar", description: result.error, variant: "destructive" })
                return
            }

            toast({
                title: isEditing ? "Post atualizado" : "Post criado",
                description:
                    payload.status === "published"
                        ? "As alterações já estão disponíveis no blog."
                        : "O post foi salvo como rascunho.",
            })
            router.push("/ddt-admin/blog")
            router.refresh()
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : "Erro inesperado ao salvar."
            setError(message)
            toast({ title: "Erro ao salvar", description: message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 md:px-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <Link
                        href="/ddt-admin/blog"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-inactive-text transition-colors hover:text-brand-green dark:text-dark-body"
                    >
                        <ArrowLeftIcon size={15} />
                        Voltar para posts
                    </Link>
                    <h1 className="mt-2 text-2xl font-black tracking-tight text-brand-dark dark:text-dark-heading">
                        {isEditing ? "Editar post" : "Novo post"}
                    </h1>
                    <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                        Escreva a dica, ajuste o SEO e publique no Blog do Dino.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {isEditing && post?.status === "published" && (
                        <Button asChild variant="outline" leftIcon={<EyeIcon size={15} />}>
                            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                                Ver no blog
                            </a>
                        </Button>
                    )}
                    <Button
                        type="submit"
                        isLoading={saving}
                        leftIcon={<SaveIcon size={15} />}
                    >
                        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar post"}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mb-5 rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-sm font-medium text-brand-red">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-6">
                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface md:p-6">
                        <h2 className="mb-4 text-base font-bold text-brand-dark dark:text-dark-heading">Conteúdo</h2>

                        <div className="space-y-4">
                            <Input
                                label="Título do post *"
                                placeholder="Ex: Como evitar golpes ao vender pelo WhatsApp"
                                value={form.title}
                                maxLength={160}
                                onChange={(event) => handleTitleChange(event.target.value)}
                            />

                            <Input
                                label="Slug (URL)"
                                placeholder="como-evitar-golpes-no-whatsapp"
                                value={form.slug}
                                maxLength={140}
                                onChange={(event) => handleSlugChange(event.target.value)}
                            />

                            <Input
                                label="Subtítulo"
                                placeholder="Uma frase que resume o artigo"
                                value={form.subtitle}
                                maxLength={320}
                                onChange={(event) => update("subtitle", event.target.value)}
                            />

                            <FormTextarea
                                label="Resumo (excerpt)"
                                placeholder="Aparece nos cards e nos resultados de busca. Se ficar vazio, usamos o início do conteúdo."
                                value={form.excerpt}
                                maxLength={500}
                                rows={3}
                                showCharacterCount
                                onChange={(event) => update("excerpt", event.target.value)}
                            />

                            <div>
                                <div className="mb-1.5 flex items-center justify-between gap-3">
                                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        Conteúdo do artigo *
                                    </label>
                                    <span className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                                        <ClockIcon size={13} />
                                        {readingTime} min de leitura
                                    </span>
                                </div>
                                <RichTextEditor
                                    label=""
                                    value={form.content}
                                    onChange={(value) => update("content", value)}
                                />
                                <p className="mt-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                    Use títulos H2 e H3 para criar a navegação automática do artigo.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface md:p-6">
                        <div className="mb-4 flex items-center gap-2">
                            <SparklesIcon size={17} className="text-brand-green" />
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                O que você vai aprender
                            </h2>
                        </div>
                        <p className="mb-4 text-xs text-brand-inactive-text dark:text-dark-body">
                            Tópicos em destaque no início do artigo. Ajuda o leitor a decidir continuar lendo.
                        </p>

                        <div className="space-y-2">
                            {form.key_takeaways.map((item, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Input
                                        placeholder={`Tópico ${index + 1}`}
                                        value={item}
                                        maxLength={300}
                                        onChange={(event) => updateTakeaway(index, event.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghostred"
                                        onClick={() => removeTakeaway(index)}
                                        aria-label="Remover tópico"
                                    >
                                        <TrashIcon size={15} />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            leftIcon={<PlusIcon size={14} />}
                            onClick={addTakeaway}
                        >
                            Adicionar tópico
                        </Button>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface md:p-6">
                        <h2 className="mb-1 text-base font-bold text-brand-dark dark:text-dark-heading">
                            Perguntas frequentes
                        </h2>
                        <p className="mb-4 text-xs text-brand-inactive-text dark:text-dark-body">
                            As perguntas viram dados estruturados no Google e ajudam nas respostas de IA.
                        </p>

                        <div className="space-y-3">
                            {form.faq.map((item, index) => (
                                <div
                                    key={index}
                                    className="rounded-xl border border-brand-border bg-brand-gray/30 p-4 dark:border-dark-border dark:bg-dark-border/20"
                                >
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                            Pergunta {index + 1}
                                        </span>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghostred"
                                            onClick={() => removeFaq(index)}
                                            aria-label="Remover pergunta"
                                        >
                                            <TrashIcon size={15} />
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        <Input
                                            label="Pergunta"
                                            value={item.question}
                                            maxLength={240}
                                            onChange={(event) => updateFaq(index, "question", event.target.value)}
                                        />
                                        <FormTextarea
                                            label="Resposta"
                                            value={item.answer}
                                            maxLength={2000}
                                            rows={3}
                                            onChange={(event) => updateFaq(index, "answer", event.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            leftIcon={<PlusIcon size={14} />}
                            onClick={addFaq}
                        >
                            Adicionar pergunta
                        </Button>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface md:p-6">
                        <h2 className="mb-4 text-base font-bold text-brand-dark dark:text-dark-heading">SEO e compartilhamento</h2>

                        <div className="space-y-4">
                            <Input
                                label="Título para SEO"
                                placeholder="Deixe vazio para usar o título do post"
                                value={form.seo_title}
                                maxLength={70}
                                showCharacterCount
                                onChange={(event) => update("seo_title", event.target.value)}
                            />
                            <FormTextarea
                                label="Descrição para SEO"
                                placeholder="Resumo exibido no Google (até 180 caracteres)"
                                value={form.seo_description}
                                maxLength={180}
                                rows={3}
                                showCharacterCount
                                onChange={(event) => update("seo_description", event.target.value)}
                            />
                            <TagsInput
                                label="Palavras-chave de SEO"
                                tags={form.seo_keywords}
                                onChange={(tags) => update("seo_keywords", tags)}
                                placeholder="Digite e pressione Enter"
                            />
                        </div>
                    </section>
                </div>

                <aside className="space-y-6">
                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <h2 className="mb-4 text-base font-bold text-brand-dark dark:text-dark-heading">Publicação</h2>

                        <div className="space-y-4">
                            <FormDropdown
                                label="Status"
                                options={STATUS_OPTIONS}
                                value={form.status}
                                setValue={(value) => update("status", value as BlogPostStatus)}
                            />

                            {form.status === "published" && (
                                <div>
                                    <Input
                                        label="Data de publicação"
                                        type="datetime-local"
                                        value={publishedAtLocal}
                                        onChange={(event) => setPublishedAtLocal(event.target.value)}
                                    />
                                    <p className="mt-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                                        Deixe vazio para publicar agora. Uma data futura agenda o post.
                                    </p>
                                </div>
                            )}

                            <FormDropdown
                                label="Categoria *"
                                options={CATEGORY_OPTIONS}
                                value={form.category}
                                setValue={(value) => update("category", value)}
                            />

                            <Checkbox
                                label="Marcar como destaque no blog"
                                checked={form.is_featured}
                                onChange={(checked) => update("is_featured", checked)}
                            />
                        </div>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <div className="mb-4 flex items-center gap-2">
                            <ImageIcon size={16} className="text-brand-inactive-text" />
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">Imagem de capa</h2>
                        </div>

                        <div className="space-y-3">
                            <Input
                                label="URL da imagem"
                                placeholder="https://img.dudit.com.br/..."
                                value={form.cover_image_url}
                                onChange={(event) => update("cover_image_url", event.target.value)}
                            />
                            <Input
                                label="Texto alternativo"
                                placeholder="Descreva a imagem"
                                value={form.cover_image_alt}
                                maxLength={240}
                                onChange={(event) => update("cover_image_alt", event.target.value)}
                            />

                            {form.cover_image_url && (
                                <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-border">
                                    <img
                                        src={form.cover_image_url}
                                        alt={form.cover_image_alt || "Prévia da capa"}
                                        className="aspect-[16/9] w-full object-cover"
                                    />
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <h2 className="mb-4 text-base font-bold text-brand-dark dark:text-dark-heading">Autor e tags</h2>

                        <div className="space-y-4">
                            <Input
                                label="Nome do autor"
                                value={form.author_name}
                                maxLength={120}
                                onChange={(event) => update("author_name", event.target.value)}
                            />
                            <Input
                                label="Cargo / descrição do autor"
                                value={form.author_role}
                                maxLength={120}
                                onChange={(event) => update("author_role", event.target.value)}
                            />
                            <TagsInput
                                label="Tags"
                                tags={form.tags}
                                onChange={(tags) => update("tags", tags)}
                                placeholder="Ex: segurança, whatsapp"
                            />
                        </div>
                    </section>

                    <section className="rounded-2xl border border-brand-border bg-brand-gray/50 p-5 dark:border-dark-border dark:bg-dark-border/20">
                        <h2 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Checklist rápido</h2>
                        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-brand-inactive-text dark:text-dark-body">
                            <li>• Título claro, com a palavra-chave principal.</li>
                            <li>• Resumo de até 180 caracteres para o Google.</li>
                            <li>• Imagem de capa horizontal (1200×630).</li>
                            <li>• Links para a Central de Ajuda ou ferramentas.</li>
                            <li>• Revise antes de publicar.</li>
                        </ul>
                    </section>
                </aside>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-brand-border pt-5 dark:border-dark-border">
                <Button asChild variant="outline">
                    <Link href="/ddt-admin/blog">Cancelar</Link>
                </Button>
                <Button type="submit" isLoading={saving} leftIcon={<SaveIcon size={15} />}>
                    {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar post"}
                </Button>
            </div>
        </form>
    )
}

export default function BlogPostEditor({ post }: BlogPostEditorProps) {
    return (
        <PermissionProvider
            role="OWNER"
            routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
            partnerId="dudit-admin"
            businessInfo={null}
            planSlug="escalar"
        >
            <BlogPostEditorInner post={post} />
        </PermissionProvider>
    )
}

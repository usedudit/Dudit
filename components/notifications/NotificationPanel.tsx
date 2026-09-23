"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { NotificationItem } from "./NotificationItem"
import type { NotificationRecord } from "@/lib/notifications/types"
import { AlertModal, Button, IconPlaceholder, ListItem, Spinner, ThreeDotsLoader } from "../reusable"
import { usePushNotificationStatus } from "./PushNotificationManager"
import { BellIcon, TrashIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface Group {
	label: string
	items: NotificationRecord[]
}

export function NotificationPanel({
	grouped,
	isLoading,
	isFetchingMore,
	hasMore,
	onLoadMore,
	onVisible,
	onNavigate,
	onMarkAllAsRead,
	onDeleteAll,
	unreadCount,
	erpOptions,
	erpFilter,
	onErpFilter,
	activePartnerId,
}: {
	grouped: Group[]
	isLoading: boolean
	isFetchingMore: boolean
	hasMore: boolean
	onLoadMore: () => void
	onVisible: (id: string, visible: boolean) => void
	onNavigate?: () => void
	onMarkAllAsRead?: () => void
 	onDeleteAll?: () => Promise<{ success: boolean; deleted: number }>
 	unreadCount?: number
 	erpOptions: Array<{ id: string; label: string }>
 	erpFilter: string
	onErpFilter: (filter: string) => void
	activePartnerId: string | null
}) {
	const [showDeleteAll, setShowDeleteAll] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)

	const sentinelRef = useRef<HTMLDivElement>(null)

	const handleDeleteAllConfirm = useCallback(async () => {
		if (!onDeleteAll) return
		setIsDeleting(true)
		try {
			const res = await onDeleteAll()
			if (res?.success) setShowDeleteAll(false)
		} finally {
			setIsDeleting(false)
		}
	}, [onDeleteAll])

	const handleIntersect = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			if (entries[0]?.isIntersecting && hasMore && !isFetchingMore) {
				onLoadMore()
			}
		},
		[hasMore, isFetchingMore, onLoadMore],
	)

	useEffect(() => {
		const el = sentinelRef.current
		if (!el) return

		const observer = new IntersectionObserver(handleIntersect, { rootMargin: "80px" })
		observer.observe(el)
		return () => observer.disconnect()
	}, [handleIntersect])

	const { isSupported, permission, isEnabling, requestEnable } = usePushNotificationStatus()

	const pushBanner = isSupported && permission === "default" && (
		<ListItem
			icon={BellIcon}
			title="Receber alertas no aparelho"
			description="Ative para ser avisado sobre pedidos e vendas"
			className="px-4 py-3 border-0"
			right={
				<Button
					variant="link"
					onClick={() => requestEnable()}
					disabled={isEnabling}
				>
					{isEnabling ? "Ativando..." : "Ativar"}
				</Button>
			}
		/>
	)

	if (isLoading) {
		return (
			<div className="flex items-center justify-center">
				<ThreeDotsLoader />
			</div>
		)
	}

	if (grouped.length === 0) {
		return (
			<>
				{pushBanner}
				<IconPlaceholder
					placeholderType="image"
					imageSrc="https://img.dudit.com.br/static/mascots/Notificacoes.png"
					imageAlt="Nenhuma notificação por aqui"
					title="Nenhuma notificação por aqui"
					subtitle="Quando tiver novidades, elas aparecerão aqui"
				/>
			</>
		)
	}

	return (
		<>
			{pushBanner}
	{grouped.length > 0 && (
		<div className="sticky top-0 z-20 bg-white dark:bg-dark-surface px-3 py-2 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
			<div className="flex items-center gap-4">
				{(unreadCount ?? 0) > 0 && onMarkAllAsRead && (
					<button
						type="button"
						onClick={onMarkAllAsRead}
						className="text-xs font-medium text-brand-green hover:text-brand-green/80 transition-colors"
					>
						Marcar todas como lidas
					</button>
				)}
			</div>
			{onDeleteAll && (
				<button
					type="button"
					onClick={() => setShowDeleteAll(true)}
					className="flex items-center gap-1 text-xs font-medium text-brand-red hover:text-brand-red/80 transition-colors"
					title="Excluir todas as notificações"
				>
					<TrashIcon className="h-3 w-3" />
					Excluir todas
				</button>
			)}
		</div>
	)}
			{erpOptions.length > 0 || activePartnerId ? (
				<div className="sticky top-0 z-20 bg-white dark:bg-dark-surface px-3 py-2 border-b border-brand-border dark:border-dark-border overflow-x-auto custom-scrollbar">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => onErpFilter("all")}
							className={cn(
								"shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
								erpFilter === "all"
									? "bg-brand-green text-white"
									: "bg-brand-gray/10 text-brand-dark dark:text-dark-body hover:bg-brand-gray/20",
							)}
						>
							Todos
						</button>
						{activePartnerId && (
							<button
								type="button"
								onClick={() => onErpFilter("current")}
								className={cn(
									"shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
									erpFilter === "current"
										? "bg-brand-green text-white"
										: "bg-brand-gray/10 text-brand-dark dark:text-dark-body hover:bg-brand-gray/20",
								)}
							>
								Este ERP
							</button>
						)}
						{erpOptions.map((opt) => (
							<button
								key={opt.id}
								type="button"
								onClick={() => onErpFilter(opt.id)}
								title={opt.label}
								className={cn(
									"shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
									erpFilter === opt.id
										? "bg-brand-green text-white"
										: "bg-brand-gray/10 text-brand-dark dark:text-dark-body hover:bg-brand-gray/20",
								)}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>
			) : null}
			{grouped.map((group) => (
				<div key={group.label} className="px-2 py-1">
					<p className="text-xs font-medium text-brand-dark dark:text-dark-heading px-2 py-2">
						{group.label}
					</p>
					<div className="space-y-2">
						{group.items.map((item) => (
							<NotificationItem
								key={item.id}
								notification={item}
								onVisible={onVisible}
								onNavigate={onNavigate}
							/>
						))}
					</div>
				</div>
			))}
			<div ref={sentinelRef} className="h-6 flex items-center justify-center">
				{isFetchingMore && <Spinner />}
			</div>
			{onDeleteAll && (
				<AlertModal
					isOpen={showDeleteAll}
					onClose={() => setShowDeleteAll(false)}
					onConfirm={handleDeleteAllConfirm}
					title="Excluir todas as notificações?"
					message="Esta ação não pode ser desfeita. Todas as notificações ( lidas e não lidas ) serão removidas da sua conta."
					confirmText="Excluir"
					cancelText="Cancelar"
					variant="danger"
					isLoading={isDeleting}
					disabled={isDeleting}
				/>
			)}
		</>
	)
}

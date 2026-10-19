"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { NotificationItem } from "./NotificationItem"
import type { NotificationRecord } from "@/lib/notifications/types"
import { ActionsDropdown, AlertModal, Button, DropdownItem, IconPlaceholder, ListItem, Spinner, ThreeDotsLoader, Tabs, TabsList, TabsTrigger } from "../reusable"
import { usePushNotificationStatus } from "./PushNotificationManager"
import { BellIcon, CheckCircleIcon, ThreeDotsIcon, TrashIcon } from "@/lib/icons"

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
			className="px-4 my-4 border-0"
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
			<div className="flex h-full flex-col items-center justify-center">
				{pushBanner}
				<IconPlaceholder
					placeholderType="image"
					imageSrc="https://img.dudit.com.br/static/mascots/Notificacoes.png"
					imageAlt="Nenhuma notificação por aqui"
					title="Nenhuma notificação por aqui"
					subtitle="Quando tiver novidades, elas aparecerão aqui"
				/>
			</div>
		)
	}

	return (
		<>
			{pushBanner}
			{grouped.length > 0 && (
			<div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-2 relative">
					<div className="flex items-center px-2">
						<Tabs value={erpFilter} onValueChange={onErpFilter} className="flex-1">
							<TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-2">
								<TabsTrigger value="all">Todos</TabsTrigger>
								{activePartnerId && <TabsTrigger value="current">Este ERP</TabsTrigger>}
								{erpOptions.map((opt) => (
									<TabsTrigger key={opt.id} value={opt.id} title={opt.label}>
										{opt.label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
						{(((unreadCount ?? 0) > 0 && onMarkAllAsRead) || onDeleteAll) && (
							<>
								<div className="border-l border-brand-border dark:border-dark-border h-6 mx-2 shrink-0" />
								<ActionsDropdown
									trigger={
										<Button variant="ghost" size="sm" className="h-7 w-7 min-w-[28px] p-0">
											<ThreeDotsIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-heading" />
										</Button>
									}
								>
									{(unreadCount ?? 0) > 0 && onMarkAllAsRead && (
										<DropdownItem onClick={onMarkAllAsRead} disabled={isDeleting}>
											<CheckCircleIcon size={16} className="text-brand-green" />
											Marcar todas como lidas
										</DropdownItem>
									)}
									{onDeleteAll && (
										<DropdownItem onClick={() => setShowDeleteAll(true)} disabled={isDeleting}>
											<TrashIcon size={16} className="text-brand-red" />
											Excluir todas
										</DropdownItem>
									)}
								</ActionsDropdown>
							</>
						)}
					</div>
				</div>
			)}
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

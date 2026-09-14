"use client"

import { useCallback, useRef, useEffect } from "react"
import { NotificationItem } from "./NotificationItem"
import type { NotificationRecord } from "@/lib/notifications/types"
import { Button, IconPlaceholder, ListItem, Spinner, ThreeDotsLoader } from "../reusable"
import { usePushNotificationStatus } from "./PushNotificationManager"
import { BellIcon } from "@/lib/icons"

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
	unreadCount,
}: {
	grouped: Group[]
	isLoading: boolean
	isFetchingMore: boolean
	hasMore: boolean
	onLoadMore: () => void
	onVisible: (id: string, visible: boolean) => void
	onNavigate?: () => void
	onMarkAllAsRead?: () => void
	unreadCount?: number
}) {
	const sentinelRef = useRef<HTMLDivElement>(null)

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
			{(unreadCount ?? 0) > 0 && onMarkAllAsRead && (
				<div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-4 py-2 border-b border-brand-border dark:border-dark-border">
					<button
						type="button"
						onClick={onMarkAllAsRead}
						className="text-xs font-medium text-brand-green hover:text-brand-green/80 transition-colors"
					>
						Marcar todas como lidas
					</button>
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
		</>
	)
}

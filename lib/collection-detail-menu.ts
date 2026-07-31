"use client"

import { useCallback, useSyncExternalStore } from "react"

export interface CollectionDetailMenuState {
    isOwner: boolean
    onEdit: () => void
    onDelete: () => void
}

let currentState: CollectionDetailMenuState | null = null
const subscribers = new Set<() => void>()
let version = 0

function notify() {
    version++
    subscribers.forEach((fn) => fn())
}

export function registerCollectionDetailMenu(next: CollectionDetailMenuState | null) {
    currentState = next
    notify()
}

function subscribe(cb: () => void) {
    subscribers.add(cb)
    return () => {
        subscribers.delete(cb)
    }
}

function getSnapshot() {
    return version
}

export function useCollectionDetailMenu(): CollectionDetailMenuState | null {
    const getSnapshotCb = useCallback(() => getSnapshot(), [])
    useSyncExternalStore(subscribe, getSnapshotCb, getSnapshotCb)
    return currentState
}

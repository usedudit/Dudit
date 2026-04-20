export type InfiniteListPage<TItem, TCursor = string> = {
  items: TItem[]
  nextCursor: TCursor | null
  hasMore: boolean
}

export type InfiniteListFetchFn<TItem, TCursor = string, TArgs = void> = (args: {
  cursor: TCursor | null
  signal?: AbortSignal
  meta?: unknown
  extra?: TArgs
}) => Promise<InfiniteListPage<TItem, TCursor>>


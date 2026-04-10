export default function NewFinancialTransactionLoading() {
  return (
    <div className="animate-in fade-in-0 duration-200 ease-out flex flex-col h-full bg-white dark:bg-dark-background">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <div className="h-8 w-56 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
            <div className="h-5 w-72 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-24 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
            <div className="h-10 w-44 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
          </div>
        </div>
        <div className="px-4 md:px-8 space-y-4">
          <div className="h-10 w-72 bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-4">
              <div className="h-28 bg-gray-200 dark:bg-dark-border rounded-2xl animate-pulse" />
              <div className="h-14 bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
              <div className="h-14 bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
              <div className="h-14 bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="h-56 bg-gray-200 dark:bg-dark-border rounded-2xl animate-pulse" />
              <div className="h-64 bg-gray-200 dark:bg-dark-border rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


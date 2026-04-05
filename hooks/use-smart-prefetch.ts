import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Global concurrent prefetch queue to prevent network saturation
class PrefetchQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private readonly MAX_CONCURRENT = 4;

  add(task: () => Promise<void>) {
    this.queue.push(task);
    this.process();
  }

  private process() {
    if (this.activeCount >= this.MAX_CONCURRENT || this.queue.length === 0) return;
    const task = this.queue.shift();
    if (task) {
      this.activeCount++;
      task().finally(() => {
        this.activeCount--;
        this.process();
      });
    }
  }
}

export const prefetchQueue = new PrefetchQueue();

export type PrefetchTarget = {
  queryKey: unknown[];
  queryFn: () => Promise<any>;
  staleTime?: number;
};

/**
 * A hook that automatically triggers a React Query prefetch when the element
 * enters the viewport or is deliberately hovered upon.
 * 
 * Features:
 * - Checks getQueryState to avoid fetching already fresh data.
 * - Debounces hover explicitly (150ms) to avoid spam.
 * - Queues fetches via PrefetchQueue limiting max concurrent requests.
 * - Root margin preloading (loads 100px before entering viewport).
 */
export function useSmartPrefetch(target: PrefetchTarget | null) {
  const queryClient = useQueryClient();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasPrefetchedRef = useRef(false);

  const doPrefetch = useCallback(() => {
    if (!target || hasPrefetchedRef.current) return;
    
    // Check if query exists and is fresh
    const state = queryClient.getQueryState(target.queryKey);
    if (state && state.dataUpdatedAt) {
      // If data exists, consider it fresh enough for hover/view to avoid spam
      const age = Date.now() - state.dataUpdatedAt;
      if (age < (target.staleTime || 60000)) {
        hasPrefetchedRef.current = true;
        return;
      }
    } else if (state && state.status === 'pending') {
       // Already fetching
       hasPrefetchedRef.current = true;
       return;
    }

    hasPrefetchedRef.current = true;
    
    // Add to global queue to avoid spamming network
    prefetchQueue.add(async () => {
      try {
        await queryClient.prefetchQuery({
          queryKey: target.queryKey,
          queryFn: target.queryFn,
          staleTime: target.staleTime || 60000,
        });
      } catch (err) {
        // ignore prefetch errors
      }
    });

  }, [target, queryClient]);

  // Observer for viewport based prefetch
  useEffect(() => {
    if (!element || !target || typeof IntersectionObserver === 'undefined') return;
    if (hasPrefetchedRef.current) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        doPrefetch();
        observer.unobserve(element);
      }
    }, { rootMargin: '100px' });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element, target, doPrefetch]);

  // Handlers for hover event
  const onMouseEnter = useCallback(() => {
    if (hasPrefetchedRef.current) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      doPrefetch();
    }, 150); // 150ms debounce
  }, [doPrefetch]);

  const onMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  return {
    ref: setElement,
    onMouseEnter,
    onMouseLeave
  };
}

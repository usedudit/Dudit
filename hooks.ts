import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== "undefined") {
            return window.matchMedia(query).matches
        }
        return false
    });

    useEffect(() => {
        const media = window.matchMedia(query);
        setMatches(media.matches);
        const listener = () => setMatches(media.matches);
        if (typeof media.addEventListener === "function") {
            media.addEventListener('change', listener);
            return () => media.removeEventListener('change', listener);
        } else if (typeof media.addListener === "function") {
            media.addListener(listener);
            return () => media.removeListener(listener);
        }
    }, [query]);

    return matches;
};

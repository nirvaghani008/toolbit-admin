'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms have
 * passed without `value` changing. Useful for throttling expensive work such as
 * search-as-you-type database lookups.
 *
 * @param value The rapidly-changing value to debounce.
 * @param delay Debounce window in milliseconds (defaults to 350ms).
 */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;

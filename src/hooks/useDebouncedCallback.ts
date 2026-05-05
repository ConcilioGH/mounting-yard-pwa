import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const debounced = useCallback(
    (...args: A) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => {
        fnRef.current(...args);
      }, ms);
    },
    [ms],
  );

  useEffect(() => {
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);

  return debounced;
}

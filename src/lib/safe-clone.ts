/** Deep clone with structuredClone when available, JSON fallback for iOS 12 Safari. */
export function safeStructuredClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

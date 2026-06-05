/**
 * Runtime polyfills for Safari on iOS 12.x. Import once at app startup (before other modules).
 */

function polyfillStructuredClone(): void {
  if (typeof globalThis.structuredClone === "function") return;
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
}

function polyfillRandomUUID(): void {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) return;
  if (typeof cryptoObj.randomUUID === "function") return;
  cryptoObj.randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    const random = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .slice(1);
    const stamp = Date.now().toString(16).padStart(12, "0").slice(-12);
    return `${stamp.slice(0, 8)}-${stamp.slice(8, 12)}-4${random().slice(0, 3)}-${random()}-${random()}${random()}${random()}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

function polyfillArrayAt(): void {
  if (typeof Array.prototype.at === "function") return;
  Object.defineProperty(Array.prototype, "at", {
    value: function at<T>(this: T[], index: number): T | undefined {
      const len = this.length;
      const relative = index >= 0 ? index : len + index;
      if (relative < 0 || relative >= len) return undefined;
      return this[relative];
    },
    writable: true,
    configurable: true,
  });
}

function polyfillObjectFromEntries(): void {
  if (typeof Object.fromEntries === "function") return;
  Object.fromEntries = <K extends PropertyKey, V>(entries: Iterable<readonly [K, V]>): Record<K, V> => {
    const out = {} as Record<K, V>;
    for (const [key, value] of entries) {
      out[key] = value;
    }
    return out;
  };
}

function polyfillPromiseAny(): void {
  if (typeof Promise.any === "function") return;
  Promise.any = <T>(promises: Iterable<PromiseLike<T>>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const items = Array.from(promises);
      if (items.length === 0) {
        reject(new Error("All promises were rejected"));
        return;
      }
      let pending = items.length;
      const errors: unknown[] = [];
      items.forEach((promise, index) => {
        Promise.resolve(promise).then(resolve, (error) => {
          errors[index] = error;
          pending -= 1;
          if (pending === 0) {
            const failure = new Error("All promises were rejected");
            Object.assign(failure, { errors });
            reject(failure);
          }
        });
      });
    });
  };
}

export function installIOS12Polyfills(): void {
  if (typeof window === "undefined") return;
  try {
    polyfillStructuredClone();
    polyfillRandomUUID();
    polyfillArrayAt();
    polyfillObjectFromEntries();
    polyfillPromiseAny();
  } catch (error) {
    console.warn("[Startup] iOS12 polyfill install failed", error);
  }
}

installIOS12Polyfills();

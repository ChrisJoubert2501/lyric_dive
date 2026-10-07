import { useEffect, useState } from "react";

/**
 * Like `useState`, but remembered across restarts in the webview's
 * `localStorage`. Meant for preferences, not project data, which belongs in
 * the project file.
 */
export function useStoredState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState(() =>
    parseStored(localStorage.getItem(key), defaultValue),
  );

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

/**
 * Falls back to `defaultValue` when nothing is stored yet, and when the stored
 * value cannot be used, e.g. because another version of the app stored a
 * different type under the same key.
 */
export function parseStored<T>(stored: string | null, defaultValue: T): T {
  if (stored === null) return defaultValue;
  try {
    const value: unknown = JSON.parse(stored);
    return typeof value === typeof defaultValue ? (value as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

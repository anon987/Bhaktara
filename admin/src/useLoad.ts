import { useEffect, useState } from "react";
import { readableError, ReadableError } from "./errors";

// Runs `load` whenever its identity changes (wrap it in useCallback with the
// inputs it depends on). Loading is derived, not set, so the effect only
// updates state when the request settles. The previous data stays visible
// while the next request runs.
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{
    source: (() => Promise<T>) | null;
    data: T | undefined;
    error: ReadableError | null;
  }>({ source: null, data: undefined, error: null });

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setState({ source: load, data, error: null }),
      (error: unknown) =>
        active &&
        setState((current) => ({
          source: load,
          data: current.data,
          error: readableError(error),
        })),
    );
    return () => {
      active = false;
    };
  }, [load]);

  return {
    data: state.data,
    error: state.source === load ? state.error : null,
    loading: state.source !== load,
  };
}

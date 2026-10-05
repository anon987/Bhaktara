import { useCallback, useState } from "react";
import { toast } from "sonner";
import { readableError, type ReadableError } from "../../errors";

// Runs an async action with a busy flag, a success toast and a readable
// error (kept for inline display, also toasted).
export function useAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options: { success?: string | ((result: R) => string) } = {},
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReadableError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const result = await action(...args);
        const message =
          typeof options.success === "function" ? options.success(result) : options.success;
        if (message) toast.success(message);
        return result;
      } catch (caught) {
        const readable = readableError(caught);
        setError(readable);
        toast.error(readable.title, { description: readable.message });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    // The action identity is the caller's concern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  );
  return { run, busy, error, clearError: () => setError(null) };
}

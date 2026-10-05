// Structured logs for Cloud Logging (one JSON object per line). Callers pass
// explicit fields only: never request headers, tokens, credentials or the
// process environment.
export type LogFields = Record<string, string | number | boolean | undefined>;
export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

const write =
  (severity: "INFO" | "WARNING" | "ERROR") =>
  (message: string, fields: LogFields = {}) =>
    console.log(JSON.stringify({ severity, message, ...fields }));

export const jsonLogger: Logger = {
  info: write("INFO"),
  warn: write("WARNING"),
  error: write("ERROR"),
};

// Collects entries in memory (tests assert nothing sensitive is logged).
export function memoryLogger() {
  const entries: { severity: string; message: string; fields: LogFields }[] =
    [];
  const push =
    (severity: string) =>
    (message: string, fields: LogFields = {}) =>
      entries.push({ severity, message, fields });
  return {
    entries,
    logger: {
      info: push("INFO"),
      warn: push("WARNING"),
      error: push("ERROR"),
    } satisfies Logger,
  };
}

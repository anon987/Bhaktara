import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdmin } from "../../app/context";
import { can } from "../../domain";
import { ConfirmAction } from "../../components/panel/confirm";
import { formatDate } from "../../components/panel/format";
import { ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import { useAction } from "../../components/panel/useAction";
import type { ConfigId, ConfigVersion } from "../../panelApi";
import { configEditors } from "./editors";

// A versioned config document (doc 09 §11): edit, save as a new version,
// or restore an older one. Saving from a stale copy is refused.
export function ConfigPage({ id }: { id: ConfigId }) {
  const editor = configEditors[id];
  const { panel, role } = useAdmin();
  const writable = can(role, "config.write");
  const [state, setState] = useState<{ data: unknown; version: number; fromDefaults: boolean } | null>(null);
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([panel.getConfig(id), panel.listConfigVersions(id).catch(() => [])])
      .then(([config, history]) => {
        if (!active) return;
        setState({
          data: config.data ? editor.normalize(config.data) : editor.defaults(),
          version: config.version,
          fromDefaults: !config.data,
        });
        setVersions(history);
      })
      .catch((error: Error) => active && setLoadError(error));
    return () => {
      active = false;
    };
  }, [panel, id, editor, reload]);

  const save = useAction(
    async () => {
      if (!state) return;
      const { version: _ignored, ...data } = state.data as { version?: number };
      void _ignored;
      await panel.saveConfig({ id, data, expectedVersion: state.version });
      setReload((n) => n + 1);
    },
    { success: "Saved as a new version" },
  );
  const restore = useAction(
    async (toVersion: number) => {
      if (!state) return;
      await panel.rollbackConfig({ id, toVersion, expectedVersion: state.version });
      setReload((n) => n + 1);
    },
    { success: "Restored" },
  );
  const retry = useCallback(() => {
    setLoadError(null);
    setReload((n) => n + 1);
  }, []);

  return (
    <div>
      <PageHeader
        title={editor.title}
        description={editor.description}
        actions={
          state && (
            <>
              <Badge variant="outline">{state.fromDefaults ? "Using app defaults" : `Version ${state.version}`}</Badge>
              {writable && (
                <Button onClick={() => void save.run()} disabled={save.busy}>
                  <Save /> {save.busy ? "Saving…" : "Save"}
                </Button>
              )}
            </>
          )
        }
      />
      {loadError && <ErrorState error={{ kind: "unknown", title: "Could not load", message: loadError.message, problems: [] }} onRetry={retry} />}
      {!state && !loadError && <LoadingState rows={6} />}
      {state && (
        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <div className="space-y-6">
            {save.error && <ErrorState error={save.error} />}
            <fieldset disabled={!writable || save.busy} className="space-y-6">
              <editor.Editor value={state.data as never} onChange={(data: unknown) => setState({ ...state, data })} />
            </fieldset>
          </div>
          <Card className="h-fit xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> History</CardTitle>
              <CardDescription>Every save is a version.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {versions.length === 0 && <p className="text-sm text-muted-foreground">No saved versions yet.</p>}
              {versions.map((entry) => (
                <div key={entry.version} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div>
                    <p className="font-medium">v{entry.version}{entry.version === state.version && " · current"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.savedAt)} · {entry.action}</p>
                  </div>
                  {writable && entry.version !== state.version && (
                    <ConfirmAction
                      trigger={<Button variant="ghost" size="icon" aria-label={`Restore version ${entry.version}`}><RotateCcw /></Button>}
                      title={`Restore version ${entry.version}?`}
                      description="It is saved again as the newest version; nothing is lost."
                      confirmLabel="Restore"
                      onConfirm={() => restore.run(entry.version)}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

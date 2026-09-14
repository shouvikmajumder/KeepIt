import { useCallback, useEffect, useRef, useState } from "react";
import { listConnections, type Connection } from "./banks";

export function useConnectionStatus() {
  const [data, setData] = useState<Connection[] | null>(null);
  const previous = useRef<Connection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [completedVersion, setCompletedVersion] = useState(0);
  const [completed, setCompleted] = useState(false);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const rows = await listConnections(controller.signal);
        if (controller.signal.aborted) return;
        const finished = rows.some(
          (row) =>
            row.sync_status === "ready" &&
            previous.current?.some(
              (old) => old.id === row.id && old.sync_status === "syncing",
            ),
        );
        if (finished) {
          setCompletedVersion((value) => value + 1);
          setCompleted(rows.every((row) => row.sync_status === "ready"));
        } else if (
          rows.some((row) => row.sync_status !== "ready") ||
          !rows.length
        ) {
          setCompleted(false);
        }
        previous.current = rows;
        setData(rows);
        setError(null);
      } catch {
        if (!controller.signal.aborted) {
          setError("Unable to check update status.");
          setCompleted(false);
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [revision]);

  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => setCompleted(false), 8000);
    return () => window.clearTimeout(timer);
  }, [completed, completedVersion]);

  return {
    data,
    loading,
    error,
    reload,
    completed,
    completedVersion,
    syncingCount:
      data?.filter((row) => row.sync_status === "syncing").length || 0,
  };
}

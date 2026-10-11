"use client";

import { useEffect, useState } from "react";
import { fetchProtectedBlob } from "@/lib/api/protected-binary";

export type ProtectedObjectUrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; blob: Blob }
  | { status: "error"; error: unknown };

/**
 * Sprint: LIVE QA QA-04, section D — fetch a protected file through the
 * Mini App's own authenticated fetch (fetchProtectedBlob) and expose it as an
 * object URL while `path` is non-null. Passing null (viewer closed) or
 * unmounting aborts an in-flight request and REVOKES the object URL, so a
 * closed preview never keeps the bytes alive. `attempt` re-runs the fetch
 * (the viewer's «Повторить»).
 */
export function useProtectedObjectUrl(path: string | null, attempt = 0): ProtectedObjectUrlState {
  const [state, setState] = useState<ProtectedObjectUrlState>({ status: "idle" });

  useEffect(() => {
    if (!path) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ status: "loading" });
    fetchProtectedBlob(path, { signal: controller.signal }).then(
      (blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl, blob });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", error });
      },
    );
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);

  return state;
}

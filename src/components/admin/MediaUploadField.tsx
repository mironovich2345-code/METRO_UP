"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { uploadFile } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";

/** Reads video duration client-side (best-effort) to store as a hint. */
function readVideoMeta(file: File): Promise<{ durationSeconds?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          durationSeconds: Math.round(v.duration) || undefined,
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
        });
      };
      v.onerror = () => resolve({});
      v.src = url;
    } catch {
      resolve({});
    }
  });
}

export function MediaUploadField({
  kind,
  currentId,
  onUploaded,
}: {
  kind: "VIDEO" | "IMAGE";
  currentId?: string | null;
  onUploaded: (mediaAssetId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(currentId ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const accept = kind === "VIDEO" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp";

  const onPick = async (file: File) => {
    setState("uploading");
    setError(null);
    try {
      const hints = kind === "VIDEO" ? await readVideoMeta(file) : {};
      const { mediaAssetId } = await uploadFile(file, hints);
      onUploaded(mediaAssetId);
      setState("done");
    } catch (e) {
      setState("error");
      if (e instanceof ApiError && e.code === "storage_not_configured")
        setError("Хранилище не настроено (см. Railway env / STORAGE_*)");
      else if (e instanceof ApiError && (e.code === "UNSUPPORTED_MIME" || e.code === "FILE_TOO_LARGE"))
        setError(e.code === "FILE_TOO_LARGE" ? "Файл слишком большой" : "Недопустимый тип файла");
      else setError("Ошибка загрузки");
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === "uploading"}
        className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {state === "uploading" ? (
          <><Loader2 className="size-4 animate-spin" /> Загрузка…</>
        ) : state === "done" ? (
          <><CheckCircle2 className="size-4 text-success" /> Файл загружен (заменить)</>
        ) : (
          <><Upload className="size-4" /> Загрузить {kind === "VIDEO" ? "видео" : "изображение"}</>
        )}
      </button>
      {currentId && state === "done" && (
        <p className="mt-1 text-xs text-muted-foreground">media: {currentId.slice(0, 8)}… (READY)</p>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        {kind === "VIDEO" ? "MP4/WebM, до 500 МБ" : "JPEG/PNG/WebP, до 10 МБ"}
      </p>
    </div>
  );
}

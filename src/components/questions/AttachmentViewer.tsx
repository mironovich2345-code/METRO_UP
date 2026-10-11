"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { questionAttachmentDownloadUrl } from "@/lib/api/questions-client";
import { useProtectedObjectUrl } from "@/lib/client/use-protected-object-url";
import { attachmentPreviewKind, canShareFile, describeAttachmentLoadError } from "@/lib/client/attachment-preview";
import type { QuestionAttachmentDTO } from "@/lib/api/questions-types";

/**
 * Sprint: LIVE QA QA-04, section D — full-screen, in-app viewer for a
 * protected question attachment. The bytes are fetched INSIDE the Mini App
 * (useProtectedObjectUrl -> fetchProtectedBlob, the same session-cookie auth
 * every other API call uses) and shown from an object URL; nothing ever
 * navigates to, links to or opens the protected API URL, so Telegram's
 * external "Открыть ссылку?" browser — which has no session — is never
 * involved. The object URL is revoked as soon as the viewer closes.
 *
 * - Image (jpg/png/webp): <img> lightbox, pinch-zoom by the WebView.
 * - PDF: shown in an <iframe> on the object URL (WebKit's built-in PDF
 *   renderer), plus «Поделиться» -> navigator.share({ files }) when the
 *   WebView supports sharing files (iOS: Quick Look / «Сохранить в Файлы»),
 *   otherwise «Скачать» — an <a download> on the SAME object URL (already
 *   authorized bytes, never the API URL).
 *
 * Portaled to <body> (the detail screen's motion containers are transformed,
 * which would trap `position: fixed`); the page underneath is never
 * navigated, so its scroll position is kept — body scrolling is only frozen
 * while the viewer is open.
 */
export function AttachmentViewer({ attachment, onClose }: { attachment: QuestionAttachmentDTO | null; onClose: () => void }) {
  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {attachment && <ViewerPanel key={attachment.id} attachment={attachment} onClose={onClose} />}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function ViewerPanel({ attachment, onClose }: { attachment: QuestionAttachmentDTO; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const state = useProtectedObjectUrl(questionAttachmentDownloadUrl(attachment.id), attempt);
  const kind = attachmentPreviewKind(attachment.mimeType);

  // Freeze the page behind the viewer without moving it; restored on close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.originalName}
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-white/85">{attachment.originalName}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)]">
        {(state.status === "loading" || state.status === "idle") && (
          <Loader2 aria-label="Загрузка" className="size-8 animate-spin text-white/70" />
        )}

        {state.status === "error" && (
          <div className="flex max-w-xs flex-col items-center gap-4 px-6 text-center">
            <p className="text-sm text-white/85">{describeAttachmentLoadError(state.error)}</p>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Повторить
            </Button>
          </div>
        )}

        {state.status === "ready" && kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of already-authorized bytes; next/image cannot optimize blob: URLs
          <img src={state.url} alt={attachment.originalName} className="max-h-full max-w-full object-contain" />
        )}

        {state.status === "ready" && kind !== "image" && (
          <PdfPanel url={state.url} blob={state.blob} name={attachment.originalName} mimeType={attachment.mimeType} />
        )}
      </div>
    </motion.div>
  );
}

function PdfPanel({ url, blob, name, mimeType }: { url: string; blob: Blob; name: string; mimeType: string }) {
  const [shareError, setShareError] = useState<string | null>(null);
  const file = useMemo(() => new File([blob], name, { type: mimeType }), [blob, name, mimeType]);
  const shareable = typeof navigator !== "undefined" && canShareFile(navigator, file);

  const share = async () => {
    setShareError(null);
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      // AbortError = the user closed the share sheet; not a failure.
      if (!(e instanceof DOMException && e.name === "AbortError")) setShareError("Не удалось открыть меню «Поделиться».");
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <iframe src={url} title={name} className="min-h-0 w-full flex-1 border-0 bg-white" />
      <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-3">
        {shareable ? (
          <Button block variant="secondary" onClick={() => void share()}>
            <Share2 className="size-4" /> Поделиться или сохранить
          </Button>
        ) : (
          <a
            href={url}
            download={name}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold active:bg-white/20"
          >
            <Download className="size-4" /> Скачать
          </a>
        )}
        {shareError && <p className="text-center text-xs text-red-300">{shareError}</p>}
      </div>
    </div>
  );
}

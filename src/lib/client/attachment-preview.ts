/**
 * Sprint: LIVE QA QA-04, section D — pure decisions for viewing a protected
 * question attachment inside the Mini App (no React, no fetch).
 */

export type AttachmentPreviewKind = "image" | "pdf" | "unsupported";

const IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** jpg/jpeg/png/webp -> the in-app image lightbox; pdf -> the PDF viewer. */
export function attachmentPreviewKind(mimeType: string): AttachmentPreviewKind {
  const mime = mimeType.toLowerCase();
  if (IMAGE_MIME.has(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  return "unsupported";
}

/** A failed authorized fetch -> the viewer's retryable message. */
export function describeAttachmentLoadError(error: unknown): string {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  if (status === 401) return "Сессия истекла. Перезапустите приложение.";
  if (status === 403) return "Нет доступа к этому файлу.";
  if (status === 404) return "Файл не найден.";
  return "Не удалось загрузить файл. Проверьте соединение и попробуйте ещё раз.";
}

/** Whether this WebView can hand the PDF to the system share sheet (iOS:
 * Quick Look / «Сохранить в Файлы»). Feature-detected, never assumed. */
export function canShareFile(nav: { canShare?: (data: { files: File[] }) => boolean } | undefined, file: File): boolean {
  try {
    return Boolean(nav?.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

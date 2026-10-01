"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadAvatar } from "@/lib/api/avatar-client";
import { ApiError } from "@/lib/api/client";
import { springSoft } from "@/lib/motion";
import { baseScaleFor, clampPan as clampPanPure, computeCropRect } from "@/lib/client/avatar-crop-math";

/**
 * METRO UP ROUND 1, Milestone 1 — "Profile → tap avatar/change photo →
 * choose image → crop 1:1 → preview → save" (section 6). Hand-rolled
 * (pointer-events pan + a zoom slider, no new dependency) rather than
 * pulling in a crop library — the interaction is simple enough (square
 * output, cover-fit, drag to reposition, one zoom axis) that a library
 * would add more surface than it saves.
 *
 * Output: a 512x512 webp blob (falls back to jpeg if the browser's canvas
 * can't encode webp), uploaded via avatar-client.ts's signed-PUT flow —
 * this component never talks to the API directly beyond that one call.
 */

const VIEWPORT = 288; // CSS px, square preview
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 3;
const ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // raw phone photo ceiling, well above the 3 MB final-output limit — generous because the OUTPUT is what's actually uploaded, not this file

type Stage = "pick" | "crop" | "saving";

export function AvatarCropSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (avatarUrl: string) => void }) {
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  function reset() {
    setStage("pick");
    setError(null);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgUrl(null);
    setNaturalSize(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleClose() {
    reset();
    onClose();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file later
    if (!file) return;
    setError(null);
    if (!ACCEPTED_MIMES.includes(file.type)) {
      setError("Поддерживаются только JPG, PNG и WEBP.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("Файл слишком большой.");
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStage("crop");
  }

  function clampPan(x: number, y: number, z: number): { x: number; y: number } {
    if (!naturalSize) return { x: 0, y: 0 };
    return clampPanPure({ x, y }, naturalSize, VIEWPORT, z);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan(clampPan(dragState.current.panX + dx, dragState.current.panY + dy, zoom));
  }
  function onPointerUp() {
    dragState.current = null;
  }

  function onZoomChange(z: number) {
    setZoom(z);
    setPan((p) => clampPan(p.x, p.y, z));
  }

  async function save() {
    const img = imgElRef.current;
    if (!img || !naturalSize) return;
    setStage("saving");
    setError(null);
    try {
      const { srcX, srcY, srcSize } = computeCropRect(naturalSize, VIEWPORT, zoom, pan);

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      const finalBlob = blob ?? (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9)));
      if (!finalBlob) throw new Error("encode failed");

      const result = await uploadAvatar(finalBlob, finalBlob.type);
      onSaved(result.avatarUrl);
      handleClose();
    } catch (e) {
      setError(e instanceof ApiError ? describeAvatarError(e.code) : "Не удалось сохранить фото. Попробуйте ещё раз.");
      setStage("crop");
    }
  }

  const effectiveScale = naturalSize ? baseScaleFor(naturalSize, VIEWPORT) * zoom : 1;
  const renderedW = naturalSize ? naturalSize.w * effectiveScale : 0;
  const renderedH = naturalSize ? naturalSize.h * effectiveScale : 0;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Фото профиля</h2>
              <button onClick={handleClose} className="rounded-full p-1.5 text-muted-foreground active:bg-foreground/5" aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>

            {stage === "pick" && (
              <div className="mt-5 flex flex-col items-center gap-4 py-6">
                <span className="flex size-16 items-center justify-center rounded-full bg-brand/12">
                  <Camera className="size-7 text-brand" />
                </span>
                <Button onClick={() => fileInputRef.current?.click()}>Выбрать фото</Button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChosen} />
              </div>
            )}

            {(stage === "crop" || stage === "saving") && imgUrl && (
              <div className="mt-5 flex flex-col items-center gap-4">
                <div
                  className="relative touch-none overflow-hidden rounded-3xl bg-muted"
                  style={{ width: VIEWPORT, height: VIEWPORT }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not a Next/Image-optimizable remote asset */}
                  <img
                    ref={imgElRef}
                    src={imgUrl}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                    }}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: renderedW || undefined,
                      height: renderedH || undefined,
                      marginLeft: renderedW ? -renderedW / 2 + pan.x : 0,
                      marginTop: renderedH ? -renderedH / 2 + pan.y : 0,
                    }}
                  />
                  {/* circular crop guide, purely visual */}
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-[100px] ring-black/35" />
                </div>

                <div className="flex w-full items-center gap-3 px-2">
                  <span className="text-xs text-muted-foreground">Масштаб</span>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="flex-1 accent-brand"
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <div className="mt-1 flex w-full gap-3">
                  <Button variant="secondary" block onClick={reset} disabled={stage === "saving"}>
                    Выбрать другое
                  </Button>
                  <Button block onClick={save} disabled={stage === "saving" || !naturalSize}>
                    {stage === "saving" ? "Сохранение…" : "Сохранить"}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function describeAvatarError(code: string): string {
  switch (code) {
    case "UNSUPPORTED_MIME":
      return "Недопустимый формат файла.";
    case "FILE_TOO_LARGE":
      return "Файл превышает допустимый размер.";
    case "upload_not_found":
      return "Не удалось загрузить файл. Попробуйте ещё раз.";
    case "upload_failed":
      return "Не удалось загрузить файл. Проверьте соединение.";
    default:
      return "Не удалось сохранить фото. Попробуйте ещё раз.";
  }
}

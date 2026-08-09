import { Film, Info } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Media overview. For the MVP, media is uploaded contextually inside a lesson's
 * VIDEO/IMAGE block (direct-to-storage signed upload). A standalone media
 * library can be added later on top of the same MediaAsset model.
 */
export default function AdminMediaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Медиа</h1>
      <p className="mt-1 text-sm text-muted-foreground">Видео и изображения уроков</p>

      <div className="mt-6 flex gap-3 rounded-3xl border border-border bg-card p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <Film className="size-5 text-brand" />
        </span>
        <div className="text-sm">
          <p className="font-semibold">Как загрузить видео</p>
          <p className="mt-1 text-muted-foreground">
            Откройте урок → добавьте блок «Видео» → «Загрузить видео». Файл идёт
            напрямую в объектное хранилище (R2/S3) по короткоживущей подписанной
            ссылке; в базе хранятся только метаданные. Публикация урока требует
            статуса медиа READY.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-3 rounded-3xl border border-border bg-card p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <Info className="size-5 text-muted-foreground" />
        </span>
        <div className="text-sm">
          <p className="font-semibold">Лимиты</p>
          <p className="mt-1 text-muted-foreground">
            Видео: MP4/WebM до 500 МБ · Изображения: JPEG/PNG/WebP до 10 МБ.
            Тип и размер проверяются на сервере (не по расширению файла).
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Plus, Upload, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { documentsAdminApi } from "@/lib/api/metric-client";
import type { MetricDocumentRowDTO, MetricDocCategoryDTO, DocScopeDTO } from "@/lib/api/metric-types";
import { DOC_CATEGORY_LABEL, DOC_CATEGORIES } from "@/lib/metric-doc-meta";
import { Field, TextInput, TextArea, StatusBadge, fieldCls } from "@/components/admin/ui";
import { Modal } from "@/components/control/Modal";

const SCOPE_LABEL: Record<DocScopeDTO, string> = { ALL: "Все сотрудники", SALES: "Менеджеры продаж" };

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const DOC_ERR: Record<string, string> = {
  no_extractable_text: "В документе не найден текст. Для сканированных документов OCR пока не поддерживается.",
  unsupported_format: "Поддерживаются PDF, DOCX, TXT, MD.",
  file_too_large: "Файл больше 20 МБ.",
  empty_file: "Файл пуст.",
  storage_error: "Не удалось загрузить файл в хранилище.",
  storage_not_configured: "Хранилище файлов не настроено.",
  document_published_readonly: "Сначала верните документ в черновик.",
};

export function MetricDocumentsAdmin() {
  const [rows, setRows] = useState<MetricDocumentRowDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [showUpload, setShowUpload] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows((await documentsAdminApi.list()).documents); setStatus("ready"); }
    catch (e) { setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setMsg(null);
    try { await fn(); await load(); }
    catch (e) { setMsg(e instanceof ApiError ? (DOC_ERR[e.code] ?? "Ошибка операции") : "Ошибка"); }
    finally { setBusyId(null); }
  };
  const download = async (id: string) => {
    try { const { url } = await documentsAdminApi.downloadUrl(id); window.open(url, "_blank", "noopener"); }
    catch { setMsg("Не удалось получить ссылку на файл."); }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Документы Метрика</h1>
          <p className="mt-1 text-sm text-muted-foreground">Корпоративные материалы, которые Метрик использует как источник знаний.</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex h-11 items-center gap-1.5 rounded-2xl bg-brand px-5 text-sm font-semibold text-brand-foreground">
          <Plus className="size-4" /> Загрузить документ
        </button>
      </div>

      {msg && <p className="mt-4 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">{msg}</p>}

      <div className="mt-5 overflow-x-auto rounded-3xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Название</th>
              <th className="px-4 py-3 font-medium">Категория</th>
              <th className="px-4 py-3 font-medium">Доступ</th>
              <th className="px-4 py-3 font-medium">Файл</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Обновлён</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {status === "loading" && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Загрузка…</td></tr>}
            {status === "ready" && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Документов пока нет</td></tr>}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{d.title}</p>
                  {d.versionLabel && <p className="text-xs text-muted-foreground">{d.versionLabel}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{DOC_CATEGORY_LABEL[d.category]}</td>
                <td className="px-4 py-3 text-muted-foreground">{SCOPE_LABEL[d.positionScope]}</td>
                <td className="px-4 py-3 text-muted-foreground"><span className="block max-w-[160px] truncate">{d.originalFileName}</span><span className="text-xs">{fmtSize(d.fileSize)}</span></td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button onClick={() => download(d.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Скачать оригинал"><Download className="size-4" /></button>
                    {d.status !== "PUBLISHED" && <button disabled={busyId === d.id} onClick={() => act(d.id, () => documentsAdminApi.publish(d.id))} className="rounded-xl bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground disabled:opacity-50">Опубликовать</button>}
                    {d.status === "PUBLISHED" && <button disabled={busyId === d.id} onClick={() => act(d.id, () => documentsAdminApi.setStatus(d.id, "DRAFT"))} className="rounded-xl border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50">В черновик</button>}
                    {d.status !== "ARCHIVED" && <button disabled={busyId === d.id} onClick={() => act(d.id, () => documentsAdminApi.setStatus(d.id, "ARCHIVED"))} className="rounded-xl border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">В архив</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); void load(); }} />}
    </div>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MetricDocCategoryDTO>("TRAINING_MANUAL");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<DocScopeDTO>("ALL");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (title.trim().length < 2 || !file) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("category", category);
      if (description.trim()) form.set("description", description.trim());
      form.set("positionScope", scope);
      if (versionLabel.trim()) form.set("versionLabel", versionLabel.trim());
      if (effectiveFrom) form.set("effectiveFrom", effectiveFrom);
      form.set("file", file);
      await documentsAdminApi.create(form);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? (DOC_ERR[e.code] ?? "Не удалось загрузить документ") : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Загрузить документ</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-5" /></button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <p className="text-xs text-muted-foreground">Не загружайте документы с персональными данными клиентов или сотрудников. Используйте утверждённые корпоративные материалы и пустые шаблоны.</p>
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Название"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Правила клуба" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Категория">
            <select className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value as MetricDocCategoryDTO)}>
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{DOC_CATEGORY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Кому доступен">
            <select className={fieldCls} value={scope} onChange={(e) => setScope(e.target.value as DocScopeDTO)}>
              <option value="ALL">Все сотрудники</option>
              <option value="SALES">Менеджеры продаж</option>
            </select>
          </Field>
        </div>
        <Field label="Краткое описание (необязательно)"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Версия / редакция (необязательно)"><TextInput value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="напр. ред. 2026-01" /></Field>
          <Field label="Дата действия (необязательно)"><TextInput type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></Field>
        </div>
        <Field label="Файл (PDF, DOCX, TXT, MD · до 20 МБ)">
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm hover:border-brand/40">
            <Upload className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file ? file.name : "Выберите файл…"}</span>
            <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        {err && <p className="text-sm text-red-500">{err}</p>}
      </div>

      <button onClick={submit} disabled={busy || title.trim().length < 2 || !file} className="mt-5 w-full rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
        {busy ? "Загружаем…" : "Загрузить (черновик)"}
      </button>
    </Modal>
  );
}

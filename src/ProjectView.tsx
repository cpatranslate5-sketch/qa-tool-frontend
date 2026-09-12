import { useEffect, useRef, useState } from "react";
import {
  deleteProject,
  getGlossaryStatus, getNumeralsStatus, getToneStatus,
  uploadGlossary, uploadNumerals, uploadTone,
} from "./api";
import type { GlossaryStatus, Manager, NumeralsStatus, Project, ToneStatus } from "./types";

type DocKind = "glossary" | "numerals" | "tone";

const DOC_META: Record<DocKind, { title: string; hint: string }> = {
  glossary: {
    title: "Глоссарий",
    hint: "Колонка EN, пояснение, затем колонка на каждый язык.",
  },
  numerals: {
    title: "Нумералс",
    hint: "Формат чисел, дат и т.п. по языкам — один или несколько листов.",
  },
  tone: {
    title: "Тон обращения",
    hint: "Колонка на каждый язык, регистр обращения (ты/вы и т.п.).",
  },
};

function DocCard({
  kind,
  isAdmin,
  status,
  onUploaded,
}: {
  kind: DocKind;
  isAdmin: boolean;
  status: { filename: string; uploaded_at: string | null; count: number } | null;
  onUploaded: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const meta = DOC_META[kind];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setSaved(false);
    setError("");
    try {
      await onUploaded(file);
      setSaved(true);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="doc-section">
      <label>{meta.title}</label>
      {status && status.count > 0 ? (
        <div className="doc-readonly">
          📄 {status.filename} — {status.count} {kind === "glossary" ? "терминов" : "языков"}
          {status.uploaded_at && (
            <span className="muted small"> (загружен {new Date(status.uploaded_at).toLocaleString("ru-RU")})</span>
          )}
        </div>
      ) : (
        <div className="doc-readonly"><span className="muted">не загружен</span></div>
      )}

      {isAdmin && (
        <form className="inline-form" onSubmit={submit}>
          <input ref={fileRef} type="file" accept=".xlsx" />
          <button type="submit" disabled={uploading}>{uploading ? "Загружаю…" : "Загрузить"}</button>
          {saved && <span className="muted small"> Сохранено.</span>}
        </form>
      )}
      {error && <div className="error-box">{error}</div>}
      <p className="muted small">{meta.hint} Загрузка полностью заменяет предыдущий файл.</p>
    </div>
  );
}

export default function ProjectView({
  manager,
  project,
  onOpenCheck,
  onProjectDeleted,
  onBack,
}: {
  manager: Manager;
  project: Project;
  onOpenCheck: () => void;
  onProjectDeleted: () => void;
  onBack: () => void;
}) {
  const [glossaryStatus, setGlossaryStatus] = useState<GlossaryStatus | null>(null);
  const [numeralsStatus, setNumeralsStatus] = useState<NumeralsStatus | null>(null);
  const [toneStatus, setToneStatus] = useState<ToneStatus | null>(null);
  const [error, setError] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    getGlossaryStatus(project.id).then(setGlossaryStatus).catch(() => {});
    getNumeralsStatus(project.id).then(setNumeralsStatus).catch(() => {});
    getToneStatus(project.id).then(setToneStatus).catch(() => {});
  }, [project.id]);

  async function submitDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteCode.trim()) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteProject(project.id, manager.id, deleteCode.trim());
      onProjectDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error && err.message === "401" ? "Неверный пароль." : "Не удалось удалить проект.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>{project.name}</h1>
        <button className="link-button" onClick={onBack}>← К проектам</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <section>
        <h2>Документы проекта</h2>
        <div className="doc-grid">
          <DocCard
            kind="glossary"
            isAdmin={manager.is_admin}
            status={glossaryStatus ? { filename: glossaryStatus.filename, uploaded_at: glossaryStatus.uploaded_at, count: glossaryStatus.term_count } : null}
            onUploaded={async file => setGlossaryStatus(await uploadGlossary(manager.id, project.id, file))}
          />
          <DocCard
            kind="numerals"
            isAdmin={manager.is_admin}
            status={numeralsStatus ? { filename: numeralsStatus.filename, uploaded_at: numeralsStatus.uploaded_at, count: numeralsStatus.rule_count } : null}
            onUploaded={async file => setNumeralsStatus(await uploadNumerals(manager.id, project.id, file))}
          />
          <DocCard
            kind="tone"
            isAdmin={manager.is_admin}
            status={toneStatus ? { filename: toneStatus.filename, uploaded_at: toneStatus.uploaded_at, count: toneStatus.rule_count } : null}
            onUploaded={async file => setToneStatus(await uploadTone(manager.id, project.id, file))}
          />
        </div>
      </section>

      <section>
        <button className="start-check-button" onClick={onOpenCheck}>Начать проверку →</button>
      </section>

      {manager.is_admin && (
        <section>
          <h2>Управление проектом</h2>
          <button className="link-button danger-link" onClick={() => { setShowDelete(true); setDeleteCode(""); setDeleteError(""); }}>
            Удалить проект
          </button>
        </section>
      )}

      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>Удалить проект «{project.name}»?</h2>
            <p className="muted small">Это действие необратимо: все документы и история проверок проекта будут удалены. Подтвердите свой пароль.</p>
            <form onSubmit={submitDelete}>
              <label>Ваш пароль</label>
              <input value={deleteCode} onChange={e => setDeleteCode(e.target.value)} type="password" autoFocus />
              {deleteError && <div className="error-box">{deleteError}</div>}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setShowDelete(false)}>Отмена</button>
                <button type="submit" disabled={deleteBusy || !deleteCode.trim()}>
                  {deleteBusy ? "Удаляю…" : "Удалить безвозвратно"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

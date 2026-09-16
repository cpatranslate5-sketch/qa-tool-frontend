import { useEffect, useState } from "react";
import {
  addCatalogLanguage,
  deleteCatalogLanguage,
  deleteProject,
  knownLanguages,
} from "./api";
import { MultiCheckHistoryList, SingleCheckHistoryList } from "./HistoryLists";
import { flagForLang } from "./lang";
import type { Manager, Project } from "./types";

// The project's manually-curated "which languages do I check here" list.
// Александр asked for this list to change ONLY when he explicitly adds or
// removes a language here — never as a side effect of uploading a file to
// check.
function LanguageCatalogSection({
  isAdmin,
  languages,
  onAdd,
  onDelete,
}: {
  isAdmin: boolean;
  languages: string[] | null;
  onAdd: (code: string) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}) {
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) return;
    setAdding(true);
    setError("");
    try {
      await onAdd(newCode.trim());
      setNewCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить язык.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(code: string) {
    setRemovingCode(code);
    setError("");
    try {
      await onDelete(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось убрать язык.");
    } finally {
      setRemovingCode(null);
    }
  }

  return (
    <section>
      <h2>Языки проекта</h2>
      <p className="muted small">
        Список языков, которые вы проверяете в этом проекте. Меняется только вручную — загрузка файла на
        проверку на него не влияет.
      </p>

      {languages === null && <p className="muted small">Загрузка…</p>}
      {languages !== null && languages.length === 0 && (
        <p className="muted small">Список пока пуст — добавьте языки ниже.</p>
      )}
      {languages !== null && languages.length > 0 && (
        <div className="doc-lang-chips">
          {languages.map(code => (
            <span key={code} className="doc-lang-chip">
              {flagForLang(code)} {code.toUpperCase()}
              {isAdmin && (
                <button
                  type="button"
                  className="chip-remove"
                  disabled={removingCode === code}
                  title={`Убрать «${code.toUpperCase()}» из списка языков проекта`}
                  onClick={() => handleDelete(code)}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isAdmin && (
        <form className="inline-form" onSubmit={submitAdd} style={{ marginTop: 10 }}>
          <input
            value={newCode}
            onChange={e => setNewCode(e.target.value)}
            placeholder="Код языка, например es-mx"
            style={{ maxWidth: 220 }}
          />
          <button type="submit" disabled={adding || !newCode.trim()}>{adding ? "Добавляю…" : "Добавить язык"}</button>
        </form>
      )}
      {error && <div className="error-box">{error}</div>}
    </section>
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
  // Called with no argument for "start a new check"; called with a
  // multi-check id when a history entry below was clicked, so the check
  // screen opens straight to that upload's results.
  onOpenCheck: (multiCheckId?: number) => void;
  onProjectDeleted: () => void;
  onBack: () => void;
}) {
  const [catalogLangs, setCatalogLangs] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    knownLanguages(project.id).then(r => setCatalogLangs(r.languages)).catch(() => setCatalogLangs([]));
  }, [project.id]);

  async function addLanguage(code: string) {
    const r = await addCatalogLanguage(project.id, manager.id, code);
    setCatalogLangs(r.languages);
  }

  async function removeLanguage(code: string) {
    const r = await deleteCatalogLanguage(project.id, manager.id, code);
    setCatalogLangs(r.languages);
  }

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

      <LanguageCatalogSection
        isAdmin={manager.is_admin}
        languages={catalogLangs}
        onAdd={addLanguage}
        onDelete={removeLanguage}
      />

      <section>
        <button className="start-check-button" onClick={() => onOpenCheck()}>Начать проверку →</button>
      </section>

      <SingleCheckHistoryList manager={manager} project={project} />
      <MultiCheckHistoryList manager={manager} project={project} onOpen={onOpenCheck} />

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
            <p className="muted small">Это действие необратимо: список языков и вся история проверок проекта будут удалены. Подтвердите свой пароль.</p>
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

import { useEffect, useRef, useState } from "react";
import { addLanguage, getGlossaryStatus, listLanguages, uploadGlossary } from "./api";
import type { GlossaryStatus, Language, Manager, Project } from "./types";

export default function ProjectView({
  manager,
  project,
  onProjectChange: _onProjectChange,
  onOpenLanguage,
  onOpenMulti,
  onBack,
}: {
  manager: Manager;
  project: Project;
  onProjectChange: (project: Project) => void;
  onOpenLanguage: (language: Language) => void;
  onOpenMulti: () => void;
  onBack: () => void;
}) {
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [newLangCode, setNewLangCode] = useState("");
  const [glossaryStatus, setGlossaryStatus] = useState<GlossaryStatus | null>(null);
  const glossaryFileRef = useRef<HTMLInputElement>(null);
  const [uploadingGlossary, setUploadingGlossary] = useState(false);
  const [glossarySaved, setGlossarySaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listLanguages(project.id).then(setLanguages).catch(() => setError("Не удалось загрузить языковые папки."));
  }, [project.id]);

  useEffect(() => {
    getGlossaryStatus(project.id).then(setGlossaryStatus).catch(() => {});
    setGlossarySaved(false);
  }, [project.id]);

  async function submitAddLanguage(e: React.FormEvent) {
    e.preventDefault();
    const code = newLangCode.trim().toLowerCase();
    if (!code) return;
    try {
      const lang = await addLanguage(manager.id, project.id, code);
      setLanguages(prev => {
        const rest = (prev || []).filter(l => l.id !== lang.id);
        return [...rest, lang].sort((a, b) => a.lang_code.localeCompare(b.lang_code));
      });
      setNewLangCode("");
    } catch {
      setError("Не удалось добавить языковую папку.");
    }
  }

  async function submitGlossaryUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = glossaryFileRef.current?.files?.[0];
    if (!file) return;
    setUploadingGlossary(true);
    setGlossarySaved(false);
    setError("");
    try {
      const status = await uploadGlossary(manager.id, project.id, file);
      setGlossaryStatus(status);
      setGlossarySaved(true);
      if (glossaryFileRef.current) glossaryFileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? `Не удалось загрузить глоссарий: ${err.message}` : "Не удалось загрузить глоссарий.");
    } finally {
      setUploadingGlossary(false);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>{project.name}</h1>
        <button className="link-button" onClick={onBack}>← К проектам</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <section className="glossary-section">
        <label>Глоссарий проекта (общий для всех языков)</label>
        {glossaryStatus && glossaryStatus.term_count > 0 ? (
          <div className="glossary-readonly">
            📄 {glossaryStatus.filename} — {glossaryStatus.term_count} терминов
            {glossaryStatus.uploaded_at && (
              <span className="muted small"> (загружен {new Date(glossaryStatus.uploaded_at).toLocaleString("ru-RU")})</span>
            )}
          </div>
        ) : (
          <div className="glossary-readonly"><span className="muted">не загружен</span></div>
        )}

        {manager.is_admin && (
          <form className="inline-form" onSubmit={submitGlossaryUpload}>
            <input ref={glossaryFileRef} type="file" accept=".xlsx" />
            <button type="submit" disabled={uploadingGlossary}>
              {uploadingGlossary ? "Загружаю…" : "Загрузить глоссарий"}
            </button>
            {glossarySaved && <span className="muted small"> Сохранено.</span>}
          </form>
        )}
        <p className="muted small">
          Файл в том же формате, что и рабочий документ: колонка EN, пояснение, затем колонка на каждый язык.
          Загрузка полностью заменяет предыдущий глоссарий.
        </p>
      </section>

      <section>
        <h2>Языковые папки</h2>
        {manager.is_admin && (
          <form className="inline-form" onSubmit={submitAddLanguage}>
            <input
              value={newLangCode}
              onChange={e => setNewLangCode(e.target.value)}
              placeholder="Код языка, напр. ru, ar, es-es"
            />
            <button type="submit" disabled={!newLangCode.trim()}>Добавить папку</button>
          </form>
        )}

        {languages === null && <div className="muted">Загрузка…</div>}
        {languages !== null && languages.length === 0 && <div className="muted">Языковых папок пока нет.</div>}

        <div className="folder-grid">
          {languages?.map(l => (
            <button key={l.id} className="folder-card" onClick={() => onOpenLanguage(l)}>
              📁 {l.lang_code}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Мульти</h2>
        <p className="muted small">Загрузка Excel с несколькими языками сразу — один запуск, один общий результат.</p>
        <button className="folder-card multi-card" onClick={onOpenMulti}>📊 Открыть «Мульти»</button>
      </section>
    </div>
  );
}

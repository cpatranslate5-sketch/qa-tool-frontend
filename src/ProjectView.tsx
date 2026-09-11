import { useEffect, useState } from "react";
import { addLanguage, listLanguages, updateGlossary } from "./api";
import type { Language, Manager, Project } from "./types";

export default function ProjectView({
  manager,
  project,
  onProjectChange,
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
  const [glossary, setGlossary] = useState(project.glossary);
  const [savingGlossary, setSavingGlossary] = useState(false);
  const [glossarySaved, setGlossarySaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listLanguages(manager.id, project.id).then(setLanguages).catch(() => setError("Не удалось загрузить языковые папки."));
  }, [manager.id, project.id]);

  useEffect(() => {
    setGlossary(project.glossary);
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

  async function saveGlossary() {
    setSavingGlossary(true);
    setGlossarySaved(false);
    try {
      const updated = await updateGlossary(manager.id, project.id, glossary);
      onProjectChange(updated);
      setGlossarySaved(true);
    } catch {
      setError("Не удалось сохранить глоссарий.");
    } finally {
      setSavingGlossary(false);
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
        <textarea
          value={glossary}
          onChange={e => { setGlossary(e.target.value); setGlossarySaved(false); }}
          rows={4}
          placeholder="Например: term1 → перевод1, term2 → перевод2"
        />
        <button onClick={saveGlossary} disabled={savingGlossary || glossary === project.glossary}>
          {savingGlossary ? "Сохраняю…" : "Сохранить глоссарий"}
        </button>
        {glossarySaved && <span className="muted small"> Сохранено.</span>}
      </section>

      <section>
        <h2>Языковые папки</h2>
        <form className="inline-form" onSubmit={submitAddLanguage}>
          <input
            value={newLangCode}
            onChange={e => setNewLangCode(e.target.value)}
            placeholder="Код языка, напр. ru, ar, es-es"
          />
          <button type="submit" disabled={!newLangCode.trim()}>Добавить папку</button>
        </form>

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

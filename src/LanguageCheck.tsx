import { useEffect, useState } from "react";
import { runCheck, singleCheckHistory } from "./api";
import type { Finding, Language, Manager, Project, SingleCheckHistoryEntry } from "./types";

const CHECK_OPTIONS: { key: string; label: string }[] = [
  { key: "numbers", label: "Числа/даты" },
  { key: "placeholders", label: "Плейсхолдеры/теги" },
  { key: "glossary", label: "Глоссарий" },
  { key: "register", label: "Регистр (ты/вы)" },
  { key: "typo", label: "Опечатки/искажения" },
];

const SEVERITY_LABEL: Record<string, string> = { high: "Важно", medium: "Средне", low: "Мелочь" };

export default function LanguageCheck({
  manager,
  project,
  language,
  onBack,
}: {
  manager: Manager;
  project: Project;
  language: Language;
  onBack: () => void;
}) {
  const [source, setSource] = useState("");
  const [translation, setTranslation] = useState("");
  const [checks, setChecks] = useState<string[]>(CHECK_OPTIONS.map(c => c.key));
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SingleCheckHistoryEntry[]>([]);

  useEffect(() => {
    singleCheckHistory(project.id, language.id).then(setHistory).catch(() => {});
  }, [project.id, language.id]);

  function toggleCheck(key: string) {
    setChecks(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  }

  async function run() {
    if (!source.trim() || !translation.trim()) return;
    setLoading(true);
    setError("");
    setFindings(null);
    try {
      const res = await runCheck({
        source, translation, checks,
        projectId: project.id,
        languageId: language.id,
        managerName: manager.name,
      });
      setFindings(res.findings);
      singleCheckHistory(project.id, language.id).then(setHistory).catch(() => {});
    } catch {
      setError("Не удалось связаться с сервером проверки.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>{project.name} / {language.lang_code}</h1>
        <button className="link-button" onClick={onBack}>← К проекту</button>
      </div>

      <div className="two-col">
        <div className="col">
          <label>Исходный текст</label>
          <textarea value={source} onChange={e => setSource(e.target.value)} rows={12} placeholder="Вставьте исходный текст…" />
        </div>
        <div className="col">
          <label>Перевод ({language.lang_code})</label>
          <textarea value={translation} onChange={e => setTranslation(e.target.value)} rows={12} placeholder="Вставьте перевод…" />
        </div>
      </div>

      <p className="muted small">Глоссарий берётся из настроек проекта автоматически.</p>

      <div className="checks-row">
        {CHECK_OPTIONS.map(c => (
          <label key={c.key} className="check-chip">
            <input type="checkbox" checked={checks.includes(c.key)} onChange={() => toggleCheck(c.key)} />
            {c.label}
          </label>
        ))}
      </div>

      <button onClick={run} disabled={loading || !source.trim() || !translation.trim()}>
        {loading ? "Проверяю…" : "Проверить"}
      </button>

      {error && <div className="error-box">{error}</div>}

      {findings !== null && (
        <div className="results">
          <h2>Результат</h2>
          {findings.length === 0 && <div className="muted">Проблем не найдено.</div>}
          {findings.map((f, i) => (
            <div key={i} className={`finding finding-${f.severity}`}>
              <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
              <span className="finding-type">{f.type}</span>
              <div className="finding-message">{f.message}</div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="history">
          <h2>История проверок ({language.lang_code})</h2>
          {history.map(h => (
            <details key={h.id} className="history-entry">
              <summary>
                {new Date(h.created_at).toLocaleString("ru-RU")}
                {h.performed_by_name ? ` — ${h.performed_by_name}` : ""}
                {" — "}{h.findings.length === 0 ? "без проблем" : `${h.findings.length} найдено`}
              </summary>
              <div className="history-pair">
                <div><strong>Источник:</strong> {h.source}</div>
                <div><strong>Перевод:</strong> {h.translation}</div>
              </div>
              {h.findings.map((f, i) => (
                <div key={i} className={`finding finding-${f.severity}`}>
                  <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                  <span className="finding-type">{f.type}</span>
                  <div className="finding-message">{f.message}</div>
                </div>
              ))}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

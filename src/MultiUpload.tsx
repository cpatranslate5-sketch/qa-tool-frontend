import { useEffect, useRef, useState } from "react";
import { multiCheck, multiCheckDetail, multiCheckHistory, multiCheckReportUrl } from "./api";
import type { Manager, MultiCheckHistoryEntry, MultiCheckResponse, Project } from "./types";

const SEVERITY_LABEL: Record<string, string> = { high: "Важно", medium: "Средне", low: "Мелочь" };

export default function MultiUpload({
  manager,
  project,
  onBack,
}: {
  manager: Manager;
  project: Project;
  onBack: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceLang, setSourceLang] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MultiCheckResponse | null>(null);
  const [history, setHistory] = useState<MultiCheckHistoryEntry[]>([]);
  const [openLang, setOpenLang] = useState<string | null>(null);

  useEffect(() => {
    multiCheckHistory(manager.id, project.id).then(setHistory).catch(() => {});
  }, [manager.id, project.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await multiCheck(manager.id, project.id, file, sourceLang.trim());
      setResult(res);
      setOpenLang(res.summary.languages_checked[0] || null);
      multiCheckHistory(manager.id, project.id).then(setHistory).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? `Не удалось обработать файл: ${err.message}` : "Не удалось обработать файл.");
    } finally {
      setLoading(false);
    }
  }

  async function openHistoryEntry(id: number) {
    setError("");
    try {
      const res = await multiCheckDetail(manager.id, project.id, id);
      setResult(res);
      setOpenLang(res.summary.languages_checked[0] || null);
    } catch {
      setError("Не удалось загрузить эту проверку.");
    }
  }

  const unrecognized = result?.sheets.flatMap(s => s.unrecognized_columns) || [];

  return (
    <div className="page">
      <div className="top-bar">
        <h1>{project.name} / Мульти</h1>
        <button className="link-button" onClick={onBack}>← К проекту</button>
      </div>

      <form className="multi-upload-form" onSubmit={submit}>
        <label>Файл Excel (экспорт из Crowdin)</label>
        <input ref={fileInputRef} type="file" accept=".xlsx" />

        <label>Исходный язык (необязательно — по умолчанию берётся колонка «en»)</label>
        <input value={sourceLang} onChange={e => setSourceLang(e.target.value)} placeholder="en" />

        <button type="submit" disabled={loading}>
          {loading ? "Проверяю все языки… это может занять пару минут" : "Проверить файл"}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="results">
          <h2>Результат — {result.summary.total_findings} проблем в {result.summary.languages_checked.length} языках</h2>
          <p className="muted small">
            Исходный язык: {result.source_lang}. Строк проверено: {result.summary.rows_checked}.
          </p>
          {unrecognized.length > 0 && (
            <div className="info-box">
              Не распознаны как языки (пропущены): {unrecognized.join(", ")}
            </div>
          )}
          <a className="download-link" href={multiCheckReportUrl(manager.id, project.id, result.multi_check_id)}>
            ⬇ Скачать отчёт (Excel)
          </a>

          {result.sheets.map(sheet => (
            <div key={sheet.sheet_name} className="sheet-block">
              {result.sheets.length > 1 && <h3>{sheet.sheet_name}</h3>}
              <div className="lang-tabs">
                {sheet.languages_checked.map(lang => {
                  const count = sheet.languages[lang]?.length || 0;
                  return (
                    <button
                      key={lang}
                      className={`lang-tab ${openLang === lang ? "active" : ""} ${count > 0 ? "has-findings" : ""}`}
                      onClick={() => setOpenLang(lang)}
                    >
                      {lang} {count > 0 ? `(${count})` : ""}
                    </button>
                  );
                })}
              </div>

              {openLang && sheet.languages[openLang] && (
                <div className="lang-results">
                  {sheet.languages[openLang].length === 0 && <div className="muted">Проблем не найдено.</div>}
                  {sheet.languages[openLang].map((row, i) => (
                    <div key={i} className="multi-row">
                      <div className="multi-row-header">
                        Строка {row.excel_row} — {row.context || "без контекста"}
                      </div>
                      <div className="history-pair">
                        <div><strong>Источник:</strong> {row.source}</div>
                        <div><strong>Перевод:</strong> {row.translation}</div>
                      </div>
                      {row.findings.map((f, fi) => (
                        <div key={fi} className={`finding finding-${f.severity}`}>
                          <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                          <span className="finding-type">{f.type}</span>
                          <div className="finding-message">{f.message}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="history">
          <h2>История загрузок</h2>
          {history.map(h => (
            <button key={h.id} className="history-row" onClick={() => openHistoryEntry(h.id)}>
              {new Date(h.created_at).toLocaleString("ru-RU")} — {h.filename} — {h.summary.total_findings} проблем
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

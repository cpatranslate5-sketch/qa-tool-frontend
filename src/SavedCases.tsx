import { useEffect, useState } from "react";
import { deleteSavedCase, listSavedCases } from "./api";
import { flagForLang, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import TagText from "./TagText";
import type { Manager, SavedCase } from "./types";

// «Сохранённое» (2026-10-01, Александр): interesting cases saved from
// reports with the 💾 button at the top of a block — kept here for later,
// private to the folder that saved it (2026-10-01). Each case is a
// copy, so it stays even if the original report is deleted.
export default function SavedCases({ manager, onBack }: { manager: Manager; onBack: () => void }) {
  const [cases, setCases] = useState<SavedCase[] | null>(null);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    listSavedCases(manager.id)
      .then(res => setCases(res.cases))
      .catch(() => {
        setCases([]);
        setError("Не удалось загрузить сохранённое.");
      });
  }, [manager.id]);

  async function handleDelete(c: SavedCase) {
    if (!window.confirm("Удалить этот кейс из «Сохранённого»?")) return;
    setRemovingId(c.id);
    setError("");
    try {
      await deleteSavedCase(c.id, manager.id);
      setCases(prev => (prev || []).filter(x => x.id !== c.id));
    } catch {
      setError("Не удалось удалить кейс.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Сохранённое</h1>
        <div className="top-bar-actions">
          <button className="link-button" onClick={onBack}>← Назад</button>
        </div>
      </div>

      <p className="muted small">
        Интересные кейсы из отчётов — сохраняются кнопкой 💾 в углу блока. Видно только вашей папке.
      </p>

      {error && <div className="error-box">{error}</div>}
      {cases === null && <div className="muted" style={{ marginTop: 16 }}>Загрузка…</div>}
      {cases !== null && cases.length === 0 && !error && (
        <div className="muted" style={{ marginTop: 16 }}>Пока ничего не сохранено.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {(cases || []).map(c => (
          <div key={c.id} className="multi-row" style={{ position: "relative" }}>
            <button
              type="button"
              className="link-button danger-link"
              style={{ position: "absolute", top: 8, right: 10 }}
              disabled={removingId === c.id}
              onClick={() => handleDelete(c)}
            >
              {removingId === c.id ? "Удаляю…" : "Удалить"}
            </button>
            <div className="multi-row-header" style={{ paddingRight: 80 }}>
              {flagForLang(c.lang)} {c.lang} · Строка {c.excel_row}{c.context ? ` — ${c.context}` : ""}
            </div>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {[c.project_name, c.filename].filter(Boolean).join(" · ")}
              {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString("ru-RU")}` : ""}
            </div>
            <div className="history-pair">
              <div><strong>Источник:</strong> <TagText text={c.source} /></div>
              <div><strong>Перевод:</strong> <TagText text={c.translation} /></div>
            </div>
            {c.findings.map((f, i) => (
              <div key={i} className={`finding finding-${f.severity}`}>
                <span className="finding-severity">{SEVERITY_LABEL[f.severity as "low"] || f.severity}</span>
                <span className="finding-type">{TYPE_LABEL[f.type] || f.type}</span>
                <div className="finding-message"><TagText text={f.message} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

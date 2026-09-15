import { useEffect, useState } from "react";
import { addLanguageAlias, deleteLanguageAlias, listLanguageAliases } from "./api";
import { flagForLang } from "./lang";
import type { LanguageAlias, Manager } from "./types";

// Александр's global spelling dictionary (his own idea, approved after he
// asked for an opinion first): any manager teaches "this raw spelling means
// this language" once here, and it's recognized everywhere from then on — a
// file's own column header, the Tone-of-address document, a manually-typed
// catalog addition (see app.excel_multi._label_to_code on the backend).
//
// Deliberately global (not per-project) and open to every folder, not just
// admin — matches the backend's non-admin-gated design: a wrong or
// redundant entry is low-stakes and self-correcting, since everyone can see
// who added what and fix a mistake themselves.
export default function LanguageAliases({
  manager,
  onBack,
}: {
  manager: Manager;
  onBack: () => void;
}) {
  const [aliases, setAliases] = useState<LanguageAlias[] | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listLanguageAliases()
      .then(res => setAliases(res.aliases))
      .catch(() => {
        // [] rather than leaving it null — otherwise the page would show
        // the error AND a permanent "Загрузка…" underneath it forever.
        setAliases([]);
        setError("Не удалось загрузить словарь языков.");
      });
  }, []);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newAlias.trim() || !newCode.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await addLanguageAlias(manager.id, newAlias.trim(), newCode.trim());
      setAliases(res.aliases);
      setNewAlias("");
      setNewCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить вариант написания.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(row: LanguageAlias) {
    setRemovingId(row.id);
    setError("");
    try {
      const res = await deleteLanguageAlias(row.id, manager.id);
      setAliases(res.aliases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить вариант написания.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Словарь языков</h1>
        <div className="top-bar-actions">
          <button className="link-button" onClick={onBack}>← Назад</button>
        </div>
      </div>

      <p className="muted small">
        Общий для всех папок список: здесь можно научить платформу, что какое-то написание языка
        (например, столбец в файле или в документе «Тон обращения») означает определённый код —
        и дальше это будет распознаваться везде само, без ручного вмешательства. Регистр не имеет
        значения. Добавлять и удалять варианты может любая папка, не только админская.
      </p>

      {error && <div className="error-box">{error}</div>}

      <form className="inline-form" onSubmit={submitAdd} style={{ marginTop: 10 }}>
        <input
          value={newAlias}
          onChange={e => setNewAlias(e.target.value)}
          placeholder='Написание, например "Portuguese Brazil"'
          style={{ maxWidth: 260 }}
        />
        <input
          value={newCode}
          onChange={e => setNewCode(e.target.value)}
          placeholder="Код языка, например pt-br"
          style={{ maxWidth: 180 }}
        />
        <button type="submit" disabled={adding || !newAlias.trim() || !newCode.trim()}>
          {adding ? "Добавляю…" : "Добавить"}
        </button>
      </form>

      {aliases === null && <div className="muted" style={{ marginTop: 16 }}>Загрузка…</div>}
      {aliases !== null && aliases.length === 0 && (
        <div className="muted" style={{ marginTop: 16 }}>Словарь пока пуст — добавьте первый вариант написания выше.</div>
      )}

      {aliases !== null && aliases.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {aliases.map(row => (
            <div key={row.id} className="history-row-wrap">
              <div className="history-row">
                «{row.alias}» → {flagForLang(row.canonical_code)} {row.canonical_code.toUpperCase()}
                <span className="muted small">
                  {" "}— добавил(а) {row.added_by_name || "неизвестно"}
                  {row.created_at ? `, ${new Date(row.created_at).toLocaleString("ru-RU")}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="history-delete-button"
                disabled={removingId === row.id}
                title={`Удалить «${row.alias}» из словаря`}
                onClick={() => handleDelete(row)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

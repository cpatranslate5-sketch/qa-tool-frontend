import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { deleteMultiCheck, deleteSingleCheck, multiCheckDetail, multiCheckHistory, singleCheckHistory } from "./api";
import { flagForLang, formatCostRu, formatElapsedMinutesRu, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import { openReportInNewTab } from "./reportHtml";
import type { Manager, MultiCheckHistoryEntry, Project, SingleCheckHistoryEntry } from "./types";

// Both lists below are self-contained: they fetch their own data (scoped to
// this manager's own history in this project, same as the backend has
// always enforced) and manage their own collapse/delete state, so they can
// be dropped into both CheckRunner (right after running a check) and
// ProjectView (as soon as you open a project folder) without the parent
// screen needing to know anything about history. `refreshSignal` — bump it
// (any changing number) to make either list re-fetch, e.g. right after a
// new check finishes running.

export function SingleCheckHistoryList({
  manager,
  project,
  refreshSignal,
}: {
  manager: Manager;
  project: Project;
  refreshSignal?: number;
}) {
  const [history, setHistory] = useState<SingleCheckHistoryEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    singleCheckHistory(project.id, manager.id).then(setHistory).catch(() => {});
  }, [project.id, manager.id, refreshSignal]);

  async function handleDelete(e: MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Удалить эту проверку из истории? Отменить будет нельзя.")) return;
    setDeletingId(id);
    setError("");
    try {
      await deleteSingleCheck(project.id, id, manager.id);
      setHistory(prev => prev.filter(h => h.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch {
      setError("Не удалось удалить эту проверку.");
    } finally {
      setDeletingId(null);
    }
  }

  if (history.length === 0) return null;

  return (
    <div className="history">
      <div className="history-header" onClick={() => setCollapsed(c => !c)}>
        <h2>История точечных проверок ({history.length})</h2>
        <span className="collapse-toggle">{collapsed ? "▸ Показать" : "▾ Скрыть"}</span>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!collapsed && history.map(h => {
        const isOpen = expandedId === h.id;
        return (
          <div key={h.id} className="history-entry-wrap">
            <div className="history-row-wrap">
              <button
                type="button"
                className="history-row"
                onClick={() => setExpandedId(isOpen ? null : h.id)}
              >
                {new Date(h.created_at).toLocaleString("ru-RU")}
                {h.performed_by_name ? ` — ${h.performed_by_name}` : ""}
                {" — "}{flagForLang(h.source_lang)}→{flagForLang(h.target_lang)} {h.target_lang}
                {" — "}{h.findings.length === 0 ? "без проблем" : `${h.findings.length} найдено`}
                {" — "}{formatCostRu(h.cost_usd)}
              </button>
              <button
                type="button"
                className="history-delete-button"
                title="Удалить эту проверку"
                disabled={deletingId === h.id}
                onClick={e => handleDelete(e, h.id)}
              >
                ✕
              </button>
            </div>
            {isOpen && (
              <div className="history-entry-detail">
                <div className="history-pair">
                  <div><strong>Источник:</strong> {h.source}</div>
                  <div><strong>Перевод:</strong> {h.translation}</div>
                </div>
                {h.findings.map((f, i) => (
                  <div key={i} className={`finding finding-${f.severity}`}>
                    <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                    <span className="finding-type">{TYPE_LABEL[f.type] || f.type}</span>
                    <div className="finding-message">{f.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MultiCheckHistoryList({
  manager,
  project,
  refreshSignal,
  onOpen,
  onDeleted,
  autoPoll = true,
}: {
  manager: Manager;
  project: Project;
  refreshSignal?: number;
  // A completed entry opens its report on its own page (see handleOpen
  // below) without ever calling this. This is only reached for a
  // still-processing entry (or if the report tab genuinely couldn't be
  // opened) — it tells the parent which check id to open on the check-runner
  // screen instead (CheckRunner shows it inline; ProjectView navigates to
  // the check screen with it), so its progress bar is still reachable.
  onOpen: (id: number) => void;
  // Called after a successful delete — lets CheckRunner clear its own
  // results panel if the deleted entry is the one currently shown there.
  onDeleted?: (id: number) => void;
  // CheckRunner already polls the one actively-open result itself, so it
  // passes false here to avoid this list ALSO polling the whole history
  // (and, server-side, re-checking every processing batch) every 20s at
  // the same time. ProjectView has no such poll of its own, so it keeps
  // the default — that's the only place a still-processing entry gets its
  // percentage updated live without the manager opening it.
  autoPoll?: boolean;
}) {
  const [history, setHistory] = useState<MultiCheckHistoryEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    multiCheckHistory(project.id, manager.id).then(setHistory).catch(() => {});
  }, [project.id, manager.id, refreshSignal]);

  // While anything here is still processing, keep quietly re-fetching so
  // the percentage moves along on its own — same idea as CheckRunner's own
  // per-check poll, just for the whole list at once.
  useEffect(() => {
    if (!autoPoll || !history.some(h => h.status === "processing")) return;
    const timer = setInterval(() => {
      multiCheckHistory(project.id, manager.id).then(setHistory).catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [autoPoll, history, project.id, manager.id]);

  // Deleting a still-processing entry doubles as cancelling it (the backend
  // tells Anthropic to stop working on it) — Александр asked for a way to
  // stop a check that's taking too long, or that he just changed his mind
  // about. The confirmation wording says "отменить" for those, since
  // "удалить" would read as if there were already a finished report to
  // lose, when there isn't yet.
  async function handleDelete(e: MouseEvent, h: MultiCheckHistoryEntry) {
    e.stopPropagation();
    const confirmMsg = h.status === "processing"
      ? "Отменить эту проверку? Она ещё обрабатывается — отмена остановит её и уберёт из истории. Отменить это действие будет нельзя."
      : "Удалить эту проверку из истории? Отменить будет нельзя.";
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(h.id);
    setError("");
    try {
      await deleteMultiCheck(project.id, h.id, manager.id);
      setHistory(prev => prev.filter(x => x.id !== h.id));
      onDeleted?.(h.id);
    } catch {
      setError(h.status === "processing" ? "Не удалось отменить эту проверку." : "Не удалось удалить эту проверку.");
    } finally {
      setDeletingId(null);
    }
  }

  // A finished report opens on its own page (Александр's ask: reports
  // shouldn't replace whatever's on the current check screen) — the tab is
  // opened synchronously so it isn't blocked as a popup, then filled in once
  // the detail fetch resolves. A still-processing entry has no report to
  // show yet, so that case keeps the old behavior (opens inline / navigates
  // to the check screen, wherever this list lives) so its progress bar is
  // still reachable. If the tab genuinely couldn't be opened (a strict
  // popup blocker), fall back to that same inline behavior too.
  async function handleOpen(h: MultiCheckHistoryEntry) {
    if (h.status !== "completed") {
      onOpen(h.id);
      return;
    }
    const opened = await openReportInNewTab(() => multiCheckDetail(project.id, h.id, manager.id));
    if (!opened) onOpen(h.id);
  }

  if (history.length === 0) return null;

  return (
    <div className="history">
      <div className="history-header" onClick={() => setCollapsed(c => !c)}>
        <h2>История загрузок документов ({history.length})</h2>
        <span className="collapse-toggle">{collapsed ? "▸ Показать" : "▾ Скрыть"}</span>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!collapsed && history.map(h => (
        <div key={h.id} className="history-row-wrap">
          <button
            className={`history-row ${h.status === "processing" ? "history-row-processing" : ""}`}
            onClick={() => handleOpen(h)}
          >
            {new Date(h.created_at).toLocaleString("ru-RU")}
            {h.performed_by_name ? ` — ${h.performed_by_name}` : ""}
            {" — "}{h.filename}
            {" — "}
            {h.status === "processing"
              ? (h.progress && h.progress.total > 0 && h.progress.done > 0
                  ? `обрабатывается — ${Math.round((h.progress.done / h.progress.total) * 100)}%`
                  // Anthropic's own counts haven't moved yet — show real
                  // elapsed waiting time instead of a static "0%"/"ещё
                  // обрабатывается…" that never seems to change.
                  : `в очереди — ${formatElapsedMinutesRu(Math.max(0, Math.floor((Date.now() - Date.parse(h.created_at)) / 60000)))}`)
              : `${h.summary.total_findings ?? 0} проблем — ${formatCostRu(h.cost_usd)}`}
          </button>
          <button
            type="button"
            className="history-delete-button"
            title={h.status === "processing" ? "Отменить эту проверку" : "Удалить эту проверку"}
            disabled={deletingId === h.id}
            onClick={e => handleDelete(e, h)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

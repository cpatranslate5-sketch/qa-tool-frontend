import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { deleteMultiCheck, deleteSingleCheck, multiCheckDetail, multiCheckHistory, singleCheckHistory } from "./api";
import { flagForLang, formatCostRu, formatDurationRu, formatElapsedMinutesRu, realFindingCount, registerSummarySegments, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
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

// A register_summary finding's message rendered as colored segments (see
// lang.ts's registerSummarySegments — «вы»/«ты» colorized, and an
// exception's actual text highlighted red instead of just its row number,
// per Александр's ask, 2026-09-17). Shared by both lists' inline finding
// rendering below.
function RegisterSummaryLine({ message, register_majority, register_exceptions, register_exception_labels }: {
  message: string;
  register_majority?: "formal" | "informal" | null;
  register_exceptions?: { label: string | number; text: string }[] | null;
  register_exception_labels?: (string | number)[] | null;
}) {
  const segments = registerSummarySegments({
    type: "register_summary",
    severity: "low",
    message,
    register_majority,
    register_exceptions,
    register_exception_labels,
  });
  return (
    <div className="finding finding-info">
      {segments.map((seg, i) => (
        <span key={i} style={seg.color ? { color: seg.color, fontWeight: 600 } : undefined}>{seg.text}</span>
      ))}
    </div>
  );
}

// Both delete-confirmation dialogs below (single entry, and "Удалить все")
// used to be a raw window.confirm() — Александр accidentally hit Chrome's
// own "prevent this page from creating additional dialogs" checkbox that
// browsers offer after a page pops several confirm()s in a row, which
// silently makes EVERY later confirm() on that page auto-return false with
// no dialog shown at all — that's why deleting appeared to just stop
// working with no error. A plain in-app modal (mirroring ProjectView's
// existing delete-project modal) has no such browser-level opt-out button
// to accidentally hit, and also happens to satisfy Александр's explicit
// ask ("подтверждение... но без кнопки 'Больше не спрашивать'") since it
// simply has no such button at all.
function ConfirmModal({ title, body, confirmLabel, busy, onConfirm, onCancel }: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="muted small">{body}</p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Отмена</button>
          <button type="button" onClick={onConfirm} disabled={busy}>{busy ? "Удаляю…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

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
  // What the confirmation modal is currently asking about — a single entry
  // by id, "all" for the bulk "Удалить все" action, or null when the modal
  // is closed. Only one modal can be open at a time for this list.
  const [confirmTarget, setConfirmTarget] = useState<number | "all" | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    singleCheckHistory(project.id, manager.id).then(setHistory).catch(() => {});
  }, [project.id, manager.id, refreshSignal]);

  async function performDelete(id: number) {
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
      setConfirmTarget(null);
    }
  }

  // Deletes every entry currently in the list, one at a time — there's no
  // dedicated bulk-delete endpoint on the backend, so this just calls the
  // same per-entry delete Александр already had, in a loop (a manager's own
  // history is never huge enough for this to matter).
  async function performDeleteAll() {
    setBulkDeleting(true);
    setError("");
    const ids = history.map(h => h.id);
    const succeeded: number[] = [];
    for (const id of ids) {
      try {
        await deleteSingleCheck(project.id, id, manager.id);
        succeeded.push(id);
      } catch {
        /* left in the list below — still exists on the backend */
      }
    }
    setHistory(prev => prev.filter(h => !succeeded.includes(h.id)));
    setExpandedId(null);
    const failed = ids.length - succeeded.length;
    if (failed > 0) setError(`Не удалось удалить ${failed} из ${ids.length} проверок.`);
    setBulkDeleting(false);
    setConfirmTarget(null);
  }

  function handleDeleteClick(e: MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    setConfirmTarget(id);
  }

  if (history.length === 0) return null;

  return (
    <div className="history">
      <div className="history-header" onClick={() => setCollapsed(c => !c)}>
        <h2>История точечных проверок ({history.length})</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            className="link-button danger-link"
            onClick={e => { e.stopPropagation(); setConfirmTarget("all"); }}
          >
            Удалить все
          </button>
          <span className="collapse-toggle">{collapsed ? "▸ Показать" : "▾ Скрыть"}</span>
        </div>
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
                {" — "}{realFindingCount(h.findings) === 0 ? "без проблем" : `${realFindingCount(h.findings)} найдено`}
                {" — "}{formatCostRu(h.cost_usd)}
              </button>
              <button
                type="button"
                className="history-delete-button"
                title="Удалить эту проверку"
                disabled={deletingId === h.id}
                onClick={e => handleDeleteClick(e, h.id)}
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
                  f.type === "register_summary" ? (
                    <RegisterSummaryLine
                      key={i}
                      message={f.message}
                      register_majority={f.register_majority}
                      register_exceptions={f.register_exceptions}
                      register_exception_labels={f.register_exception_labels}
                    />
                  ) : (
                    <div key={i} className={`finding finding-${f.severity}`}>
                      <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                      <span className="finding-type">{TYPE_LABEL[f.type] || f.type}</span>
                      <div className="finding-message">{f.message}</div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        );
      })}
      {confirmTarget !== null && confirmTarget !== "all" && (
        <ConfirmModal
          title="Удалить эту проверку?"
          body="Она будет удалена из истории. Отменить будет нельзя."
          confirmLabel="Удалить"
          busy={deletingId === confirmTarget}
          onConfirm={() => performDelete(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {confirmTarget === "all" && (
        <ConfirmModal
          title="Удалить всю историю точечных проверок?"
          body={`Будет удалено ${history.length} проверок. Отменить будет нельзя.`}
          confirmLabel="Удалить все"
          busy={bulkDeleting}
          onConfirm={performDeleteAll}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
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
  // Same idea as SingleCheckHistoryList's confirmTarget — a single entry's
  // id, "all" for the bulk action, or null when no modal is open.
  const [confirmTarget, setConfirmTarget] = useState<number | "all" | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    multiCheckHistory(project.id, manager.id).then(setHistory).catch(() => {});
  }, [project.id, manager.id, refreshSignal]);

  // While anything here is still processing, or has finished but is still
  // waiting on its background Sonnet+GPT second opinion (see
  // types.ts's second_opinion_pending), keep quietly re-fetching so both
  // move along on their own — same idea as CheckRunner's own per-check
  // poll, just for the whole list at once. Opening a report always fetches
  // its own fresh detail anyway (see handleOpen below), so this is only
  // about keeping the list itself from looking stuck.
  useEffect(() => {
    if (!autoPoll || !history.some(h => h.status === "processing" || h.second_opinion_pending)) return;
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
  async function performDelete(h: MultiCheckHistoryEntry) {
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
      setConfirmTarget(null);
    }
  }

  // Same loop-over-existing-delete approach as SingleCheckHistoryList's
  // bulk action — also cancels whatever's still processing along the way,
  // same as deleting one of those individually already does.
  async function performDeleteAll() {
    setBulkDeleting(true);
    setError("");
    const ids = history.map(h => h.id);
    const succeeded: number[] = [];
    for (const h of history) {
      try {
        await deleteMultiCheck(project.id, h.id, manager.id);
        succeeded.push(h.id);
        onDeleted?.(h.id);
      } catch {
        /* left in the list below — still exists on the backend */
      }
    }
    setHistory(prev => prev.filter(h => !succeeded.includes(h.id)));
    const failed = ids.length - succeeded.length;
    if (failed > 0) setError(`Не удалось удалить/отменить ${failed} из ${ids.length} проверок.`);
    setBulkDeleting(false);
    setConfirmTarget(null);
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
    const opened = await openReportInNewTab(() => multiCheckDetail(project.id, h.id, manager.id), project.id, manager.id);
    if (!opened) onOpen(h.id);
  }

  if (history.length === 0) return null;

  const confirmEntry = typeof confirmTarget === "number" ? history.find(h => h.id === confirmTarget) : null;

  return (
    <div className="history">
      <div className="history-header" onClick={() => setCollapsed(c => !c)}>
        <h2>История загрузок документов ({history.length})</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            className="link-button danger-link"
            onClick={e => { e.stopPropagation(); setConfirmTarget("all"); }}
          >
            Удалить все
          </button>
          <span className="collapse-toggle">{collapsed ? "▸ Показать" : "▾ Скрыть"}</span>
        </div>
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
                  // обрабатывается…" that never seems to change. Says
                  // "прошло" (elapsed), not "осталось" (remaining) —
                  // Александр read an earlier, vaguer wording as a
                  // countdown to completion, which it never was (Anthropic
                  // doesn't give us that number at all). Appends a rough,
                  // learned-from-history ETA when one's available, so the
                  // elapsed number has something to compare against.
                  : `обрабатывается — прошло ${formatElapsedMinutesRu(Math.max(0, Math.floor((Date.now() - Date.parse(h.created_at)) / 60000)))}`
                    + (h.estimated_minutes ? ` (обычно ~${h.estimated_minutes} мин)` : ""))
              : `${h.summary.total_findings ?? 0} проблем — ${formatCostRu(h.cost_usd)}`
                + (formatDurationRu(h.created_at, h.completed_at) ? ` — заняла ${formatDurationRu(h.created_at, h.completed_at)}` : "")}
          </button>
          <button
            type="button"
            className="history-delete-button"
            title={h.status === "processing" ? "Отменить эту проверку" : "Удалить эту проверку"}
            disabled={deletingId === h.id}
            onClick={e => { e.stopPropagation(); setConfirmTarget(h.id); }}
          >
            ✕
          </button>
        </div>
      ))}
      {confirmEntry && (
        <ConfirmModal
          title={confirmEntry.status === "processing" ? "Отменить эту проверку?" : "Удалить эту проверку?"}
          body={
            confirmEntry.status === "processing"
              ? "Она ещё обрабатывается — отмена остановит её и уберёт из истории. Отменить это действие будет нельзя."
              : "Она будет удалена из истории. Отменить будет нельзя."
          }
          confirmLabel={confirmEntry.status === "processing" ? "Отменить" : "Удалить"}
          busy={deletingId === confirmEntry.id}
          onConfirm={() => performDelete(confirmEntry)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {confirmTarget === "all" && (
        <ConfirmModal
          title="Удалить всю историю загрузок?"
          body={`Будет удалено (и отменено, если что-то ещё обрабатывается) ${history.length} загрузок. Отменить будет нельзя.`}
          confirmLabel="Удалить все"
          busy={bulkDeleting}
          onConfirm={performDeleteAll}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { learnItem, learningItems, reviewItem, setItemStatus, type AiReview, type LearningItem } from "./api";
import TagText from "./TagText";
import { ScopeChooser } from "./LearningScope";
import type { Manager } from "./types";

// «Разбор комментариев» (2026-10-05, Александр): every «Не актуально» from a
// translator gets a second opinion from the model that checks this language —
// who is right, how sure, why (in plain Russian), a draft lesson for the
// platform and, when the finding stands, a reply for the translator. The
// admin edits and decides; nothing is learned without «Запомнить».

const VERDICT: Record<AiReview["verdict"], { label: string; cls: string }> = {
  translator_right: { label: "Переводчик прав — замечание ошибочное", cls: "ok" },
  partly: { label: "Переводчик прав частично", cls: "warn" },
  translator_wrong: { label: "Переводчик ошибается — замечание верное", cls: "bad" },
  unclear: { label: "Модель не уверена", cls: "muted" },
};

type Filter = "all" | "todo" | "translator_right" | "partly" | "translator_wrong" | "unclear";

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

function scopeFor(item: LearningItem, suggested?: string) {
  if (suggested === "project" && item.project_id) return "project";
  if (suggested === "client" && item.client_id) return "client";
  if (suggested === "all") return "all";
  return item.project_id ? "project" : "all";
}

function ReviewCard({
  item, manager, busyExternal, onReviewed, onDone, onOpenReport,
}: {
  item: LearningItem;
  manager: Manager;
  busyExternal: boolean;
  onReviewed: (it: LearningItem) => void;
  onDone: (id: number) => void;
  onOpenReport: (projectId: number, multiCheckId: number) => void;
}) {
  const r = item.ai_review;
  const [text, setText] = useState(r?.lesson || item.translator_comment || "");
  const [touched, setTouched] = useState(false);
  const [scope, setScope] = useState(scopeFor(item, r?.suggested_scope));
  const [langScope, setLangScope] = useState("lang");
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [langKeys, setLangKeys] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(item.admin_note || "");
  const [noteOpen, setNoteOpen] = useState(false);

  // A fresh opinion fills the draft — unless the admin has already typed something.
  useEffect(() => {
    if (!r || touched) return;
    setText(r.lesson || item.translator_comment || "");
    setScope(scopeFor(item, r.suggested_scope));
  }, [r?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(force: boolean, withNote?: string) {
    setThinking(true);
    setError("");
    try {
      const res = await reviewItem(item.id, manager.id, force, withNote);
      if (withNote !== undefined) { setTouched(false); setNoteOpen(false); }
      onReviewed(res.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось.");
    } finally {
      setThinking(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onDone(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось.");
      setBusy(false);
    }
  }

  function copyReply() {
    if (!r?.translator_reply) return;
    navigator.clipboard?.writeText(r.translator_reply).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  const v = r ? VERDICT[r.verdict] || VERDICT.unclear : null;
  const wrong = r?.verdict === "translator_wrong";

  return (
    <div className="multi-row lr-card">
      <div className="lr-head">
        {item.status === "postponed" && <span className="lr-origin okk">Отложено</span>}
        <span className="muted small">
          {[item.client_name, item.project_name, item.lang_label, item.filename, item.excel_row ? `строка ${item.excel_row}` : ""].filter(Boolean).join(" · ")}
          {item.created_at ? ` · ${fmt(item.created_at)}` : ""}
        </span>
        {item.project_id && (
          <button type="button" className="link-button" onClick={() => onOpenReport(item.project_id as number, item.multi_check_id)}>
            Открыть отчёт →
          </button>
        )}
      </div>
      {item.context && <div className="muted small">Контекст: {item.context}</div>}
      <div className="history-pair">
        <div><strong>Источник:</strong> <TagText text={item.source} /></div>
        <div><strong>Перевод:</strong> <TagText text={item.translation} /></div>
      </div>
      <div className="small lr-line"><strong>Замечание платформы:</strong> <TagText text={item.finding_message} /></div>
      <div className="small lr-line">
        <strong>Комментарий переводчика:</strong>{" "}
        {item.translator_comment ? item.translator_comment : <span className="muted">нет — модель оценит сама</span>}
      </div>

      <div className="small lr-line">
        {!noteOpen && item.admin_note && (
          <>
            <strong>Моё пояснение:</strong> {item.admin_note}{" "}
            <button type="button" className="link-button" onClick={() => setNoteOpen(true)}>изменить</button>
          </>
        )}
        {!noteOpen && !item.admin_note && (
          <button type="button" className="link-button" onClick={() => setNoteOpen(true)}>+ Добавить пояснение от себя</button>
        )}
        {noteOpen && (
          <div className="cr-note">
            <label className="sg-k">Моё пояснение — модель примет это как проверенный факт</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Например: «بونصات» — так называется раздел Bonuses на сайте 1win, название менять нельзя." />
            <div className="sg-actions">
              <button type="button" disabled={thinking || busyExternal || note.trim() === (item.admin_note || "").trim()}
                onClick={() => ask(true, note)}>
                Сохранить и разобрать с пояснением
              </button>
              <button type="button" className="secondary" onClick={() => { setNote(item.admin_note || ""); setNoteOpen(false); }}>Отмена</button>
            </div>
          </div>
        )}
      </div>

      <div className="cr-ai">
        {!r && !thinking && (
          <button type="button" className="secondary" disabled={busyExternal} onClick={() => ask(false)}>
            🔍 Спросить мнение модели
          </button>
        )}
        {thinking && <div className="muted small">Модель разбирает замечание…</div>}
        {r && v && !thinking && (
          <>
            <div className="cr-verdict-row">
              <span className={`cr-verdict ${v.cls}`}>{v.label}</span>
              <span className="muted small">уверенность {r.confidence}%</span>
            </div>
            {r.reasoning && <div className="small cr-reason">{r.reasoning}</div>}
            {r.translator_reply && (
              <div className="small cr-reply">
                <strong>Ответ переводчику:</strong> {r.translator_reply}{" "}
                <button type="button" className="link-button" onClick={copyReply}>{copied ? "скопировано ✓" : "копировать"}</button>
              </div>
            )}
            <div className="muted small cr-meta">
              {r.model} · ${r.cost_usd.toFixed(3)} · {fmt(r.at)} ·{" "}
              <button type="button" className="link-button" disabled={busyExternal} onClick={() => ask(true)}>разобрать заново</button>
            </div>
          </>
        )}
      </div>

      <div className="lr-form">
        <label className="sg-k">
          Суть для платформы (так модель это и прочитает){r?.lesson && !touched ? " — черновик модели, поправьте при необходимости" : ""}
        </label>
        <textarea rows={3} value={text} onChange={e => { setText(e.target.value); setTouched(true); }}
          placeholder={wrong ? "Модель считает замечание верным — урок, скорее всего, не нужен." : "Например: в узбекском hisoblandi значит «начислено», а не «подсчитано» — это не ошибка."} />
        <ScopeChooser item={item} scope={scope} setScope={setScope} langScope={langScope} setLangScope={setLangScope}
          projectIds={projectIds} setProjectIds={setProjectIds}
          langKeys={langKeys} setLangKeys={setLangKeys} presetLangKey={item.lang_key} />
        {error && <div className="error-box">{error}</div>}
        <div className="sg-actions">
          <button type="button" className={wrong ? "secondary" : ""} disabled={busy || !text.trim() || (scope === "projects" && projectIds.length === 0) || (langScope === "langs" && langKeys.length === 0)}
            onClick={() => act(() => learnItem(item.id, manager.id, text, scope, langScope, projectIds, langKeys))}>
            Запомнить
          </button>
          {item.status === "new" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => act(() => setItemStatus(item.id, manager.id, "postponed"))}>
              Отложить
            </button>
          )}
          <button type="button" className={wrong ? "" : "secondary"} disabled={busy} onClick={() => act(() => setItemStatus(item.id, manager.id, "dismissed"))}>
            Не запоминать
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommentReview({
  manager, langFilter, onLangs, onOpenReport, onCountsChanged,
}: {
  manager: Manager;
  langFilter: string;
  onLangs: (langs: string[]) => void;
  onOpenReport: (projectId: number, multiCheckId: number) => void;
  onCountsChanged: () => void;
}) {
  const [items, setItems] = useState<LearningItem[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  const keyOf = (it: LearningItem) => (it.lang_key || it.lang_code || "").toLowerCase();

  function load() {
    setError("");
    Promise.all([learningItems(manager.id, "new"), learningItems(manager.id, "postponed")])
      .then(([a, b]) => {
        const list = [...a.items, ...b.items].filter(it => it.origin === "translator");
        setItems(list);
        onLangs(Array.from(new Set(list.map(keyOf).filter(Boolean))));
      })
      .catch(() => setError("Не удалось загрузить."));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function replace(upd: LearningItem) {
    setItems(prev => (prev || []).map(x => (x.id === upd.id ? upd : x)));
  }

  function remove(id: number) {
    setItems(prev => (prev || []).filter(x => x.id !== id));
    onCountsChanged();
  }

  const inLang = (items || []).filter(it => !langFilter || keyOf(it) === langFilter);
  const todo = inLang.filter(it => !it.ai_review);
  const shown = inLang.filter(it =>
    filter === "all" ? true : filter === "todo" ? !it.ai_review : it.ai_review?.verdict === filter,
  );
  const countOf = (f: Filter) =>
    f === "all" ? inLang.length : f === "todo" ? todo.length : inLang.filter(it => it.ai_review?.verdict === f).length;

  async function reviewAll() {
    const queue = todo.slice();
    stopRef.current = false;
    setBulk({ done: 0, total: queue.length });
    let failed = 0;
    for (let i = 0; i < queue.length; i++) {
      if (stopRef.current) break;
      try {
        const res = await reviewItem(queue[i].id, manager.id, false);
        replace(res.item);
      } catch {
        failed += 1;
      }
      setBulk({ done: i + 1, total: queue.length });
    }
    setBulk(null);
    if (failed) setError(`Не удалось разобрать ${failed} шт. — можно повторить кнопкой на карточке.`);
  }

  const FILTERS: [Filter, string][] = [
    ["all", "Все"],
    ["todo", "Без разбора"],
    ["translator_right", "Переводчик прав"],
    ["partly", "Частично"],
    ["translator_wrong", "Переводчик ошибается"],
    ["unclear", "Модель не уверена"],
  ];

  return (
    <div>
      <p className="muted small sg-intro">
        Здесь все «Не актуально» от переводчиков, которые вы ещё не обработали. По каждому можно спросить мнение
        модели, закреплённой за этим языком: она скажет, кто прав, объяснит по-русски, предложит текст урока и, если
        прав не переводчик, ответ для него. Решение и формулировка — за вами.
      </p>
      <div className="inline-form cr-toolbar">
        {bulk ? (
          <>
            <span className="small">Разбираю {bulk.done} из {bulk.total}…</span>
            <button type="button" className="link-button" onClick={() => { stopRef.current = true; }}>остановить</button>
          </>
        ) : (
          <button type="button" disabled={todo.length === 0} onClick={reviewAll}>
            Разобрать все без разбора ({todo.length})
          </button>
        )}
      </div>
      <div className="sg-tabs">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className={`sg-tab${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
            {label} ({countOf(f)})
          </button>
        ))}
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="lr-list">
        {items === null && <div className="muted">Загрузка…</div>}
        {items !== null && shown.length === 0 && <div className="muted">Здесь пусто.</div>}
        {shown.map(it => (
          <ReviewCard key={it.id} item={it} manager={manager} busyExternal={!!bulk}
            onReviewed={replace} onDone={remove} onOpenReport={onOpenReport} />
        ))}
      </div>
    </div>
  );
}

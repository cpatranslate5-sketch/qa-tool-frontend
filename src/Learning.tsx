import { useEffect, useState } from "react";
import {
  learnItem,
  learningItems,
  listLessons,
  setItemStatus,
  updateLesson,
  type LearningItem,
  type Lesson,
} from "./api";
import TagText from "./TagText";
import { langLabel } from "./lang";
import type { Manager } from "./types";

// «Обучение платформы» (2026-10-04, Александр): the only place where the
// platform learns anything. Candidates come from the head of QA («Убрать» +
// «📚 На обучение» on the report page) and from translators («Не актуально»,
// with or without a comment). The admin writes the gist for the platform and
// chooses where it applies; every verified lesson keeps its full history.

type Tab = "new" | "postponed" | "learned" | "dismissed" | "lessons";

const ACTION_LABEL: Record<string, string> = {
  created: "создан",
  edited: "изменён",
  disabled: "выключен",
  enabled: "включён",
  deleted: "удалён",
  restored: "восстановлен",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

function ScopeChooser({
  item, scope, setScope, langScope, setLangScope,
}: {
  item: { project_name: string; client_name?: string; client_id: number | null; project_id: number | null; lang_label: string };
  scope: string;
  setScope: (v: string) => void;
  langScope: string;
  setLangScope: (v: string) => void;
}) {
  return (
    <div className="lr-scope">
      <div>
        <div className="sg-k">Где действует</div>
        <label className="sg-check"><input type="radio" checked={scope === "project"} disabled={!item.project_id} onChange={() => setScope("project")} /> Только проект «{item.project_name || "—"}»</label>
        <label className="sg-check"><input type="radio" checked={scope === "client"} disabled={!item.client_id} onChange={() => setScope("client")} /> Все проекты заказчика{item.client_name ? ` «${item.client_name}»` : ""}</label>
        <label className="sg-check"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Все проекты</label>
      </div>
      <div>
        <div className="sg-k">Язык</div>
        <label className="sg-check"><input type="radio" checked={langScope === "lang"} onChange={() => setLangScope("lang")} /> Только {item.lang_label}</label>
        <label className="sg-check"><input type="radio" checked={langScope === "all"} onChange={() => setLangScope("all")} /> Все языки</label>
      </div>
    </div>
  );
}

function ItemCard({
  item, manager, onChanged, onOpenReport,
}: {
  item: LearningItem;
  manager: Manager;
  onChanged: () => void;
  onOpenReport: (projectId: number, multiCheckId: number) => void;
}) {
  const [text, setText] = useState(item.okk_note || item.translator_comment || "");
  const [scope, setScope] = useState(item.project_id ? "project" : "all");
  const [langScope, setLangScope] = useState("lang");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = item.status === "new" || item.status === "postponed";

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="multi-row lr-card">
      <div className="lr-head">
        <span className={`lr-origin ${item.origin}`}>{item.origin === "okk" ? "Убрано ОКК" : "Переводчик: «Не актуально»"}</span>
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
      {item.origin === "translator" && (
        <div className="small lr-line">
          <strong>Комментарий переводчика:</strong>{" "}
          {item.translator_comment ? item.translator_comment : <span className="muted">нет — при необходимости уточните у переводчика</span>}
        </div>
      )}
      {item.okk_note && <div className="small lr-line"><strong>Причина ОКК:</strong> {item.okk_note}</div>}

      {open && (
        <div className="lr-form">
          <label className="sg-k">Суть для платформы (так модель это и прочитает)</label>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Например: в узбекском hisoblandi значит «начислено», а не «подсчитано» — это не ошибка." />
          <ScopeChooser item={item} scope={scope} setScope={setScope} langScope={langScope} setLangScope={setLangScope} />
          {error && <div className="error-box">{error}</div>}
          <div className="sg-actions">
            <button type="button" disabled={busy || !text.trim()} onClick={() => act(() => learnItem(item.id, manager.id, text, scope, langScope))}>
              Запомнить
            </button>
            {item.status === "new" && (
              <button type="button" className="secondary" disabled={busy} onClick={() => act(() => setItemStatus(item.id, manager.id, "postponed"))}>
                Отложить
              </button>
            )}
            <button type="button" className="secondary" disabled={busy} onClick={() => act(() => setItemStatus(item.id, manager.id, "dismissed"))}>
              Не запоминать
            </button>
          </div>
        </div>
      )}
      {item.status === "dismissed" && (
        <div className="sg-actions">
          <span className="muted small">Не запоминать · {item.resolved_by_name} {fmt(item.resolved_at)}</span>
          <button type="button" className="link-button" disabled={busy} onClick={() => act(() => setItemStatus(item.id, manager.id, "new"))}>Вернуть в новые</button>
        </div>
      )}
      {item.status === "learned" && (
        <div className="muted small lr-line">Запомнено · {item.resolved_by_name} {fmt(item.resolved_at)} — урок №{item.lesson_id} во вкладке «Уроки»</div>
      )}
    </div>
  );
}

function LessonCard({ lesson, manager, onChanged }: { lesson: Lesson; manager: Manager; onChanged: (l: Lesson) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  const [scope, setScope] = useState(lesson.project_id ? "project" : lesson.client_id ? "client" : "all");
  const [langScope, setLangScope] = useState(lesson.lang_key ? "lang" : "all");
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ex = lesson.example || {};

  async function patch(p: { text?: string; scope?: string; lang_scope?: string; status?: string }) {
    setBusy(true);
    setError("");
    try {
      const upd = await updateLesson(lesson.id, manager.id, p);
      onChanged(upd);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`multi-row lr-card${lesson.status !== "active" ? " fb-off" : ""}`}>
      <div className="lr-head">
        <strong>Урок №{lesson.id}</strong>
        <span className="muted small">
          {lesson.scope_label} · применялся в {lesson.used_count} провер. · {lesson.created_by_name} {fmt(lesson.created_at)}
          {lesson.status === "disabled" ? " · выключен" : lesson.status === "deleted" ? " · удалён" : ""}
        </span>
      </div>
      {!editing ? (
        <div className="lr-text">{lesson.text}</div>
      ) : (
        <div className="lr-form">
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} />
          <ScopeChooser
            item={{ project_name: ex.project_name || "", client_id: 1, project_id: 1, lang_label: lesson.lang_label || ex.lang_code || "этот язык" }}
            scope={scope} setScope={setScope} langScope={langScope} setLangScope={setLangScope}
          />
        </div>
      )}
      {ex.finding_message && (
        <div className="muted small lr-line">
          Откуда: замечание «{ex.finding_message}» к переводу «{ex.translation}»{ex.project_name ? ` (${ex.project_name}, ${ex.lang_code})` : ""}
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
      <div className="sg-actions">
        {!editing && lesson.status !== "deleted" && <button type="button" className="link-button" onClick={() => setEditing(true)}>Изменить / дополнить</button>}
        {editing && (
          <>
            <button type="button" disabled={busy || !text.trim()} onClick={() => patch({ text, scope, lang_scope: langScope })}>Сохранить</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(false); setText(lesson.text); }}>Отмена</button>
          </>
        )}
        {lesson.status === "active" && <button type="button" className="link-button" disabled={busy} onClick={() => patch({ status: "disabled" })}>Выключить</button>}
        {lesson.status === "disabled" && <button type="button" className="link-button" disabled={busy} onClick={() => patch({ status: "active" })}>Включить</button>}
        {lesson.status !== "deleted" && (
          <button type="button" className="link-button danger-link" disabled={busy}
            onClick={() => { if (window.confirm("Удалить урок? Он останется в истории, и его можно будет восстановить.")) patch({ status: "deleted" }); }}>
            Удалить
          </button>
        )}
        {lesson.status === "deleted" && <button type="button" className="link-button" disabled={busy} onClick={() => patch({ status: "active" })}>Восстановить</button>}
        <button type="button" className="link-button" onClick={() => setShowHistory(v => !v)}>
          {showHistory ? "Скрыть историю" : `История (${lesson.history.length})`}
        </button>
      </div>
      {showHistory && (
        <div className="lr-history">
          {lesson.history.map((h, i) => (
            <div key={i} className="sg-hist-row">
              <span>{fmt(h.created_at)} · {h.by_name} · {ACTION_LABEL[h.action] || h.action}{h.snapshot ? ` · «${h.snapshot.text}»` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Learning({
  manager, onBack, onOpenReport,
}: {
  manager: Manager;
  onBack: () => void;
  onOpenReport: (projectId: number, multiCheckId: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [items, setItems] = useState<LearningItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonFilter, setLessonFilter] = useState<"active" | "disabled" | "deleted">("active");
  const [error, setError] = useState("");
  // Language filter (2026-10-04, Александр): "" = all languages. Kept across
  // tabs; a lesson for «все языки» is shown under every language too.
  const [langFilter, setLangFilter] = useState("");

  function load(t: Tab = tab) {
    setError("");
    if (t === "lessons") {
      listLessons(manager.id).then(r => setLessons(r.lessons)).catch(() => setError("Не удалось загрузить уроки."));
      learningItems(manager.id, "new").then(r => setCounts(r.counts)).catch(() => {});
    } else {
      setItems(null);
      learningItems(manager.id, t).then(r => { setItems(r.items); setCounts(r.counts); }).catch(() => setError("Не удалось загрузить."));
    }
  }

  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!manager.is_admin) {
    return (
      <div className="page">
        <div className="top-bar"><h1>Обучение платформы</h1><button className="link-button" onClick={onBack}>← Назад</button></div>
        <p className="muted">Этот раздел доступен только админской папке.</p>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["new", `Новые${counts.new ? ` (${counts.new})` : ""}`],
    ["postponed", `Отложенные${counts.postponed ? ` (${counts.postponed})` : ""}`],
    ["learned", "Запомнено"],
    ["dismissed", "Не запоминать"],
    ["lessons", "Уроки"],
  ];
  const itemKey = (it: LearningItem) => (it.lang_key || it.lang_code || "").toLowerCase();
  const langsHere = Array.from(new Set(
    tab === "lessons"
      ? (lessons || []).map(l => (l.lang_key || "").toLowerCase()).filter(Boolean)
      : (items || []).map(itemKey).filter(Boolean),
  ));
  if (langFilter && !langsHere.includes(langFilter)) langsHere.push(langFilter);
  langsHere.sort();
  const shownItems = (items || []).filter(it => !langFilter || itemKey(it) === langFilter);
  const lessonsInLang = (lessons || []).filter(l => !langFilter || !l.lang_key || l.lang_key.toLowerCase() === langFilter);
  const shownLessons = lessonsInLang.filter(l => l.status === lessonFilter);

  return (
    <div className="page sg-page">
      <div className="top-bar">
        <h1>Обучение платформы</h1>
        <button className="link-button" onClick={onBack}>← Назад</button>
      </div>
      <p className="muted small sg-intro">
        Платформа запоминает только то, что вы утвердили здесь. Сюда попадают замечания, которые вы убрали в отчёте
        с отметкой «📚 На обучение», и все замечания, которые переводчики отметили «Не актуально». Утверждённые
        уроки учитываются в следующих проверках там, где вы указали.
      </p>
      <div className="sg-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={`sg-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {label}
            {k === "new" && counts.new ? <span className="red-badge">{counts.new}</span> : null}
          </button>
        ))}
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="inline-form lr-langfilter">
        <label className="muted small">Язык:</label>
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)}>
          <option value="">Все языки</option>
          {langsHere.map(k => <option key={k} value={k}>{langLabel(k)}</option>)}
        </select>
        {langFilter && <button type="button" className="link-button" onClick={() => setLangFilter("")}>сбросить</button>}
      </div>

      {tab !== "lessons" && (
        <div className="lr-list">
          {items === null && <div className="muted">Загрузка…</div>}
          {items !== null && shownItems.length === 0 && <div className="muted">{langFilter ? "По этому языку здесь пусто." : "Здесь пусто."}</div>}
          {shownItems.map(it => (
            <ItemCard key={it.id} item={it} manager={manager} onChanged={() => load()} onOpenReport={onOpenReport} />
          ))}
        </div>
      )}

      {tab === "lessons" && (
        <>
          <div className="sg-tabs">
            {(["active", "disabled", "deleted"] as const).map(f => (
              <button key={f} type="button" className={`sg-tab${lessonFilter === f ? " on" : ""}`} onClick={() => setLessonFilter(f)}>
                {f === "active" ? "Действуют" : f === "disabled" ? "Выключены" : "Удалены"} ({lessonsInLang.filter(l => l.status === f).length})
              </button>
            ))}
          </div>
          <div className="lr-list">
            {lessons === null && <div className="muted">Загрузка…</div>}
            {lessons !== null && shownLessons.length === 0 && <div className="muted">Здесь пусто.</div>}
            {shownLessons.map(l => (
              <LessonCard key={l.id} lesson={l} manager={manager} onChanged={upd => setLessons(prev => (prev || []).map(x => (x.id === upd.id ? upd : x)))} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

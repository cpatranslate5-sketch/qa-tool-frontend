import { useEffect, useMemo, useState } from "react";
import {
  getClientStyleguide,
  getProjectStyleguide,
  revertStyleguideChange,
  saveClientSection,
  saveProjectSection,
  styleguideMeta,
} from "./api";
import type { ClientStyleguide, Manager, ProjectStyleguide, SgChange, SgMeta, SgRules, SgValue } from "./types";

// Styleguide settings (2026-10-04, Александр): rules per language for a
// «Заказчик» (client) and its projects. A project shows every section «как у
// заказчика» (grey, read-only) until «Своё для проекта» is pressed — then only
// that section of that language is the project's own. Only the admin folder
// edits; every save is logged in «История изменений» with «Вернуть».

export type StyleguideScope =
  | { kind: "client"; id: number; name: string }
  | { kind: "project"; id: number; name: string };

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Обращение и стиль", keys: ["tone", "cta_buttons", "service_buttons", "capitalization"] },
  { title: "Пунктуация", keys: ["period_comma", "marks", "quotes", "hyphen", "tilde", "en_dash", "em_dash"] },
  { title: "Числа, термины и прочее", keys: ["ordinals", "versus", "number_sign", "fs_fb", "specific", "other"] },
  { title: "Проверяет алгоритм (бесплатно и точно)", keys: ["terms", "auto"] },
];

const AUTO_FLAGS: [string, string][] = [
  ["en_dash_forbidden", "Короткое тире «–» запрещено"],
  ["hyphen_forbidden", "Дефис «-» запрещён"],
  ["hyphen_as_dash", "Дефис « - » вместо тире между словами — ошибка"],
  ["ellipsis_char", "Только символ «…», не «...»"],
  ["arabic_punct", "Арабские знаки «،» и «؟»"],
  ["danda", "Данда «।» в конце предложения"],
  ["zh_latin_space", "Пробел между иероглифами и латиницей/цифрами"],
  ["es_opening_marks", "Испанские ¡…! и ¿…?"],
  ["fr_spaces", "Пробел перед : ; ! ? и внутри « »"],
  ["no_final_period", "Без точки в конце предложения"],
  ["no_period_after_currency", "Без точки после «грн» / «UAH»"],
  ["ordinals", "Окончания порядковых числительных (если написаны)"],
  ["fs_fb_latin", "Сокращения FS/FB только латиницей"],
  ["consistency", "Единообразие по файлу: кавычки, многоточие, тире в диапазонах"],
];

const LANG_KEY_STORAGE = "qa-sg-lang";

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function emptyValue(section: string, meta: SgMeta): SgValue {
  if (section === "tone") return { level: "", form: "", avoid: "", note: "" };
  if (section === "terms") return { items: [] };
  if (section === "auto") return { ...meta.auto_default };
  return { text: "" };
}

function summary(v: SgValue | null, section: string, meta: SgMeta | null, project = true): string {
  if (v == null) return project ? "как у заказчика" : "пусто";
  if (section === "tone") {
    const lvl = meta?.tone_levels[v.level || ""] || v.level || "не задано";
    return [lvl, v.form].filter(Boolean).join(", ");
  }
  if (section === "terms") return `${(v.items || []).length} терм.`;
  if (section === "auto") return "настройки алгоритма";
  const t = String(v.text || "");
  return t.length > 60 ? t.slice(0, 60) + "…" : t || "пусто";
}

function SectionEditor({
  section, value, meta, disabled, onChange,
}: {
  section: string;
  value: SgValue;
  meta: SgMeta;
  disabled: boolean;
  onChange: (v: SgValue) => void;
}) {
  if (section === "tone") {
    return (
      <div className="sg-fields">
        <label className="sg-row">
          <span className="sg-k">Тон</span>
          <select disabled={disabled} value={value.level || ""} onChange={e => onChange({ ...value, level: e.target.value })}>
            {Object.entries(meta.tone_levels).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="sg-row">
          <span className="sg-k">Конкретная форма</span>
          <input disabled={disabled} value={value.form || ""} placeholder="например, Anda / Sie / 회원님" onChange={e => onChange({ ...value, form: e.target.value })} />
        </label>
        <label className="sg-row">
          <span className="sg-k">Нежелательные формы</span>
          <input disabled={disabled} value={value.avoid || ""} placeholder="например, kamu, 너" onChange={e => onChange({ ...value, avoid: e.target.value })} />
        </label>
        <label className="sg-row">
          <span className="sg-k">Пояснение для ИИ</span>
          <textarea disabled={disabled} rows={3} value={value.note || ""} onChange={e => onChange({ ...value, note: e.target.value })} />
        </label>
      </div>
    );
  }
  if (section === "terms") {
    const items: { bad: string; good: string; note: string }[] = value.items || [];
    const setItem = (i: number, patch: Partial<{ bad: string; good: string; note: string }>) =>
      onChange({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
    return (
      <div className="sg-fields">
        {items.length === 0 && <div className="muted small">Терминов пока нет.</div>}
        {items.length > 0 && (
          <table className="sg-terms">
            <thead><tr><th>Запрещено</th><th>Как надо</th><th>Комментарий</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td><input disabled={disabled} value={it.bad} onChange={e => setItem(i, { bad: e.target.value })} /></td>
                  <td><input disabled={disabled} value={it.good} onChange={e => setItem(i, { good: e.target.value })} /></td>
                  <td><input disabled={disabled} value={it.note} onChange={e => setItem(i, { note: e.target.value })} /></td>
                  <td>
                    {!disabled && (
                      <button type="button" className="link-button danger-link" title="Удалить термин"
                        onClick={() => onChange({ items: items.filter((_, j) => j !== i) })}>🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!disabled && (
          <button type="button" className="secondary sg-add" onClick={() => onChange({ items: [...items, { bad: "", good: "", note: "" }] })}>
            ＋ Добавить термин
          </button>
        )}
      </div>
    );
  }
  if (section === "auto") {
    const quotes: string[] = value.quotes || [];
    return (
      <div className="sg-fields">
        <div className="sg-row">
          <span className="sg-k">Разрешённые кавычки</span>
          <div className="sg-checks">
            {Object.entries(meta.quote_kinds).map(([k, t]) => (
              <label key={k} className="sg-check">
                <input type="checkbox" disabled={disabled} checked={quotes.includes(k)}
                  onChange={e => onChange({ ...value, quotes: e.target.checked ? [...quotes, k] : quotes.filter(q => q !== k) })} />
                {t}
              </label>
            ))}
            <span className="muted small">ничего не отмечено — вид кавычек не проверяется</span>
          </div>
        </div>
        <label className="sg-row">
          <span className="sg-k">Длинное тире «—»</span>
          <select disabled={disabled} value={value.em_dash || "any"} onChange={e => onChange({ ...value, em_dash: e.target.value })}>
            {Object.entries(meta.em_dash_modes).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="sg-row">
          <span className="sg-k">Диапазоны чисел</span>
          <select disabled={disabled} value={value.ranges || "any"} onChange={e => onChange({ ...value, ranges: e.target.value })}>
            {Object.entries(meta.range_signs).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="sg-row">
          <span className="sg-k">Пробелы в диапазонах</span>
          <select disabled={disabled} value={value.range_spaces || "any"} onChange={e => onChange({ ...value, range_spaces: e.target.value })}>
            {Object.entries(meta.range_spaces).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="sg-row">
          <span className="sg-k">Полноширинная пунктуация</span>
          <select disabled={disabled} value={value.cjk_punct || ""} onChange={e => onChange({ ...value, cjk_punct: e.target.value })}>
            <option value="">нет</option>
            <option value="ja">японская (。、 без пробелов)</option>
            <option value="zh">китайская (，。！？ и скобки)</option>
          </select>
        </label>
        <div className="sg-row">
          <span className="sg-k">Проверки</span>
          <div className="sg-checks sg-checks-col">
            {AUTO_FLAGS.map(([k, t]) => (
              <label key={k} className="sg-check">
                <input type="checkbox" disabled={disabled} checked={!!value[k]} onChange={e => onChange({ ...value, [k]: e.target.checked })} />
                {t}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="sg-fields">
      <textarea
        disabled={disabled}
        rows={Math.min(8, Math.max(2, String(value.text || "").split("\n").length + 1))}
        value={value.text || ""}
        placeholder="Правило своими словами — его читает ИИ"
        onChange={e => onChange({ text: e.target.value })}
      />
    </div>
  );
}

export default function StyleguideEditor({
  manager, scope, onBack,
}: {
  manager: Manager;
  scope: StyleguideScope;
  onBack: () => void;
}) {
  const [meta, setMeta] = useState<SgMeta | null>(null);
  const [clientData, setClientData] = useState<ClientStyleguide | null>(null);
  const [projectData, setProjectData] = useState<ProjectStyleguide | null>(null);
  const [lang, setLang] = useState<string>(() => {
    try { return localStorage.getItem(LANG_KEY_STORAGE) || ""; } catch { return ""; }
  });
  const [drafts, setDrafts] = useState<Record<string, SgValue>>({});
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [addLang, setAddLang] = useState("");
  const [historyAll, setHistoryAll] = useState(false);
  const isAdmin = manager.is_admin;
  const isProject = scope.kind === "project";

  useEffect(() => {
    styleguideMeta().then(setMeta).catch(() => setError("Не удалось загрузить настройки."));
    const load = scope.kind === "client"
      ? getClientStyleguide(scope.id).then(setClientData)
      : getProjectStyleguide(scope.id).then(setProjectData);
    load.catch(() => setError("Не удалось загрузить стайлгайд."));
  }, [scope.kind, scope.id]);

  const base: SgRules = (isProject ? projectData?.client_rules : clientData?.rules) || {};
  const own: SgRules = (isProject ? projectData?.own : {}) || {};
  const history: SgChange[] = (isProject ? projectData?.history : clientData?.history) || [];

  // A project's languages come from its «Языки проекта» list (2026-10-04).
  const projectLangs = isProject ? projectData?.langs ?? null : null;
  const langs = useMemo(() => {
    if (!meta) return [];
    if (projectLangs) return meta.langs.filter(l => projectLangs.includes(l.key));
    const present = new Set([...Object.keys(base), ...Object.keys(own)]);
    return meta.langs.filter(l => present.has(l.key));
  }, [meta, base, own, projectLangs]);

  useEffect(() => {
    if (langs.length && !langs.some(l => l.key === lang)) setLang(langs[0].key);
  }, [langs, lang]);

  useEffect(() => {
    setDrafts({});
    try { if (lang) localStorage.setItem(LANG_KEY_STORAGE, lang); } catch { /* per-viewer convenience only */ }
  }, [lang]);

  if (!meta || (!clientData && !projectData)) {
    return (
      <div className="page">
        <div className="top-bar"><h1>Стайлгайд — {scope.name}</h1><button className="link-button" onClick={onBack}>← Назад</button></div>
        {error ? <div className="error-box">{error}</div> : <div className="muted">Загрузка…</div>}
      </div>
    );
  }

  const m = meta;
  const clientName = isProject ? projectData?.client?.name : clientData?.client.name;

  async function save(section: string, value: SgValue | null) {
    setBusy(section);
    setError("");
    try {
      if (scope.kind === "client") {
        setClientData(await saveClientSection(scope.id, manager.id, lang, section, value as SgValue));
      } else {
        setProjectData(await saveProjectSection(scope.id, manager.id, lang, section, value));
      }
      setDrafts(d => { const n = { ...d }; delete n[section]; return n; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.");
    } finally {
      setBusy("");
    }
  }

  async function revert(change: SgChange) {
    if (!window.confirm(`Вернуть «${change.section_title}» (${change.lang_label}) к значению до этого изменения?`)) return;
    setBusy("history");
    setError("");
    try {
      const r = await revertStyleguideChange<ClientStyleguide & ProjectStyleguide>(change.id, manager.id);
      if (scope.kind === "client") setClientData(r); else setProjectData(r);
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось вернуть.");
    } finally {
      setBusy("");
    }
  }

  function card(section: string) {
    const meta_ = m.sections.find(s => s.key === section);
    if (!meta_) return null;
    const inherited = base[lang]?.[section] ?? null;
    const ownVal = isProject ? own[lang]?.[section] ?? null : null;
    const hasOwn = isProject && ownVal != null;
    const saved: SgValue | null = isProject ? (hasOwn ? ownVal : inherited) : inherited;
    const draft = drafts[section];
    const editingOwn = isProject && (hasOwn || draft !== undefined);
    const editable = isAdmin && (!isProject || editingOwn);
    const shown = draft ?? saved ?? emptyValue(section, m);
    const dirty = draft !== undefined && !same(draft, saved);
    return (
      <div key={section} className={`sg-card${isProject && !editingOwn ? " sg-inherited" : ""}`}>
        <div className="sg-head">
          <h3>
            {meta_.title}
            <span className={`sg-badge ${meta_.kind === "algo" ? "sg-algo" : "sg-ai"}`}>{meta_.kind === "algo" ? "алгоритм" : "ИИ"}</span>
          </h3>
          {isProject && (
            <div className="sg-toggle">
              <button type="button" className={!editingOwn ? "on" : ""} disabled={!isAdmin || busy === section}
                onClick={() => {
                  if (hasOwn) {
                    if (window.confirm("Убрать своё значение проекта и вернуть «как у заказчика»?")) save(section, null);
                  } else {
                    setDrafts(d => { const n = { ...d }; delete n[section]; return n; });
                  }
                }}>
                Как у заказчика
              </button>
              <button type="button" className={editingOwn ? "on" : ""} disabled={!isAdmin || busy === section}
                onClick={() => { if (!editingOwn) setDrafts(d => ({ ...d, [section]: JSON.parse(JSON.stringify(inherited ?? emptyValue(section, m))) })); }}>
                Своё для проекта
              </button>
            </div>
          )}
        </div>
        {isProject && editingOwn && (
          <div className="sg-from">У заказчика: {summary(inherited, section, m)}</div>
        )}
        <SectionEditor section={section} value={shown} meta={m} disabled={!editable}
          onChange={v => setDrafts(d => ({ ...d, [section]: v }))} />
        {editable && (dirty || (isProject && draft !== undefined && !hasOwn)) && (
          <div className="sg-actions">
            <button type="button" disabled={busy === section} onClick={() => save(section, drafts[section] ?? shown)}>
              {busy === section ? "Сохраняю…" : "Сохранить"}
            </button>
            <button type="button" className="secondary" disabled={busy === section}
              onClick={() => setDrafts(d => { const n = { ...d }; delete n[section]; return n; })}>
              Отмена
            </button>
          </div>
        )}
      </div>
    );
  }

  const addable = m.langs.filter(l => !langs.some(x => x.key === l.key));
  const shownHistory = historyAll ? history : history.slice(0, 15);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div className="page sg-page">
      <div className="top-bar">
        <div>
          <div className="muted small">
            Заказчики{clientName ? ` › ${clientName}` : ""}{isProject ? ` › ${scope.name}` : ""}
          </div>
          <h1>{isProject ? `Стайлгайд проекта «${scope.name}»` : `Стайлгайд заказчика «${scope.name}»`}</h1>
        </div>
        <button className="link-button" onClick={onBack}>← Назад</button>
      </div>

      <p className="muted small sg-intro">
        {isProject
          ? (projectData?.client
            ? <>Серые блоки — «как у заказчика»: правила берутся из стайлгайда «{projectData.client.name}» и меняются вместе с ним. «Своё для проекта» — изменить блок только для этого проекта и только для выбранного языка.</>
            : <>Проект не привязан к заказчику — здесь только собственные правила проекта.</>)
          : <>Правила по языкам для всех проектов заказчика. Проект может изменить любой блок у себя («Своё для проекта»).</>}
        {" "}Изменения действуют со следующей проверки.{!isAdmin && " Менять правила может только админская папка."}
      </p>

      <div className="sg-tabs">
        {langs.map(l => (
          <button key={l.key} type="button" className={`sg-tab${l.key === lang ? " on" : ""}`} onClick={() => setLang(l.key)}>
            {l.label}{isProject && own[l.key] && Object.keys(own[l.key]).length > 0 ? " •" : ""}
          </button>
        ))}
        {isAdmin && !projectLangs && addable.length > 0 && (
          <select className="sg-addlang" value={addLang} onChange={e => { const v = e.target.value; setAddLang(""); if (v) setLang(v); }}>
            <option value="">＋ язык</option>
            {addable.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        )}
      </div>
      {isProject && (
        <p className="muted small">
          • — у языка есть свои правила проекта.
          {projectLangs && " Список языков берётся из «Языки проекта» на странице проекта."}
        </p>
      )}

      {error && <div className="error-box">{error}</div>}

      {lang && GROUPS.map(g => (
        <section key={g.title} className="sg-group">
          <h2>{g.title}</h2>
          {g.keys.map(card)}
        </section>
      ))}

      <section className="sg-group">
        <h2>История изменений</h2>
        {history.length === 0 && <div className="muted small">Изменений пока не было.</div>}
        <div className="sg-history">
          {shownHistory.map(h => (
            <div key={h.id} className="sg-hist-row">
              <span>{fmt(h.created_at)} · {h.changed_by_name} · {h.lang_label} · {h.section_title}: {summary(h.before, h.section, m, isProject)} → {summary(h.after, h.section, m, isProject)}</span>
              {isAdmin && <button type="button" className="link-button" disabled={busy === "history"} onClick={() => revert(h)}>Вернуть</button>}
            </div>
          ))}
        </div>
        {history.length > 15 && (
          <button type="button" className="link-button" onClick={() => setHistoryAll(v => !v)}>
            {historyAll ? "Свернуть" : `Показать все (${history.length})`}
          </button>
        )}
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  deleteMultiCheck, detectFileLanguages, getToneStatus,
  knownLanguages, multiCheck, multiCheckDetail, multiCheckReportUrl,
  runCheck, verifyLanguages,
} from "./api";
import { buildChecksToSend, CHECK_DOC_REQUIREMENT, CHECK_OPTIONS, describeChecksRu, flagForLang, formatCostRu, formatDurationRu, formatElapsedMinutesRu, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import { MultiCheckHistoryList, SingleCheckHistoryList } from "./HistoryLists";
import { openReportInNewTab } from "./reportHtml";
import type {
  Finding, Manager, MultiCheckResponse,
  Project, ToneStatus,
} from "./types";

const SOURCE_LANGS = [
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

function baseLang(code: string): string {
  return code.split("-")[0].toLowerCase();
}

export default function CheckRunner({
  manager,
  project,
  onBack,
  openMultiCheckId,
}: {
  manager: Manager;
  project: Project;
  onBack: () => void;
  // Set when navigating here from a history entry clicked on the project
  // page (see ProjectView) — that specific upload's results open right away.
  openMultiCheckId?: number;
}) {
  // --- step 1: source language ---
  const [sourceLang, setSourceLang] = useState("");

  // --- step: text vs file (mutually exclusive) ---
  const [mode, setMode] = useState<"text" | "file">("text");
  const [sourceText, setSourceText] = useState("");
  const [translationText, setTranslationText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against two rapid file picks racing: if a slower detectFileLanguages
  // response for an earlier file lands after a newer one was already picked,
  // its result must be dropped rather than overwriting the catalog with stale
  // data — bumped on every onFileChosen call, checked before applying a result.
  const fileDetectToken = useRef(0);
  const [fileName, setFileName] = useState("");

  // --- target language(s): single choice for a text pair, multi for a file ---
  // The ONLY source of the target-language checkboxes — the project's
  // manually-curated catalog (see ProjectView's "Языки проекта"). Never
  // touched by anything below: a file's own detected languages are shown
  // purely as an advisory (see fileLangs/fileUnknownLanguages), never
  // merged into this list. That merge is exactly what used to let a
  // mislabeled column ("PR", meant as Portuguese) silently become a real,
  // checkable target language with Peru's flag — Александр asked for the
  // catalog to change only when he explicitly adds or removes a language.
  const [allLangs, setAllLangs] = useState<string[] | null>(null);
  // Of the current FILE's own language-shaped columns (file mode only):
  // fileLangs = the ones that also match the project's catalog (purely
  // informational — "found N of your languages in this file");
  // fileUnknownLanguages = the ones that look like a language code but
  // aren't on the catalog at all — shown as a plain notice pointing the
  // manager at renaming the column or adding the language themselves on
  // the project page (no inline "add" action here anymore — Александр
  // asked for that shortcut button to be removed). Both null before any
  // file is picked, or if detection failed.
  const [fileLangs, setFileLangs] = useState<string[] | null>(null);
  const [fileUnknownLanguages, setFileUnknownLanguages] = useState<string[]>([]);
  const [fileLangsLoading, setFileLangsLoading] = useState(false);
  // Column headers detect-languages couldn't recognize as a language at
  // all — shown as its own up-front notice (see the "3. Проверка
  // автоопределения" panel below) instead of only surfacing inside a
  // finished report, so a genuine language column that got missed (a
  // typo'd code, an unusual spelling) can be caught and fixed BEFORE an
  // AI-backed check runs, not after it's already been paid for.
  const [fileUnrecognizedCols, setFileUnrecognizedCols] = useState<string[]>([]);
  const [targetLangSingle, setTargetLangSingle] = useState("");
  const [targetLangsMulti, setTargetLangsMulti] = useState<string[]>([]);

  // Александр's redesign: the manager ticks the languages they expect,
  // presses "Подтвердить выбор языков", and ONLY once every ticked
  // language is confirmed present in the file (via verify-languages) does
  // "Начать проверку" become pressable — rather than trusting the
  // auto-detected list and hoping a missing language gets NOTICED.
  // languagesConfirmed stays false (and must be re-earned) after ANY
  // change that could invalidate it: a different file, or a different set
  // of ticked languages — see the effect below.
  const [languagesConfirmed, setLanguagesConfirmed] = useState(false);
  const [confirmingLanguages, setConfirmingLanguages] = useState(false);
  // Codes that came back "not found" on the last confirm attempt — null
  // means "no attempt yet since the last invalidation", not "all found".
  const [missingLanguages, setMissingLanguages] = useState<string[] | null>(null);

  // --- step 2: criteria ---
  const [checks, setChecks] = useState<string[]>(CHECK_OPTIONS.map(c => c.key));

  // --- optional comment ---
  const [comment, setComment] = useState("");

  // "Срочно" — file mode only: forces the instant path (2x price) instead
  // of Anthropic's cheaper but up-to-an-hour batch queue, for a big
  // upload that can't wait — Александр asked for this after hitting the
  // "проверяется в очереди" notice on an urgent file.
  const [urgent, setUrgent] = useState(false);

  // --- doc status, for the missing-document warning ---
  const [toneStatus, setToneStatus] = useState<ToneStatus | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [singleCost, setSingleCost] = useState(0);
  const [multiResult, setMultiResult] = useState<MultiCheckResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // "Все" by default (shows everything, same as before) or one specific
  // language, so Александр can narrow the results down to just the
  // language he's currently looking at instead of scrolling past the
  // others — reset back to "Все" whenever a different check's results come
  // on screen, so the filter never silently carries over from one upload
  // to the next.
  const [langFilter, setLangFilter] = useState<string>("all");
  useEffect(() => {
    setLangFilter("all");
  }, [multiResult?.multi_check_id]);

  // Bumped whenever the matching history list below should re-fetch (a
  // check just ran, or a batch just finished polling) — kept separate so
  // finishing a single-text check doesn't also cause a pointless refetch
  // of the (unrelated) upload history, and vice versa. The lists are
  // self-contained (see HistoryLists.tsx); this is the only hook
  // CheckRunner needs into them.
  const [singleHistorySignal, setSingleHistorySignal] = useState(0);
  const [multiHistorySignal, setMultiHistorySignal] = useState(0);

  useEffect(() => {
    knownLanguages(project.id).then(r => setAllLangs(r.languages)).catch(() => setAllLangs([]));
    getToneStatus(project.id).then(setToneStatus).catch(() => {});
  }, [project.id, manager.id]);

  // reset target-language choices whenever the source language changes, since
  // the exclusion rule (source can't also be a target) depends on it
  useEffect(() => {
    setTargetLangSingle("");
    setTargetLangsMulti([]);
  }, [sourceLang]);

  // A previous "Подтвердить выбор языков" confirmation is only valid for
  // the EXACT file + language selection it was run against — invalidate it
  // the moment either changes, so a stale "✓ confirmed" can never carry
  // over to a different file or a tweaked selection without being
  // re-earned.
  useEffect(() => {
    setLanguagesConfirmed(false);
    setMissingLanguages(null);
  }, [targetLangsMulti, fileName]);

  // large multi-checks go to Anthropic's cheaper batch queue and come back
  // "processing" — keep quietly re-checking until it flips to "completed".
  // Every tick's fresh progress is applied to the screen even while still
  // processing (not just on the final "completed" tick) — previously this
  // only called setMultiResult once the whole batch finished, so the done/
  // total count (and the percentage shown from it) stayed frozen at
  // whatever it was on the very first render the entire time, even once
  // Anthropic had genuinely moved forward — that's what made it look stuck
  // at 0%.
  useEffect(() => {
    if (!multiResult || multiResult.status !== "processing") return;
    const id = multiResult.multi_check_id;
    let cancelled = false;
    const timer = setInterval(async () => {
      setPolling(true);
      try {
        const res = await multiCheckDetail(project.id, id, manager.id);
        if (cancelled) return;
        setMultiResult(res);
        if (res.status === "completed") {
          setMultiHistorySignal(s => s + 1);
        }
      } catch {
        /* transient — just try again next tick */
      } finally {
        setPolling(false);
      }
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [multiResult, project.id, manager.id]);

  // A plain re-render clock, ticking every 30s, purely so the elapsed-time
  // fallback below (shown while Anthropic's own done/total hasn't moved
  // yet) visibly counts up on its own instead of only changing whenever a
  // real progress update happens to land. Deliberately keyed on just the
  // status (not the whole multiResult object, which gets a new reference
  // on every 20s poll above) — depending on the full object would tear
  // down and reschedule this 30s timer on every poll tick, and since polls
  // land more often than 30s, the timer would keep getting cancelled
  // before it ever fires.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (multiResult?.status !== "processing") return;
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [multiResult?.status]);

  // The checkbox candidates are always exactly the project's catalog,
  // regardless of mode or whether a file has been picked — see allLangs
  // above for why.
  const targetCandidates = (allLangs || []).filter(l => baseLang(l) !== sourceLang);
  const targetsReady = allLangs !== null;

  async function confirmLanguages() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || targetLangsMulti.length === 0) return;
    setConfirmingLanguages(true);
    try {
      const r = await verifyLanguages(project.id, file, targetLangsMulti);
      const missing = r.results.filter(row => !row.found).map(row => row.code);
      setMissingLanguages(missing);
      setLanguagesConfirmed(missing.length === 0);
    } catch {
      // Network/server hiccup — treat as "not confirmed" rather than
      // silently letting the manager proceed on an unknown state.
      setMissingLanguages(null);
      setLanguagesConfirmed(false);
    } finally {
      setConfirmingLanguages(false);
    }
  }

  // Runs detect-languages for the given file and applies the result.
  async function detectAndSetFileLanguages(file: File) {
    const token = ++fileDetectToken.current;
    setFileLangsLoading(true);
    try {
      const r = await detectFileLanguages(project.id, file);
      if (token !== fileDetectToken.current) return; // a newer file was picked meanwhile
      setFileLangs(r.languages);
      setFileUnknownLanguages(r.unknown_languages || []);
      setFileUnrecognizedCols(r.unrecognized_columns || []);
    } catch {
      if (token !== fileDetectToken.current) return;
      setFileLangs(null);
      setFileUnknownLanguages([]);
    } finally {
      if (token === fileDetectToken.current) setFileLangsLoading(false);
    }
  }

  async function onFileChosen(file: File | undefined) {
    setFileName(file?.name || "");
    setTargetLangsMulti([]);
    setFileUnrecognizedCols([]);
    setFileUnknownLanguages([]);
    if (!file) {
      setFileLangs(null);
      fileDetectToken.current++; // invalidate any detection still in flight
      return;
    }
    await detectAndSetFileLanguages(file);
  }

  function toggleCheck(key: string) {
    setChecks(prev => (prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]));
  }
  function toggleAllChecks() {
    setChecks(prev => (prev.length === CHECK_OPTIONS.length ? [] : CHECK_OPTIONS.map(c => c.key)));
  }
  function toggleTargetMulti(code: string) {
    setTargetLangsMulti(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));
  }
  function toggleAllTargets() {
    setTargetLangsMulti(prev => (prev.length === targetCandidates.length ? [] : [...targetCandidates]));
  }

  const docStatusByRequirement: Record<string, { filename: string } | null> = {
    tone: toneStatus && toneStatus.rule_count > 0 ? toneStatus : null,
  };
  const DOC_LABEL: Record<string, string> = { tone: "Тон обращения" };
  const missingDocsForSelected = [...new Set(
    checks
      .map(c => CHECK_DOC_REQUIREMENT[c])
      .filter((doc): doc is "tone" => !!doc && !docStatusByRequirement[doc])
  )];

  const hasText = sourceText.trim() && translationText.trim();
  const hasFile = !!fileName;
  const targetsChosen = mode === "text" ? !!targetLangSingle : targetLangsMulti.length > 0;
  const canStart =
    !!sourceLang &&
    (mode === "text" ? !!hasText : hasFile) &&
    targetsChosen &&
    checks.length > 0 &&
    missingDocsForSelected.length === 0 &&
    // File mode only: the manager must explicitly confirm every ticked
    // language was actually found in the file (see "Подтвердить выбор
    // языков" above) before a check can run — text mode has no file to
    // confirm against, so it's unaffected.
    (mode === "text" || languagesConfirmed) &&
    !loading;

  async function start() {
    if (!canStart) return;
    setLoading(true);
    setError("");
    setFindings(null);
    setMultiResult(null);
    const checksToSend = buildChecksToSend(checks);
    try {
      if (mode === "text") {
        const res = await runCheck({
          source: sourceText,
          translation: translationText,
          checks: checksToSend,
          projectId: project.id,
          sourceLang,
          targetLang: targetLangSingle,
          extraInstructions: comment,
          managerName: manager.name,
          managerId: manager.id,
        });
        setFindings(res.findings);
        setSingleCost(res.cost_usd);
        setSingleHistorySignal(s => s + 1);
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;
        const res = await multiCheck(project.id, file, sourceLang, manager.name, manager.id, checksToSend, comment, targetLangsMulti, urgent);
        setMultiResult(res);
        setMultiHistorySignal(s => s + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? `Не удалось выполнить проверку: ${err.message}` : "Не удалось выполнить проверку.");
    } finally {
      setLoading(false);
    }
  }

  async function openMultiHistoryEntry(id: number) {
    setError("");
    try {
      const res = await multiCheckDetail(project.id, id, manager.id);
      setMultiResult(res);
      setFindings(null);
    } catch {
      setError("Не удалось загрузить эту проверку.");
    }
  }

  // Cancels the multi-check currently shown in the "processing" panel
  // below — e.g. it's turning out slower than expected and the manager
  // would rather re-upload with "Срочно", or they simply changed their
  // mind. Deleting a still-processing check doubles as cancelling it (the
  // backend tells Anthropic to stop working on it), same as the ✕ button
  // in the history list further down — this is just a more visible way to
  // reach it right from the panel that's actually showing "processing".
  async function cancelProcessing() {
    if (!multiResult) return;
    if (!window.confirm("Отменить проверку? Она ещё обрабатывается — отмена остановит её. Отменить это действие будет нельзя.")) return;
    setCancelling(true);
    setError("");
    try {
      await deleteMultiCheck(project.id, multiResult.multi_check_id, manager.id);
      setMultiResult(null);
      setMultiHistorySignal(s => s + 1);
    } catch {
      setError("Не удалось отменить проверку.");
    } finally {
      setCancelling(false);
    }
  }

  // Deep-link from ProjectView's own history list: open this specific
  // upload's results as soon as we land on the check screen.
  useEffect(() => {
    if (openMultiCheckId != null) {
      openMultiHistoryEntry(openMultiCheckId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMultiCheckId]);

  const unrecognized = multiResult?.sheets?.flatMap(s => s.unrecognized_columns) || [];
  // Every language checked across every sheet, in the order it first
  // appears — the full "Все" set the filter buttons below are built from.
  const resultLangs: string[] = multiResult?.sheets
    ? [...new Set(multiResult.sheets.flatMap(s => s.languages_checked))]
    : [];
  // How many rows had findings for each language, summed across every
  // sheet it appears in — the same number already shown in that
  // language's own section header ("N найдено") below, just surfaced on
  // the filter button itself too, so a language with problems stands out
  // ("HI (4)") before even scrolling down to it.
  const findingsCountByLang: Record<string, number> = {};
  multiResult?.sheets?.forEach(sheet => {
    sheet.languages_checked.forEach(lang => {
      const rows = sheet.languages[lang] || [];
      findingsCountByLang[lang] = (findingsCountByLang[lang] || 0) + rows.length;
    });
  });
  const elapsedMinutes = multiResult?.created_at
    ? Math.max(0, Math.floor((nowTick - Date.parse(multiResult.created_at)) / 60000))
    : 0;

  return (
    <div className="page">
      <div className="top-bar">
        <h1>{project.name} / Проверка</h1>
        <button className="link-button" onClick={onBack}>← К проекту</button>
      </div>

      <div className="step">
        <div className="step-title">1. Выбор языка оригинала</div>
        <div className="lang-pick-row">
          {SOURCE_LANGS.map(l => (
            <button
              key={l.code}
              className={`lang-pick-btn ${sourceLang === l.code ? "active" : ""}`}
              onClick={() => setSourceLang(l.code)}
              type="button"
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="step">
        <div className="mode-tabs">
          <button type="button" className={`mode-tab ${mode === "text" ? "active" : ""}`} onClick={() => setMode("text")}>
            Текст в полях
          </button>
          <button type="button" className={`mode-tab ${mode === "file" ? "active" : ""}`} onClick={() => setMode("file")}>
            Загрузить документ
          </button>
        </div>

        {mode === "text" ? (
          <div className="two-col">
            <div className="col">
              <label>Исходный текст</label>
              <textarea value={sourceText} onChange={e => setSourceText(e.target.value)} rows={8} placeholder="Вставьте исходный текст…" />
            </div>
            <div className="col">
              <label>Перевод</label>
              <textarea value={translationText} onChange={e => setTranslationText(e.target.value)} rows={8} placeholder="Вставьте перевод…" />
            </div>
          </div>
        ) : (
          <div>
            <label>Файл Excel (экспорт из Crowdin)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={e => onFileChosen(e.target.files?.[0])}
            />
            <label className="check-chip" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} />
              Срочно (дороже в 2 раза, без очереди)
            </label>
            <p className="muted small">
              Обычно большой файл дешевле проверять через очередь Anthropic — до часа ожидания. Эта галочка
              пропускает очередь и считает сразу, но по полной (в 2 раза дороже) цене.
            </p>
          </div>
        )}
      </div>

      <div className="step">
        <div className="step-title">2. Выбор целевых языков</div>
        {!sourceLang && <p className="muted small">Сначала выберите язык оригинала.</p>}
        {sourceLang && mode === "file" && fileLangsLoading && (
          <p className="muted small">Определяю языки в файле…</p>
        )}
        {sourceLang && !(mode === "file" && fileLangsLoading) && !targetsReady && (
          <p className="muted small">Загрузка списка языков…</p>
        )}
        {sourceLang && !(mode === "file" && fileLangsLoading) && targetsReady && targetCandidates.length === 0 && (
          <p className="muted small">
            В списке языков проекта пока нет ни одного языка, кроме языка оригинала — добавьте нужные языки в
            разделе «Языки проекта» на странице проекта.
          </p>
        )}
        {sourceLang && mode === "file" && fileLangs !== null && !fileLangsLoading && (
          <p className="muted small">
            В файле найдено языковых колонок: {fileLangs.length + fileUnknownLanguages.length}, из них в вашем
            списке языков — {fileLangs.length}.
          </p>
        )}
        {sourceLang && mode === "file" && fileUnrecognizedCols.length > 0 && (
          <div className="info-box">
            Эти колонки не распознаны как язык и не будут проверяться: «{fileUnrecognizedCols.join("», «")}».
            Если среди них должен быть язык — переименуйте колонку в файле и загрузите его заново.
          </div>
        )}
        {sourceLang && mode === "file" && fileUnknownLanguages.length > 0 && (
          <div className="warn-box">
            {fileUnknownLanguages.map(code => (
              <div key={code} style={{ marginBottom: 6 }}>
                <span>
                  В файле найдена колонка «{code.toUpperCase()}», похожая на язык, но её нет в вашем списке
                  языков. Если это опечатка — переименуйте колонку в файле. Если это новый язык — добавьте его
                  вручную в разделе «Языки проекта» на странице проекта.
                </span>
              </div>
            ))}
          </div>
        )}
        {sourceLang && mode === "file" && targetCandidates.length > 0 && (
          <>
            <label className="check-chip select-all">
              <input type="checkbox" checked={targetLangsMulti.length === targetCandidates.length} onChange={toggleAllTargets} />
              Выбрать все
            </label>
            <div className="target-lang-grid">
              {targetCandidates.map(code => (
                <label key={code} className="target-lang-chip">
                  <input type="checkbox" checked={targetLangsMulti.includes(code)} onChange={() => toggleTargetMulti(code)} />
                  {flagForLang(code)} {code.toUpperCase()}
                </label>
              ))}
            </div>
            {targetLangsMulti.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="secondary" onClick={confirmLanguages} disabled={confirmingLanguages}>
                  {confirmingLanguages ? "Проверяю…" : "Подтвердить выбор языков"}
                </button>
                {languagesConfirmed && (
                  <div className="success-box">✓ Языки распознаны, можно начинать проверку.</div>
                )}
                {missingLanguages !== null && missingLanguages.length > 0 && (
                  <div className="info-box">
                    {missingLanguages.map(code => (
                      <div key={code}>
                        Не найден язык «{code}». Переименуйте нужную колонку в файле на «{code}» и загрузите
                        документ заново — либо снимите галочку с этого языка, если проверять его сейчас не нужно.
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {sourceLang && mode === "text" && targetCandidates.length > 0 && (
          <div className="target-lang-single">
            {targetCandidates.map(code => (
              <button
                key={code}
                type="button"
                className={targetLangSingle === code ? "active" : ""}
                onClick={() => setTargetLangSingle(code)}
              >
                {flagForLang(code)} {code.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="step">
        <div className="step-title">3. Выбор критериев проверки</div>
        <label className="check-chip select-all">
          <input type="checkbox" checked={checks.length === CHECK_OPTIONS.length} onChange={toggleAllChecks} />
          Выбрать все
        </label>
        <div className="checks-row">
          {CHECK_OPTIONS.map(c => (
            <label key={c.key} className="check-chip">
              <input type="checkbox" checked={checks.includes(c.key)} onChange={() => toggleCheck(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        {missingDocsForSelected.length > 0 && (
          <div className="warn-box">
            Нельзя запустить: для выбранных критериев нужны документы проекта, которые ещё не загружены —{" "}
            {missingDocsForSelected.map(d => `«${DOC_LABEL[d]}»`).join(", ")}. Загрузите их на странице проекта.
          </div>
        )}
      </div>

      <div className="step extra-instructions">
        <div className="step-title">4. Комментарий к задаче (опционально)</div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          placeholder='Например: в этой задаче особое условие оставить "Points" на английском там, где в оригинале написано с большой буквы'
        />
      </div>

      <button className="start-check-button" onClick={start} disabled={!canStart}>
        {loading ? "Проверяю…" : mode === "file" ? "Начать проверку" : "Начать проверку"}
      </button>
      {!checks.length && <p className="muted small">Выберите хотя бы один критерий проверки.</p>}
      {mode === "file" && hasFile && targetsChosen && !languagesConfirmed && (
        <p className="muted small">Сначала подтвердите выбор языков (шаг 2) — кнопка выше.</p>
      )}

      {error && <div className="error-box">{error}</div>}

      {findings !== null && (
        <div className="results">
          <h2>Результат</h2>
          <p className="muted small">Проверка завершена, стоимость составила: {formatCostRu(singleCost)}</p>
          {findings.length === 0 && <div className="muted">Проблем не найдено.</div>}
          {findings.map((f, i) => (
            <div key={i} className={`finding finding-${f.severity}`}>
              <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
              <span className="finding-type">{TYPE_LABEL[f.type] || f.type}</span>
              <div className="finding-message">{f.message}</div>
            </div>
          ))}
        </div>
      )}

      {multiResult && multiResult.status === "processing" && (
        <div className="results">
          <div className="info-box">
            Задача большая — обрабатывается через очередь Anthropic. Anthropic не сообщает точное время
            окончания, поэтому ниже — сколько уже <strong>прошло</strong> с начала ожидания, а не сколько
            осталось.
            {multiResult.estimated_minutes ? (
              <>
                {" "}По похожим прошлым проверкам такое обычно занимает около{" "}
                {formatElapsedMinutesRu(multiResult.estimated_minutes)} — это не гарантия, скорость у
                Anthropic каждый раз может быть разной (иногда быстрее, иногда медленнее, до часа).
              </>
            ) : (
              " Обычно это занимает до часа."
            )}
            {" "}Можно закрыть вкладку и вернуться позже через «Историю» ниже.
            {multiResult.progress && multiResult.progress.total > 0 && multiResult.progress.done > 0 ? (
              <>
                {" "}Готово {multiResult.progress.done} из {multiResult.progress.total}.
              </>
            ) : multiResult.created_at ? (
              <>
                {" "}Прошло уже {formatElapsedMinutesRu(elapsedMinutes)}.
              </>
            ) : null}
            {polling && " Проверяю, не готово ли ещё…"}
          </div>
          {multiResult.progress && multiResult.progress.total > 0 && (
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((multiResult.progress.done / multiResult.progress.total) * 100)}%` }}
              />
            </div>
          )}
          <button
            type="button"
            className="link-button danger-link"
            style={{ marginTop: 10 }}
            onClick={cancelProcessing}
            disabled={cancelling}
          >
            {cancelling ? "Отменяю…" : "✕ Отменить проверку"}
          </button>
        </div>
      )}

      {multiResult && multiResult.status === "completed" && multiResult.summary && multiResult.sheets && (() => {
        const durationText = formatDurationRu(multiResult.created_at, multiResult.completed_at);
        const criteriaText = describeChecksRu(multiResult.checks_run);
        return (
        <div className="results">
          <h2>Результат — {multiResult.summary.total_findings} проблем в {multiResult.summary.languages_checked.length} языках</h2>
          <p className="muted small">
            Исходный язык: {multiResult.source_lang}. Строк проверено: {multiResult.summary.rows_checked}.
            {" "}Проверка завершена, стоимость составила: {formatCostRu(multiResult.cost_usd || 0)}.
            {durationText && <> Заняла: {durationText}.</>}
            {criteriaText && <> Критерии: {criteriaText}.</>}
          </p>
          {unrecognized.length > 0 && (
            <div className="info-box">Не распознаны как языки (пропущены): {unrecognized.join(", ")}</div>
          )}
          <a
            className="download-link"
            href={multiCheckReportUrl(project.id, multiResult.multi_check_id, manager.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            ⬇ Скачать отчёт (Excel)
          </a>
          <button
            type="button"
            className="download-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 20 }}
            onClick={() => openReportInNewTab(() => Promise.resolve(multiResult))}
          >
            ⧉ Открыть в новой вкладке
          </button>

          {resultLangs.length > 1 && (
            <div className="lang-filter-bar">
              <button
                type="button"
                className={`lang-filter-btn ${langFilter === "all" ? "active" : ""}`}
                onClick={() => setLangFilter("all")}
              >
                Все
              </button>
              {resultLangs.map(lang => (
                <button
                  key={lang}
                  type="button"
                  className={`lang-filter-btn ${langFilter === lang ? "active" : ""} ${findingsCountByLang[lang] > 0 ? "has-findings" : ""}`}
                  onClick={() => setLangFilter(lang)}
                >
                  {flagForLang(lang)} {lang}{findingsCountByLang[lang] > 0 && ` (${findingsCountByLang[lang]})`}
                </button>
              ))}
            </div>
          )}

          {multiResult.sheets
            .filter(sheet => sheet.languages_checked.some(l => langFilter === "all" || l === langFilter))
            .map(sheet => (
            <div key={sheet.sheet_name} className="sheet-block">
              {multiResult.sheets!.length > 1 && <h3>{sheet.sheet_name}</h3>}

              {sheet.languages_checked.filter(l => langFilter === "all" || l === langFilter).map(lang => {
                const rows = sheet.languages[lang] || [];
                return (
                  <div key={lang} className="lang-block">
                    <h4 className={`lang-block-title ${rows.length > 0 ? "has-findings" : ""}`}>
                      {flagForLang(lang)} {lang} — {rows.length > 0 ? `${rows.length} найдено` : "без проблем"}
                    </h4>
                    <div className="lang-results">
                      {rows.length === 0 && <div className="muted">Проблем не найдено.</div>}
                      {rows.map((row, i) => (
                        <div key={i} className="multi-row">
                          <div className="multi-row-header">Строка {row.excel_row} — {row.context || "без контекста"}</div>
                          <div className="history-pair">
                            <div><strong>Источник:</strong> {row.source}</div>
                            <div><strong>Перевод:</strong> {row.translation}</div>
                          </div>
                          {row.findings.map((f, fi) => (
                            <div key={fi} className={`finding finding-${f.severity}`}>
                              <span className="finding-severity">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                              <span className="finding-type">{TYPE_LABEL[f.type] || f.type}</span>
                              <div className="finding-message">{f.message}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        );
      })()}

      <SingleCheckHistoryList manager={manager} project={project} refreshSignal={singleHistorySignal} />
      <MultiCheckHistoryList
        manager={manager}
        project={project}
        refreshSignal={multiHistorySignal}
        onOpen={openMultiHistoryEntry}
        onDeleted={id => {
          if (multiResult?.multi_check_id === id) setMultiResult(null);
        }}
        autoPoll={false}
      />
    </div>
  );
}

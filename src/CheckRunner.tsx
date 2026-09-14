import { useEffect, useRef, useState } from "react";
import {
  deleteMultiCheck, detectFileLanguages, getToneStatus,
  knownLanguages, multiCheck, multiCheckDetail, multiCheckReportUrl,
  runCheck,
} from "./api";
import { buildChecksToSend, CHECK_DOC_REQUIREMENT, CHECK_OPTIONS, flagForLang, formatCostRu, formatElapsedMinutesRu, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
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
  const [fileName, setFileName] = useState("");

  // --- target language(s): single choice for a text pair, multi for a file ---
  const [allLangs, setAllLangs] = useState<string[] | null>(null);
  // Languages actually found in the currently-selected FILE (file mode
  // only) — takes over from allLangs (the project's Tone document) once a
  // file is chosen, since the file itself is the real source of truth for
  // "what target languages exist here". null before any file is picked, or
  // if detection failed (falls back to allLangs either way).
  const [fileLangs, setFileLangs] = useState<string[] | null>(null);
  const [fileLangsLoading, setFileLangsLoading] = useState(false);
  const [targetLangSingle, setTargetLangSingle] = useState("");
  const [targetLangsMulti, setTargetLangsMulti] = useState<string[]>([]);

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

  // In file mode, once a file has been picked, its OWN languages are the
  // source of truth for what can be checked — falls back to the project's
  // Tone-document languages before a file is chosen, or in text mode.
  const targetLangSource = mode === "file" && fileLangs !== null ? fileLangs : (allLangs || []);
  const targetCandidates = targetLangSource.filter(l => baseLang(l) !== sourceLang);
  const targetsReady = mode === "file"
    ? (fileLangs !== null || (!fileLangsLoading && allLangs !== null))
    : allLangs !== null;

  async function onFileChosen(file: File | undefined) {
    setFileName(file?.name || "");
    setTargetLangsMulti([]);
    if (!file) {
      setFileLangs(null);
      return;
    }
    setFileLangsLoading(true);
    try {
      const r = await detectFileLanguages(project.id, file);
      setFileLangs(r.languages);
    } catch {
      // Falls back to the Tone document's languages (targetLangSource
      // above) rather than blocking the manager from checking at all.
      setFileLangs(null);
    } finally {
      setFileLangsLoading(false);
    }
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
            {mode === "file" && fileLangs !== null
              ? "В этом файле не найдено ни одного языка, кроме языка оригинала."
              : "В документах проекта (Тон обращения) пока не найдено ни одного языка, кроме языка оригинала."}
          </p>
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
            Задача большая — проверка началась, но займёт некоторое время. Можно закрыть вкладку и
            вернуться позже через «Историю» ниже.
            {multiResult.progress && multiResult.progress.total > 0 && multiResult.progress.done > 0 ? (
              <>
                {" "}Готово {multiResult.progress.done} из {multiResult.progress.total}.
              </>
            ) : multiResult.created_at ? (
              <>
                {" "}В очереди уже {formatElapsedMinutesRu(elapsedMinutes)}.
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

      {multiResult && multiResult.status === "completed" && multiResult.summary && multiResult.sheets && (
        <div className="results">
          <h2>Результат — {multiResult.summary.total_findings} проблем в {multiResult.summary.languages_checked.length} языках</h2>
          <p className="muted small">
            Исходный язык: {multiResult.source_lang}. Строк проверено: {multiResult.summary.rows_checked}.
            {" "}Проверка завершена, стоимость составила: {formatCostRu(multiResult.cost_usd || 0)}.
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

          {multiResult.sheets.map(sheet => (
            <div key={sheet.sheet_name} className="sheet-block">
              {multiResult.sheets!.length > 1 && <h3>{sheet.sheet_name}</h3>}

              {sheet.languages_checked.map(lang => {
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
      )}

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

import { useEffect, useRef, useState } from "react";
import {
  detectFileLanguages, getToneStatus,
  knownLanguages, multiCheck, multiCheckDetail, multiCheckHistory, multiCheckReportUrl,
  runCheck, singleCheckHistory,
} from "./api";
import { buildChecksToSend, CHECK_DOC_REQUIREMENT, CHECK_OPTIONS, flagForLang, formatCostRu, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import type {
  Finding, Manager, MultiCheckHistoryEntry, MultiCheckResponse,
  Project, SingleCheckHistoryEntry, ToneStatus,
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
}: {
  manager: Manager;
  project: Project;
  onBack: () => void;
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
  const [openLang, setOpenLang] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const [singleHistory, setSingleHistory] = useState<SingleCheckHistoryEntry[]>([]);
  const [multiHistory, setMultiHistory] = useState<MultiCheckHistoryEntry[]>([]);

  useEffect(() => {
    knownLanguages(project.id).then(r => setAllLangs(r.languages)).catch(() => setAllLangs([]));
    getToneStatus(project.id).then(setToneStatus).catch(() => {});
    singleCheckHistory(project.id, manager.id).then(setSingleHistory).catch(() => {});
    multiCheckHistory(project.id, manager.id).then(setMultiHistory).catch(() => {});
  }, [project.id, manager.id]);

  // reset target-language choices whenever the source language changes, since
  // the exclusion rule (source can't also be a target) depends on it
  useEffect(() => {
    setTargetLangSingle("");
    setTargetLangsMulti([]);
  }, [sourceLang]);

  // large multi-checks go to Anthropic's cheaper batch queue and come back
  // "processing" — keep quietly re-checking until it flips to "completed"
  useEffect(() => {
    if (!multiResult || multiResult.status !== "processing") return;
    const id = multiResult.multi_check_id;
    let cancelled = false;
    const timer = setInterval(async () => {
      setPolling(true);
      try {
        const res = await multiCheckDetail(project.id, id, manager.id);
        if (cancelled) return;
        if (res.status === "completed") {
          setMultiResult(res);
          setOpenLang(res.summary?.languages_checked[0] || null);
          multiCheckHistory(project.id, manager.id).then(setMultiHistory).catch(() => {});
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
        singleCheckHistory(project.id, manager.id).then(setSingleHistory).catch(() => {});
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;
        const res = await multiCheck(project.id, file, sourceLang, manager.name, manager.id, checksToSend, comment, targetLangsMulti, urgent);
        setMultiResult(res);
        setOpenLang(res.summary?.languages_checked[0] || null);
        multiCheckHistory(project.id, manager.id).then(setMultiHistory).catch(() => {});
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
      setOpenLang(res.summary?.languages_checked[0] || null);
    } catch {
      setError("Не удалось загрузить эту проверку.");
    }
  }

  const unrecognized = multiResult?.sheets?.flatMap(s => s.unrecognized_columns) || [];

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
            Задача большая — для неё дешевле проверять через очередь Anthropic, а не мгновенно.
            Обычно это занимает до часа. {polling ? "Проверяю, не готово ли ещё…" : "Страница сама проверит готовность через некоторое время"}
            {" "}— можно закрыть вкладку и вернуться позже через «Историю» ниже.
            {multiResult.progress && multiResult.progress.total > 0 && (
              <>
                {" "}Готово {multiResult.progress.done} из {multiResult.progress.total}.
              </>
            )}
          </div>
          {multiResult.progress && multiResult.progress.total > 0 && (
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((multiResult.progress.done / multiResult.progress.total) * 100)}%` }}
              />
            </div>
          )}
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
          <a className="download-link" href={multiCheckReportUrl(project.id, multiResult.multi_check_id, manager.id)}>
            ⬇ Скачать отчёт (Excel)
          </a>

          {multiResult.sheets.map(sheet => (
            <div key={sheet.sheet_name} className="sheet-block">
              {multiResult.sheets!.length > 1 && <h3>{sheet.sheet_name}</h3>}
              <div className="lang-tabs">
                {sheet.languages_checked.map(lang => {
                  const count = sheet.languages[lang]?.length || 0;
                  return (
                    <button
                      key={lang}
                      type="button"
                      className={`lang-tab ${openLang === lang ? "active" : ""} ${count > 0 ? "has-findings" : ""}`}
                      onClick={() => setOpenLang(lang)}
                    >
                      {flagForLang(lang)} {lang} {count > 0 ? `(${count})` : ""}
                    </button>
                  );
                })}
              </div>

              {openLang && sheet.languages[openLang] && (
                <div className="lang-results">
                  {sheet.languages[openLang].length === 0 && <div className="muted">Проблем не найдено.</div>}
                  {sheet.languages[openLang].map((row, i) => (
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
              )}
            </div>
          ))}
        </div>
      )}

      {singleHistory.length > 0 && (
        <div className="history">
          <h2>История точечных проверок</h2>
          {singleHistory.map(h => (
            <details key={h.id} className="history-entry">
              <summary>
                {new Date(h.created_at).toLocaleString("ru-RU")}
                {h.performed_by_name ? ` — ${h.performed_by_name}` : ""}
                {" — "}{flagForLang(h.source_lang)}→{flagForLang(h.target_lang)} {h.target_lang}
                {" — "}{h.findings.length === 0 ? "без проблем" : `${h.findings.length} найдено`}
                {" — "}{formatCostRu(h.cost_usd)}
              </summary>
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
            </details>
          ))}
        </div>
      )}

      {multiHistory.length > 0 && (
        <div className="history">
          <h2>История загрузок документов</h2>
          {multiHistory.map(h => (
            <button
              key={h.id}
              className={`history-row ${h.status === "processing" ? "history-row-processing" : ""}`}
              onClick={() => openMultiHistoryEntry(h.id)}
            >
              {new Date(h.created_at).toLocaleString("ru-RU")}
              {h.performed_by_name ? ` — ${h.performed_by_name}` : ""}
              {" — "}{h.filename}
              {" — "}
              {h.status === "processing" ? "ещё обрабатывается…" : `${h.summary.total_findings ?? 0} проблем — ${formatCostRu(h.cost_usd)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

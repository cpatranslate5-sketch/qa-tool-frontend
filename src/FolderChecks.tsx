import { useEffect, useState } from "react";
import { adminFolderChecks, adminMoveCheck, listManagers, type DeletedTrace, type FolderCheck } from "./api";
import type { Manager } from "./types";

// «Поиск проверок папки» (2026-10-04, Александр: результаты Ани-2 «пропали»).
// Admin only: every check a folder made, in ALL projects, plus traces of
// reports that were deleted. A check found by the folder's name but stored
// without that folder (or in another one) can be moved back into it.

function fmt(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export default function FolderChecks({ manager, onBack }: { manager: Manager; onBack: () => void }) {
  const [folders, setFolders] = useState<Manager[]>([]);
  const [folderId, setFolderId] = useState("");
  const [checks, setChecks] = useState<FolderCheck[] | null>(null);
  const [traces, setTraces] = useState<DeletedTrace[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listManagers().then(setFolders).catch(() => setError("Не удалось загрузить папки."));
  }, []);

  function load(id: string) {
    setFolderId(id);
    setChecks(null);
    setTraces([]);
    setError("");
    if (!id) return;
    setLoading(true);
    adminFolderChecks(manager.id, Number(id))
      .then(r => { setChecks(r.checks); setTraces(r.deleted_traces); })
      .catch(e => setError(e instanceof Error ? e.message : "Не удалось загрузить проверки."))
      .finally(() => setLoading(false));
  }

  async function move(c: FolderCheck) {
    try {
      await adminMoveCheck(manager.id, c.kind, c.id, Number(folderId));
      load(folderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось перенести.");
    }
  }

  const folderName = folders.find(f => String(f.id) === folderId)?.name || "";
  const groups = new Map<string, FolderCheck[]>();
  (checks || []).forEach(c => {
    const key = (c.client_name ? c.client_name + " · " : "") + c.project_name;
    groups.set(key, [...(groups.get(key) || []), c]);
  });
  const mine = traces.filter(t => t.this_folder);
  const other = traces.filter(t => !t.this_folder);

  return (
    <div className="page sg-page">
      <div className="top-bar">
        <h1>Поиск проверок папки</h1>
        <button className="link-button" onClick={onBack}>← Назад</button>
      </div>
      <p className="muted small sg-intro">
        Показывает все проверки выбранной папки во всех проектах — даже если они сохранились без папки
        или в другой папке под её именем. Такие можно вернуть в папку одной кнопкой. Ниже — следы удалённых отчётов.
      </p>
      <div className="inline-form">
        <select value={folderId} onChange={e => load(e.target.value)}>
          <option value="">Выберите папку…</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}{f.is_admin ? " (админ)" : ""}</option>)}
        </select>
      </div>
      {error && <div className="error-box">{error}</div>}
      {loading && <div className="muted">Ищу…</div>}

      {checks && checks.length === 0 && <div className="muted">У папки «{folderName}» проверок не найдено ни в одном проекте.</div>}
      {checks && checks.length > 0 && (
        <p className="small">Найдено проверок: <b>{checks.length}</b> (по файлам: {checks.filter(c => c.kind === "file").length},
          точечных: {checks.filter(c => c.kind === "point").length}).</p>
      )}
      {[...groups.entries()].map(([proj, list]) => (
        <div key={proj} className="client-block">
          <h2>📁 {proj} <span className="muted">— {list.length}</span></h2>
          <div className="lr-list">
            {list.map(c => {
              const elsewhere = c.owner_id !== Number(folderId);
              return (
                <div key={c.kind + c.id} className="multi-row lr-card">
                  <div className="lr-head">
                    <span className={`lr-origin ${c.kind === "file" ? "okk" : "translator"}`}>{c.kind === "file" ? "Файл" : "Точечная"}</span>
                    <b>{c.title}</b>
                    <span className="muted">{fmt(c.created_at)}</span>
                  </div>
                  <div className="muted small">
                    {c.langs.length > 0 && <>Языки: {c.langs.join(", ")} · </>}
                    {c.findings != null && <>замечаний: {c.findings} · </>}
                    {c.status !== "completed" && <>статус: {c.status} · </>}
                    {elsewhere
                      ? <span style={{ color: "var(--danger)" }}>{c.owner_name ? `лежит в папке «${c.owner_name}»` : "сохранена без папки — нигде не видна"}</span>
                      : <>видна в папке «{folderName}», проект «{c.project_name}»</>}
                  </div>
                  {elsewhere && (
                    <button type="button" className="lr-line" onClick={() => move(c)}>Вернуть в папку «{folderName}»</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {checks && (mine.length > 0 || other.length > 0) && (
        <div className="client-block">
          <h2>🗑 Удалённые отчёты</h2>
          <p className="muted small">
            Этих отчётов больше нет в базе — от них остались только следы. Вернуть их можно лишь из резервной копии базы.
          </p>
          {mine.length > 0 && <p className="small"><b>Точно из папки «{folderName}»</b> (по «Сохранённому»):</p>}
          {mine.map(t => <TraceRow key={"m" + t.multi_check_id} t={t} />)}
          {other.length > 0 && <p className="small"><b>Папка неизвестна</b> (по «Обучению платформы»):</p>}
          {other.map(t => <TraceRow key={"o" + t.multi_check_id} t={t} />)}
        </div>
      )}
    </div>
  );
}

function TraceRow({ t }: { t: DeletedTrace }) {
  return (
    <div className="small lr-line">
      • {t.project_name || "?"} · {t.filename || "(без имени)"}{t.langs.length ? ` · ${t.langs.join(", ")}` : ""}
      <span className="muted"> — №{t.multi_check_id}, видно в: {t.seen_in.join(", ")}</span>
    </div>
  );
}

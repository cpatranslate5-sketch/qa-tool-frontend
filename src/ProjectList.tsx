import { useEffect, useState } from "react";
import { createClient, createProject, learningSummary, listClients, listProjects, setClientCrowdin, setClientDomain, setProjectClient } from "./api";
import type { ClientEntry, Manager, Project } from "./types";

// Main screen: «Заказчики» (2026-10-04) — each client with its styleguide
// button and its projects — then projects without a client.
// Subject area of a client's projects — picks the «ТЕМАТИКА» note for the AI.
const DOMAIN_LABELS: [string, string][] = [
  ["", "Тематика не задана"],
  ["betting", "Беттинг и гемблинг"],
  ["marketing", "Общий маркетинг"],
];

export default function ProjectList({
  manager,
  onOpenProject,
  onOpenClientStyleguide,
  onSwitchFolder,
  onOpenChangePassword,
  onOpenAliases,
  onOpenSaved,
  onOpenLearning,
  onOpenFolderChecks,
}: {
  manager: Manager;
  onOpenProject: (project: Project) => void;
  onOpenClientStyleguide: (client: ClientEntry) => void;
  onSwitchFolder: () => void;
  onOpenChangePassword: () => void;
  onOpenAliases: () => void;
  onOpenSaved: () => void;
  onOpenLearning: () => void;
  onOpenFolderChecks: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<ClientEntry[] | null>(null);
  const [newName, setNewName] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  function reload() {
    listProjects().then(setProjects).catch(() => setError("Не удалось загрузить список проектов."));
    listClients().then(setClients).catch(() => setClients([]));
  }

  useEffect(reload, []);

  // Red counter of new «Обучение платформы» items (admin only).
  const [learningNew, setLearningNew] = useState(0);
  useEffect(() => {
    if (manager.is_admin) learningSummary(manager.id).then(r => setLearningNew(r.new)).catch(() => {});
  }, [manager.id, manager.is_admin]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const project = await createProject(manager.id, newName.trim(), copyFromId ? Number(copyFromId) : undefined);
      if (newClientId) await setProjectClient(project.id, manager.id, Number(newClientId));
      setNewName("");
      setCopyFromId("");
      reload();
    } catch (err) {
      setError(err instanceof Error && err.message === "409" ? "Проект с таким названием уже есть." : "Не удалось создать проект.");
    } finally {
      setCreating(false);
    }
  }

  async function submitClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setError("");
    try {
      await createClient(manager.id, newClientName.trim());
      setNewClientName("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать заказчика.");
    }
  }

  const byId = new Map((projects || []).map(p => [p.id, p]));
  const inClients = new Set((clients || []).flatMap(c => c.projects.map(p => p.id)));
  const loose = (projects || []).filter(p => !inClients.has(p.id));

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Проекты — {manager.name}{manager.is_admin ? " (админ)" : ""}</h1>
        <div className="top-bar-actions">
          <button className="link-button" onClick={onOpenSaved}>Сохранённое</button>
          {manager.is_admin && (
            <button className="link-button" onClick={onOpenLearning}>
              Обучение платформы{learningNew > 0 && <span className="red-badge">{learningNew}</span>}
            </button>
          )}
          {manager.is_admin && <button className="link-button" onClick={onOpenFolderChecks}>Поиск проверок</button>}
          <button className="link-button" onClick={onOpenAliases}>Словарь языков</button>
          <button className="link-button" onClick={onOpenChangePassword}>Сменить пароль</button>
          <button className="link-button" onClick={onSwitchFolder}>Сменить папку</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {manager.is_admin ? (
        <form className="inline-form" onSubmit={submitCreate}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Название нового проекта"
          />
          {clients && clients.length > 0 && (
            <select value={newClientId} onChange={e => setNewClientId(e.target.value)}>
              <option value="">Без заказчика</option>
              {clients.map(c => <option key={c.id} value={c.id}>Заказчик «{c.name}»</option>)}
            </select>
          )}
          {projects && projects.length > 0 && (
            <select value={copyFromId} onChange={e => setCopyFromId(e.target.value)}>
              <option value="">Начать с нуля</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>Скопировать документы из «{p.name}»</option>
              ))}
            </select>
          )}
          <button type="submit" disabled={creating || !newName.trim()}>
            {creating ? "Создаю…" : "Создать проект"}
          </button>
        </form>
      ) : (
        <p className="muted small">Создавать новые проекты может только админская папка — здесь можно открывать и проверять уже существующие.</p>
      )}

      {(projects === null || clients === null) && <div className="muted">Загрузка…</div>}

      {clients && clients.length > 0 && <h2>Заказчики</h2>}
      {clients?.map(c => (
        <div key={c.id} className="client-block">
          <div className="client-head">
            <h2>🏢 {c.name}</h2>
            <button type="button" className="link-button" onClick={() => onOpenClientStyleguide(c)}>📘 Стайлгайд заказчика</button>
            {manager.is_admin ? (
              <select
                className="client-domain"
                value={c.domain || ""}
                title="Тематика текстов — подсказка для ИИ, в каком значении читать слова"
                onChange={e => setClientDomain(c.id, manager.id, e.target.value).then(reload).catch(() => setError("Не удалось сменить тематику."))}
              >
                {DOMAIN_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            ) : null}
            {manager.is_admin ? (
              <label className="client-crowdin" title="Если включено — к принятым замечаниям обязательны ссылки на Crowdin">
                <input
                  type="checkbox"
                  checked={!!c.uses_crowdin}
                  onChange={e => setClientCrowdin(c.id, manager.id, e.target.checked).then(reload).catch(() => setError("Не удалось сохранить."))}
                /> Crowdin
              </label>
            ) : (
              c.domain ? <span className="muted small">{DOMAIN_LABELS.find(d => d[0] === c.domain)?.[1]}</span> : null
            )}
          </div>
          {c.projects.length === 0 && <div className="muted small">Проектов пока нет.</div>}
          <div className="folder-grid">
            {c.projects.map(p => {
              const full = byId.get(p.id) || { id: p.id, name: p.name, created_by_name: "" };
              return (
                <button key={p.id} className="folder-card" onClick={() => onOpenProject(full)}>
                  📁 {p.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {manager.is_admin && (
        <form className="inline-form" onSubmit={submitClient}>
          <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Название нового заказчика" />
          <button type="submit" disabled={!newClientName.trim()}>Создать заказчика</button>
        </form>
      )}

      {projects !== null && clients !== null && (
        <>
          {loose.length > 0 && <h2>{clients.length > 0 ? "Проекты без заказчика" : "Проекты"}</h2>}
          {projects.length === 0 && <div className="muted">Проектов пока нет.</div>}
          <div className="folder-grid">
            {loose.map(p => (
              <button key={p.id} className="folder-card" onClick={() => onOpenProject(p)}>
                📁 {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

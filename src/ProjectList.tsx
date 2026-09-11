import { useEffect, useState } from "react";
import { createProject, listProjects } from "./api";
import type { Manager, Project } from "./types";

export default function ProjectList({
  manager,
  onOpenProject,
  onSwitchFolder,
}: {
  manager: Manager;
  onOpenProject: (project: Project) => void;
  onSwitchFolder: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setError("Не удалось загрузить список проектов."));
  }, []);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const project = await createProject(manager.id, newName.trim());
      setProjects(prev => [...(prev || []), project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err) {
      setError(err instanceof Error && err.message === "409" ? "Проект с таким названием уже есть." : "Не удалось создать проект.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Проекты — {manager.name}{manager.is_admin ? " (админ)" : ""}</h1>
        <button className="link-button" onClick={onSwitchFolder}>Сменить папку</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {manager.is_admin ? (
        <form className="inline-form" onSubmit={submitCreate}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Название нового проекта"
          />
          <button type="submit" disabled={creating || !newName.trim()}>
            {creating ? "Создаю…" : "Создать проект"}
          </button>
        </form>
      ) : (
        <p className="muted small">Создавать новые проекты может только админская папка — здесь можно открывать и проверять уже существующие.</p>
      )}

      {projects === null && <div className="muted">Загрузка…</div>}
      {projects !== null && projects.length === 0 && <div className="muted">Проектов пока нет.</div>}

      <div className="folder-grid">
        {projects?.map(p => (
          <button key={p.id} className="folder-card" onClick={() => onOpenProject(p)}>
            📁 {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

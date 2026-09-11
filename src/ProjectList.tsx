import { useEffect, useState } from "react";
import { createProject, listProjects } from "./api";
import type { Manager, Project } from "./types";

export default function ProjectList({
  manager,
  onOpenProject,
  onLogout,
}: {
  manager: Manager;
  onOpenProject: (project: Project) => void;
  onLogout: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects(manager.id).then(setProjects).catch(() => setError("Не удалось загрузить список проектов."));
  }, [manager.id]);

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
        <h1>Проекты — {manager.name}</h1>
        <button className="link-button" onClick={onLogout}>Выйти</button>
      </div>

      {error && <div className="error-box">{error}</div>}

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

      {projects === null && <div className="muted">Загрузка…</div>}
      {projects !== null && projects.length === 0 && <div className="muted">Проектов пока нет — создайте первый выше.</div>}

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

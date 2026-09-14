import { useEffect, useState } from "react";
import { listManagers, listProjects } from "./api";
import ChangePasswordModal from "./ChangePasswordModal";
import CheckRunner from "./CheckRunner";
import FolderPicker from "./FolderPicker";
import ProjectList from "./ProjectList";
import ProjectView from "./ProjectView";
import { applyTheme, loadTheme, saveTheme, type Theme } from "./theme";
import type { Manager, Project } from "./types";

type View =
  | { name: "projects" }
  | { name: "project"; project: Project }
  | { name: "check"; project: Project; openMultiCheckId?: number };

// Keeps the manager on the exact screen they were on across a page reload
// instead of dropping them back to the folder picker every time — Александр's
// explicit ask ("обновление не должно перекидывать на главную"). Only a
// lightweight pointer is stored (which manager, which screen, which
// project id); both are re-checked against the server on load (see the
// restore effect below) rather than trusted blindly, in case the manager
// or project was deleted meanwhile — a stale pointer just falls back to a
// fresh start instead of getting stuck.
const SESSION_KEY = "qa-tool-session";

type StoredView =
  | { name: "projects" }
  | { name: "project" | "check"; projectId: number };

type StoredSession = { managerId: number; view: StoredView };

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* per-device convenience only — worst case, a refresh goes back to the
       folder picker instead of staying put */
  }
}

export default function App() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [view, setView] = useState<View>({ name: "projects" });
  const [restoring, setRestoring] = useState(true);
  const [theme, setTheme] = useState<Theme>(loadTheme());
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Restore manager + screen from a previous visit, once, on first mount.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const managers = await listManagers();
        const foundManager = managers.find(m => m.id === stored.managerId);
        if (!foundManager) {
          saveStoredSession(null); // folder no longer exists — don't keep retrying this pointer
          return;
        }
        setManager(foundManager);

        if (stored.view.name === "projects") {
          setView({ name: "projects" });
        } else {
          const projects = await listProjects();
          const foundProject = projects.find(p => p.id === stored.view.projectId);
          if (!foundProject) {
            setView({ name: "projects" });
            saveStoredSession({ managerId: foundManager.id, view: { name: "projects" } });
          } else if (stored.view.name === "project") {
            setView({ name: "project", project: foundProject });
          } else {
            setView({ name: "check", project: foundProject });
          }
        }
      } catch {
        // Server unreachable right now — just start fresh rather than
        // getting stuck on a loading screen.
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  }

  function handleEnter(m: Manager) {
    setManager(m);
    setView({ name: "projects" });
    saveStoredSession({ managerId: m.id, view: { name: "projects" } });
  }

  function handleSwitchFolder() {
    setManager(null);
    setView({ name: "projects" });
    saveStoredSession(null);
  }

  function openProject(project: Project) {
    setView({ name: "project", project });
    if (manager) saveStoredSession({ managerId: manager.id, view: { name: "project", projectId: project.id } });
  }

  function openCheck(project: Project, openMultiCheckId?: number) {
    setView({ name: "check", project, openMultiCheckId });
    if (manager) saveStoredSession({ managerId: manager.id, view: { name: "check", projectId: project.id } });
  }

  function backToProjects() {
    setView({ name: "projects" });
    if (manager) saveStoredSession({ managerId: manager.id, view: { name: "projects" } });
  }

  function backToProject(project: Project) {
    setView({ name: "project", project });
    if (manager) saveStoredSession({ managerId: manager.id, view: { name: "project", projectId: project.id } });
  }

  const themeToggle = (
    <button className="theme-toggle" onClick={toggleTheme}>
      {theme === "dark" ? "☀ Светлая тема" : "🌙 Тёмная тема"}
    </button>
  );

  if (restoring) {
    return (
      <>
        {themeToggle}
        <div className="page"><div className="muted">Загрузка…</div></div>
      </>
    );
  }

  return (
    <>
      {themeToggle}
      {showChangePassword && manager && (
        <ChangePasswordModal manager={manager} onClose={() => setShowChangePassword(false)} />
      )}

      {!manager ? (
        <FolderPicker onEnter={handleEnter} />
      ) : view.name === "projects" ? (
        <ProjectList
          manager={manager}
          onOpenProject={openProject}
          onSwitchFolder={handleSwitchFolder}
          onOpenChangePassword={() => setShowChangePassword(true)}
        />
      ) : view.name === "project" ? (
        <ProjectView
          manager={manager}
          project={view.project}
          onOpenCheck={(multiCheckId?: number) => openCheck(view.project, multiCheckId)}
          onProjectDeleted={backToProjects}
          onBack={backToProjects}
        />
      ) : (
        <CheckRunner
          manager={manager}
          project={view.project}
          openMultiCheckId={view.openMultiCheckId}
          onBack={() => backToProject(view.project)}
        />
      )}
    </>
  );
}

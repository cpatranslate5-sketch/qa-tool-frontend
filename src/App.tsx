import { useEffect, useState } from "react";
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
  | { name: "check"; project: Project };

export default function App() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [view, setView] = useState<View>({ name: "projects" });
  const [theme, setTheme] = useState<Theme>(loadTheme());
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  }

  function handleEnter(m: Manager) {
    setManager(m);
    setView({ name: "projects" });
  }

  function handleSwitchFolder() {
    setManager(null);
    setView({ name: "projects" });
  }

  const themeToggle = (
    <button className="theme-toggle" onClick={toggleTheme}>
      {theme === "dark" ? "☀ Светлая тема" : "🌙 Тёмная тема"}
    </button>
  );

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
          onOpenProject={project => setView({ name: "project", project })}
          onSwitchFolder={handleSwitchFolder}
          onOpenChangePassword={() => setShowChangePassword(true)}
        />
      ) : view.name === "project" ? (
        <ProjectView
          manager={manager}
          project={view.project}
          onOpenCheck={() => setView({ name: "check", project: view.project })}
          onProjectDeleted={() => setView({ name: "projects" })}
          onBack={() => setView({ name: "projects" })}
        />
      ) : (
        <CheckRunner
          manager={manager}
          project={view.project}
          onBack={() => setView({ name: "project", project: view.project })}
        />
      )}
    </>
  );
}

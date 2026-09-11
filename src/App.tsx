import { useEffect, useState } from "react";
import Login from "./Login";
import ProjectList from "./ProjectList";
import ProjectView from "./ProjectView";
import LanguageCheck from "./LanguageCheck";
import MultiUpload from "./MultiUpload";
import type { Language, Manager, Project } from "./types";

const STORAGE_KEY = "qa-tool-manager";

type View =
  | { name: "projects" }
  | { name: "project"; project: Project }
  | { name: "language"; project: Project; language: Language }
  | { name: "multi"; project: Project };

export default function App() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [view, setView] = useState<View>({ name: "projects" });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setManager(JSON.parse(saved));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  function handleLogin(m: Manager) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    setManager(m);
    setView({ name: "projects" });
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setManager(null);
    setView({ name: "projects" });
  }

  if (!manager) {
    return <Login onLogin={handleLogin} />;
  }

  if (view.name === "projects") {
    return (
      <ProjectList
        manager={manager}
        onOpenProject={project => setView({ name: "project", project })}
        onLogout={handleLogout}
      />
    );
  }

  if (view.name === "project") {
    return (
      <ProjectView
        manager={manager}
        project={view.project}
        onProjectChange={project => setView({ name: "project", project })}
        onOpenLanguage={language => setView({ name: "language", project: view.project, language })}
        onOpenMulti={() => setView({ name: "multi", project: view.project })}
        onBack={() => setView({ name: "projects" })}
      />
    );
  }

  if (view.name === "language") {
    return (
      <LanguageCheck
        manager={manager}
        project={view.project}
        language={view.language}
        onBack={() => setView({ name: "project", project: view.project })}
      />
    );
  }

  return (
    <MultiUpload
      manager={manager}
      project={view.project}
      onBack={() => setView({ name: "project", project: view.project })}
    />
  );
}

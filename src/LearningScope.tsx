import { useEffect, useState } from "react";
import { listProjects, styleguideMeta } from "./api";
import type { Project } from "./types";

// Shared by «Обучение платформы» and «Разбор комментариев».
// 2026-10-05: «Выбранные проекты» — a lesson can apply to several chosen
// projects (e.g. «1win» + «1win SMM»), not only one / the whole client / all.

let projectsCache: Promise<Project[]> | null = null;
function allProjects(): Promise<Project[]> {
  if (!projectsCache) projectsCache = listProjects().catch(() => { projectsCache = null; return []; });
  return projectsCache;
}

let langsCache: Promise<{ key: string; label: string }[]> | null = null;
function allLangs(): Promise<{ key: string; label: string }[]> {
  if (!langsCache) langsCache = styleguideMeta().then(m => m.langs).catch(() => { langsCache = null; return []; });
  return langsCache;
}

export function ScopeChooser({
  item, scope, setScope, langScope, setLangScope, projectIds, setProjectIds, presetProjectId, groupClientId,
  langKeys, setLangKeys, presetLangKey,
}: {
  item: { project_name: string; client_name?: string; client_id: number | null; project_id: number | null; lang_label: string };
  scope: string;
  setScope: (v: string) => void;
  langScope: string;
  setLangScope: (v: string) => void;
  projectIds: number[];
  setProjectIds: (v: number[]) => void;
  // The lesson editor passes a placeholder item; these carry the real values.
  presetProjectId?: number | null;
  groupClientId?: number | null;
  langKeys: string[];
  setLangKeys: (v: string[]) => void;
  presetLangKey?: string;
}) {
  const preset = presetProjectId !== undefined ? presetProjectId : item.project_id;
  const groupClient = groupClientId !== undefined ? groupClientId : item.client_id;
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    if (scope === "projects" && projects === null) allProjects().then(setProjects);
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const [langs, setLangs] = useState<{ key: string; label: string }[] | null>(null);
  useEffect(() => {
    if (langScope === "langs" && langs === null) allLangs().then(setLangs);
  }, [langScope]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickLangs() {
    setLangScope("langs");
    if (langKeys.length === 0 && presetLangKey) setLangKeys([presetLangKey]);
  }

  function toggleLang(k: string) {
    setLangKeys(langKeys.includes(k) ? langKeys.filter(x => x !== k) : [...langKeys, k]);
  }

  function pickProjects() {
    setScope("projects");
    if (projectIds.length === 0 && preset) setProjectIds([preset]);
  }

  function toggle(id: number) {
    setProjectIds(projectIds.includes(id) ? projectIds.filter(x => x !== id) : [...projectIds, id]);
  }

  // The item's own client first — that's where the related projects usually are.
  const sameClient = (projects || []).filter(p => groupClient && p.client_id === groupClient);
  const others = (projects || []).filter(p => !(groupClient && p.client_id === groupClient));

  const box = (p: Project) => (
    <label key={p.id} className="sg-check">
      <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}
    </label>
  );

  return (
    <div className="lr-scope">
      <div>
        <div className="sg-k">Где действует</div>
        <label className="sg-check"><input type="radio" checked={scope === "project"} disabled={!item.project_id} onChange={() => setScope("project")} /> Только проект «{item.project_name || "—"}»</label>
        <label className="sg-check"><input type="radio" checked={scope === "projects"} onChange={pickProjects} /> Выбранные проекты{scope === "projects" && projectIds.length ? ` (${projectIds.length})` : "…"}</label>
        <label className="sg-check"><input type="radio" checked={scope === "client"} disabled={!item.client_id} onChange={() => setScope("client")} /> Все проекты заказчика{item.client_name ? ` «${item.client_name}»` : ""}</label>
        <label className="sg-check"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Все проекты</label>
        {scope === "projects" && (
          <div className="lr-projects">
            {projects === null && <div className="muted small">Загрузка проектов…</div>}
            {sameClient.length > 0 && (
              <>
                <div className="muted small">Проекты того же заказчика</div>
                {sameClient.map(box)}
              </>
            )}
            {others.length > 0 && (
              <>
                {sameClient.length > 0 && <div className="muted small lr-projects-sep">Другие проекты</div>}
                {others.map(box)}
              </>
            )}
            {projects !== null && projectIds.length === 0 && <div className="muted small">Отметьте хотя бы один проект.</div>}
          </div>
        )}
      </div>
      <div>
        <div className="sg-k">Язык</div>
        <label className="sg-check"><input type="radio" checked={langScope === "lang"} onChange={() => setLangScope("lang")} /> Только {item.lang_label}</label>
        <label className="sg-check"><input type="radio" checked={langScope === "langs"} onChange={pickLangs} /> Выбранные языки{langScope === "langs" && langKeys.length ? ` (${langKeys.length})` : "…"}</label>
        <label className="sg-check"><input type="radio" checked={langScope === "all"} onChange={() => setLangScope("all")} /> Все языки</label>
        {langScope === "langs" && (
          <div className="lr-projects lr-langs">
            {langs === null && <div className="muted small">Загрузка языков…</div>}
            {(langs || []).map(l => (
              <label key={l.key} className="sg-check">
                <input type="checkbox" checked={langKeys.includes(l.key)} onChange={() => toggleLang(l.key)} /> {l.label}
              </label>
            ))}
            {langs !== null && langKeys.length === 0 && <div className="muted small">Отметьте хотя бы один язык.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

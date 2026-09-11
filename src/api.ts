import type {
  Finding,
  Language,
  Manager,
  MultiCheckHistoryEntry,
  MultiCheckResponse,
  Project,
  SingleCheckHistoryEntry,
} from "./types";

export const API_URL = import.meta.env.VITE_API_URL || "https://web-production-f70ad.up.railway.app";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = String(res.status);
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

// --- folders (managers) ---

export function listManagers(): Promise<Manager[]> {
  return request("/managers");
}

export function createManagerFolder(name: string, code: string): Promise<Manager> {
  return request("/managers", { method: "POST", body: JSON.stringify({ name, code }) });
}

export function unlockManagerFolder(managerId: number, code: string): Promise<Manager> {
  return request(`/managers/${managerId}/unlock`, { method: "POST", body: JSON.stringify({ code }) });
}

// --- projects (shared; structural changes require an admin manager_id) ---

export function listProjects(): Promise<Project[]> {
  return request("/projects");
}

export function createProject(managerId: number, name: string): Promise<Project> {
  return request("/projects", { method: "POST", body: JSON.stringify({ name, manager_id: managerId }) });
}

export function updateGlossary(managerId: number, projectId: number, glossary: string): Promise<Project> {
  return request(`/projects/${projectId}/glossary`, {
    method: "PUT",
    body: JSON.stringify({ glossary, manager_id: managerId }),
  });
}

export function listLanguages(projectId: number): Promise<Language[]> {
  return request(`/projects/${projectId}/languages`);
}

export function addLanguage(managerId: number, projectId: number, langCode: string): Promise<Language> {
  return request(`/projects/${projectId}/languages`, {
    method: "POST",
    body: JSON.stringify({ lang_code: langCode, manager_id: managerId }),
  });
}

export function runCheck(params: {
  source: string;
  translation: string;
  checks: string[];
  projectId?: number;
  languageId?: number;
  glossary?: string;
  managerName?: string;
}): Promise<{ findings: Finding[]; single_check_id: number | null }> {
  return request("/check", {
    method: "POST",
    body: JSON.stringify({
      source: params.source,
      translation: params.translation,
      checks: params.checks,
      project_id: params.projectId,
      language_id: params.languageId,
      glossary: params.glossary || "",
      manager_name: params.managerName || "",
    }),
  });
}

export function singleCheckHistory(projectId: number, languageId: number): Promise<SingleCheckHistoryEntry[]> {
  return request(`/projects/${projectId}/languages/${languageId}/history`);
}

export async function multiCheck(
  projectId: number,
  file: File,
  sourceLang: string,
  managerName: string
): Promise<MultiCheckResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_lang", sourceLang);
  formData.append("manager_name", managerName);
  const res = await fetch(`${API_URL}/projects/${projectId}/multi-check`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    let detail = String(res.status);
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function multiCheckHistory(projectId: number): Promise<MultiCheckHistoryEntry[]> {
  return request(`/projects/${projectId}/multi-check`);
}

export function multiCheckDetail(projectId: number, multiCheckId: number): Promise<MultiCheckResponse> {
  return request(`/projects/${projectId}/multi-check/${multiCheckId}`);
}

export function multiCheckReportUrl(projectId: number, multiCheckId: number): string {
  return `${API_URL}/projects/${projectId}/multi-check/${multiCheckId}/report.xlsx`;
}

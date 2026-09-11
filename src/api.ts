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

export async function login(name: string, code: string): Promise<{ manager: Manager; isNew: boolean }> {
  const res = await request<{ manager_id: number; name: string; is_new: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ name, code }),
  });
  return { manager: { id: res.manager_id, name: res.name }, isNew: res.is_new };
}

export function listProjects(managerId: number): Promise<Project[]> {
  return request(`/managers/${managerId}/projects`);
}

export function createProject(managerId: number, name: string): Promise<Project> {
  return request(`/managers/${managerId}/projects`, { method: "POST", body: JSON.stringify({ name }) });
}

export function updateGlossary(managerId: number, projectId: number, glossary: string): Promise<Project> {
  return request(`/managers/${managerId}/projects/${projectId}/glossary`, {
    method: "PUT",
    body: JSON.stringify({ glossary }),
  });
}

export function listLanguages(managerId: number, projectId: number): Promise<Language[]> {
  return request(`/managers/${managerId}/projects/${projectId}/languages`);
}

export function addLanguage(managerId: number, projectId: number, langCode: string): Promise<Language> {
  return request(`/managers/${managerId}/projects/${projectId}/languages`, {
    method: "POST",
    body: JSON.stringify({ lang_code: langCode }),
  });
}

export function runCheck(params: {
  source: string;
  translation: string;
  checks: string[];
  projectId?: number;
  languageId?: number;
  glossary?: string;
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
    }),
  });
}

export function singleCheckHistory(
  managerId: number,
  projectId: number,
  languageId: number
): Promise<SingleCheckHistoryEntry[]> {
  return request(`/managers/${managerId}/projects/${projectId}/languages/${languageId}/history`);
}

export async function multiCheck(
  managerId: number,
  projectId: number,
  file: File,
  sourceLang: string
): Promise<MultiCheckResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_lang", sourceLang);
  const res = await fetch(`${API_URL}/managers/${managerId}/projects/${projectId}/multi-check`, {
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

export function multiCheckHistory(managerId: number, projectId: number): Promise<MultiCheckHistoryEntry[]> {
  return request(`/managers/${managerId}/projects/${projectId}/multi-check`);
}

export function multiCheckDetail(managerId: number, projectId: number, multiCheckId: number): Promise<MultiCheckResponse> {
  return request(`/managers/${managerId}/projects/${projectId}/multi-check/${multiCheckId}`);
}

export function multiCheckReportUrl(managerId: number, projectId: number, multiCheckId: number): string {
  return `${API_URL}/managers/${managerId}/projects/${projectId}/multi-check/${multiCheckId}/report.xlsx`;
}

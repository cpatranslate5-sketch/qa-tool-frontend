import type {
  Finding,
  Manager,
  MultiCheckHistoryEntry,
  MultiCheckResponse,
  Project,
  SingleCheckHistoryEntry,
  ToneStatus,
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

async function requestForm<T>(path: string, formData: FormData, method = "POST"): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method, body: formData });
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

export function changePassword(managerId: number, currentCode: string, newCode: string): Promise<Manager> {
  return request(`/managers/${managerId}/change-password`, {
    method: "POST",
    body: JSON.stringify({ current_code: currentCode, new_code: newCode }),
  });
}

// Lets someone who already has admin access on this device open any other
// folder without typing that folder's own password (see FolderPicker.tsx).
export function adminEnterManager(managerId: number, adminManagerId: number): Promise<Manager> {
  return request(`/managers/${managerId}/admin-enter`, {
    method: "POST",
    body: JSON.stringify({ admin_manager_id: adminManagerId }),
  });
}

// --- projects (shared; structural changes require an admin manager_id) ---

export function listProjects(): Promise<Project[]> {
  return request("/projects");
}

export function createProject(managerId: number, name: string, copyFromProjectId?: number): Promise<Project> {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify({ name, manager_id: managerId, copy_from_project_id: copyFromProjectId ?? null }),
  });
}

export function deleteProject(projectId: number, managerId: number, code: string): Promise<void> {
  return request(`/projects/${projectId}`, {
    method: "DELETE",
    body: JSON.stringify({ manager_id: managerId, code }),
  });
}

export function knownLanguages(projectId: number): Promise<{ languages: string[] }> {
  return request(`/projects/${projectId}/known-languages`);
}

// Language codes actually found as column headers in an uploaded file —
// used once a file is selected in the multi-check flow, so the target-
// language checkboxes reflect what's really IN this file rather than only
// what the project's Tone document happens to mention (a language can be
// legitimately present in the file without ever needing a tone-of-address
// rule — English chiefly, which rarely needs a ты/вы-style distinction).
export function detectFileLanguages(projectId: number, file: File): Promise<{ languages: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  return requestForm(`/projects/${projectId}/multi-check/detect-languages`, formData);
}

// --- reference documents (tone-of-address) ---

export function getToneStatus(projectId: number): Promise<ToneStatus> {
  return request(`/projects/${projectId}/tone/status`);
}

export function uploadTone(managerId: number, projectId: number, file: File): Promise<ToneStatus> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("manager_id", String(managerId));
  return requestForm(`/projects/${projectId}/tone/upload`, formData);
}

// --- checking: one text pair (single target language) ---

export function runCheck(params: {
  source: string;
  translation: string;
  checks: string[];
  projectId: number;
  sourceLang: string;
  targetLang: string;
  extraInstructions?: string;
  managerName?: string;
  managerId?: number;
}): Promise<{ findings: Finding[]; single_check_id: number | null; cost_usd: number }> {
  return request("/check", {
    method: "POST",
    body: JSON.stringify({
      source: params.source,
      translation: params.translation,
      checks: params.checks,
      project_id: params.projectId,
      source_lang: params.sourceLang,
      target_lang: params.targetLang,
      extra_instructions: params.extraInstructions || "",
      manager_name: params.managerName || "",
      manager_id: params.managerId ?? null,
    }),
  });
}

// History is scoped to the requesting folder only — each manager only sees
// their own runs (not every folder's), so managerId is required.
export function singleCheckHistory(projectId: number, managerId: number): Promise<SingleCheckHistoryEntry[]> {
  return request(`/projects/${projectId}/history?manager_id=${managerId}`);
}

// --- checking: an uploaded document (one or more target languages) ---

export function multiCheck(
  projectId: number,
  file: File,
  sourceLang: string,
  managerName: string,
  managerId: number,
  checks: string[],
  extraInstructions: string,
  targetLangs: string[],
  // "Срочно" — forces the instant (2x price) path instead of Anthropic's
  // cheaper but up-to-an-hour batch queue, for a large upload that can't wait.
  urgent = false
): Promise<MultiCheckResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_lang", sourceLang);
  formData.append("manager_name", managerName);
  formData.append("manager_id", String(managerId));
  formData.append("checks", checks.join(","));
  formData.append("extra_instructions", extraInstructions);
  formData.append("target_langs", targetLangs.join(","));
  if (urgent) formData.append("urgent", "true");
  return requestForm(`/projects/${projectId}/multi-check`, formData);
}

export function multiCheckHistory(projectId: number, managerId: number): Promise<MultiCheckHistoryEntry[]> {
  return request(`/projects/${projectId}/multi-check?manager_id=${managerId}`);
}

export function multiCheckDetail(projectId: number, multiCheckId: number, managerId: number): Promise<MultiCheckResponse> {
  return request(`/projects/${projectId}/multi-check/${multiCheckId}?manager_id=${managerId}`);
}

export function multiCheckReportUrl(projectId: number, multiCheckId: number, managerId: number): string {
  return `${API_URL}/projects/${projectId}/multi-check/${multiCheckId}/report.xlsx?manager_id=${managerId}`;
}

import type {
  Finding,
  LanguageAlias,
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

// The project's manually-curated "which languages do I check here"
// catalog — the ONLY source of the target-language checkboxes. Changes
// only through addCatalogLanguage/deleteCatalogLanguage below, never as
// a side effect of uploading a Tone document or a file to check.
export function knownLanguages(projectId: number): Promise<{ languages: string[] }> {
  return request(`/projects/${projectId}/known-languages`);
}

export function addCatalogLanguage(projectId: number, managerId: number, langCode: string): Promise<{ languages: string[] }> {
  return request(`/projects/${projectId}/languages`, {
    method: "POST",
    body: JSON.stringify({ manager_id: managerId, lang_code: langCode }),
  });
}

export function deleteCatalogLanguage(projectId: number, managerId: number, langCode: string): Promise<{ languages: string[] }> {
  return request(`/projects/${projectId}/languages/${encodeURIComponent(langCode)}?manager_id=${managerId}`, {
    method: "DELETE",
  });
}

// Language codes found as column headers in an uploaded file, checked
// against the project's own catalog above — used once a file is selected
// in the multi-check flow, purely as an ADVISORY (the checkboxes
// themselves never change based on this). Three buckets:
// - languages: found in the file AND already on the catalog — real,
//   checkable target languages.
// - unknown_languages: look language-shaped but aren't on the catalog at
//   all (Александр's concrete case: a column literally labelled "PR",
//   meant as Portuguese but not a real code for it, used to silently
//   become a selectable target language with Peru's flag) — surfaced so
//   the manager can rename the column (if it's a mistake) or explicitly
//   add the language to the catalog (if it's genuinely new).
// - unrecognized_columns: header text parse_workbook couldn't recognize
//   as a language at all (or as Context/Max length/a known meta column).
// All surfaced before the manager presses "start", so any of the three
// situations can be caught and fixed up front rather than only noticed
// afterward, by which point an AI-backed check may already have run
// without ever covering the language that needed it.
export function detectFileLanguages(
  projectId: number, file: File
): Promise<{ languages: string[]; unknown_languages: string[]; unrecognized_columns: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  return requestForm(`/projects/${projectId}/multi-check/detect-languages`, formData);
}

// Александр's redesign of the language-selection flow: instead of trusting
// an auto-generated "here's what we found" list (easy to miss an ABSENCE
// from — that's exactly how a real language went missing before this
// existed), the manager ticks which languages they expect, presses
// "Подтвердить выбор языков", and this is the explicit per-language yes/no
// that drives it — found via the same safe bridging resolve_lang_code uses
// everywhere else (a code spelled differently in the file still counts),
// missing only when nothing safely matches.
export function verifyLanguages(
  projectId: number, file: File, codes: string[]
): Promise<{ results: { code: string; found: boolean }[] }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("codes", codes.join(","));
  return requestForm(`/projects/${projectId}/multi-check/verify-languages`, formData);
}

// --- language alias dictionary (GLOBAL — not scoped to a project, unlike
// the catalog above; open to every folder, not just admin — see
// app.main's "language aliases" section and LanguageAliases.tsx) ---

export function listLanguageAliases(): Promise<{ aliases: LanguageAlias[] }> {
  return request("/language-aliases");
}

export function addLanguageAlias(managerId: number, alias: string, canonicalCode: string): Promise<{ aliases: LanguageAlias[] }> {
  return request("/language-aliases", {
    method: "POST",
    body: JSON.stringify({ manager_id: managerId, alias, canonical_code: canonicalCode }),
  });
}

export function deleteLanguageAlias(aliasId: number, managerId: number): Promise<{ aliases: LanguageAlias[] }> {
  return request(`/language-aliases/${aliasId}?manager_id=${managerId}`, { method: "DELETE" });
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

export function deleteSingleCheck(projectId: number, singleCheckId: number, managerId: number): Promise<void> {
  return request(`/projects/${projectId}/history/${singleCheckId}?manager_id=${managerId}`, { method: "DELETE" });
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

// Deletes one uploaded-document check from this manager's own history —
// scoped server-side exactly like every other multi-check lookup, so this
// can only ever affect the requesting manager's own uploads.
export function deleteMultiCheck(projectId: number, multiCheckId: number, managerId: number): Promise<void> {
  return request(`/projects/${projectId}/multi-check/${multiCheckId}?manager_id=${managerId}`, { method: "DELETE" });
}

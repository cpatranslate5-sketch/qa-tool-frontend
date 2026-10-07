import type {
  ClientEntry,
  ClientStyleguide,
  ProjectStyleguide,
  SgMeta,
  SgValue,
  Finding,
  LanguageAlias,
  SavedCase,
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

export function getProject(projectId: number): Promise<Project> {
  return request(`/projects/${projectId}`);
}

export function updateProjectDescription(projectId: number, managerId: number, description: string): Promise<Project> {
  return request(`/projects/${projectId}/description`, {
    method: "PUT",
    body: JSON.stringify({ manager_id: managerId, description }),
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
// a side effect of uploading a file to check.
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
// - duplicate_languages: a language code assigned to 2+ columns in the
//   file (e.g. two columns both headed "ru") — {code: ["Sheet: C, AA"]}.
//   Only one column's data can actually be used per row, so this is a
//   real ambiguity the manager should resolve, not a cosmetic quirk —
//   caught live on Александр's real file (2026-09-22).
// All surfaced before the manager presses "start", so any of these
// situations can be caught and fixed up front rather than only noticed
// afterward, by which point an AI-backed check may already have run
// without ever covering the language that needed it.
export function detectFileLanguages(
  projectId: number, file: File
): Promise<{
  languages: string[];
  unknown_languages: string[];
  unrecognized_columns: string[];
  duplicate_languages: Record<string, string[]>;
}> {
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
): Promise<{ results: { code: string; found: boolean; missing_from_sheets: string[] }[] }> {
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

// --- «Сохранённое» (2026-10-01): interesting cases saved from reports with
// the 💾 button — each folder sees only its own, see app.main "Сохранённое" ---

export function listSavedCases(managerId: number): Promise<{ cases: SavedCase[] }> {
  return request(`/saved-cases?manager_id=${managerId}`);
}

export function deleteSavedCase(caseId: number, managerId: number): Promise<{ ok: boolean }> {
  return request(`/saved-cases/${caseId}?manager_id=${managerId}`, { method: "DELETE" });
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

// Report page for a single («точечная») check — the backend turns it into a
// report record once, so the whole review / translator-link flow works.
export function singleCheckReport(projectId: number, singleCheckId: number, managerId: number): Promise<{ multi_check_id: number }> {
  return request(`/projects/${projectId}/history/${singleCheckId}/report?manager_id=${managerId}`, { method: "POST" });
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

// --- clients («Заказчики») & styleguides (2026-10-04) ---

export function listClients(): Promise<ClientEntry[]> {
  return request("/clients");
}

export function createClient(managerId: number, name: string): Promise<ClientEntry> {
  return request("/clients", { method: "POST", body: JSON.stringify({ manager_id: managerId, name }) });
}

export function setClientDomain(clientId: number, managerId: number, domain: string): Promise<ClientEntry> {
  return request(`/clients/${clientId}/domain`, { method: "PUT", body: JSON.stringify({ manager_id: managerId, domain }) });
}

export function setClientCrowdin(clientId: number, managerId: number, usesCrowdin: boolean): Promise<ClientEntry> {
  return request(`/clients/${clientId}/crowdin`, { method: "PUT", body: JSON.stringify({ manager_id: managerId, uses_crowdin: usesCrowdin }) });
}

export function setProjectClient(projectId: number, managerId: number, clientId: number | null): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}/client`, {
    method: "PUT",
    body: JSON.stringify({ manager_id: managerId, client_id: clientId }),
  });
}

export function styleguideMeta(): Promise<SgMeta> {
  return request("/styleguide/meta");
}

export function getClientStyleguide(clientId: number): Promise<ClientStyleguide> {
  return request(`/clients/${clientId}/styleguide`);
}

export function getProjectStyleguide(projectId: number): Promise<ProjectStyleguide> {
  return request(`/projects/${projectId}/styleguide`);
}

export function saveClientSection(clientId: number, managerId: number, lang: string, section: string, value: SgValue): Promise<ClientStyleguide> {
  return request(`/clients/${clientId}/styleguide`, {
    method: "PUT",
    body: JSON.stringify({ manager_id: managerId, lang, section, value }),
  });
}

export function saveProjectSection(projectId: number, managerId: number, lang: string, section: string, value: SgValue | null): Promise<ProjectStyleguide> {
  return request(`/projects/${projectId}/styleguide`, {
    method: "PUT",
    body: JSON.stringify({ manager_id: managerId, lang, section, value }),
  });
}

export function revertStyleguideChange<T>(changeId: number, managerId: number): Promise<T> {
  return request(`/styleguide/changes/${changeId}/revert`, {
    method: "POST",
    body: JSON.stringify({ manager_id: managerId }),
  });
}

// --- «Обучение платформы» (2026-10-04) ---
export interface LearningItem {
  id: number;
  origin: "okk" | "translator";
  status: "new" | "postponed" | "dismissed" | "learned";
  multi_check_id: number;
  project_id: number | null;
  project_name: string;
  client_id: number | null;
  client_name: string;
  filename: string;
  lang_code: string;
  lang_key: string;
  lang_label: string;
  excel_row: number;
  context: string;
  finding_type: string;
  finding_message: string;
  source: string;
  translation: string;
  translator_comment: string;
  okk_note: string;
  lesson_id: number | null;
  resolved_by_name: string;
  created_at: string | null;
  resolved_at: string | null;
}

export interface LessonHistoryEntry {
  action: string;
  snapshot: { text: string; project_id: number | null; client_id: number | null; lang_key: string; status: string } | null;
  by_name: string;
  created_at: string | null;
}

export interface Lesson {
  id: number;
  text: string;
  project_id: number | null;
  client_id: number | null;
  lang_key: string;
  lang_label: string;
  scope_label: string;
  example: { finding_message?: string; source?: string; translation?: string; project_name?: string; lang_code?: string; item_id?: number };
  status: "active" | "disabled" | "deleted";
  used_count: number;
  created_by_name: string;
  created_at: string | null;
  updated_at: string | null;
  history: LessonHistoryEntry[];
}

export function learningSummary(managerId: number): Promise<{ new: number }> {
  return request(`/learning/summary?manager_id=${managerId}`);
}

export function learningItems(managerId: number, status: string): Promise<{ items: LearningItem[]; counts: Record<string, number> }> {
  return request(`/learning/items?manager_id=${managerId}&status=${status}`);
}

export function learnItem(itemId: number, managerId: number, text: string, scope: string, langScope: string): Promise<{ item: LearningItem; lesson: Lesson }> {
  return request(`/learning/items/${itemId}/learn`, {
    method: "POST",
    body: JSON.stringify({ manager_id: managerId, text, scope, lang_scope: langScope }),
  });
}

export function setItemStatus(itemId: number, managerId: number, status: string): Promise<{ item: LearningItem }> {
  return request(`/learning/items/${itemId}/status`, { method: "POST", body: JSON.stringify({ manager_id: managerId, status }) });
}

export function listLessons(managerId: number): Promise<{ lessons: Lesson[] }> {
  return request(`/learning/lessons?manager_id=${managerId}`);
}

export function updateLesson(lessonId: number, managerId: number, patch: { text?: string; scope?: string; lang_scope?: string; status?: string }): Promise<Lesson> {
  return request(`/learning/lessons/${lessonId}`, { method: "PUT", body: JSON.stringify({ manager_id: managerId, ...patch }) });
}

// --- Admin: «Поиск проверок папки» (2026-10-04) ---
export type FolderCheck = {
  kind: "file" | "point";
  id: number;
  project_id: number;
  project_name: string;
  client_name: string;
  title: string;
  langs: string[];
  findings: number | null;
  status: string;
  created_at: string;
  owner_id: number | null;
  owner_name: string;
  performed_by_name: string;
};
export type DeletedTrace = {
  multi_check_id: number;
  project_name: string;
  filename: string;
  langs: string[];
  seen_in: string[];
  this_folder: boolean;
};
export function adminFolderChecks(managerId: number, folderId: number): Promise<{
  folder: { id: number; name: string }; checks: FolderCheck[]; deleted_traces: DeletedTrace[];
}> {
  return request(`/admin/folder-checks?manager_id=${managerId}&folder_id=${folderId}`);
}
export function adminMoveCheck(managerId: number, kind: string, checkId: number, folderId: number): Promise<{ ok: boolean }> {
  return request("/admin/checks/move", {
    method: "POST",
    body: JSON.stringify({ manager_id: managerId, kind, check_id: checkId, folder_id: folderId }),
  });
}

// --- Word / PowerPoint / JSON → Excel table (2026-10-05) ---
export type ConvertInfo = { mode: string; rows: number; sheets: number; warnings: string[] };
export function convertDocument(
  projectId: number, original: File, translation: File | null, sourceLang: string, targetLang: string,
): Promise<{ xlsx_b64: string; info: ConvertInfo }> {
  const fd = new FormData();
  fd.append("original", original);
  if (translation) fd.append("translation", translation);
  fd.append("source_lang", sourceLang);
  fd.append("target_lang", targetLang);
  return requestForm(`/projects/${projectId}/convert`, fd);
}

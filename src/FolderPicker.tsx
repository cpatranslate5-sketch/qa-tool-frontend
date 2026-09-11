import { useEffect, useState } from "react";
import { createManagerFolder, listManagers, unlockManagerFolder } from "./api";
import type { Manager } from "./types";

const TRUSTED_KEY = "qa-tool-trusted-managers";

function loadTrusted(): Manager[] {
  try {
    const raw = localStorage.getItem(TRUSTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function rememberTrusted(manager: Manager) {
  const trusted = loadTrusted().filter(m => m.id !== manager.id);
  trusted.push(manager);
  try {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted));
  } catch {
    /* ignore */
  }
}

export default function FolderPicker({ onEnter }: { onEnter: (manager: Manager) => void }) {
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [trusted, setTrusted] = useState<Manager[]>(loadTrusted());
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"list" | "unlock" | "create">("list");
  const [activeManager, setActiveManager] = useState<Manager | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listManagers().then(setManagers).catch(() => setError("Не удалось загрузить список папок."));
  }, []);

  const trustedIds = new Set(trusted.map(m => m.id));

  function openFolder(manager: Manager) {
    if (trustedIds.has(manager.id)) {
      onEnter(manager);
      return;
    }
    setActiveManager(manager);
    setCodeInput("");
    setError("");
    setMode("unlock");
  }

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!activeManager || !codeInput.trim()) return;
    setBusy(true);
    setError("");
    try {
      const manager = await unlockManagerFolder(activeManager.id, codeInput.trim());
      rememberTrusted(manager);
      setTrusted(loadTrusted());
      onEnter(manager);
    } catch (err) {
      setError(err instanceof Error && err.message === "401" ? "Неверный код." : "Не удалось открыть папку.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newCode.trim()) return;
    setBusy(true);
    setError("");
    try {
      const manager = await createManagerFolder(newName.trim(), newCode.trim());
      rememberTrusted(manager);
      setTrusted(loadTrusted());
      onEnter(manager);
    } catch (err) {
      setError(err instanceof Error && err.message === "409" ? "Папка с таким именем уже есть." : "Не удалось создать папку.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "unlock" && activeManager) {
    return (
      <div className="page login-page">
        <h1>Папка «{activeManager.name}»</h1>
        <form className="login-form" onSubmit={submitUnlock}>
          <label>Код доступа</label>
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            type="password"
            placeholder="Код этой папки"
            autoFocus
          />
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={busy || !codeInput.trim()}>
            {busy ? "Открываю…" : "Открыть папку"}
          </button>
        </form>
        <button className="link-button" onClick={() => setMode("list")}>← Назад к списку папок</button>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="page login-page">
        <h1>Новая папка</h1>
        <form className="login-form" onSubmit={submitCreate}>
          <label>Имя папки</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Например: Александр" autoFocus />

          <label>Код доступа</label>
          <input value={newCode} onChange={e => setNewCode(e.target.value)} type="password" placeholder="Придумайте код" />

          <p className="muted small">
            Имя папки должно быть уникальным. Код нужно будет вводить только на новых устройствах — на этом браузере он запомнится.
          </p>

          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={busy || !newName.trim() || !newCode.trim()}>
            {busy ? "Создаю…" : "Создать папку"}
          </button>
        </form>
        <button className="link-button" onClick={() => setMode("list")}>← Назад к списку папок</button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>QA переводов</h1>
      <p className="muted small">Выберите папку.</p>

      {error && <div className="error-box">{error}</div>}
      {managers === null && <div className="muted">Загрузка…</div>}

      <div className="folder-grid">
        {managers?.map(m => (
          <button key={m.id} className="folder-card" onClick={() => openFolder(m)}>
            📁 {m.name}{m.is_admin ? " (админ)" : ""}
            {!trustedIds.has(m.id) && <span className="muted small lock-hint"> 🔒</span>}
          </button>
        ))}
        <button className="folder-card create-folder-card" onClick={() => { setMode("create"); setError(""); }}>
          + Создать новую папку
        </button>
      </div>
    </div>
  );
}

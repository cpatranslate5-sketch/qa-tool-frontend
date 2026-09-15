import { useState } from "react";
import { changePassword } from "./api";
import type { Manager } from "./types";

// Point 1 of Александр's spec — every folder (not just admin) can change its
// own password, from anywhere the top bar is shown.
export default function ChangePasswordModal({
  manager,
  onClose,
}: {
  manager: Manager;
  onClose: () => void;
}) {
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCode2, setNewCode2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentCode.trim() || !newCode.trim()) return;
    if (newCode !== newCode2) {
      setError("Новые пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changePassword(manager.id, currentCode.trim(), newCode.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message === "401" ? "Текущий пароль неверен." : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2>Смена пароля — «{manager.name}»</h2>
        {done ? (
          <>
            <p className="muted small">Пароль изменён. На этом устройстве он не понадобится — он запомнен, но на новых устройствах нужно будет ввести новый.</p>
            <div className="modal-actions">
              <button onClick={onClose}>Готово</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>Текущий пароль</label>
            <input value={currentCode} onChange={e => setCurrentCode(e.target.value)} type="password" autoFocus />
            <label>Новый пароль</label>
            <input value={newCode} onChange={e => setNewCode(e.target.value)} type="password" />
            <label>Повторите новый пароль</label>
            <input value={newCode2} onChange={e => setNewCode2(e.target.value)} type="password" />
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>Отмена</button>
              <button type="submit" disabled={busy || !currentCode.trim() || !newCode.trim() || !newCode2.trim()}>
                {busy ? "Меняю…" : "Сменить пароль"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

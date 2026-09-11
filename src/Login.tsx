import { useState } from "react";
import { login } from "./api";
import type { Manager } from "./types";

export default function Login({ onLogin }: { onLogin: (manager: Manager) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await login(name.trim(), code.trim());
      if (res.isNew) {
        setInfo("Это имя используется впервые — запомнили новый код для него.");
      }
      onLogin(res.manager);
    } catch (err) {
      setError(err instanceof Error && err.message === "401" ? "Неверный код для этого имени." : "Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <h1>QA переводов</h1>
      <form className="login-form" onSubmit={submit}>
        <label>Имя менеджера</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Александр" autoFocus />

        <label>Код доступа</label>
        <input value={code} onChange={e => setCode(e.target.value)} type="password" placeholder="Придумайте код при первом входе" />

        <p className="muted small">
          Первый вход с новым именем создаёт вашу папку менеджера — придуманный код нужно будет вводить при следующих входах.
        </p>

        {error && <div className="error-box">{error}</div>}
        {info && <div className="info-box">{info}</div>}

        <button type="submit" disabled={loading || !name.trim() || !code.trim()}>
          {loading ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

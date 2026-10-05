// Shared by «Обучение платформы» and «Разбор комментариев».

export function ScopeChooser({
  item, scope, setScope, langScope, setLangScope,
}: {
  item: { project_name: string; client_name?: string; client_id: number | null; project_id: number | null; lang_label: string };
  scope: string;
  setScope: (v: string) => void;
  langScope: string;
  setLangScope: (v: string) => void;
}) {
  return (
    <div className="lr-scope">
      <div>
        <div className="sg-k">Где действует</div>
        <label className="sg-check"><input type="radio" checked={scope === "project"} disabled={!item.project_id} onChange={() => setScope("project")} /> Только проект «{item.project_name || "—"}»</label>
        <label className="sg-check"><input type="radio" checked={scope === "client"} disabled={!item.client_id} onChange={() => setScope("client")} /> Все проекты заказчика{item.client_name ? ` «${item.client_name}»` : ""}</label>
        <label className="sg-check"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Все проекты</label>
      </div>
      <div>
        <div className="sg-k">Язык</div>
        <label className="sg-check"><input type="radio" checked={langScope === "lang"} onChange={() => setLangScope("lang")} /> Только {item.lang_label}</label>
        <label className="sg-check"><input type="radio" checked={langScope === "all"} onChange={() => setLangScope("all")} /> Все языки</label>
      </div>
    </div>
  );
}

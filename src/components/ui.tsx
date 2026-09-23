import { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          {subtitle ? <p>{subtitle}</p> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

const badgeTone: Record<string, string> = {
  sealed: "tone-info",
  active: "tone-ok",
  resurveying: "tone-warn",
  pending: "tone-warn",
  released: "tone-ok",
  returned: "tone-danger",
  健康: "tone-ok",
  变形关注: "tone-warn",
  病害预警: "tone-danger",
  锁定: "tone-info",
  待补录: "tone-warn",
  贯穿裂缝: "tone-danger",
};

export function Badge({ children }: { children: ReactNode }) {
  const text = String(children);
  const tone = badgeTone[text] ?? "tone-muted";
  return <span className={`badge ${tone}`}>{text}</span>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function KeyVal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="keyval">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

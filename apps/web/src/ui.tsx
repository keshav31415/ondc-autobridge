"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  LoaderCircle,
  X,
} from "lucide-react";
import type { MerchantState } from "../../../packages/core/src/domain";
export { money } from "../../../packages/core/src/domain";
export type Snapshot = {
  id: string;
  state: MerchantState;
  integrations: {
    cline: boolean;
    logistics: string;
    ondc: string;
    environment: string;
  };
};
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers: {
      "x-autobridge-client": "portal",
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: "include",
  });
  const data = await res
    .json()
    .catch(() => ({ error: "The service could not be reached" }));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}
type AppContext = {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  act: (work: () => Promise<unknown>, success?: string) => Promise<boolean>;
  busy: boolean;
};
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing application context");
  return value;
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 29V19a14 14 0 0128 0v10M6 22h28M15 29v-9a5 5 0 0110 0v9"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
      <span>
        autobridge<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export function Button({
  children,
  secondary = false,
  ghost = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${secondary ? "secondary" : ""} ${ghost ? "ghost" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "neutral" | "blue";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-orbit">
        <ArrowUpRight size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {tone === "success" ? <Check size={17} /> : <CircleAlert size={17} />}
      <div>{children}</div>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle size={18} className="spin" />;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
export const human = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        ["delivered", "passed", "resolved", "ready", "paid"].includes(value)
          ? "green"
          : ["failed", "cancelled", "delivery_failed"].includes(value)
            ? "red"
            : [
                  "confirmed",
                  "reserved",
                  "queued",
                  "open",
                  "refund_pending",
                ].includes(value)
              ? "amber"
              : "neutral"
      }
    >
      {human(value)}
    </Badge>
  );
}
export function useFilter() {
  const [search, setSearch] = useState("");
  return {
    search,
    setSearch,
    matches: (...values: string[]) =>
      values.join(" ").toLowerCase().includes(search.toLowerCase()),
  };
}

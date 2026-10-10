"use client";
import { useEffect, useState } from "react";
import {
  Check,
  Download,
  Hammer,
  ShieldCheck,
  Cpu,
  CircleDashed,
} from "lucide-react";
import { api, Button, Badge, Notice, Spinner, Status, useApp } from "./ui";
export function BuildPanel() {
  const { snapshot, act, refresh, busy } = useApp();
  const [mode, setMode] = useState<"template" | "cline">("template");
  const build = snapshot.state.builds[0];
  const running = build?.status === "queued" || build?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h2>Your seller service</h2>
          <p className="subtle" style={{ fontSize: 12, marginTop: 7 }}>
            Built from your catalogue and confirmed business rules.
          </p>
        </div>
        <Badge tone={build?.status === "passed" ? "green" : "neutral"}>
          {build?.status === "passed"
            ? "Local build verified"
            : "Ready to build"}
        </Badge>
      </div>
      <div className="fields">
        <label className="field">
          <span>Build engine</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="template">
              Verified template · no AI key required
            </option>
            <option value="cline" disabled={!snapshot.integrations.cline}>
              Cline SDK{" "}
              {snapshot.integrations.cline
                ? ""
                : "· configure model key to enable"}
            </option>
          </select>
        </label>
        <div style={{ alignSelf: "end" }}>
          <Button
            className="full"
            disabled={
              busy ||
              running ||
              !snapshot.state.business ||
              !snapshot.state.products.length
            }
            onClick={() =>
              void act(() => api("/builds", { mode }), "Build queued")
            }
          >
            {running ? <Spinner /> : <Hammer size={15} />}{" "}
            {running ? "Building your service…" : "Build seller service"}
          </Button>
        </div>
      </div>
      <Notice>
        {mode === "template"
          ? "Template mode runs real configuration checks and packages the seller service. It does not use or simulate Cline."
          : "Cline uses restricted tools to configure, validate and repair the build. Your model-provider account is charged for this run."}
      </Notice>
      {build && (
        <>
          <div className="row spread">
            <small>
              Build {build.id.slice(0, 8)} ·{" "}
              {build.mode === "cline" ? "Cline SDK" : "Template engine"}
            </small>
            <Status value={build.status} />
          </div>
          <div className="build-log" aria-live="polite">
            {build.logs.length ? (
              build.logs.map((log, i) => (
                <div key={i}>
                  <span className="timestamp">
                    {new Date(log.at).toLocaleTimeString("en-IN", {
                      hour12: false,
                    })}
                  </span>
                  {log.message}
                </div>
              ))
            ) : (
              <div>Waiting for the build worker…</div>
            )}
          </div>
          {build.error && <Notice tone="error">{build.error}</Notice>}
          {build.status === "passed" && (
            <a
              className="button secondary"
              href={`/api/builds/${build.id}/download`}
            >
              <Download size={15} />
              Download service source & configuration
            </a>
          )}
        </>
      )}
      <div className="checklist">
        <div className="checklist-item">
          <Check size={17} color="#769a5b" />
          Catalogue and business rules stored
        </div>
        <div className="checklist-item">
          {build?.status === "passed" ? (
            <ShieldCheck size={17} color="#769a5b" />
          ) : (
            <CircleDashed size={17} />
          )}
          Seller build{" "}
          {build?.status === "passed"
            ? "validated locally"
            : "awaiting validation"}
        </div>
        <div className="checklist-item">
          <Cpu size={17} />
          Local API available for simulation
        </div>
        <div className="checklist-item">
          <CircleDashed size={17} />
          ONDC network activation · not connected
        </div>
        <div className="checklist-item">
          <CircleDashed size={17} />
          Live delivery partner · not connected
        </div>
      </div>
      <small>
        A passing local build is separate from ONDC onboarding and production
        activation. Advanced service requirements are listed in the downloaded
        README.
      </small>
    </div>
  );
}

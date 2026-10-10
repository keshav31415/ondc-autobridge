"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Leaf, LogOut } from "lucide-react";
import { Brand, Button, PageTitle, useApp, api, money } from "./ui";
import {
  BusinessForm,
  RulesForm,
  InventoryUpload,
  InventoryReview,
  Simulator,
  type ImportPreview,
} from "./forms";
import { BuildPanel } from "./build-panel";
const steps = [
  "Your business",
  "Upload inventory",
  "Review products",
  "Business rules",
  "Review & test",
  "Build & activate",
];
const descriptions = [
  "A few details to make this workspace yours.",
  "Start with the spreadsheet you already use.",
  "Let’s make sure we understood your catalogue.",
  "Tell us how your business operates.",
  "Try the rules before your first real order.",
  "Turn your business setup into a seller service.",
];
export function Onboarding() {
  const { snapshot, act, busy } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(Math.min(snapshot.state.onboardingStep, 5));
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const s = snapshot.state;
  return (
    <div className="setup-shell">
      <header className="setup-header">
        <Brand />
        <div className="row">
          <small>Seller setup</small>
          <Button
            ghost
            onClick={() =>
              void act(async () => {
                await api("/auth/logout", {});
                window.location.assign("/login");
              })
            }
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </header>
      <main className="wizard">
        <div className="steps">
          {steps.map((name, i) => (
            <div
              key={name}
              className={`wizard-step ${i === step ? "active" : ""} ${i < step ? "complete" : ""}`}
            >
              <span className="step-number">
                {i < step ? <Check size={12} /> : i + 1}
              </span>
              <span>{name}</span>
            </div>
          ))}
        </div>
        <PageTitle
          eyebrow={`STEP ${step + 1} OF 6`}
          title={steps[step]}
          description={descriptions[step]}
        />
        <div className="setup-grid">
          <section className="card">
            {step === 0 && <BusinessForm onSaved={() => setStep(1)} />}
            {step === 1 && (
              <InventoryUpload
                onPreview={(value) => {
                  setPreview(value);
                  setStep(2);
                }}
                onSample={() => setStep(3)}
              />
            )}
            {step === 2 &&
              (preview ? (
                <InventoryReview
                  preview={preview}
                  setPreview={setPreview}
                  onImported={() => setStep(3)}
                />
              ) : (
                <InventoryUpload onPreview={setPreview} />
              ))}
            {step === 3 && <RulesForm onSaved={() => setStep(4)} />}
            {step === 4 && (
              <div className="stack">
                <div className="summary-list">
                  <div>
                    <small>Business</small>
                    <strong>{s.business?.name}</strong>
                  </div>
                  <div>
                    <small>Inventory</small>
                    <strong>{s.products.length} products</strong>
                  </div>
                  <div>
                    <small>Delivery</small>
                    <strong>Serviceable pincodes across India</strong>
                  </div>
                  <div>
                    <small>Free shipping from</small>
                    <strong>
                      {s.rules.freeShippingAbove === null
                        ? "Not enabled"
                        : money(s.rules.freeShippingAbove)}
                    </strong>
                  </div>
                </div>
                <hr />
                <h2>Try an example order</h2>
                <Simulator />
                <div className="form-footer">
                  <Button onClick={() => setStep(5)}>
                    Continue to build
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </div>
            )}
            {step === 5 && (
              <>
                <BuildPanel />
                <div className="form-footer">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api("/onboarding/complete", {});
                        router.push("/overview");
                      }, "Your workspace is ready")
                    }
                  >
                    Open business portal
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </>
            )}
            {step > 0 && (
              <div style={{ marginTop: 22 }}>
                <Button ghost onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={14} />
                  Back
                </Button>
              </div>
            )}
          </section>
          <aside className="card understood">
            <Leaf size={21} color="#72895b" />
            <h3 style={{ margin: "15px 0 8px" }}>What we understood</h3>
            <p className="subtle" style={{ fontSize: 11 }}>
              Your setup takes shape as you go.
            </p>
            <hr />
            <div className="definition">
              <span>Business</span>
              <strong>{s.business?.name ?? "Your business name"}</strong>
            </div>
            <div className="definition">
              <span>Pickup location</span>
              <strong>
                {s.business
                  ? `${s.business.city} · ${s.business.pincode}`
                  : "One pickup location"}
              </strong>
            </div>
            <div className="definition">
              <span>Products</span>
              <strong>
                {s.products.length || "Awaiting your spreadsheet"}
              </strong>
            </div>
            <div className="definition">
              <span>Delivery reach</span>
              <strong>India · subject to partner coverage</strong>
            </div>
            <div className="definition">
              <span>Build environment</span>
              <strong>Local testing</strong>
            </div>
            <hr />
            <p className="subtle" style={{ fontSize: 10 }}>
              Your progress is saved after each completed step. You can change
              these details in your portal.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

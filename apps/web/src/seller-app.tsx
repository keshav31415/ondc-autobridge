"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
  SlidersHorizontal,
  Wallet,
  MessagesSquare,
  Settings,
  LogOut,
  ChevronRight,
  Bell,
  Menu,
  X,
  ArrowRight,
  Leaf,
  FlaskConical,
  CircleHelp,
} from "lucide-react";
import {
  api,
  Brand,
  Button,
  Field,
  Notice,
  Spinner,
  Context,
  type Snapshot,
} from "./ui";
import { Onboarding } from "./onboarding";
import { PortalPage } from "./portal";
const navigation = [
  ["overview", "Overview", LayoutDashboard],
  ["products", "Products & stock", Package],
  ["orders", "Orders", ShoppingBag],
  ["deliveries", "Deliveries", Truck],
  ["rules", "Business rules", SlidersHorizontal],
  ["payments", "Payments", Wallet],
  ["support", "Returns & support", MessagesSquare],
  ["settings", "Settings", Settings],
] as const;
export function SellerApp() {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<Snapshot>("/state");
    setSnapshot(data);
  }, []);
  useEffect(() => {
    void refresh()
      .catch(() => setSnapshot(null))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 10000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const act = useCallback(
    async (work: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await work();
        await refresh();
        if (success) setToast({ message: success, error: false });
        return true;
      } catch (error) {
        setToast({
          message:
            error instanceof Error
              ? error.message
              : "Unable to complete action",
          error: true,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => setNavOpen(false), [pathname]);
  if (loading)
    return (
      <div className="loading-page">
        <Spinner />
        <span>Opening your workspace…</span>
      </div>
    );
  if (!snapshot)
    return (
      <Login
        onSignedIn={async () => {
          await refresh();
          router.push("/overview");
        }}
      />
    );
  const section = pathname.split("/")[1] || "overview";
  const title = navigation.find(([key]) => key === section)?.[1] ?? "Overview";
  const s = snapshot.state;
  return (
    <Context.Provider value={{ snapshot, refresh, act, busy }}>
      {!s.onboarded || section === "onboarding" ? (
        <Onboarding />
      ) : (
        <div className="shell">
          <aside className={`sidebar ${navOpen ? "open" : ""}`}>
            <Brand light />
            <div className="workspace-select">
              <div className="workspace-avatar">
                {s.business?.name.slice(0, 1) ?? "A"}
              </div>
              <div>
                <strong>{s.business?.name ?? "Your business"}</strong>
                <small>D2C seller workspace</small>
              </div>
            </div>
            <div className="nav-label">WORKSPACE</div>
            <nav>
              {navigation.map(([key, label, Icon]) => (
                <Link
                  href={`/${key}`}
                  className={`nav-item ${section === key ? "active" : ""}`}
                  key={key}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  {label}
                  {key === "orders" &&
                    s.orders.filter((o) => o.status === "confirmed").length >
                      0 && (
                      <span className="nav-count">
                        {
                          s.orders.filter((o) => o.status === "confirmed")
                            .length
                        }
                      </span>
                    )}
                </Link>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <Link
                href="/settings"
                className="connection-note"
                style={{ display: "block" }}
              >
                <strong>
                  <span style={{ color: "#d7b97b" }}>●</span>Local workspace
                </strong>
                <p>
                  ONDC activation is pending.
                  <br />
                  Your test workspace is ready.
                </p>
              </Link>
              <div className="sidebar-footer">
                <span>Built for your next chapter</span>
                <button
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={async () => {
                    await api("/auth/logout", {});
                    setSnapshot(null);
                    router.push("/login");
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div className="row">
                <button
                  aria-label={navOpen ? "Close menu" : "Open menu"}
                  className="icon-button mobile-nav-toggle"
                  onClick={() => setNavOpen(!navOpen)}
                >
                  {navOpen ? <X size={17} /> : <Menu size={17} />}
                </button>
                <div className="breadcrumbs">
                  Workspace
                  <ChevronRight size={11} />
                  <strong>{title}</strong>
                </div>
              </div>
              <div className="top-actions">
                <span
                  className="top-status"
                  style={{ fontSize: 10, color: "#8d9784" }}
                >
                  India · INR
                </span>
                <Link
                  href="/support"
                  title="Help & support"
                  aria-label="Help & support"
                >
                  <CircleHelp size={17} color="#8b9685" />
                </Link>
                <Link
                  href="/overview#attention"
                  title="View items needing attention"
                  aria-label="View alerts"
                >
                  <Bell size={17} color="#8b9685" />
                </Link>
                <span className="divider" />
                <Link
                  href="/settings"
                  className="avatar"
                  title="Business settings"
                >
                  {s.business?.owner
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("") ?? "AB"}
                </Link>
              </div>
            </header>
            <main className="content">
              <PortalPage section={section} detailId={pathname.split("/")[2]} />
              <div className="footer-note">
                <Leaf size={12} />
                Your business, connected. Powered by AutoBridge.
              </div>
            </main>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Notice tone={toast.error ? "error" : "success"}>
            {toast.message}
          </Notice>
        </div>
      )}
    </Context.Provider>
  );
}
function Login({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [register, setRegister] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (demo = false) => {
    setBusy(true);
    setError("");
    try {
      await api(
        demo ? "/auth/demo" : register ? "/auth/register" : "/auth/login",
        demo ? {} : { email, password },
      );
      await onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand light />
        <div>
          <div className="eyebrow" style={{ color: "#a5bd8c" }}>
            SMALL BUSINESS. OPEN POSSIBILITIES.
          </div>
          <h1>
            Your products.
            <br />A bigger world.
            <br />
            <em>One simple bridge.</em>
          </h1>
          <p>
            Bring your inventory, set your rules, and build your next chapter on
            open commerce.
          </p>
          <div className="story-flow">
            <span>Your Excel</span>
            <ArrowRight size={15} />
            <span>Your rules</span>
            <ArrowRight size={15} />
            <span>Your business</span>
          </div>
        </div>
        <footer>Made for independent businesses across India.</footer>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <div className="eyebrow">YOUR SELLER WORKSPACE</div>
          <h2>{register ? "Let’s get you connected." : "Welcome back."}</h2>
          <p>
            {register
              ? "A simpler way to manage products, orders and your ONDC journey."
              : "Your business is right where you left it."}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Email address">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@yourbusiness.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={register ? "At least 12 characters." : ""}
            >
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  register ? "Create a strong password" : "Your password"
                }
              />
            </Field>
            <Button className="full" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  {register ? "Create your workspace" : "Sign in"}
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </form>
          <p className="form-footnote">
            {register ? "Already have a workspace?" : "New to AutoBridge?"}{" "}
            <button
              className="text-link"
              style={{ border: 0, background: "none", padding: 0 }}
              onClick={() => setRegister(!register)}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="login-divider">or take a look around</div>
          <Button
            secondary
            className="full"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            <FlaskConical size={16} />
            Explore a demo workspace
          </Button>
          <p className="form-footnote">
            Demo products, orders and deliveries. No real transactions.
          </p>
        </div>
      </section>
    </div>
  );
}

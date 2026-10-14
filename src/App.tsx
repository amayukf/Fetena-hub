import { useMemo, useState, useRef, useEffect, type ReactNode, type ChangeEvent } from "react";
import theme from "./tokens/theme";
import { api, type BootstrapData } from "./lib/api";
import {
  INITIAL_USERS,
  INITIAL_PAYMENTS,
  INITIAL_CONTRIBUTIONS,
  INITIAL_REQUESTS,
  INITIAL_PAPERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TERM_INTERESTS,
  INITIAL_SYSTEM_SETTINGS,
  INITIAL_WANTED_PAPERS,
  type SystemSettingsState,
  FRESHMAN_11_COURSES,
  getCoursesForStream,
  type FreshmanCourseItem,
  type StorePayment,
  type StoreContribution,
  type StorePaperRequest,
  type StoreExamPaper,
  type StoreWantedPaper,
  type StoreAuditLog,
  type StoreNotification,
} from "./lib/store";
import type { UserSession, PaymentMethod, StreamCode, TermInterestRecord, Role, ExamType } from "./types";
import AccessDenied from "./components/admin/AccessDenied";
import AdminDashboard from "./components/admin/AdminDashboard";
import CoverageMatrix from "./components/admin/CoverageMatrix";
import PapersManager from "./components/admin/PapersManager";
import WantedPapersManager from "./components/admin/WantedPapersManager";
import UsersManager from "./components/admin/UsersManager";
import AuditLogViewer from "./components/admin/AuditLogViewer";
import SettingsManager from "./components/admin/SettingsManager";
import { TermsPage, PrivacyPage, ContactPage, ForbiddenPage, NotFoundPage, ForcePasswordChangeModal } from "./components/LegalPages";

const isDev = import.meta.env.DEV || (typeof process !== "undefined" && process.env?.NODE_ENV === "development");


export type Screen =
  | "landing" | "login" | "signup" | "verify" | "dashboard" | "browse"
  | "semester" | "course" | "viewer" | "checkout" | "payments" | "requests"
  | "profile" | "notifications" | "help" | "admin-login" | "admin"
  | "structure" | "papers" | "contributions" | "paper-requests"
  | "admin-payments" | "users" | "audit" | "settings" | "components" | "tokens"
  | "terms" | "privacy" | "contact" | "forbidden" | "not-found";

export type IconName =
  | "vault" | "home" | "search" | "book" | "card" | "bell" | "user" | "help"
  | "arrow" | "check" | "lock" | "file" | "chevron" | "menu" | "close"
  | "upload" | "eye" | "download" | "settings" | "users" | "chart" | "layers"
  | "activity" | "plus" | "filter" | "more" | "logout" | "shield" | "clock" | "image";

const iconPaths: Record<IconName, ReactNode> = {
  vault: <><path d="M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M3 9h18v12H3z"/><path d="M8 14h8M12 14v3"/></>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 5.5v14"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h5"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12"/><circle cx="12" cy="12" r="2.5"/></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-2-2.1-2.1-2 .9a7 7 0 0 0-1.8-.8L10.5 2h-3l-.7 2a7 7 0 0 0-1.8.8l-2-.9L.9 6l.9 2a7 7 0 0 0-.8 1.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8l-.9 2L3 20.1l2-.9a7 7 0 0 0 1.8.8l.7 2h3l.7-2a7 7 0 0 0 1.8-.8l2 .9 2.1-2.1-.9-2a7 7 0 0 0 .8-1.8z" transform="translate(2) scale(.84)"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  activity: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  logout: <><path d="M10 5H4v14h6M14 8l4 4-4 4M8 12h10"/></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export function Button({ children, variant = "primary", icon, onClick, className = "", type = "button", disabled = false, style, title }: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName; onClick?: () => void; className?: string; type?: "button" | "submit"; disabled?: boolean; style?: React.CSSProperties; title?: string;
}) {
  return <button type={type} disabled={disabled} style={style} title={title} className={`btn btn-${variant} ${className}`} onClick={onClick}>{icon && <Icon name={icon} size={18}/>}<span>{children}</span></button>;
}

export function Heading({ level = 2, children, className = "", style }: { level?: 1 | 2 | 3 | 4; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4';
  return <Tag style={style} className={`heading heading-${level} ${className}`}>{children}</Tag>;
}

export function Input({ label, placeholder, type = "text", value, onChange, disabled }: {
  label: string; placeholder: string; type?: string; value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void; disabled?: boolean;
}) {
  return <label className="field"><span>{label}</span><input type={type} placeholder={placeholder} value={value} onChange={onChange} disabled={disabled}/></label>;
}

export function Select({ label, children, value, onChange }: { label: string; children: ReactNode; value?: string; onChange?: (e: ChangeEvent<HTMLSelectElement>) => void }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={onChange}>{children}</select></label>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "accent" | "danger" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="logo"><span className="logo-mark"><Icon name="vault" size={20}/></span>{!compact && <span>{theme.constants.appName}</span>}</div>;
}

const studentNav: Array<[Screen, IconName, string]> = [
  ["dashboard", "home", "Home"], ["browse", "search", "Browse papers"],
  ["payments", "card", "Payments"], ["requests", "upload", "Requests & uploads"],
  ["notifications", "bell", "Notifications"], ["profile", "user", "Profile & settings"],
  ["help", "help", "Help & support"],
];

const adminNav: Array<[Screen, IconName, string]> = [
  ["admin", "home", "Overview"], ["structure", "layers", "Structure"],
  ["papers", "file", "Exam papers"], ["contributions", "upload", "Contributions"],
  ["paper-requests", "bell", "Paper requests"], ["admin-payments", "card", "Payments"],
  ["users", "users", "Users & roles"], ["audit", "activity", "Audit log"],
  ["settings", "settings", "Platform settings"], ["components", "book", "Components"],
  ["tokens", "chart", "Design tokens"],
];

function Header({
  go,
  currentUser,
  onMenu,
  pendingCount = 0,
}: {
  go: (s: Screen) => void;
  currentUser: UserSession;
  onMenu?: () => void;
  pendingCount?: number;
}) {
  const initials = currentUser.fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const isStaff = currentUser.role !== "STUDENT";

  return <header className="topbar">
    <div className="topbar-left">
      {onMenu && <Button variant="ghost" onClick={onMenu} className="menu-btn"><Icon name="menu"/></Button>}
      <div style={{ cursor: "pointer" }} onClick={() => go("landing")}><Logo/></div>
    </div>
    <div className="topbar-actions">
      {isStaff && (
        <span className="role-pill-btn" style={{ cursor: "default", opacity: 0.9 }}>
          <Icon name="shield" size={14}/>
          <span>{currentUser.role.replace("_", " ")}</span>
        </span>
      )}
      <button className="language">EN <span>⌄</span></button>
      <button className="icon-button" onClick={() => go("notifications")} aria-label="Notifications">
        <Icon name="bell"/>
        {pendingCount > 0 && <i/>}
      </button>
      <button
        className="avatar"
        onClick={() => go("profile")}
        title={`${currentUser.fullName} (${currentUser.role})`}
      >
        {initials}
      </button>
    </div>
  </header>;
}

function Shell({
  screen,
  go,
  children,
  currentUser,
  pendingPaymentsCount = 0,
  unreadNotifsCount = 0,
}: {
  screen: Screen;
  go: (s: Screen) => void;
  children: ReactNode;
  currentUser: UserSession;
  pendingPaymentsCount?: number;
  unreadNotifsCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const isAdminScreen = ["admin","structure","papers","contributions","paper-requests","admin-payments","users","audit","settings","components","tokens"].includes(screen);
  
  const isContentManager = currentUser.role === "CONTENT_MANAGER";
  const isPaymentVerifier = currentUser.role === "PAYMENT_VERIFIER";

  let nav = studentNav;
  if (isAdminScreen) {
    nav = adminNav;
    if (isContentManager) {
      // CONTENT_MANAGER cannot see payments or user roles
      nav = nav.filter(([id]) => id !== "admin-payments" && id !== "users");
    }
    if (isPaymentVerifier) {
      // PAYMENT_VERIFIER cannot see curriculum structure
      nav = nav.filter(([id]) => id !== "structure");
    }
  }

  // CONTENT_MANAGER cannot see pending payments
  const effectivePendingCount = isContentManager ? 0 : pendingPaymentsCount;

  return <div className="app-shell">
    <Header go={go} currentUser={currentUser} onMenu={() => setOpen(!open)} pendingCount={effectivePendingCount}/>
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="mobile-side-head"><Logo/><Button variant="ghost" onClick={() => setOpen(false)}><Icon name="close"/></Button></div>
      <div className="side-context">
        {isAdminScreen ? (
          <>
            <Badge tone="accent">{currentUser.role.replace("_", " ")} CONSOLE</Badge>
            <strong>{theme.constants.campus}</strong>
          </>
        ) : (
          <>
            <span>STUDENT PORTAL</span>
            <strong>{currentUser.stream === "SOC_SCI" ? "Social Science" : "Natural Science"} · Year 1</strong>
            <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Woliso Campus</small>
          </>
        )}
      </div>
      <nav>
        {nav.map(([id, icon, label]) => (
          <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => { go(id); setOpen(false); }}>
            <Icon name={icon}/>
            <span>{label}</span>
            {id === "notifications" && unreadNotifsCount > 0 && <b>{unreadNotifsCount}</b>}
            {id === "admin-payments" && pendingPaymentsCount > 0 && <b style={{ background: "var(--warning)" }}>{pendingPaymentsCount}</b>}
          </button>
        ))}
      </nav>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => go("landing")}>
          <Icon name="logout"/><span>Log out</span>
        </button>
        <small>{theme.constants.appName} v1.0 · Ambo Uni</small>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}

// -------------------------------------------------------------
// MARKETING & AUTH SCREENS
// -------------------------------------------------------------

function Landing({ go }: { go: (s: Screen) => void }) {
  return <div className="landing">
    <nav className="marketing-nav">
      <Logo/>
      <div className="marketing-links">
        <button onClick={() => go("browse")}>Browse</button>
        <button onClick={() => go("help")}>How it works</button>
        <button onClick={() => go("admin-login")}>Admin</button>
      </div>
      <div className="nav-cta">
        <Button variant="ghost" onClick={() => go("login")}>Log in</Button>
        <Button onClick={() => go("signup")}>Get started</Button>
      </div>
    </nav>
    <section className="hero">
      <div className="hero-copy">
        <Badge tone="accent">BUILT FOR AMBO UNIVERSITY STUDENTS</Badge>
        <Heading level={1}>Prepare smarter with past exam papers.</Heading>
        <p>Find previous exams for your department, year, and semester—all organized in one calm, reliable place.</p>
        <div className="hero-actions">
          <Button onClick={() => go("browse")} icon="arrow">Browse exam papers</Button>
          <Button variant="secondary" onClick={() => go("viewer")} icon="eye">View a free sample</Button>
        </div>
        <div className="trust-line">
          <span><Icon name="check"/>One simple semester fee (50 ETB)</span>
          <span><Icon name="shield"/>Secure watermarked viewer</span>
          <span><Icon name="book"/>Quality-checked papers</span>
        </div>
      </div>
      <div className="hero-visual">
        <div className="floating-note note-top">
          <span className="status-dot"/>
          <div><strong>New papers added</strong><small>Database Systems · 2023</small></div>
        </div>
        <Card className="preview-card">
          <div className="preview-head"><Logo compact/><span>Past papers</span><Badge tone="success">Unlocked</Badge></div>
          <div className="preview-body">
            <small>INFORMATION TECHNOLOGY · YEAR 3</small>
            <Heading level={3}>Semester 1 courses</Heading>
            {["Database Systems", "Computer Networks", "Web Programming II"].map((c, i) => (
              <div className="preview-row" key={c}>
                <span className="course-icon"><Icon name="book"/></span>
                <div><strong>{c}</strong><small>{6 - i} exam papers</small></div>
                <Icon name="chevron"/>
              </div>
            ))}
          </div>
        </Card>
        <div className="floating-note note-bottom">
          <span className="price-orb">50</span>
          <div><strong>50 ETB only</strong><small>Full semester access</small></div>
        </div>
      </div>
    </section>
    <section className="social-proof">
      <p>Helping students study with confidence across Woliso Campus</p>
      <div>
        <strong>19</strong><span>Departments</span>
        <strong>840+</strong><span>Exam papers</span>
        <strong>2,400+</strong><span>Students supported</span>
      </div>
    </section>
    <section className="section">
      <div className="section-heading">
        <Badge>HOW IT WORKS</Badge>
        <Heading level={2}>From search to study in three steps</Heading>
        <p>No confusing folders. No asking around. Find what you need and start preparing.</p>
      </div>
      <div className="steps">
        {[
          ["01", "Choose your semester", "Select your department, year, and semester to see every available course."],
          ["02", "Unlock for 50 ETB", "Upload payment screenshot and reference ID. Verifier approves access for the whole semester."],
          ["03", "Study with confidence", "Open quality-checked papers securely on any phone, protected with your student watermark."],
        ].map(([n,t,d]) => <Card key={n} className="step-card"><span>{n}</span><Heading level={3}>{t}</Heading><p>{d}</p></Card>)}
      </div>
    </section>
    <section className="price-section">
      <Card className="price-card">
        <div>
          <Badge tone="success">SIMPLE PRICING</Badge>
          <Heading level={2}>Everything in your semester.<br/>One fair price.</Heading>
          <p>Unlock all current and newly added exam papers for one department, academic year, and semester.</p>
          <ul>
            <li><Icon name="check"/>All courses included</li>
            <li><Icon name="check"/>Mid exams, finals, and quizzes</li>
            <li><Icon name="check"/>Access for the full semester</li>
            <li><Icon name="check"/>Sell your own papers to the admin</li>
          </ul>
        </div>
        <div className="price-box">
          <span><strong>50</strong> ETB</span>
          <small>per semester</small>
          <Button onClick={() => go("checkout")} icon="arrow">Choose your semester</Button>
          <p>Free sample available before payment</p>
        </div>
      </Card>
    </section>
    <section className="section faq">
      <div>
        <Badge>COMMON QUESTIONS</Badge>
        <Heading level={2}>Good to know</Heading>
        <p>Clear answers before you begin.</p>
      </div>
      <div className="faq-list">
        {[
          "What does the 50 ETB payment include?",
          "How long does payment verification take?",
          "Can I access papers on a basic smartphone?",
          "Can I sell past exam papers I have to ExamVault?",
        ].map((q, i) => (
          <details key={q} open={i === 0}>
            <summary>{q}<span>+</span></summary>
            <p>
              {i === 0
                ? "Your payment unlocks every available paper for all courses in one semester, plus any new papers added during that semester."
                : i === 1
                ? "Payments submitted with a Telebirr or CBE Birr screenshot and reference ID are reviewed and approved within 15–30 minutes."
                : i === 2
                ? "Yes! ExamVault is mobile-first, lightweight, and works seamlessly even on low-bandwidth 3G campus connections."
                : "Yes! Use the 'Contribute a paper' tab in Requests. Admin will inspect the scan, offer an agreed buyout in ETB, and pay directly to your Telebirr or CBE account."}
            </p>
          </details>
        ))}
      </div>
    </section>
    <footer>
      <Logo/>
      <p>Past papers, organized for better preparation.</p>
      <div><button onClick={() => go("help")}>Help</button><button onClick={() => go("privacy")}>Privacy</button><button onClick={() => go("terms")}>Terms</button><button onClick={() => go("contact")}>Contact</button></div>
      <small>© 2026 ExamVault · Ambo University, Woliso Campus</small>
    </footer>
  </div>;
}

function Auth({
  mode,
  go,
  onAuthSuccess,
}: {
  mode: "login" | "signup" | "verify" | "admin";
  go: (s: Screen) => void;
  onAuthSuccess: (user: UserSession, mustChangePassword?: boolean) => void;
}) {
  const signup = mode === "signup", admin = mode === "admin";
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [studentId, setStudentId] = useState("");
  const [stream, setStream] = useState<StreamCode>("NAT_SCI");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (signup) {
        if (!fullName.trim() || fullName.trim().length < 2) {
          throw new Error("Please enter your full legal name.");
        }
        if (!identifier.trim()) {
          throw new Error("Phone number or email is required.");
        }
        if (!password || password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }

        const isEmail = identifier.includes("@");
        const res = await api.signup({
          fullName: fullName.trim(),
          email: isEmail ? identifier.trim() : undefined,
          phone: !isEmail ? identifier.trim() : undefined,
          studentId: studentId.trim() || undefined,
          stream,
          password,
        });

        const userSession: UserSession = {
          userId: res.user.id,
          fullName: res.user.fullName,
          email: res.user.email || null,
          phone: res.user.phone || null,
          role: res.user.role as Role,
          programId: res.user.programId || null,
          studentId: res.user.studentId || null,
          stream,
          currentYear: res.user.currentYear || 1,
        };

        onAuthSuccess(userSession, false);
        go("dashboard");
      } else {
        if (!identifier.trim() || !password) {
          throw new Error("Please enter your credentials.");
        }

        const res = await api.login({
          identifier: identifier.trim(),
          password,
        });

        const userSession: UserSession = {
          userId: res.user.id,
          fullName: res.user.fullName,
          email: res.user.email || null,
          phone: res.user.phone || null,
          role: res.user.role as Role,
          programId: res.user.programId || null,
          studentId: res.user.studentId || null,
          stream: (res.user.program?.code as StreamCode) || "NAT_SCI",
          currentYear: res.user.currentYear || 1,
          mustChangePassword: res.mustChangePassword,
        };

        onAuthSuccess(userSession, res.mustChangePassword);

        if (res.user.role !== "STUDENT") {
          go("admin");
        } else {
          go("dashboard");
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="auth-layout">
    <div className="auth-brand">
      <Logo/>
      <div>
        <Badge tone="accent">{admin ? "SECURE ADMIN ACCESS" : "STUDY WITH CONFIDENCE"}</Badge>
        <Heading level={1}>{admin ? "Manage the library that helps students succeed." : "Everything you need to prepare, in one place."}</Heading>
        <p>{admin ? "Authorized staff only. Role-based access control and audit logging active." : "Access organized, quality-checked exam papers from any device—even on a slow connection."}</p>
      </div>
      <small>Ambo University · Woliso Campus</small>
    </div>
    <div className="auth-form">
      <div className="auth-mobile-logo"><Logo/></div>
      <Card>
        <button className="back-link" onClick={() => go("landing")}>← Back to home</button>
        <Heading level={2}>{signup ? "Create your student account" : admin ? "Admin sign in" : "Welcome back"}</Heading>
        <p>{signup ? "Join Woliso Campus students preparing for Freshman examinations." : "Enter your credentials to continue to ExamVault."}</p>

        {error && (
          <div className="alert danger" style={{ margin: "14px 0" }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {signup && (
            <Input
              label="Full name"
              placeholder="e.g. Student Full Name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          )}

          <Input
            label="Phone number or email"
            placeholder={signup ? "+251 9... or student@amu.edu.et" : "Enter phone or email"}
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
          />

          {signup && (
            <div className="form-grid">
              <Select label="Curriculum Stream" value={stream} onChange={e => setStream(e.target.value as StreamCode)}>
                <option value="NAT_SCI">Natural Science Stream</option>
                <option value="SOC_SCI">Social Science Stream</option>
              </Select>
              <Input
                label="Student ID (Optional)"
                placeholder="e.g. AMU-2026-0042"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
              />
            </div>
          )}

          <Input
            label="Password"
            placeholder="At least 8 characters"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <Button type="submit" className="full" disabled={loading} style={{ marginTop: "12px" }}>
            {loading ? "Please wait..." : signup ? "Create account" : admin ? "Sign in to Admin Console" : "Sign in"}
          </Button>
        </form>

        {!admin && (
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to ExamVault?"}{" "}
            <button onClick={() => { setError(null); go(signup ? "login" : "signup"); }}>
              {signup ? "Log in" : "Create an account"}
            </button>
          </p>
        )}
      </Card>
    </div>
  </div>;
}

export function PageHead({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) {
  return <div className="page-head">
    <div>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <Heading level={1}>{title}</Heading>
      {text && <p>{text}</p>}
    </div>
    {action}
  </div>;
}

// -------------------------------------------------------------
// STUDENT PORTAL SCREENS
// -------------------------------------------------------------

function Dashboard({
  go,
  currentUser,
  isUnlocked,
  selectedStream,
  onOpenNotifyModal,
}: {
  go: (s: Screen) => void;
  currentUser: UserSession;
  isUnlocked: boolean;
  selectedStream: StreamCode;
  onOpenNotifyModal: () => void;
}) {
  const streamLabel = selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science";
  const courses = getCoursesForStream(selectedStream);

  return <>
    <PageHead
      eyebrow="AMBO UNIVERSITY — WOLISO CAMPUS"
      title={`Good morning, ${currentUser.fullName.split(" ")[0]}.`}
      text={`Freshman ${streamLabel} · Year 1 exam preparation`}
    />
    <Card className="welcome-banner">
      <div>
        <Badge tone={isUnlocked ? "success" : "warning"}>
          {isUnlocked ? "SEMESTER 1 UNLOCKED" : "SEMESTER ACCESS PENDING"}
        </Badge>
        <Heading level={2}>{streamLabel} · Year 1</Heading>
        <p>Semester 1 · 7 courses (3 shared across streams) · Verified past exam papers</p>
        <Button onClick={() => go(isUnlocked ? "semester" : "checkout")} variant="secondary">
          {isUnlocked ? "Open semester" : "Unlock semester (50 ETB)"} <Icon name="arrow"/>
        </Button>
      </div>
      <div className="progress-ring">
        <strong>{isUnlocked ? "100%" : "0%"}</strong>
        <span>{isUnlocked ? "unlocked" : "locked"}</span>
      </div>
    </Card>

    <div className="section-title">
      <Heading level={2}>Freshman semesters</Heading>
      <Button variant="ghost" onClick={() => go("browse")}>Change stream <Icon name="arrow"/></Button>
    </div>
    <div className="semester-grid">
      <Card className={`semester-mini ${isUnlocked ? "unlocked" : ""}`}>
        <div className={`card-icon ${isUnlocked ? "" : "muted"}`}><Icon name={isUnlocked ? "book" : "lock"}/></div>
        <Badge tone={isUnlocked ? "success" : "neutral"}>{isUnlocked ? "UNLOCKED" : "AVAILABLE · 50 ETB"}</Badge>
        <Heading level={3}>{streamLabel} · Year 1</Heading>
        <p>Semester 1 · 7 courses</p>
        <Button variant="ghost" onClick={() => go("semester")}>
          {isUnlocked ? "Open semester" : "View courses"} <Icon name="chevron"/>
        </Button>
      </Card>

      <Card className="semester-mini" style={{ borderStyle: "dashed" }}>
        <div className="card-icon muted"><Icon name="clock"/></div>
        <Badge tone="accent">COMING SOON</Badge>
        <Heading level={3}>{streamLabel} · Year 1</Heading>
        <p>Semester 2 · In preparation</p>
        <Button variant="secondary" onClick={onOpenNotifyModal}>
          <Icon name="bell"/> Notify me
        </Button>
      </Card>

      <button className="add-semester" onClick={() => go("browse")}>
        <Icon name="plus"/>
        <span>Switch stream ({selectedStream === "NAT_SCI" ? "Social Science" : "Natural Science"})</span>
      </button>
    </div>

    <div className="content-grid">
      <div>
        <div className="section-title"><Heading level={2}>Featured free sample</Heading></div>
        <Card className="continue-card">
          <div className="pdf-thumb"><Icon name="file" size={32}/><span>PDF</span></div>
          <div>
            <Badge tone="accent">FREE SAMPLE · 2015 E.C.</Badge>
            <Heading level={3}>FLEn 1011 Communicative English</Heading>
            <p>Mid Exam · Shared across all freshman students</p>
          </div>
          <Button onClick={() => go("viewer")}>Preview free sample</Button>
        </Card>
      </div>
      <div>
        <div className="section-title"><Heading level={2}>Courses in your stream</Heading></div>
        <Card className="recent-list">
          {courses.slice(0, 4).map((c) => (
            <button key={c.id} onClick={() => go("semester")}>
              <span className="tiny-file"><Icon name="book"/></span>
              <span>
                <strong>{c.code} {c.title}</strong>
                <small>{c.isShared ? "Shared course · 3 Cr. Hr." : `${c.breakdown} · 3 Cr. Hr.`}</small>
              </span>
              {c.isShared && <Badge tone="accent">SHARED</Badge>}
              <Icon name="chevron"/>
            </button>
          ))}
        </Card>
      </div>
    </div>
  </>;
}

function Browse({
  go,
  selectedStream,
  onSelectStream,
  onOpenNotifyModal,
}: {
  go: (s: Screen) => void;
  selectedStream: StreamCode;
  onSelectStream: (stream: StreamCode) => void;
  onOpenNotifyModal: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);

  return <>
    <PageHead
      eyebrow="AMBO UNIVERSITY — WOLISO CAMPUS"
      title="Freshman Exam Vault"
      text="Find previous exam papers for your freshman stream (Natural Science or Social Science)."
    />
    <div className="stepper">
      {[
        { title: "Choose Stream", num: 1 },
        { title: "Select Semester", num: 2 },
      ].map((s) => (
        <div className={step >= s.num ? "done" : ""} key={s.title}>
          <span>{step > s.num ? <Icon name="check" size={14}/> : s.num}</span>
          <strong>{s.title}</strong>
        </div>
      ))}
    </div>

    <Card className="selector-card">
      <div className="selector-top">
        <div>
          <span>STEP {step} OF 2</span>
          <Heading level={2}>
            {step === 1 ? "Select your Freshman stream" : "Select academic semester"}
          </Heading>
          <p>
            {step === 1
              ? "Ambo University - Woliso Campus freshman curriculum is organized into two primary streams."
              : `Showing Year 1 terms for ${selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science"}.`}
          </p>
        </div>
        {step > 1 && <Button variant="ghost" onClick={() => setStep(1)}>← Back to Streams</Button>}
      </div>

      {step === 1 && (
        <div className="choice-list">
          <button
            className={selectedStream === "NAT_SCI" ? "selected" : ""}
            onClick={() => {
              onSelectStream("NAT_SCI");
              setStep(2);
            }}
          >
            <span className="choice-icon">NS</span>
            <span>
              <strong>Natural Science (Stream)</strong>
              <small>7 courses: FLEn 1011, Phil 1011, SPSC 1011, Phys 1011, GeES 1011, MATH 1011, Psyc 1011</small>
            </span>
            {selectedStream === "NAT_SCI" && <Badge tone="accent">SELECTED</Badge>}
            <Icon name="chevron"/>
          </button>

          <button
            className={selectedStream === "SOC_SCI" ? "selected" : ""}
            onClick={() => {
              onSelectStream("SOC_SCI");
              setStep(2);
            }}
          >
            <span className="choice-icon">SS</span>
            <span>
              <strong>Social Science (Stream)</strong>
              <small>7 courses: FLEn 1011, Phil 1011, SPSC 1011, Econ 1011, Anth 1012, EmTe 1012, MGMT 1012</small>
            </span>
            {selectedStream === "SOC_SCI" && <Badge tone="accent">SELECTED</Badge>}
            <Icon name="chevron"/>
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="semester-choices">
          <button onClick={() => go("semester")}>
            <span className="choice-icon"><Icon name="book"/></span>
            <span>
              <strong>Year 1, Semester 1</strong>
              <small>7 courses (3 shared with other stream) · 50 ETB full semester access</small>
            </span>
            <Badge tone="success">READY</Badge>
            <Icon name="chevron"/>
          </button>

          <div
            className="semester-choice-coming-soon"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px",
              border: "1px dashed var(--line)",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              marginTop: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="choice-icon" style={{ opacity: 0.6 }}><Icon name="clock"/></span>
              <div>
                <strong>Year 1, Semester 2</strong>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                  Non-purchasable right now. Digitization in progress.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Badge tone="accent">COMING SOON</Badge>
              <Button variant="secondary" onClick={onOpenNotifyModal} icon="bell">
                Notify me
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  </>;
}

function Semester({
  go,
  isUnlocked,
  selectedStream,
  payments = [],
  settings,
  currentUser,
  onSelectCourse,
}: {
  go: (s: Screen) => void;
  isUnlocked: boolean;
  selectedStream: StreamCode;
  payments?: StorePayment[];
  settings: SystemSettingsState;
  currentUser: UserSession;
  onSelectCourse: (c: FreshmanCourseItem) => void;
}) {
  const streamLabel = selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science";
  const courses = getCoursesForStream(selectedStream);
  const userStreamPayments = (payments || []).filter(
    p => p.userId === currentUser.userId && p.stream === selectedStream && p.academicYearNumber === 1 && p.semesterNumber === 1
  );
  const pendingPayment = userStreamPayments.find(p => p.status === "PENDING");
  const rejectedPayment = userStreamPayments.find(p => p.status === "REJECTED");

  return <>
    <button className="back-link page-back" onClick={() => go("browse")}>← Back to stream selection</button>
    <PageHead
      eyebrow="AMBO UNIVERSITY — WOLISO CAMPUS"
      title={`${streamLabel} · Year 1, Semester 1`}
      text="7 courses (3 shared between Natural Science & Social Science) · Verified past exam papers"
    />

    {isUnlocked ? (
      <Card className="unlock-card" style={{ background: "linear-gradient(120deg, #e8f7f1, #ffffff)" }}>
        <div className="unlock-icon" style={{ background: "var(--success)" }}><Icon name="check" size={26}/></div>
        <div>
          <Badge tone="success">SEMESTER UNLOCKED</Badge>
          <Heading level={2}>Full Access Active</Heading>
          <p>All past papers for {streamLabel}, Year 1, Semester 1 are unlocked and available to view.</p>
          <div className="unlock-points">
            <span><Icon name="check"/>All 7 courses unlocked</span>
            <span><Icon name="check"/>Mid & final exam papers</span>
            <span><Icon name="check"/>Dynamic student watermark protection</span>
          </div>
        </div>
        <div className="unlock-price">
          <Badge tone="success">PAID ({settings.semesterPriceEtb || 50} ETB)</Badge>
          <Button variant="secondary" onClick={() => {
            onSelectCourse(courses[0]);
            go("course");
          }}>
            Explore papers <Icon name="arrow"/>
          </Button>
        </div>
      </Card>
    ) : pendingPayment ? (
      <Card className="unlock-card" style={{ background: "linear-gradient(120deg, #fffbeb, #ffffff)", borderColor: "#f59e0b" }}>
        <div className="unlock-icon" style={{ background: "#f59e0b" }}><Icon name="clock" size={26}/></div>
        <div>
          <Badge tone="warning">PAYMENT UNDER REVIEW</Badge>
          <Heading level={2}>Verification in Progress</Heading>
          <p>Your payment receipt (Ref: <b>{pendingPayment.referenceCode}</b>) is queued for verification by Woliso Campus staff.</p>
          <div className="unlock-points">
            <span><Icon name="clock"/>Verification SLA: Within {settings.paymentVerificationSlaHours || "2"} hours</span>
            <span><Icon name="check"/>Transaction ID: <code>{pendingPayment.transactionId}</code></span>
            <span><Icon name="shield"/>One pending payment per term enforced</span>
          </div>
        </div>
        <div className="unlock-price">
          <Badge tone="warning">PENDING</Badge>
          <Button onClick={() => go("payments")}>View receipt <Icon name="arrow"/></Button>
        </div>
      </Card>
    ) : rejectedPayment ? (
      <Card className="unlock-card" style={{ background: "linear-gradient(120deg, #fef2f2, #ffffff)", borderColor: "#ef4444" }}>
        <div className="unlock-icon" style={{ background: "#ef4444" }}><Icon name="close" size={26}/></div>
        <div>
          <Badge tone="danger">PAYMENT REJECTED</Badge>
          <Heading level={2}>Receipt Correction Required</Heading>
          <p>Reason: <b style={{ color: "#b91c1c" }}>"{rejectedPayment.rejectionReason || "Transaction reference could not be verified"}"</b></p>
          <div className="unlock-points">
            <span><Icon name="clock"/>Resubmission #{ (rejectedPayment.resubmitCount || 0) + 1 }</span>
            <span><Icon name="shield"/>Upload clear screenshot proof</span>
            <span><Icon name="clock"/>Verification SLA: Within {settings.paymentVerificationSlaHours || "2"} hours</span>
          </div>
        </div>
        <div className="unlock-price">
          <Button onClick={() => go("checkout")}>Resubmit receipt <Icon name="arrow"/></Button>
        </div>
      </Card>
    ) : (
      <Card className="unlock-card">
        <div className="unlock-icon"><Icon name="lock" size={26}/></div>
        <div>
          <Badge tone="accent">ONE-TIME SEMESTER ACCESS</Badge>
          <Heading level={2}>Unlock all 7 courses for {settings.semesterPriceEtb || 50} ETB</Heading>
          <p>Get every past mid exam, final, and quiz for {streamLabel} Y1S1—plus newly digitized papers this semester.</p>
          <div className="unlock-points">
            <span><Icon name="check"/>All 7 courses included</span>
            <span><Icon name="clock"/>Verification SLA: Within {settings.paymentVerificationSlaHours || "2"} hours</span>
            <span><Icon name="check"/>Dynamic student watermark security</span>
          </div>
        </div>
        <div className="unlock-price">
          <span><strong>{settings.semesterPriceEtb || 50}</strong> ETB</span>
          <Button onClick={() => go("checkout")}>Unlock semester <Icon name="arrow"/></Button>
          <button onClick={() => go("viewer")}>Preview a free sample</button>
        </div>
      </Card>
    )}

    <div className="section-title">
      <div>
        <Heading level={2}>Courses in this semester</Heading>
        <p>Select a course below to view past exam papers.</p>
      </div>
      <Badge tone="neutral">{courses.length} courses</Badge>
    </div>

    <div className="course-list">
      {courses.map((c) => (
        <Card className="course-row" key={c.id}>
          <span className="course-icon"><Icon name="book"/></span>
          <div className="course-info">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <small>{c.code}</small>
              {c.isShared && (
                <Badge tone="accent">SHARED COURSE</Badge>
              )}
            </div>
            <Heading level={3}>{c.title}</Heading>
            <p>{c.creditHours} Credit Hours · {c.breakdown}</p>
          </div>
          <Badge tone={c.paperCount > 0 ? "accent" : "neutral"}>
            {c.paperCount > 0 ? `${c.paperCount} papers available` : "No papers yet"}
          </Badge>
          <Button
            variant="ghost"
            onClick={() => {
              onSelectCourse(c);
              go("course");
            }}
          >
            View papers <Icon name="chevron"/>
          </Button>
        </Card>
      ))}
    </div>
  </>;
}

function Course({
  go,
  isUnlocked,
  course,
  papers,
  onSelectPaper,
}: {
  go: (s: Screen) => void;
  isUnlocked: boolean;
  course: FreshmanCourseItem;
  papers: StoreExamPaper[];
  onSelectPaper: (p: StoreExamPaper) => void;
}) {
  const coursePapers = papers.filter(
    (p) => p.courseCode === course.code || p.courseId === course.id
  );

  return <>
    <button className="back-link page-back" onClick={() => go("semester")}>← Back to semester courses</button>
    <PageHead
      eyebrow={`${course.code} · ${course.creditHours} CREDIT HOURS`}
      title={course.title}
      text={course.isShared ? "Shared course taken by both Natural Science and Social Science students." : "Freshman stream course · Ambo University Woliso Campus."}
      action={course.isShared ? <Badge tone="accent">SHARED COURSE</Badge> : undefined}
    />
    <div className="filter-row">
      <div>
        <Button variant="secondary" icon="filter">All types</Button>
        <Button variant="secondary">2015 E.C.</Button>
      </div>
      <Badge tone={isUnlocked ? "success" : "warning"}>
        {isUnlocked ? "SEMESTER UNLOCKED" : "50 ETB TO UNLOCK ALL"}
      </Badge>
    </div>

    {coursePapers.length === 0 ? (
      <Card style={{ textAlign: "center", padding: "48px 24px", margin: "24px 0" }}>
        <Icon name="file" size={40}/>
        <Heading level={2}>No exam papers uploaded yet</Heading>
        <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "8px auto 20px" }}>
          We don't have digitized papers for {course.code} yet. Do you have a copy of a mid or final exam? Sell it to ExamVault for cash!
        </p>
        <Button onClick={() => go("requests")} icon="upload">
          Sell this paper to Admin
        </Button>
      </Card>
    ) : (
      <div className="paper-grid">
        {coursePapers.map((p, i) => {
          const canOpen = isUnlocked || p.isFreeSample;
          return (
            <Card className="paper-card" key={p.id}>
              <div className="paper-top">
                <span className="large-file"><Icon name="file" size={28}/><small>PDF</small></span>
                <Badge tone={p.isFreeSample ? "accent" : p.quality === "EXCELLENT" ? "success" : "neutral"}>
                  {p.isFreeSample ? "Free Sample" : `${p.quality} scan`}
                </Badge>
              </div>
              <small>{p.examType} · {p.examYearEc ? `${p.examYearEc} E.C.` : `${p.academicYear}`}</small>
              <Heading level={3}>{p.title}</Heading>
              <p>{p.pageCount} pages · Verified scan</p>
              {canOpen ? (
                <Button
                  onClick={() => {
                    onSelectPaper(p);
                    go("viewer");
                  }}
                  variant={i === 0 ? "primary" : "secondary"}
                  className="full"
                >
                  <Icon name="eye"/> {p.isFreeSample ? "Open free sample" : "Open paper"}
                </Button>
              ) : (
                <div className="locked-action" style={{ cursor: "pointer" }} onClick={() => go("checkout")}>
                  <Icon name="lock"/>
                  <span>Unlock semester (50 ETB)</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    )}

    <Card className="empty-callout">
      <div className="card-icon"><Icon name="help"/></div>
      <div>
        <Heading level={3}>Have past exams for {course.code}?</Heading>
        <p>Sell physical or photographed exam papers you hold to ExamVault Admin for a direct cash payout via Telebirr or CBE.</p>
      </div>
      <Button variant="secondary" onClick={() => go("requests")}>Sell a paper</Button>
    </Card>
  </>;
}

// -------------------------------------------------------------
// SECURE IN-BROWSER WATERMARKED VIEWER
// -------------------------------------------------------------

function Viewer({ go, currentUser, paper }: { go: (s: Screen) => void; currentUser: UserSession; paper?: StoreExamPaper | null }) {
  const [page, setPage] = useState(1);
  const [accessState, setAccessState] = useState<{ allowed: boolean; reason?: string; watermark?: any; streamUrl?: string; expiresAt?: number } | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState("BLURRY_SCAN");
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!paper) {
      setCheckingAccess(false);
      return;
    }
    api.checkPaperAccess(paper.id, currentUser.userId)
      .then((res) => {
        setAccessState(res);
        setCheckingAccess(false);
      })
      .catch(() => {
        setAccessState({ allowed: false, reason: "NETWORK_ERROR" });
        setCheckingAccess(false);
      });
  }, [paper?.id, currentUser.userId]);

  const totalPages = paper?.pageCount || 6;
  const studentName = accessState?.watermark?.studentName || currentUser.fullName || "ExamVault Student";
  const studentId = accessState?.watermark?.studentId || currentUser.studentId || "AMU-2026-0042";
  const dateStr = accessState?.watermark?.timestamp
    ? new Date(accessState.watermark.timestamp).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const handleReportProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paper) return;
    setReportSubmitting(true);
    try {
      await api.reportPaperProblem(paper.id, {
        userId: currentUser.userId,
        category: reportCategory,
        description: reportNotes,
      });
      setReportFeedback("Thank you! Your report has been submitted to the Woliso Campus exam review board.");
      setTimeout(() => {
        setShowReportModal(false);
        setReportFeedback(null);
        setReportNotes("");
      }, 2500);
    } catch (err: any) {
      setReportFeedback(err.message || "Failed to submit report. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  };

  // Max 2 Concurrent Sessions Guard
  if (!checkingAccess && accessState && accessState.reason === "MAX_CONCURRENT_SESSIONS") {
    return (
      <div className="standalone-state">
        <Logo/>
        <Card style={{ maxWidth: "520px", textAlign: "center" }}>
          <span className="state-icon pending" style={{ background: "rgba(234, 88, 12, 0.1)", color: "#ea580c" }}>
            <Icon name="shield" size={32}/>
          </span>
          <Badge tone="warning">MAXIMUM 2 CONCURRENT SESSIONS</Badge>
          <Heading level={1}>Session Limit Reached</Heading>
          <p style={{ margin: "12px 0 20px", color: "var(--muted)" }}>
            To safeguard Ambo University exam scripts, your account is permitted a maximum of 2 simultaneous active sessions. Please log out from another device or refresh your session.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
            <Button className="full" onClick={() => window.location.reload()}>
              Retry / Refresh Session
            </Button>
            <Button variant="secondary" className="full" onClick={() => go("course")}>
              Return to course
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Access Denied / Locked Paper Guard
  if (!checkingAccess && accessState && !accessState.allowed && !paper?.isFreeSample) {
    return (
      <div className="standalone-state">
        <Logo/>
        <Card style={{ maxWidth: "520px", textAlign: "center" }}>
          <span className="state-icon pending" style={{ background: "rgba(220, 38, 38, 0.1)", color: "var(--danger)" }}>
            <Icon name="lock" size={32}/>
          </span>
          <Badge tone="danger">ACCESS RESTRICTED</Badge>
          <Heading level={1}>Active Entitlement Required</Heading>
          <p style={{ margin: "12px 0 20px", color: "var(--muted)" }}>
            {accessState.reason === "USER_INACTIVE" || accessState.reason === "USER_DELETED"
              ? "Your student account is suspended or marked inactive. Contact campus administration."
              : accessState.reason === "PAPER_NOT_PUBLISHED"
              ? "This exam paper is currently in draft or review quarantine and is not open to students."
              : `To open past papers for ${paper?.courseCode || "this course"}, unlock your semester with a 50 ETB semester pass.`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
            <Button className="full" onClick={() => go("checkout")}>
              Unlock Semester (50 ETB) <Icon name="arrow"/>
            </Button>
            <Button variant="secondary" className="full" onClick={() => go("semester")}>
              Return to courses
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="viewer" onContextMenu={(e) => e.preventDefault()}>
      <div className="viewer-bar">
        <div>
          <Button variant="ghost" onClick={() => go("course")}><Icon name="close"/></Button>
          <span>
            <strong>{paper ? paper.title : "Communicative English · Final Exam 2015 E.C."}</strong>
            <small>{paper ? `${paper.courseCode} · ${paper.pageCount} pages` : "FLEn 1011 · 6 pages"} · Protected Tiled Watermark Viewer</small>
          </span>
        </div>
        <div className="viewer-tools">
          <Button variant="ghost">−</Button>
          <span>100%</span>
          <Button variant="ghost">+</Button>
          <Button variant="ghost" onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          }}><Icon name="eye"/> Fullscreen</Button>
          <Button variant="ghost" onClick={() => setShowReportModal(true)}><Icon name="help"/> Report problem</Button>
        </div>
      </div>

      <div className="pdf-stage">
        <div className="pdf-page" style={{ position: "relative", overflow: "hidden" }}>
          {/* Dynamic Watermark Tiled Across Each Page */}
          <div
            className="watermark-tiled"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              userSelect: "none",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: "repeat(5, 1fr)",
              gap: "24px",
              padding: "30px 15px",
              opacity: 0.12,
              zIndex: 10,
              overflow: "hidden",
            }}
          >
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                style={{
                  transform: "rotate(-25deg)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--primary, #0c4a34)",
                  lineHeight: 1.25,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span>{studentName}</span>
                <span>{studentId}</span>
                <span>{dateStr}</span>
              </div>
            ))}
          </div>

          <div className="exam-logo"><Logo compact/></div>
          <p>AMBO UNIVERSITY — WOLISO CAMPUS</p>
          <Heading level={2}>
            {paper ? `${paper.courseName} (${paper.courseCode})` : "Communicative English Language Skills I (FLEn 1011)"}
          </Heading>
          <div className="exam-meta">
            <span>Course: {paper ? paper.courseName : "Communicative English Language Skills I"}</span>
            <span>Course Code: {paper ? paper.courseCode : "FLEn 1011"}</span>
            <span>Exam: {paper ? paper.title : "Final Exam 2015 E.C."}</span>
            <span>Academic Year: {paper?.examYearEc ? `${paper.examYearEc} E.C.` : "2015 E.C."}</span>
          </div>
          <hr style={{ margin: "16px 0", borderColor: "#dfe7e4" }}/>
          <strong>Instructions: Answer all questions carefully. Time allowed: 2:00 hours. Total Marks: 50%. (Page {page} of {totalPages})</strong>

          <ol style={{ paddingLeft: "20px" }}>
            <li>
              <strong>Reading Comprehension & Critical Analysis:</strong>
              <p>Read the provided academic passage concerning sustainable agricultural development in the Horn of Africa. Identify the author's primary thesis and evaluate two counter-arguments presented in paragraph 3. <b>(15 marks)</b></p>
            </li>
            <li>
              <strong>Discourse Cohesion & Contextual Synthesis:</strong>
              <p>Analyze how cohesive markers (transitions, anaphora, lexical repetition) link the premise to the conclusion in the following excerpt from the Woliso Campus symposium: <b>(10 marks)</b></p>
              <div className="code-block">
                "Higher education fosters technological dissemination. Consequently, regional productivity accelerates..."
              </div>
            </li>
            <li>
              <strong>Academic Sentence Structure & Paraphrasing:</strong>
              <p>Paraphrase the following complex academic excerpt without altering its propositional content or formal register: <b>(15 marks)</b></p>
              <p style={{ fontStyle: "italic", marginTop: "8px" }}>
                "The rapid evolution of scientific methodologies necessitates rigorous critical discernment among undergraduate students entering university programs."
              </p>
            </li>
            <li>
              <strong>Summary Writing & Thesis Formulation:</strong>
              <p>Synthesize the text into a 120-word cohesive abstract highlighting problem statement, methodological orientation, and major findings. <b>(10 marks)</b></p>
            </li>
          </ol>
        </div>
      </div>

      <div className="page-control">
        <Button variant="secondary" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>←</Button>
        <span>Page <strong>{page}</strong> of {totalPages}</span>
        <Button variant="secondary" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>→</Button>
      </div>

      {/* Report a Problem Modal */}
      {showReportModal && (
        <div className="modal-backdrop" onClick={() => !reportSubmitting && setShowReportModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <Heading level={2}>Report a Problem</Heading>
              <button className="icon-btn" onClick={() => setShowReportModal(false)}><Icon name="close"/></button>
            </div>
            <p style={{ color: "var(--muted)", margin: "8px 0 16px", fontSize: "14px" }}>
              Help improve the ExamVault archive for Woliso Campus. Let our content moderators know what is wrong with this paper.
            </p>
            {reportFeedback ? (
              <div style={{ padding: "16px", background: "rgba(12, 74, 52, 0.08)", borderRadius: "8px", color: "var(--primary)" }}>
                <strong>{reportFeedback}</strong>
              </div>
            ) : (
              <form onSubmit={handleReportProblem} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Select
                  label="Problem Category"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                >
                  <option value="BLURRY_SCAN">Illegible / blurry scan</option>
                  <option value="MISSING_PAGES">Missing pages or incorrect page order</option>
                  <option value="WRONG_YEAR">Wrong academic year or course title</option>
                  <option value="WRONG_EXAM">Wrong exam paper content</option>
                  <option value="OTHER">Other issue</option>
                </Select>
                <label className="field">
                  <span>Additional Details (Optional)</span>
                  <textarea
                    rows={3}
                    placeholder="Describe specific page numbers or issues observed..."
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    style={{
                      width: "100%",
                      borderRadius: "6px",
                      border: "1px solid var(--border, #cbdad3)",
                      padding: "8px 12px",
                      fontFamily: "inherit",
                      fontSize: "14px",
                    }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <Button variant="secondary" onClick={() => setShowReportModal(false)} disabled={reportSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={reportSubmitting}>
                    {reportSubmitting ? "Submitting..." : "Submit Report"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// CHECKOUT & MANUAL PAYMENT SUBMISSION SCREEN
// -------------------------------------------------------------

function Checkout({
  go,
  currentUser,
  selectedStream,
  settings,
  payments = [],
  onSubmitPayment,
}: {
  go: (s: Screen) => void;
  currentUser: UserSession;
  selectedStream: StreamCode;
  settings: SystemSettingsState;
  payments?: StorePayment[];
  onSubmitPayment: (p: { method: PaymentMethod; txId: string; screenshotUrl: string }) => Promise<StorePayment> | StorePayment;
}) {
  const streamLabel = selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science";
  const userStreamPayments = (payments || []).filter(
    p => p.userId === currentUser.userId && p.stream === selectedStream && p.academicYearNumber === 1 && p.semesterNumber === 1
  );
  const pendingPayment = userStreamPayments.find(p => p.status === "PENDING");
  const rejectedPayment = userStreamPayments.find(p => p.status === "REJECTED");

  const [method, setMethod] = useState<PaymentMethod>("TELEBIRR");
  const [txId, setTxId] = useState(rejectedPayment?.transactionId || "");
  const [screenshotUrl, setScreenshotUrl] = useState("https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80");
  const [screenshotName, setScreenshotName] = useState(rejectedPayment ? "corrected_payment_proof.jpg" : "telebirr_payment_proof.jpg");
  const [submittedPayment, setSubmittedPayment] = useState<StorePayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Screenshot must be under 5 MB.");
        return;
      }
      setScreenshotName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshotUrl(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txId.trim() || txId.trim().length < 4) {
      setError("Please enter a valid transaction reference ID (e.g. TB4F8K92 or CBE778942).");
      return;
    }
    setError(null);
    try {
      const newPay = await onSubmitPayment({
        method,
        txId: txId.trim().toUpperCase(),
        screenshotUrl,
      });
      setSubmittedPayment(newPay);
    } catch (err: any) {
      setError(err.message || "Payment submission failed");
    }
  };

  if (pendingPayment && !submittedPayment) {
    return (
      <div className="standalone-state">
        <Logo/>
        <Card>
          <span className="state-icon pending">
            <Icon name="clock" size={32}/>
          </span>
          <Badge tone="warning">PAYMENT UNDER REVIEW</Badge>
          <Heading level={1}>Payment Already Submitted</Heading>
          <p>
            You already have a pending payment for {streamLabel}, Year 1, Semester 1 awaiting review by Woliso Campus staff.
            To prevent duplicate charges, only one pending payment is allowed per semester.
          </p>
          <div className="alert info" style={{ background: "rgba(12, 74, 52, 0.08)", color: "var(--primary)", margin: "14px 0" }}>
            <Icon name="clock" size={18}/>
            <span>
              <strong>Verification SLA:</strong> Payments are verified within {settings.paymentVerificationSlaHours || "2"} hours.
            </span>
          </div>
          <div className="receipt-summary">
            <span>Reference<strong>{pendingPayment.referenceCode}</strong></span>
            <span>Transaction ID<strong>{pendingPayment.transactionId}</strong></span>
            <span>Method<strong>{pendingPayment.paymentMethod.replace("_", " ")}</strong></span>
            <span>Amount<strong>{pendingPayment.amountEtb} ETB</strong></span>
            <span>Status<Badge tone="warning">PENDING</Badge></span>
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            <Button className="full" onClick={() => go("payments")}>
              View in Payment History & Receipts
            </Button>
            <Button variant="secondary" className="full" onClick={() => go("semester")}>
              Return to Semester
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (submittedPayment) {
    const isApproved = submittedPayment.status === "APPROVED";
    return <div className="standalone-state">
      <Logo/>
      <Card>
        <span className={`state-icon ${isApproved ? "approved" : "pending"}`}>
          <Icon name={isApproved ? "check" : "clock"} size={32}/>
        </span>
        <Badge tone={isApproved ? "success" : "warning"}>
          {isApproved ? "PAYMENT APPROVED" : "VERIFICATION IN PROGRESS"}
        </Badge>
        <Heading level={1}>
          {isApproved ? "Your semester is unlocked!" : "Payment submitted for review"}
        </Heading>
        <p>
          {isApproved
            ? `You now have full access to all past papers in ${streamLabel}, Year 1, Semester 1.`
            : "Your payment reference and screenshot receipt have been queued. Payment verifiers check submissions every few minutes. You will receive access as soon as it is approved."}
        </p>

        <div className="receipt-summary">
          <span>Reference<strong>{submittedPayment.referenceCode}</strong></span>
          <span>Transaction ID<strong>{submittedPayment.transactionId}</strong></span>
          <span>Method<strong>{submittedPayment.paymentMethod.replace("_", " ")}</strong></span>
          <span>Amount<strong>{submittedPayment.amountEtb || settings.semesterPriceEtb} ETB</strong></span>
          <span>Status<Badge tone={isApproved ? "success" : "warning"}>{submittedPayment.status}</Badge></span>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
          {isApproved ? (
            <Button className="full" onClick={() => go("semester")}>Open my semester</Button>
          ) : (
            <>
              <Button className="full" onClick={() => go("admin-payments")}>
                Go to Admin Verification Queue to Approve <Icon name="arrow"/>
              </Button>
              <Button variant="secondary" className="full" onClick={() => go("dashboard")}>
                Go to student dashboard
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>;
  }

  return <div className="checkout-layout">
    <header>
      <Logo/>
      <span><Icon name="shield"/>Secure manual checkout</span>
    </header>
    <main>
      <button className="back-link" onClick={() => go("semester")}>← Back to semester</button>
      <PageHead eyebrow="AMBO UNIVERSITY — WOLISO CAMPUS" title="Unlock your semester" text={`Unlock all 7 courses for ${streamLabel}, Year 1, Semester 1.`}/>
      
      <div className="checkout-grid">
        <form onSubmit={handleSubmit}>
          {rejectedPayment && (
            <div className="alert danger" style={{ marginBottom: "16px", background: "#fef2f2", border: "1px solid #ef4444", color: "#991b1b" }}>
              <Icon name="close" size={18}/>
              <span>
                <strong>Resubmission Mode (Attempt #{(rejectedPayment.resubmitCount || 0) + 1}):</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                  Previous rejection reason: "{rejectedPayment.rejectionReason}". Please upload a corrected screenshot receipt or fix the reference ID below.
                </p>
              </span>
            </div>
          )}

          <Card>
            <Heading level={2}>1. Choose payment method</Heading>
            <div className="payment-options">
              {(["TELEBIRR", "CBE_BIRR", "BANK_TRANSFER"] as PaymentMethod[]).map((m) => {
                const label = m === "TELEBIRR" ? "Telebirr" : m === "CBE_BIRR" ? "CBE Birr" : "Bank Transfer";
                return (
                  <label key={m} className={method === m ? "selected" : ""}>
                    <input type="radio" name="payment" checked={method === m} onChange={() => setMethod(m)}/>
                    <span className="payment-logo">{m.slice(0, 2)}</span>
                    <span>
                      <strong>{label}</strong>
                      <small>{m === "TELEBIRR" ? settings.telebirrPhone : m === "CBE_BIRR" ? "CBE mobile transfer" : "Commercial Bank"}</small>
                    </span>
                    {method === m && <Icon name="check"/>}
                  </label>
                );
              })}
            </div>
          </Card>

          <Card style={{ marginTop: "16px" }}>
            <Heading level={2}>2. Payment instructions</Heading>
            {!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim() && (
              <div className="alert warning" style={{ marginBottom: "14px", background: "#fffbeb", border: "1px solid #f59e0b", color: "#b45309" }}>
                <Icon name="shield" size={20}/>
                <span>
                  <strong>Checkout Blocked — Payment Accounts Not Yet Configured:</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                    The campus administration has not set up active Telebirr or CBE account numbers in Platform Settings. Manual payment submission is temporarily blocked until account details are filled by an administrator.
                  </p>
                </span>
              </div>
            )}
            <div className="alert info" style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px", background: "rgba(12, 74, 52, 0.08)", color: "var(--primary)" }}>
              <Icon name="clock" size={18}/>
              <span>
                <strong>Verification SLA:</strong> Payments are verified within {settings.paymentVerificationSlaHours || "2"} hours by Woliso Campus staff.
              </span>
            </div>
            <div className="instruction-box">
              <strong>Transfer {settings.semesterPriceEtb || 50} ETB to Ambo University Woliso Campus</strong>
              {method === "TELEBIRR" ? (
                <>
                  <span>Telebirr receiver number: <b>{settings.telebirrPhone?.trim() || "[Admin: Set TELEBIRR_RECEIVER_PHONE in Settings]"}</b></span>
                  <span>Recipient name: <b>{settings.telebirrRecipientName?.trim() || "Ambo University Woliso Campus"}</b></span>
                </>
              ) : method === "CBE_BIRR" ? (
                <>
                  <span>CBE account number: <b>{settings.cbeAccountNumber?.trim() || "[Admin: Set CBE_ACCOUNT_NUMBER in Settings]"}</b></span>
                  <span>Account name: <b>{settings.cbeRecipientName?.trim() || "Ambo University Woliso Campus"}</b></span>
                </>
              ) : (
                <>
                  <span>Bank: <b>Commercial Bank of Ethiopia (CBE)</b></span>
                  <span>Account: <b>{settings.cbeAccountNumber?.trim() || "[Admin: Set CBE_ACCOUNT_NUMBER in Settings]"}</b></span>
                </>
              )}
            </div>

            <Input
              label="Transaction reference / confirmation ID"
              placeholder="e.g. TB4F8K92 or CBE778942"
              value={txId}
              onChange={e => setTxId(e.target.value)}
              disabled={!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()}
            />

            <div className="upload-box" style={{ cursor: (!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()) ? "not-allowed" : "pointer", opacity: (!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()) ? 0.6 : 1 }} onClick={() => { if (settings.telebirrPhone?.trim() || settings.cbeAccountNumber?.trim()) fileInputRef.current?.click(); }}>
              <input
                type="file"
                ref={fileInputRef.current ? undefined : fileInputRef}
                style={{ display: "none" }}
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                disabled={!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()}
              />
              <Icon name="image" size={32}/>
              <strong>Upload payment receipt screenshot</strong>
              <small>{screenshotName} (PNG or JPG, up to 5 MB)</small>
              <Button variant="secondary" disabled={!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()} onClick={() => fileInputRef.current?.click()}>
                Choose screenshot
              </Button>
            </div>

            {screenshotUrl && (
              <div style={{ marginBottom: "16px" }}>
                <span className="selected-file-badge">
                  <Icon name="check" size={16}/> Screenshot attached: {screenshotName}
                </span>
              </div>
            )}

            {error && (
              <div className="alert danger" style={{ marginBottom: "16px" }}>
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="full"
              disabled={!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()}
              title={(!settings.telebirrPhone?.trim() && !settings.cbeAccountNumber?.trim()) ? "Checkout blocked until payment accounts are set in settings" : undefined}
            >
              {rejectedPayment ? `Resubmit for verification (Attempt #${(rejectedPayment.resubmitCount || 0) + 1})` : "Submit for verification"}
            </Button>
          </Card>
        </form>

        <Card className="order-summary">
          <Heading level={2}>Order summary</Heading>
          <div className="summary-course">
            <span className="course-icon"><Icon name="book"/></span>
            <div>
              <strong>{streamLabel}</strong>
              <small>Freshman · Year 1, Semester 1</small>
            </div>
          </div>
          <ul>
            <li><span>Courses included</span><strong>7</strong></li>
            <li><span>Shared courses</span><strong>3</strong></li>
            <li><span>Access period</span><strong>Full semester</strong></li>
            <li><span>Student</span><strong>{currentUser.fullName}</strong></li>
          </ul>
          <div className="total">
            <span>Total fee</span>
            <strong>{settings.semesterPriceEtb || 50} ETB</strong>
          </div>
          <p><Icon name="shield"/>Manual screenshot verification with replay protection.</p>
        </Card>
      </div>
    </main>
  </div>;
}

// -------------------------------------------------------------
// PAYMENTS & RECEIPTS HISTORY
// -------------------------------------------------------------

function Payments({ payments, settings, go }: { payments: StorePayment[]; settings?: SystemSettingsState; go?: (s: Screen) => void }) {
  const [selectedReceipt, setSelectedReceipt] = useState<StorePayment | null>(null);

  return <>
    <PageHead eyebrow="ACCOUNT" title="Payments & receipts" text="View your payment submissions, reference codes, and verification status."/>
    <div className="alert info" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px", background: "rgba(12, 74, 52, 0.08)", color: "var(--primary)" }}>
      <Icon name="clock" size={18}/>
      <span>
        <strong>Verification SLA:</strong> Payments are verified within {settings?.paymentVerificationSlaHours || "2"} hours by Woliso Campus staff.
      </span>
    </div>
    <div className="stats-row">
      <Card>
        <span className="stat-icon"><Icon name="card"/></span>
        <div><small>Total paid</small><strong>{payments.filter(p => p.status === "APPROVED").length * 50} ETB</strong></div>
      </Card>
      <Card>
        <span className="stat-icon"><Icon name="check"/></span>
        <div><small>Semesters unlocked</small><strong>{payments.filter(p => p.status === "APPROVED").length}</strong></div>
      </Card>
      <Card>
        <span className="stat-icon"><Icon name="clock"/></span>
        <div><small>Pending payments</small><strong>{payments.filter(p => p.status === "PENDING").length}</strong></div>
      </Card>
    </div>

    <Card className="table-card">
      <div className="table-head">
        <Heading level={2}>Payment history</Heading>
        <Button variant="secondary" icon="download" onClick={() => window.print()}>Print Summary</Button>
      </div>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Semester</th>
              <th>Date</th>
              <th>Method</th>
              <th>Transaction ID</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td><strong>{p.referenceCode}</strong></td>
                <td>{p.streamName} · Y{p.academicYearNumber} S{p.semesterNumber}</td>
                <td>{p.submittedAt}</td>
                <td>{p.paymentMethod.replace("_", " ")}</td>
                <td><code>{p.transactionId}</code></td>
                <td><strong>{p.amountEtb} ETB</strong></td>
                <td>
                  <Badge tone={p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "warning" : "danger"}>
                    {p.status}
                  </Badge>
                </td>
                <td>
                  <Button variant="secondary" onClick={() => setSelectedReceipt(p)}>
                    View Receipt
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>

    {/* Official Receipt Modal */}
    {selectedReceipt && (
      <div className="modal-backdrop" onClick={() => setSelectedReceipt(null)}>
        <div className="modal-card receipt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "480px" }}>
          <div className="modal-head">
            <div>
              <span className="eyebrow">OFFICIAL RECEIPT</span>
              <Heading level={2}>Ambo University Woliso Campus</Heading>
            </div>
            <Button variant="ghost" onClick={() => setSelectedReceipt(null)}><Icon name="close"/></Button>
          </div>
          <div className="modal-body">
            <div style={{ textAlign: "center", padding: "16px 0", borderBottom: "1px dashed var(--border, #cbdad3)" }}>
              <span style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Payment Reference Code</span>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary, #0c4a34)", fontFamily: "monospace", marginTop: "4px" }}>
                {selectedReceipt.referenceCode}
              </div>
              <div style={{ marginTop: "8px" }}>
                <Badge tone={selectedReceipt.status === "APPROVED" ? "success" : selectedReceipt.status === "PENDING" ? "warning" : "danger"}>
                  {selectedReceipt.status === "APPROVED" ? "VERIFIED & UNLOCKED" : selectedReceipt.status === "PENDING" ? "UNDER REVIEW" : "REJECTED"}
                </Badge>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0", fontSize: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Student:</span>
                <strong>{selectedReceipt.studentName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Program / Term:</span>
                <strong>{selectedReceipt.streamName} · Y{selectedReceipt.academicYearNumber} S{selectedReceipt.semesterNumber}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Payment Method:</span>
                <strong>{selectedReceipt.paymentMethod.replace("_", " ")}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Transaction ID:</span>
                <code>{selectedReceipt.transactionId}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Submission Date:</span>
                <span>{selectedReceipt.submittedAt}</span>
              </div>
              {selectedReceipt.resubmitCount !== undefined && selectedReceipt.resubmitCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Resubmit Count:</span>
                  <span>{selectedReceipt.resubmitCount} attempt(s)</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--border, #cbdad3)", fontSize: "1.05rem" }}>
                <strong>Amount Paid:</strong>
                <strong style={{ color: "var(--primary, #0c4a34)" }}>{selectedReceipt.amountEtb} ETB</strong>
              </div>
            </div>

            {selectedReceipt.status === "REJECTED" && (
              <div className="alert danger" style={{ margin: "12px 0" }}>
                <strong>Rejection Reason:</strong>
                <p style={{ marginTop: "4px" }}>{selectedReceipt.rejectionReason || "Transaction reference could not be verified on statement."}</p>
                <div style={{ marginTop: "10px" }}>
                  <Button className="full" onClick={() => { setSelectedReceipt(null); if (go) go("checkout"); }}>
                    Resubmit Corrected Receipt <Icon name="arrow"/>
                  </Button>
                </div>
              </div>
            )}

            {selectedReceipt.status === "APPROVED" && (
              <div className="alert success" style={{ margin: "12px 0" }}>
                <Icon name="check"/>
                <span>All 7 courses for this semester are unlocked and ready in the secure viewer.</span>
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between" }}>
            <Button variant="secondary" onClick={() => window.print()}>Print Receipt</Button>
            <Button onClick={() => setSelectedReceipt(null)}>Close</Button>
          </div>
        </div>
      </div>
    )}
  </>;
}

// -------------------------------------------------------------
// SELL-TO-ADMIN: REQUESTS & CONTRIBUTIONS SCREEN
// -------------------------------------------------------------

function Requests({
  currentUser,
  contributions,
  onSubmitContribution,
  onSubmitRequest,
}: {
  currentUser: UserSession;
  contributions: StoreContribution[];
  onSubmitContribution: (c: {
    courseId: string;
    courseCode: string;
    courseName: string;
    examType: any;
    year: number;
    examDate: string;
    declarationAccepted: boolean;
    payoutAccount: string;
    payoutMethod: PaymentMethod;
    proposedPayout: number;
    notes: string;
    fileBase64?: string;
    fileName?: string;
  }) => void;
  onSubmitRequest: (course: string, type: string, year: string, note: string) => void;
}) {
  const [tab, setTab] = useState<"request" | "upload" | "status">("upload");
  const [selectedCourseCode, setSelectedCourseCode] = useState(FRESHMAN_11_COURSES[0].code);
  const [examType, setExamType] = useState<"FINAL" | "MID" | "QUIZ">("FINAL");
  const [examYear, setExamYear] = useState("2023");
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const [examDate, setExamDate] = useState(yesterdayStr);
  const [declPastSemester, setDeclPastSemester] = useState(false);
  const [declAuthorized, setDeclAuthorized] = useState(false);
  const [declLegible, setDeclLegible] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<PaymentMethod>("TELEBIRR");
  const [payoutAccount, setPayoutAccount] = useState(currentUser.phone || "");
  const [proposedPayout, setProposedPayout] = useState("100");
  const [notes, setNotes] = useState("");
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachedBase64, setAttachedBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setError("File size exceeds 20 MB limit.");
        return;
      }
      setAttachedFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.split(",")[1] || res;
        setAttachedBase64(base64);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!declPastSemester || !declAuthorized || !declLegible) {
      setError("All three mandatory honor declarations must be accepted before submitting.");
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (examDate >= todayStr) {
      setError("Exam administration date must be strictly in the past (< today). Future or today's exams cannot be accepted.");
      return;
    }
    if (!payoutAccount.trim()) {
      setError("Please provide your Telebirr or CBE account number to receive your payout.");
      return;
    }
    setError(null);
    const targetCourse = FRESHMAN_11_COURSES.find(c => c.code === selectedCourseCode) || FRESHMAN_11_COURSES[0];

    onSubmitContribution({
      courseId: targetCourse.id,
      courseCode: targetCourse.code,
      courseName: targetCourse.title,
      examType,
      year: parseInt(examYear) || 2023,
      examDate,
      declarationAccepted: true,
      payoutAccount: payoutAccount.trim(),
      payoutMethod,
      proposedPayout: parseFloat(proposedPayout) || 50,
      notes,
      fileBase64: attachedBase64 || undefined,
      fileName: attachedFileName || undefined,
    });
    setSubmittedMessage("Your paper has been submitted! Admin will inspect scan clarity and settle your payout.");
    setTab("status");
  };

  const mySubmissions = contributions.filter(c => c.studentId === currentUser.userId);
  const totalSettledEarnings = mySubmissions
    .filter(c => c.status === "PAID" || c.status === "PAID_OUT")
    .reduce((sum, c) => sum + (c.approvedPayoutEtb || 0), 0);
  const pendingEvaluation = mySubmissions.filter(c => c.status !== "PAID" && c.status !== "PAID_OUT" && c.status !== "REJECTED").length;

  return <>
    <PageHead eyebrow="COMMUNITY ARCHIVE" title="Requests & contributions" text="Sell exam papers you hold to the admin, or request missing papers."/>
    <div className="tabs">
      <button className={tab === "request" ? "active" : ""} onClick={() => setTab("request")}>Request a paper</button>
      <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>Sell a paper to Admin</button>
      <button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>My submissions ({mySubmissions.length})</button>
    </div>

    {submittedMessage && (
      <div className="alert success" style={{ marginBottom: "16px" }}>
        <Icon name="check"/>
        <span><strong>Submission received!</strong><small>{submittedMessage}</small></span>
      </div>
    )}

    {error && (
      <div className="alert danger" style={{ marginBottom: "16px" }}>
        <span>{error}</span>
      </div>
    )}

    <Card className="form-card">
      {tab === "request" ? (
        <>
          <Heading level={2}>What exam paper are you looking for?</Heading>
          <p>Requests with more student demand are prioritized by content managers for acquisition.</p>
          <div className="form-grid">
            <Select label="Course" value={selectedCourseCode} onChange={e => setSelectedCourseCode(e.target.value)}>
              {FRESHMAN_11_COURSES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.title}</option>
              ))}
            </Select>
            <Select label="Paper type"><option>Final exam</option><option>Mid exam</option><option>Quiz</option></Select>
          </div>
          <Select label="Exam year"><option>2023</option><option>2022</option><option>2021</option></Select>
          <label className="field"><span>Additional notes (optional)</span><textarea placeholder="e.g. Need the morning session exam..."/></label>
          <Button onClick={() => { setSubmittedMessage("Paper request registered with Woliso Campus moderators."); }}>Send request</Button>
        </>
      ) : tab === "upload" ? (
        <form onSubmit={handleSellSubmit}>
          <Heading level={2}>Sell an exam paper to ExamVault Admin</Heading>
          <p>We purchase clear mid and final exams from students. Once verified, payout is sent directly to your Telebirr or CBE account.</p>

          <div className="upload-box large" style={{ cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
            <input
              type="file"
              ref={fileRef}
              style={{ display: "none" }}
              accept="application/pdf,image/png,image/jpeg"
              onChange={handleFile}
            />
            <Icon name="upload" size={32}/>
            <strong>{attachedFileName ? `Attached: ${attachedFileName}` : "Drop PDF or photos of the exam paper here"}</strong>
            <small>PDF, JPG, or PNG · Maximum 20 MB · Clear legible text</small>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {attachedFileName ? "Replace paper file" : "Choose paper file"}
            </Button>
          </div>

          <div className="form-grid">
            <Select label="Course (11 Freshman Courses)" value={selectedCourseCode} onChange={e => setSelectedCourseCode(e.target.value)}>
              {FRESHMAN_11_COURSES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.title} {c.isShared ? "(Shared)" : ""}</option>
              ))}
            </Select>
            <Select label="Paper type" value={examType} onChange={e => setExamType(e.target.value as any)}>
              <option value="FINAL">Final Exam</option>
              <option value="MID">Mid Exam</option>
              <option value="QUIZ">Quiz / Test</option>
            </Select>
          </div>

          <div className="form-grid">
            <Input
              type="date"
              label="Exam administration date (Strictly in the past)"
              placeholder="YYYY-MM-DD"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
            />
            <Input label="Proposed buyout payout (ETB)" placeholder="e.g. 100" value={proposedPayout} onChange={e => setProposedPayout(e.target.value)}/>
          </div>

          <div className="form-grid">
            <Select label="Payout wallet / bank" value={payoutMethod} onChange={e => setPayoutMethod(e.target.value as any)}>
              <option value="TELEBIRR">Telebirr Mobile Money</option>
              <option value="CBE_BIRR">CBE Birr</option>
            </Select>
            <Input label="Your phone / CBE account for payout" placeholder="09... or 1000..." value={payoutAccount} onChange={e => setPayoutAccount(e.target.value)}/>
          </div>

          <label className="field"><span>Notes about scan quality or questions</span><textarea placeholder="e.g. Complete questions with full legible handwriting..." value={notes} onChange={e => setNotes(e.target.value)}/></label>

          <div style={{ background: "var(--canvas)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", margin: "16px 0", display: "flex", flexDirection: "column", gap: "10px" }}>
            <strong style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--primary)" }}>
              Three Mandatory Academic Honor Declarations:
            </strong>
            <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={declPastSemester} onChange={e => setDeclPastSemester(e.target.checked)}/>
              <span>1. I declare that this exam paper was officially administered in a past semester at Ambo University and represents historical academic material.</span>
            </label>
            <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={declAuthorized} onChange={e => setDeclAuthorized(e.target.checked)}/>
              <span>2. I declare that I am legally authorized to submit this scan and it contains no confidential, unadministered, or leaked examination papers.</span>
            </label>
            <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={declLegible} onChange={e => setDeclLegible(e.target.checked)}/>
              <span>3. I declare that the scan is authentic, legible, complete, and unmanipulated.</span>
            </label>
          </div>

          <Button type="submit">Submit paper to Admin for cash payout</Button>
        </form>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ background: "var(--canvas)", padding: "16px", borderRadius: "8px", border: "1px solid var(--line)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>TOTAL EARNINGS SETTLED</span>
              <Heading level={2} style={{ color: "var(--success)", margin: "4px 0 0" }}>{totalSettledEarnings} ETB</Heading>
            </div>
            <div style={{ background: "var(--canvas)", padding: "16px", borderRadius: "8px", border: "1px solid var(--line)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>SUBMISSIONS IN REVIEW</span>
              <Heading level={2} style={{ color: "var(--accent)", margin: "4px 0 0" }}>{pendingEvaluation}</Heading>
            </div>
          </div>

          {mySubmissions.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)", padding: "32px 0" }}>
              You haven't submitted any exam papers yet. Use the "Sell a paper to Admin" tab to contribute and earn ETB!
            </p>
          ) : (
            <div className="submission-list">
              {mySubmissions.map(c => {
                const statusTone: "neutral" | "success" | "warning" | "accent" | "danger" =
                  c.status === "PAID" || c.status === "PAID_OUT" || c.status === "PUBLISHED" ? "success"
                  : c.status === "REJECTED" ? "danger"
                  : c.status === "OFFER_MADE" || c.status === "CHANGES_REQUESTED" ? "warning"
                  : "accent";

                return (
                  <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{c.courseName} ({c.courseCode})</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {c.examType} · {c.academicYear} E.C. · Submitted {c.submittedAt}
                        </div>
                      </div>
                      <Badge tone={statusTone}>{c.status.replace("_", " ")}</Badge>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--ink-2)" }}>
                      <span>Payout Target: <b>{c.payoutPaymentMethod} · {c.payoutAccount}</b></span>
                      <span>
                        Offered: <b>{c.proposedPayoutEtb} ETB</b>
                        {c.approvedPayoutEtb && <> · Approved: <b style={{ color: "var(--success)" }}>{c.approvedPayoutEtb} ETB</b></>}
                      </span>
                    </div>

                    {c.rejectionReason && (
                      <div className="alert danger" style={{ margin: "4px 0 0", padding: "8px 12px", fontSize: "0.85rem" }}>
                        <strong>Feedback:</strong> {c.rejectionReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  </>;
}

function Profile({ currentUser, onLogout }: { currentUser: UserSession; onLogout: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPwdMsg({ text: "New password must be at least 8 characters long.", tone: "danger" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ text: "Passwords do not match.", tone: "danger" });
      return;
    }

    setPwdLoading(true);
    setPwdMsg(null);
    try {
      await api.changePassword({ newPassword });
      setPwdMsg({ text: "Password successfully updated!", tone: "success" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdMsg({ text: err.message || "Failed to update password.", tone: "danger" });
    } finally {
      setPwdLoading(false);
    }
  };

  return <>
    <PageHead eyebrow="ACCOUNT" title="Profile & settings" text="Manage your personal details and active device sessions."/>
    <div className="settings-grid">
      <Card className="profile-card">
        <div className="profile-avatar">{currentUser.fullName.slice(0, 2).toUpperCase()}</div>
        <Heading level={2}>{currentUser.fullName}</Heading>
        <p>{currentUser.email || currentUser.phone}</p>
        <Badge tone="success">VERIFIED {currentUser.role.replace("_", " ")}</Badge>
        <hr/>
        <span>ID: {currentUser.studentId || "AMU-STUDENT"}</span>
        <span>Woliso Campus · Ambo University</span>

        <div style={{ marginTop: "24px", width: "100%" }}>
          <Button variant="danger" className="full" icon="logout" onClick={onLogout}>
            Log Out of Session
          </Button>
        </div>
      </Card>
      <div>
        <Card className="form-card">
          <Heading level={2}>Personal information</Heading>
          <div className="form-grid">
            <Input label="Full name" placeholder={currentUser.fullName} disabled/>
            <Input label="Phone number" placeholder={currentUser.phone || "Not set"} disabled/>
          </div>
          <Input label="Email address" placeholder={currentUser.email || "Not set"} disabled/>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "8px 0 0" }}>
            To update university records or student ID, please visit the Woliso Campus Registrar.
          </p>
        </Card>

        <Card className="form-card" style={{ marginTop: "16px" }}>
          <Heading level={2}>Change Password</Heading>
          {pwdMsg && (
            <div className={`alert ${pwdMsg.tone}`} style={{ margin: "12px 0" }}>
              <span>{pwdMsg.text}</span>
            </div>
          )}
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Input
              label="New password"
              placeholder="At least 8 characters"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <Input
              label="Confirm new password"
              placeholder="Re-enter new password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" disabled={pwdLoading}>
              {pwdLoading ? "Saving..." : "Update Password"}
            </Button>
          </form>
        </Card>

        <Card className="form-card" style={{ marginTop: "16px" }}>
          <Heading level={2}>Security & device sessions</Heading>
          <div className="device-row">
            <Icon name="user"/>
            <span>
              <strong>Web Browser Session</strong>
              <small>Woliso, Ethiopia · Active authenticated session</small>
            </span>
            <Badge tone="success">THIS DEVICE</Badge>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "8px 0 0" }}>
            Your account is enforced with a maximum of 2 simultaneous concurrent sessions to protect exam materials.
          </p>
        </Card>
      </div>
    </div>
  </>;
}

function Notifications({ notifications }: { notifications: StoreNotification[] }) {
  return <>
    <PageHead eyebrow="UPDATES" title="Notifications" text="Important updates about your payments, unlocked papers, and contributions."/>
    <Card className="notification-list">
      {notifications.map((n, i) => (
        <button key={n.id} className={!n.read ? "unread" : ""}>
          <span className={`notification-icon ${n.tone}`}><Icon name={n.icon as any}/></span>
          <span>
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <small>{n.timeAgo}</small>
          </span>
          {!n.read && <i/>}
        </button>
      ))}
    </Card>
  </>;
}

function Help() {
  return <>
    <PageHead eyebrow="SUPPORT" title="How can we help?" text="Find quick answers about payment verification, viewer security, and selling papers."/>
    <div className="help-grid">
      {[
        ["card", "Payments & verification", "How screenshot verification works, average review time, and receipts"],
        ["book", "Using exam papers", "Viewing past exams, understanding dynamic student watermarks"],
        ["upload", "Selling papers", "Submitting papers for buyout, payment methods (Telebirr/CBE)"],
      ].map(([icon, title, text]) => (
        <Card key={title}>
          <span className="card-icon"><Icon name={icon as any}/></span>
          <Heading level={3}>{title}</Heading>
          <p>{text}</p>
        </Card>
      ))}
    </div>
  </>;
}

// -------------------------------------------------------------
// ADMIN CONSOLE SCREENS
// -------------------------------------------------------------

// -------------------------------------------------------------
// ADMIN TABLES & QUEUES (PAYMENTS, CONTRIBUTIONS, AUDIT, ETC.)
// -------------------------------------------------------------

function AdminTable({
  type,
  go,
  payments,
  contributions,
  requests,
  auditLogs,
  onReviewPayment,
  onReviewContribution,
}: {
  type: Screen;
  go: (s: Screen) => void;
  payments: StorePayment[];
  contributions: StoreContribution[];
  requests: StorePaperRequest[];
  auditLogs: StoreAuditLog[];
  onReviewPayment: (p: StorePayment) => void;
  onReviewContribution: (c: StoreContribution) => void;
}) {
  if (type === "admin-payments") {
    return <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Payment verification queue"
        text="Review submitted payment screenshot receipts, verify transaction IDs, and grant semester access."
        action={<Button icon="download" onClick={() => alert("Exported payments.")}>Export report</Button>}
      />
      <Card className="table-card">
        <div className="table-tools">
          <label><Icon name="search"/><input placeholder="Search by student name or transaction ID..."/></label>
          <div>
            <Button variant="secondary" icon="filter">Filter: All</Button>
            <Button variant="secondary">Sort: Newest</Button>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Semester</th>
                <th>Method</th>
                <th>Transaction ID</th>
                <th>Screenshot</th>
                <th>Submitted</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>
                    <span className="table-primary">
                      <span className="mini-avatar">{p.studentName.slice(0, 2).toUpperCase()}</span>
                      <strong>{p.studentName}</strong>
                    </span>
                  </td>
                  <td>{p.streamName} · Y{p.academicYearNumber} S{p.semesterNumber}</td>
                  <td>{p.paymentMethod.replace("_", " ")}</td>
                  <td><code>{p.transactionId}</code></td>
                  <td>
                    {p.screenshotUrl ? (
                      <span className="selected-file-badge" style={{ cursor: "pointer" }} onClick={() => onReviewPayment(p)}>
                        <Icon name="image" size={14}/> View proof
                      </span>
                    ) : "None"}
                    {p.hasDuplicateScreenshot && (
                      <div style={{ marginTop: "4px" }}>
                        <Badge tone="danger">⚠️ DUPLICATE SHA-256</Badge>
                      </div>
                    )}
                    {(p.resubmitCount || 0) > 0 && (
                      <div style={{ marginTop: "4px" }}>
                        <Badge tone="warning">Resubmitted ({p.resubmitCount}x)</Badge>
                      </div>
                    )}
                  </td>
                  <td>{p.submittedAt}</td>
                  <td><strong>{p.amountEtb} ETB</strong></td>
                  <td>
                    <Badge tone={p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "warning" : "danger"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant={p.status === "PENDING" ? "primary" : p.status === "APPROVED" ? "secondary" : "ghost"}
                      onClick={() => onReviewPayment(p)}
                    >
                      {p.status === "PENDING" ? "Review & Unlock" : p.status === "APPROVED" ? "Inspect / Revoke" : "Inspect"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>;
  }

  if (type === "contributions") {
    return <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Student paper contributions & buybacks"
        text="Review exam papers submitted by students to sell to ExamVault. Verify legibility, negotiate payout, and publish."
        action={<Button icon="upload" onClick={() => alert("Upload new verified paper.")}>Direct upload</Button>}
      />
      <Card className="table-card">
        <div className="table-tools">
          <label><Icon name="search"/><input placeholder="Search submissions..."/></label>
          <div>
            <Button variant="secondary" icon="filter">Filter: All</Button>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Exam details</th>
                <th>Proposed payout</th>
                <th>Payout wallet</th>
                <th>Scan quality</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.studentName}</strong></td>
                  <td>{c.courseName} ({c.courseCode})</td>
                  <td>{c.examType} · {c.academicYear}</td>
                  <td><strong>{c.proposedPayoutEtb} ETB</strong></td>
                  <td>{c.payoutPaymentMethod} · {c.payoutAccount}</td>
                  <td><Badge tone={c.quality === "EXCELLENT" ? "success" : "neutral"}>{c.quality}</Badge></td>
                  <td>
                    <Badge tone={c.status === "PAID_OUT" ? "success" : c.status === "PENDING" ? "warning" : "neutral"}>
                      {c.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => onReviewContribution(c)}>
                      Review & Pay
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>;
  }

  if (type === "audit") {
    return <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Activity & audit log"
        text="Immutable cryptographic record of all platform actions, approvals, payouts, and access grants."
        action={<Button icon="download" onClick={() => alert("Audit log exported.")}>Export CSV</Button>}
      />
      <Card className="table-card">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Performed by</th>
                <th>IP / Device</th>
                <th>Date & Time</th>
                <th>Risk</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.action}</strong></td>
                  <td>{a.performedBy}</td>
                  <td>{a.deviceIp}</td>
                  <td>{a.dateTime}</td>
                  <td><Badge tone={a.risk === "High" ? "danger" : a.risk === "Medium" ? "warning" : "success"}>{a.risk}</Badge></td>
                  <td>{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>;
  }

  // Default table (papers, users, paper-requests)
  return <>
    <PageHead
      eyebrow="ADMINISTRATION"
      title={type === "papers" ? "Exam papers library" : type === "users" ? "Users & access roles" : "Student paper requests"}
      text={type === "papers" ? "Manage, organize, and publish the exam paper library." : type === "users" ? "Manage student and staff roles across Woliso campus." : "Track student paper requests to prioritize acquisitions."}
      action={<Button icon="plus">{type === "papers" ? "Upload paper" : type === "users" ? "Add staff member" : "Export requests"}</Button>}
    />
    <Card className="table-card">
      <div className="table-tools">
        <label><Icon name="search"/><input placeholder={`Search ${type}...`}/></label>
      </div>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Name / Title</th>
              <th>Details</th>
              <th>Department</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[
              ["FLEn 1011 · Final Exam 2015 E.C.", "FLEn 1011 · 6 pages", "Shared Course", "Published"],
              ["FLEn 1011 · Mid Exam 2015 E.C. (Free Sample)", "FLEn 1011 · 4 pages", "Shared Course", "Published"],
              ["Phys 1011 · Final Exam 2015 E.C.", "Phys 1011 · 8 pages", "Natural Science", "Published"],
              ["MATH 1011 · Final Exam 2015 E.C.", "MATH 1011 · 8 pages", "Natural Science", "Published"],
              ["Econ 1011 · Final Exam 2015 E.C.", "Econ 1011 · 7 pages", "Social Science", "Published"],
            ].map(([title, detail, dept, status]) => (
              <tr key={title}>
                <td><strong>{title}</strong></td>
                <td>{detail}</td>
                <td>{dept}</td>
                <td><Badge tone={status === "Published" ? "success" : "neutral"}>{status}</Badge></td>
                <td><Button variant="ghost"><Icon name="more"/></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  </>;
}

function Structure({
  courses,
  papers,
  activeTab = "tree",
  onTabChange,
  onCreateWantedPaper,
}: {
  courses: FreshmanCourseItem[];
  papers: StoreExamPaper[];
  activeTab?: "tree" | "matrix";
  onTabChange?: (t: "tree" | "matrix") => void;
  onCreateWantedPaper: (courseId: string, courseCode: string, examType: ExamType) => void;
}) {
  const [activeStream, setActiveStream] = useState<StreamCode>("NAT_SCI");
  const streamCourses = getCoursesForStream(activeStream);
  const [tab, setTab] = useState<"tree" | "matrix">(activeTab);

  useEffect(() => {
    setTab(activeTab);
  }, [activeTab]);

  const handleTab = (t: "tree" | "matrix") => {
    setTab(t);
    if (onTabChange) onTabChange(t);
  };

  return <>
    <PageHead
      eyebrow="AMBO UNIVERSITY — WOLISO CAMPUS"
      title="Curriculum & Coverage Structure"
      text="Manage freshman streams, Year 1 semesters, courses, and exam coverage completeness."
    />

    <div className="admin-tabs">
      <button
        className={`admin-tab-btn ${tab === "tree" ? "active" : ""}`}
        onClick={() => handleTab("tree")}
      >
        Curriculum Hierarchy
      </button>
      <button
        className={`admin-tab-btn ${tab === "matrix" ? "active" : ""}`}
        onClick={() => handleTab("matrix")}
      >
        11-Course Coverage Matrix
      </button>
    </div>

    {tab === "matrix" ? (
      <CoverageMatrix courses={courses} papers={papers} onCreateWantedPaper={onCreateWantedPaper} />
    ) : (
      <div className="structure-grid">
        <Card className="tree">
          <div className="table-head">
            <Heading level={2}>Freshman Streams</Heading>
          </div>
          <button
            className={activeStream === "NAT_SCI" ? "active" : ""}
            onClick={() => setActiveStream("NAT_SCI")}
          >
            <span>NS</span>
            <strong>Natural Science</strong>
            <Badge>7 courses</Badge>
            <Icon name="chevron"/>
          </button>
          <button
            className={activeStream === "SOC_SCI" ? "active" : ""}
            onClick={() => setActiveStream("SOC_SCI")}
          >
            <span>SS</span>
            <strong>Social Science</strong>
            <Badge>7 courses</Badge>
            <Icon name="chevron"/>
          </button>
        </Card>

        <Card className="structure-detail">
          <div className="table-head">
            <div>
              <span className="eyebrow">STREAM</span>
              <Heading level={2}>{activeStream === "NAT_SCI" ? "Natural Science" : "Social Science"}</Heading>
              <p>Ambo University - Woliso Campus · Year 1 Freshman Curriculum</p>
            </div>
            <Badge tone="accent">STREAM</Badge>
          </div>

          <div className="year-block">
            <div>
              <span className="year-number">1</span>
              <Heading level={3}>Year 1, Semester 1</Heading>
              <Badge tone="success">PURCHASABLE (50 ETB)</Badge>
            </div>
            <div className="course-list" style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {streamCourses.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                  }}
                >
                  <div>
                    <strong>{c.code} — {c.title}</strong>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "2px" }}>
                      {c.creditHours} Credit Hours
                    </div>
                  </div>
                  {c.isShared ? (
                    <Badge tone="accent">SHARED COURSE</Badge>
                  ) : (
                    <Badge tone="neutral">{c.streamScope === "NAT_SCI" ? "Natural Science" : "Social Science"}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="year-block" style={{ marginTop: "20px", borderStyle: "dashed" }}>
            <div style={{ opacity: 0.8 }}>
              <span className="year-number">2</span>
              <Heading level={3}>Year 1, Semester 2</Heading>
              <Badge tone="neutral">COMING SOON (NON-PURCHASABLE)</Badge>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "8px 0 0" }}>
              Curriculum digitized in subsequent phases. 0 courses currently attached.
            </p>
          </div>
        </Card>
      </div>
    )}
  </>;
}

function ComponentsPage() {
  return <>
    <PageHead eyebrow="DESIGN SYSTEM" title="Components" text="Reusable interface patterns used throughout ExamVault."/>
    <div className="component-stack">
      <Card>
        <Heading level={2}>Buttons</Heading>
        <div className="component-row">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost action</Button>
          <Button variant="danger">Destructive</Button>
          <Button icon="plus">With icon</Button>
        </div>
      </Card>
      <Card>
        <Heading level={2}>Badges & states</Heading>
        <div className="component-row">
          <Badge tone="success">Approved</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Rejected</Badge>
          <Badge tone="accent">New</Badge>
          <Badge>Draft</Badge>
        </div>
      </Card>
    </div>
  </>;
}

function TokensPage() {
  return <>
    <PageHead eyebrow="DESIGN SYSTEM" title="Design tokens" text="A calm, accessible foundation that can be themed globally."/>
    <div className="token-grid">
      <Card>
        <Heading level={2}>Color swatches</Heading>
        <div className="swatches">
          {[
            ["Accent", "accent"],
            ["Accent soft", "accent-soft"],
            ["Ink", "ink"],
            ["Muted", "muted"],
            ["Canvas", "canvas"],
            ["Success", "success"],
            ["Warning", "warning"],
            ["Danger", "danger"],
          ].map(([x, c]) => (
            <div key={x}><i className={c}/><span><strong>{x}</strong><small>var(--{c})</small></span></div>
          ))}
        </div>
      </Card>
      <Card>
        <Heading level={2}>Typography</Heading>
        <div className="type-samples">
          <span className="display">Prepare smarter.</span>
          <span className="title">Semester exam papers</span>
          <span className="heading-sample">Database Systems</span>
          <span className="body-sample">Clear instructions and organized courses.</span>
        </div>
      </Card>
    </div>
  </>;
}

// -------------------------------------------------------------
// MAIN APPLICATION COMPONENT
// -------------------------------------------------------------

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [selectedStream, setSelectedStream] = useState<StreamCode>("NAT_SCI");
  const [courses, setCourses] = useState<FreshmanCourseItem[]>(FRESHMAN_11_COURSES);
  const [selectedCourse, setSelectedCourse] = useState<FreshmanCourseItem>(FRESHMAN_11_COURSES[0]);
  const [unlockedSemesters, setUnlockedSemesters] = useState<Set<string>>(new Set());
  const [payments, setPayments] = useState<StorePayment[]>(INITIAL_PAYMENTS);
  const [contributions, setContributions] = useState<StoreContribution[]>(INITIAL_CONTRIBUTIONS);
  const [requests, setRequests] = useState<StorePaperRequest[]>(INITIAL_REQUESTS);
  const [auditLogs, setAuditLogs] = useState<StoreAuditLog[]>(INITIAL_AUDIT_LOGS);
  const [notifications, setNotifications] = useState<StoreNotification[]>(INITIAL_NOTIFICATIONS);
  const [papers, setPapers] = useState<StoreExamPaper[]>(INITIAL_PAPERS);
  const [wantedPapers, setWantedPapers] = useState<StoreWantedPaper[]>(INITIAL_WANTED_PAPERS);
  const [structureTab, setStructureTab] = useState<"tree" | "matrix">("tree");
  const [prefilledWanted, setPrefilledWanted] = useState<{ courseId: string; courseCode: string; examType: ExamType } | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<StoreExamPaper | null>(INITIAL_PAPERS[0] || null);
  const [termInterests, setTermInterests] = useState<TermInterestRecord[]>(INITIAL_TERM_INTERESTS);
  const [settings, setSettings] = useState<SystemSettingsState>(INITIAL_SYSTEM_SETTINGS);

  // Modal inspection states
  const [reviewingPayment, setReviewingPayment] = useState<StorePayment | null>(null);
  const [reviewingContribution, setReviewingContribution] = useState<StoreContribution | null>(null);
  const [payoutInput, setPayoutInput] = useState("100");
  const [payoutTxInput, setPayoutTxInput] = useState("");

  // Notify Me Modal for Semester 2 (Coming Soon)
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyContact, setNotifyContact] = useState("");
  const [notifyChannel, setNotifyChannel] = useState<"TELEGRAM" | "SMS" | "EMAIL">("TELEGRAM");
  const [notifySubmitted, setNotifySubmitted] = useState(false);

  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentTermKey = `pt-${selectedStream === "NAT_SCI" ? "nat-sci" : "soc-sci"}-y1s1`;
  const isCurrentSemesterUnlocked = unlockedSemesters.has(currentTermKey);
  const pendingPaymentsCount = payments.filter(p => p.status === "PENDING").length;

  // Refresh data from real PostgreSQL database
  const refreshDatabaseData = async () => {
    try {
      const data = await api.getBootstrap();

      if (data.settings && data.settings.length > 0) {
        const sObj: Partial<SystemSettingsState> = {};
        data.settings.forEach((s: any) => {
          if (s.key === "SEMESTER_PRICE_ETB") sObj.semesterPriceEtb = s.value;
          if (s.key === "TELEBIRR_RECEIVER_PHONE") sObj.telebirrPhone = s.value;
          if (s.key === "TELEBIRR_RECEIVER_NAME") sObj.telebirrRecipientName = s.value;
          if (s.key === "CBE_ACCOUNT_NUMBER") sObj.cbeAccountNumber = s.value;
          if (s.key === "CBE_ACCOUNT_NAME") sObj.cbeRecipientName = s.value;
          if (s.key === "MAX_UPLOAD_SIZE_MB") sObj.maxUploadSizeMb = s.value;
          if (s.key === "PAYMENT_VERIFICATION_SLA_HOURS") sObj.paymentVerificationSlaHours = s.value;
          if (s.key === "ANNOUNCEMENT_BANNER") sObj.announcementBanner = s.value;
          if (s.key === "ANNOUNCEMENT_ACTIVE") sObj.announcementActive = s.value === "true";
          if (s.key === "PAYMENT_INSTRUCTIONS") sObj.paymentInstructions = s.value;
          if (s.key === "MAX_PAYOUT_LIMIT_ETB") sObj.maxPayoutLimitEtb = s.value;
        });
        setSettings(prev => ({ ...prev, ...sObj }));
      }

      if (data.courses && data.courses.length > 0) {
        const mappedCourses: FreshmanCourseItem[] = data.courses.map((c: any) => {
          const ptCodes = c.programTerms?.map((pt: any) => pt.programTerm?.program?.code) || [];
          const isShared = ptCodes.includes("NAT_SCI") && ptCodes.includes("SOC_SCI");
          const streamScope: "NAT_SCI" | "SOC_SCI" | "SHARED" = isShared ? "SHARED" : ptCodes.includes("SOC_SCI") ? "SOC_SCI" : "NAT_SCI";
          return {
            id: c.id,
            code: c.code,
            title: c.title,
            creditHours: c.creditHours,
            streamScope,
            isShared,
            breakdown: isShared ? "Common Course (Shared)" : streamScope === "NAT_SCI" ? "Natural Science Core" : "Social Science Core",
            paperCount: 2,
            hasFreeSample: true,
          };
        });
        setCourses(mappedCourses);
      }

      if (data.papers && data.papers.length > 0) {
        const mappedPapers: StoreExamPaper[] = data.papers.map((p: any) => ({
          id: p.id,
          courseId: p.courseId,
          courseCode: p.course?.code || "FLEn 1011",
          courseName: p.course?.title || "Communicative English",
          title: p.title,
          examType: p.examType,
          academicYear: p.examYearEc || 2023,
          examYearEc: p.examYearEc || 2023,
          quality: p.quality || "EXCELLENT",
          pageCount: p.pageCount || 6,
          isFreeSample: p.isFreeSample,
          status: p.status,
          addedAt: new Date(p.createdAt).toLocaleDateString(),
        }));
        setPapers(mappedPapers);
        setSelectedPaper(mappedPapers[0] || null);
      }

      if (data.payments) {
        const mappedPayments: StorePayment[] = data.payments.map((p: any) => ({
          id: p.id,
          referenceCode: p.referenceCode,
          userId: p.userId,
          studentName: p.user?.fullName || "Student",
          studentId: p.user?.studentId || "AMU-2026-0042",
          stream: (p.programTerm?.program?.code as StreamCode) || "NAT_SCI",
          streamName: p.programTerm?.program?.name || "Natural Science",
          academicYearNumber: p.programTerm?.term?.yearNumber || 1,
          semesterNumber: p.programTerm?.term?.semesterNumber || 1,
          programTermId: p.programTermId,
          amountEtb: Number(p.amountEtb) || 50,
          paymentMethod: p.paymentMethod,
          transactionId: p.transactionId,
          screenshotUrl: p.screenshotKey,
          status: p.status,
          rejectionReason: p.rejectionReason,
          resubmitCount: p.resubmitCount || 0,
          hasDuplicateScreenshot: Boolean(p.hasDuplicateScreenshot),
          submittedAt: new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toLocaleDateString() : undefined,
          reviewedBy: p.reviewedBy?.fullName,
        }));
        setPayments(mappedPayments);
      }

      if (data.contributions) {
        const mappedContribs: StoreContribution[] = data.contributions.map((c: any) => ({
          id: c.id,
          studentId: c.studentId,
          studentName: c.student?.fullName || "Student",
          studentIdentifier: c.student?.studentId || "AMU-2026-0042",
          courseId: c.courseId,
          courseCode: c.course?.code || "",
          courseName: c.course?.title || "",
          streamName: "Freshman Curriculum",
          examType: c.examType,
          academicYear: c.academicYearEc || 2023,
          examDate: new Date(c.examDate).toISOString().split("T")[0],
          declarationAccepted: true,
          studentNotes: c.studentNotes || undefined,
          fileName: c.files?.[0]?.storageKey?.split("/").pop() || "Exam_Scan.pdf",
          fileSizeBytes: c.files?.[0]?.sizeBytes || 2400000,
          payoutPaymentMethod: c.payoutPaymentMethod,
          payoutAccount: c.payoutAccount,
          proposedPayoutEtb: Number(c.proposedPayoutEtb) || 100,
          approvedPayoutEtb: c.approvedPayoutEtb ? Number(c.approvedPayoutEtb) : undefined,
          payoutTxId: c.payoutTxId || undefined,
          quality: "EXCELLENT",
          status: c.status,
          rejectionReason: c.rejectionReason,
          submittedAt: new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          reviewedAt: c.reviewedAt ? new Date(c.reviewedAt).toLocaleDateString() : undefined,
        }));
        setContributions(mappedContribs);
      }

      if (data.auditLogs) {
        const mappedAudit: StoreAuditLog[] = data.auditLogs.map((a: any) => {
          const detailStr = typeof a.details === "object" && a.details ? JSON.stringify(a.details) : String(a.details || "");
          return {
            id: a.id,
            action: a.action,
            performedBy: a.actor?.fullName || "System Automated",
            role: a.actor?.role || "SYSTEM",
            deviceIp: a.ipAddress || "197.156.102.10",
            dateTime: new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            risk: a.riskLevel === "HIGH" || a.riskLevel === "CRITICAL" ? "High" : a.riskLevel === "MEDIUM" ? "Medium" : "Low",
            details: detailStr,
          };
        });
        setAuditLogs(mappedAudit);
      }

      if (data.notifications) {
        const mappedNotifs: StoreNotification[] = data.notifications.map((n: any) => ({
          id: n.id,
          userId: n.userId,
          icon: n.type === "SUCCESS" ? "check" : "file",
          title: n.title,
          message: n.message,
          timeAgo: new Date(n.createdAt).toLocaleDateString(),
          tone: n.type === "SUCCESS" ? "success" : "accent",
          read: n.isRead,
        }));
        setNotifications(mappedNotifs);
      }

      if (data.wantedPapers) {
        const mappedWanted: StoreWantedPaper[] = data.wantedPapers.map((w: any) => ({
          id: w.id,
          courseId: w.courseId,
          courseCode: w.course?.code || "",
          courseTitle: w.course?.title || "",
          examType: w.examType,
          offeredPriceEtb: Number(w.offeredPriceEtb) || 100,
          isOpen: w.isOpen,
          notes: w.notes,
          createdAt: new Date(w.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        }));
        setWantedPapers(mappedWanted);
      }

      if (data.entitlements) {
        const unlocked = new Set<string>();
        data.entitlements.forEach((e: any) => {
          unlocked.add(e.programTermId);
          if (e.programTerm?.program?.code === "NAT_SCI") unlocked.add("pt-nat-sci-y1s1");
          if (e.programTerm?.program?.code === "SOC_SCI") unlocked.add("pt-soc-sci-y1s1");
        });
        setUnlockedSemesters(unlocked);
      }
    } catch (err) {
      console.error("[Database Bootstrap Error]:", err);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        const meRes = await api.getMe();
        if (meRes.user) {
          const stream = (meRes.user.program?.code as StreamCode) || "NAT_SCI";
          const sess: UserSession = {
            userId: meRes.user.id,
            fullName: meRes.user.fullName,
            email: meRes.user.email || "",
            phone: meRes.user.phone || "",
            role: meRes.user.role as Role,
            programId: meRes.user.programId || null,
            studentId: meRes.user.studentId || undefined,
            stream,
            currentYear: meRes.user.currentYear || 1,
            mustChangePassword: Boolean(meRes.mustChangePassword),
          };
          setCurrentUser(sess);
          setSelectedStream(stream);
          setMustChangePassword(Boolean(meRes.mustChangePassword));
          if (meRes.unlockedProgramTermIds) {
            setUnlockedSemesters(new Set(meRes.unlockedProgramTermIds));
          }
        }
      } catch (err) {
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initSession();
    refreshDatabaseData();
  }, []);

  // Handlers for payments (backed by PostgreSQL)
  const handlePaymentSubmission = async (p: { method: PaymentMethod; txId: string; screenshotUrl: string }): Promise<StorePayment> => {
    if (!currentUser) {
      throw new Error("You must be logged in to submit a payment.");
    }
    const streamName = selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science";

    try {
      const created = await api.submitPayment({
        userId: currentUser.userId,
        stream: selectedStream,
        method: p.method,
        txId: p.txId,
        screenshotUrl: p.screenshotUrl,
      });

      const newPayment: StorePayment = {
        id: created.id,
        referenceCode: created.referenceCode,
        userId: created.userId,
        studentName: currentUser.fullName,
        studentId: currentUser.studentId || "AMU-STUDENT",
        stream: selectedStream,
        streamName,
        academicYearNumber: 1,
        semesterNumber: 1,
        programTermId: created.programTermId,
        amountEtb: Number(created.amountEtb) || 50,
        paymentMethod: p.method,
        transactionId: p.txId,
        screenshotUrl: p.screenshotUrl,
        status: "PENDING",
        resubmitCount: created.resubmitCount || 0,
        hasDuplicateScreenshot: Boolean(created.hasDuplicateScreenshot),
        submittedAt: "Just now",
      };

      setPayments(prev => [newPayment, ...prev]);
      await refreshDatabaseData();
      return newPayment;
    } catch (err: any) {
      alert(err.message || "Failed to submit payment");
      throw err;
    }
  };

  const handleApprovePayment = async (payId: string) => {
    if (!currentUser) return;
    const target = payments.find(p => p.id === payId);
    const confirmed = window.confirm(
      `Confirm approval: Grant full semester access to ${target?.studentName || "student"} for ${target?.streamName || "this semester"} (Ref: ${target?.referenceCode || payId})?`
    );
    if (!confirmed) return;

    try {
      const res = await api.approvePayment(payId, currentUser.userId);
      setPayments(prev =>
        prev.map(p => (p.id === payId ? { ...p, status: "APPROVED", reviewedAt: "Just now", reviewedBy: currentUser.fullName } : p))
      );
      if (res.entitlement?.programTermId) {
        setUnlockedSemesters(prev => new Set([...prev, res.entitlement.programTermId, currentTermKey]));
      }
      setReviewingPayment(null);
      await refreshDatabaseData();
    } catch (err: any) {
      alert(err.message || "Failed to approve payment");
    }
  };

  const handleRejectPayment = async (payId: string) => {
    if (!currentUser) return;
    const reason = prompt(
      "Enter mandatory rejection reason (required - will be displayed to student):",
      "Transaction reference ID not found in bank statement"
    );
    if (!reason || !reason.trim()) {
      alert("Rejection cancelled: a reason is mandatory.");
      return;
    }

    try {
      await api.rejectPayment(payId, reason.trim(), currentUser.userId);
      setPayments(prev =>
        prev.map(p => (p.id === payId ? { ...p, status: "REJECTED", rejectionReason: reason.trim(), reviewedAt: "Just now", reviewedBy: currentUser.fullName } : p))
      );
      setReviewingPayment(null);
      await refreshDatabaseData();
    } catch (err: any) {
      alert(err.message || "Failed to reject payment");
    }
  };

  const handleRevokePayment = async (payId: string) => {
    if (!currentUser) return;
    const target = payments.find(p => p.id === payId);
    const reason = prompt(
      `Enter mandatory reason for revoking access for ${target?.studentName || "student"} (e.g. Chargeback, Invalid receipt, Fraudulent statement):`,
      "Statement verification revoked by verifier"
    );
    if (!reason || !reason.trim()) {
      alert("Revocation cancelled: a reason is mandatory.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to REVOKE access for ${target?.studentName || "student"}? This will immediately lock their semester access and write a high-risk audit log.`
    );
    if (!confirmed) return;

    try {
      await api.revokePayment(payId, reason.trim(), currentUser.userId);
      setPayments(prev =>
        prev.map(p =>
          p.id === payId
            ? { ...p, status: "REJECTED", rejectionReason: `Access Revoked: ${reason.trim()}`, reviewedAt: "Just now", reviewedBy: currentUser.fullName }
            : p
        )
      );
      setReviewingPayment(null);
      await refreshDatabaseData();
      alert("Access successfully revoked and audit logged.");
    } catch (err: any) {
      alert(err.message || "Failed to revoke access");
    }
  };

  // Handlers for sell-to-admin contributions (backed by PostgreSQL)
  const handleContributionSubmission = async (c: {
    courseId: string;
    courseCode: string;
    courseName: string;
    examType: any;
    year: number;
    examDate: string;
    declarationAccepted: boolean;
    payoutAccount: string;
    payoutMethod: PaymentMethod;
    proposedPayout: number;
    notes: string;
  }) => {
    if (!currentUser) return;
    try {
      await api.submitContribution({
        studentId: currentUser.userId,
        courseId: c.courseId,
        examType: c.examType,
        academicYear: c.year,
        examDate: c.examDate,
        declarationAccepted: c.declarationAccepted,
        payoutPaymentMethod: c.payoutMethod,
        payoutAccount: c.payoutAccount,
        proposedPayoutEtb: c.proposedPayout,
        studentNotes: c.notes,
      });
      await refreshDatabaseData();
      alert("Paper submitted successfully to Admin verification queue.");
    } catch (err: any) {
      alert(err.message || "Failed to submit paper contribution");
    }
  };

  const handleApproveContribution = async (contribId: string) => {
    if (!currentUser) return;
    const amount = parseFloat(payoutInput) || 100;
    const tx = payoutTxInput || "TB_PAYOUT_SETTLED";

    try {
      await api.approveContribution({
        contributionId: contribId,
        approvedPayoutEtb: amount,
        payoutTxId: tx,
        reviewerId: currentUser.userId,
      });
      setReviewingContribution(null);
      await refreshDatabaseData();
      alert("Buyout approved! Student payout marked settled and paper published to library.");
    } catch (err: any) {
      alert(err.message || "Failed to approve contribution buyout");
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error("Logout error", err);
    }
    setCurrentUser(null);
    setUnlockedSemesters(new Set());
    setScreen("landing");
  };

  // Handle semester 2 notification signup (backed by PostgreSQL)
  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyContact.trim()) return;

    try {
      await api.registerTermInterest(currentUser?.userId || "anon", "term-y1s2");
      const newRecord: TermInterestRecord = {
        id: `interest-${Date.now()}`,
        userId: currentUser?.userId || "anon",
        termId: "term-y1s2",
        termName: `${selectedStream === "NAT_SCI" ? "Natural Science" : "Social Science"} · Year 1, Semester 2`,
        emailOrPhone: notifyContact.trim(),
        preferredChannel: notifyChannel,
        submittedAt: new Date().toLocaleString(),
      };
      setTermInterests(prev => [newRecord, ...prev]);
      setNotifySubmitted(true);
    } catch (err: any) {
      alert(err.message || "Failed to register notification interest");
    }
  };

  const handleSaveSettings = async (s: SystemSettingsState) => {
    if (!currentUser) return;
    try {
      await api.saveSettings({
        SEMESTER_PRICE_ETB: s.semesterPriceEtb,
        TELEBIRR_RECEIVER_PHONE: s.telebirrPhone,
        TELEBIRR_RECEIVER_NAME: s.telebirrRecipientName,
        CBE_ACCOUNT_NUMBER: s.cbeAccountNumber,
        CBE_ACCOUNT_NAME: s.cbeRecipientName,
        MAX_UPLOAD_SIZE_MB: s.maxUploadSizeMb,
        ANNOUNCEMENT_BANNER: s.announcementBanner,
        ANNOUNCEMENT_ACTIVE: s.announcementActive ? "true" : "false",
        PAYMENT_INSTRUCTIONS: s.paymentInstructions,
        MAX_PAYOUT_LIMIT_ETB: s.maxPayoutLimitEtb,
        PAYMENT_VERIFICATION_SLA_HOURS: s.paymentVerificationSlaHours,
      }, currentUser.userId);
      setSettings(s);
      await refreshDatabaseData();
      alert("Platform settings saved and persisted to database.");
    } catch (err: any) {
      alert(err.message || "Failed to save settings to database");
    }
  };

  // Loading state while checking active session
  if (authLoading) {
    return (
      <div className="standalone-state" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Logo/>
          <p style={{ marginTop: "16px", color: "var(--muted)" }}>Connecting to ExamVault Woliso archive...</p>
        </div>
      </div>
    );
  }

  // Standalone public pages
  if (screen === "landing") return <Landing go={go}/>;
  if (screen === "terms") return <TermsPage go={go}/>;
  if (screen === "privacy") return <PrivacyPage go={go}/>;
  if (screen === "contact") return <ContactPage go={go}/>;
  if (screen === "forbidden") return <ForbiddenPage go={go}/>;
  if (screen === "not-found") return <NotFoundPage go={go}/>;
  if (screen === "help" && !currentUser) return <Help/>;

  if (screen === "login" || screen === "signup" || screen === "admin-login" || screen === "verify") {
    return (
      <Auth
        mode={screen === "admin-login" ? "admin" : (screen as any)}
        go={go}
        onAuthSuccess={(u, mustChange) => {
          setCurrentUser(u);
          setSelectedStream(u.stream || "NAT_SCI");
          setMustChangePassword(Boolean(mustChange));
          refreshDatabaseData();
        }}
      />
    );
  }

  // Protected screen guard: require login
  if (!currentUser) {
    return (
      <Auth
        mode="login"
        go={go}
        onAuthSuccess={(u, mustChange) => {
          setCurrentUser(u);
          setSelectedStream(u.stream || "NAT_SCI");
          setMustChangePassword(Boolean(mustChange));
          refreshDatabaseData();
        }}
      />
    );
  }

  if (screen === "viewer") return <Viewer go={go} currentUser={currentUser} paper={selectedPaper}/>;
  if (screen === "checkout") {
    return (
      <Checkout
        go={go}
        currentUser={currentUser}
        selectedStream={selectedStream}
        settings={settings}
        payments={payments}
        onSubmitPayment={handlePaymentSubmission}
      />
    );
  }

  // Role separation guards
  const adminScreens = ["admin","structure","papers","contributions","paper-requests","admin-payments","users","audit","settings","components","tokens"];
  if (currentUser.role === "STUDENT" && adminScreens.includes(screen)) {
    return <ForbiddenPage go={go}/>;
  }

  if (currentUser.role === "CONTENT_MANAGER" && (screen === "admin-payments" || screen === "users")) {
    return (
      <Shell screen={screen} go={go} currentUser={currentUser}>
        <AccessDenied
          title="Access Restricted for Content Managers"
          message="Content Managers do not have permissions to view student payments or administrative user roles."
          onGoBack={() => go("admin")}
        />
      </Shell>
    );
  }

  if (currentUser.role === "PAYMENT_VERIFIER" && (screen === "structure" || screen === "papers")) {
    return (
      <Shell screen={screen} go={go} currentUser={currentUser}>
        <AccessDenied
          title="Access Restricted for Payment Verifiers"
          message="Payment Verifiers do not have permission to view or modify freshman curriculum structure or exam papers."
          onGoBack={() => go("admin")}
        />
      </Shell>
    );
  }

  const content =
    screen === "dashboard" ? (
      <Dashboard
        go={go}
        currentUser={currentUser}
        isUnlocked={isCurrentSemesterUnlocked}
        selectedStream={selectedStream}
        onOpenNotifyModal={() => { setNotifyModalOpen(true); setNotifySubmitted(false); }}
      />
    ) :
    screen === "browse" ? (
      <Browse
        go={go}
        selectedStream={selectedStream}
        onSelectStream={setSelectedStream}
        onOpenNotifyModal={() => { setNotifyModalOpen(true); setNotifySubmitted(false); }}
      />
    ) :
    screen === "semester" ? (
      <Semester
        go={go}
        isUnlocked={isCurrentSemesterUnlocked}
        selectedStream={selectedStream}
        payments={payments}
        settings={settings}
        currentUser={currentUser}
        onSelectCourse={(c) => {
          setSelectedCourse(c);
          go("course");
        }}
      />
    ) :
    screen === "course" ? (
      <Course
        go={go}
        isUnlocked={isCurrentSemesterUnlocked}
        course={selectedCourse}
        papers={papers}
        onSelectPaper={setSelectedPaper}
      />
    ) :
    screen === "payments" ? <Payments payments={payments} settings={settings} go={go}/> :
    screen === "requests" ? (
      <Requests
        currentUser={currentUser}
        contributions={contributions}
        onSubmitContribution={handleContributionSubmission}
        onSubmitRequest={() => {}}
      />
    ) :
    screen === "profile" ? <Profile currentUser={currentUser} onLogout={handleLogout}/> :
    screen === "notifications" ? <Notifications notifications={notifications}/> :
    screen === "help" ? <Help/> :
    screen === "admin" ? (
      <AdminDashboard
        go={go}
        currentUser={currentUser}
        pendingPayments={payments.filter(p => p.status === "PENDING")}
        onReviewPayment={setReviewingPayment}
        onOpenCoverage={() => { setStructureTab("matrix"); go("structure"); }}
      />
    ) :
    screen === "structure" ? (
      <Structure
        courses={courses}
        papers={papers}
        activeTab={structureTab}
        onTabChange={setStructureTab}
        onCreateWantedPaper={(cId, cCode, eType) => {
          setPrefilledWanted({ courseId: cId, courseCode: cCode, examType: eType });
          go("paper-requests");
        }}
      />
    ) :
    screen === "papers" ? (
      <PapersManager
        currentUser={currentUser}
        courses={courses}
        papers={papers}
        onRefresh={refreshDatabaseData}
      />
    ) :
    screen === "contributions" ? (
      <AdminTable
        type={screen}
        go={go}
        payments={payments}
        contributions={contributions}
        requests={requests}
        auditLogs={auditLogs}
        onReviewPayment={setReviewingPayment}
        onReviewContribution={setReviewingContribution}
      />
    ) :
    screen === "paper-requests" ? (
      <WantedPapersManager
        currentUser={currentUser}
        courses={courses}
        wantedPapers={wantedPapers}
        onRefresh={refreshDatabaseData}
        prefilledWanted={prefilledWanted}
        onClearPrefill={() => setPrefilledWanted(null)}
      />
    ) :
    screen === "admin-payments" ? (
      <AdminTable
        type={screen}
        go={go}
        payments={payments}
        contributions={contributions}
        requests={requests}
        auditLogs={auditLogs}
        onReviewPayment={setReviewingPayment}
        onReviewContribution={setReviewingContribution}
      />
    ) :
    screen === "users" ? (
      <UsersManager currentUser={currentUser} />
    ) :
    screen === "audit" ? (
      <AuditLogViewer />
    ) :
    screen === "settings" ? (
      <SettingsManager settings={settings} currentUser={currentUser} onSaveSettings={handleSaveSettings} />
    ) :
    screen === "components" ? <ComponentsPage/> :
    <TokensPage/>;

  return (
    <>
      <Shell
        screen={screen}
        go={go}
        currentUser={currentUser}
        pendingPaymentsCount={pendingPaymentsCount}
        unreadNotifsCount={notifications.filter(n => !n.read).length}
      >
        {content}
      </Shell>

      {/* Force Password Change Modal (First login for admin or temporary passwords) */}
      {mustChangePassword && (
        <ForcePasswordChangeModal
          onPasswordChanged={() => {
            setMustChangePassword(false);
            setCurrentUser(prev => prev ? { ...prev, mustChangePassword: false } : null);
          }}
        />
      )}

      {/* Working "Notify Me" Modal for Year 1 Semester 2 (Coming Soon) */}
      {notifyModalOpen && (
        <div className="modal-backdrop" onClick={() => setNotifyModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: "440px" }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">SEMESTER 2 NOTIFICATION</span>
                <Heading level={2}>Get Notified for Semester 2</Heading>
              </div>
              <Button variant="ghost" onClick={() => setNotifyModalOpen(false)}><Icon name="close"/></Button>
            </div>
            <div className="modal-body">
              {notifySubmitted ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <span className="state-icon approved" style={{ margin: "0 auto 12px" }}>
                    <Icon name="check" size={32}/>
                  </span>
                  <Heading level={3}>You're on the list!</Heading>
                  <p style={{ color: "var(--muted)", margin: "8px 0 16px" }}>
                    We will notify <b>{notifyContact}</b> via {notifyChannel} as soon as Year 1, Semester 2 exam papers are digitized and available.
                  </p>
                  <Button className="full" onClick={() => setNotifyModalOpen(false)}>Done</Button>
                </div>
              ) : (
                <form onSubmit={handleNotifySubmit}>
                  <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.9rem" }}>
                    Year 1, Semester 2 is currently in digitization. Enter your Telegram handle, phone, or email to receive instant access notification when papers launch.
                  </p>

                  <Input
                    label="Phone, Telegram (@handle), or Email"
                    placeholder="e.g. @your_telegram or 09..."
                    value={notifyContact}
                    onChange={e => setNotifyContact(e.target.value)}
                  />

                  <div style={{ marginTop: "12px" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 650, display: "block", marginBottom: "8px" }}>
                      Preferred notification channel:
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {(["TELEGRAM", "SMS", "EMAIL"] as const).map(ch => (
                        <button
                          key={ch}
                          type="button"
                          className={`btn ${notifyChannel === ch ? "btn-primary" : "btn-secondary"}`}
                          style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
                          onClick={() => setNotifyChannel(ch)}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "20px" }}>
                    <Button type="submit" className="full">
                      <Icon name="bell"/> Notify me when available
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Verification & Review Modal */}
      {reviewingPayment && (
        <div className="modal-backdrop" onClick={() => setReviewingPayment(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">VERIFICATION REVIEW</span>
                <Heading level={2}>Verify Payment Receipt</Heading>
              </div>
              <Button variant="ghost" onClick={() => setReviewingPayment(null)}><Icon name="close"/></Button>
            </div>
            <div className="modal-body">
              <div className="instruction-box" style={{ margin: 0 }}>
                <span>Student: <b>{reviewingPayment.studentName} ({reviewingPayment.studentId})</b></span>
                <span>Term: <b>{reviewingPayment.streamName} · Year 1, Semester 1</b></span>
                <span>Payment Method: <b>{reviewingPayment.paymentMethod.replace("_", " ")}</b></span>
                <span>Transaction Ref ID: <b style={{ fontFamily: "monospace", fontSize: "1rem", color: "var(--accent)" }}>{reviewingPayment.transactionId}</b></span>
                <span>Amount: <b>{reviewingPayment.amountEtb} ETB</b></span>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 650, display: "block", marginBottom: "8px" }}>
                  Uploaded Payment Screenshot:
                </label>
                <div className="screenshot-preview-box">
                  <img
                    src={reviewingPayment.screenshotUrl || "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80"}
                    alt="Payment receipt proof"
                  />
                </div>
              </div>

              {reviewingPayment.hasDuplicateScreenshot && (
                <div className="alert danger" style={{ background: "#ffebe9", border: "1px solid #ff8182", color: "#cf222e" }}>
                  <Icon name="shield" size={20}/>
                  <span>
                    <strong>DUPLICATE SCREENSHOT WARNING (SHA-256 MATCH):</strong>
                    <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem" }}>
                      This receipt screenshot has an identical SHA-256 hash to another payment in the database. Possible receipt reuse / replay fraud!
                    </p>
                  </span>
                </div>
              )}

              {(reviewingPayment.resubmitCount || 0) > 0 && (
                <div className="alert info" style={{ background: "rgba(12, 74, 52, 0.08)", color: "var(--primary)" }}>
                  <Icon name="clock" size={18}/>
                  <span>
                    <strong>Resubmitted Receipt:</strong> Student resubmitted this payment (Attempt #{(reviewingPayment.resubmitCount || 0) + 1}) with a corrected screenshot.
                  </span>
                </div>
              )}

              <div className="alert success">
                <Icon name="shield"/>
                <span>
                  <strong>Idempotent Access Grant:</strong>
                  <small>Approving this payment unlocks all 7 courses for this student's stream and writes an audit log.</small>
                </span>
              </div>
            </div>
            <div className="modal-footer">
              {reviewingPayment.status === "APPROVED" ? (
                <>
                  <Badge tone="success">STATUS: ACTIVE & VERIFIED</Badge>
                  <Button variant="danger" onClick={() => handleRevokePayment(reviewingPayment.id)}>
                    Revoke Access
                  </Button>
                </>
              ) : reviewingPayment.status === "REJECTED" ? (
                <>
                  <Badge tone="danger">STATUS: REJECTED</Badge>
                  <Button variant="secondary" onClick={() => setReviewingPayment(null)}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="danger" onClick={() => handleRejectPayment(reviewingPayment.id)}>
                    Reject Payment
                  </Button>
                  <Button onClick={() => handleApprovePayment(reviewingPayment.id)}>
                    Approve & Unlock Semester ({reviewingPayment.amountEtb} ETB)
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contribution Review Modal (Sell-to-Admin) */}
      {reviewingContribution && (
        <div className="modal-backdrop" onClick={() => setReviewingContribution(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">BUYOUT REVIEW</span>
                <Heading level={2}>Review Student Exam Paper Submission</Heading>
              </div>
              <Button variant="ghost" onClick={() => setReviewingContribution(null)}><Icon name="close"/></Button>
            </div>
            <div className="modal-body">
              <div className="instruction-box" style={{ margin: 0 }}>
                <span>Student: <b>{reviewingContribution.studentName} ({reviewingContribution.studentIdentifier})</b></span>
                <span>Course: <b>{reviewingContribution.courseName} ({reviewingContribution.courseCode})</b></span>
                <span>Exam: <b>{reviewingContribution.examType} · {reviewingContribution.academicYear}</b></span>
                <span>Exam Date: <b>{reviewingContribution.examDate}</b></span>
                <span>Honor Declaration: <b style={{ color: "var(--success)" }}>Accepted by student</b></span>
                <span>Payout Wallet: <b>{reviewingContribution.payoutPaymentMethod} · {reviewingContribution.payoutAccount}</b></span>
                <span>Proposed Buyout Price: <b>{reviewingContribution.proposedPayoutEtb} ETB</b></span>
                {reviewingContribution.studentNotes && <span>Notes: <i>"{reviewingContribution.studentNotes}"</i></span>}
              </div>

              <div className="form-grid">
                <Input
                  label="Approved buyout payout (ETB)"
                  placeholder="100"
                  value={payoutInput}
                  onChange={e => setPayoutInput(e.target.value)}
                />
                <Input
                  label="Payout mobile money Tx ID"
                  placeholder="TB_PAYOUT_8892"
                  value={payoutTxInput}
                  onChange={e => setPayoutTxInput(e.target.value)}
                />
              </div>

              <div className="alert success">
                <Icon name="check"/>
                <span>
                  <strong>Publish to Catalog:</strong>
                  <small>Paper will be verified, added to the freshman course collection, and student payout marked settled.</small>
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setReviewingContribution(null)}>Cancel</Button>
              <Button onClick={() => handleApproveContribution(reviewingContribution.id)}>
                Approve Payout & Publish Paper
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

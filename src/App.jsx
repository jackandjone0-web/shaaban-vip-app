import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const Connection_URL = "https://api.shaabansignals.online";

async function parseApiJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`API returned non-JSON (${res.status}). Please restart/redeploy the API or check the route.`);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function asBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  return false;
}

function getPlatformFreeMode(settings) {
  return asBool(
    settings?.free_mode ??
    settings?.platform_free_mode ??
    settings?.freeMode ??
    settings?.settings?.free_mode ??
    settings?.settings?.platform_free_mode ??
    settings?.data?.free_mode ??
    settings?.data?.platform_free_mode
  );
}

const DEFAULT_LOGOS = {
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  ADA: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  LINK: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
  ONDO: "https://assets.coingecko.com/coins/images/26580/large/ONDO.png",
  JUP: "https://assets.coingecko.com/coins/images/34188/large/jup.png",
  PEPE: "https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  WIF: "https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
  ARB: "https://assets.coingecko.com/coins/images/16547/large/arb.jpg",
  OP: "https://assets.coingecko.com/coins/images/25244/large/Optimism.png",
  SUI: "https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg",
  SEI: "https://assets.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png",
  APT: "https://assets.coingecko.com/coins/images/26455/large/aptos_round.png",
  INJ: "https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png",
  FET: "https://assets.coingecko.com/coins/images/5681/large/ASI.png",
  RENDER: "https://assets.coingecko.com/coins/images/11636/large/rndr.png",
  NEAR: "https://assets.coingecko.com/coins/images/10365/large/near.jpg",
  TIA: "https://assets.coingecko.com/coins/images/31967/large/tia.jpg",
  PYTH: "https://assets.coingecko.com/coins/images/31924/large/pyth.png",
  WLD: "https://assets.coingecko.com/coins/images/31069/large/worldcoin.jpeg"
};

function sym(v) {
  return String(v || "").replace("/USDT", "").replace("USDT", "").toUpperCase();
}

function money(v) {
  const n = Number(v || 0);
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function change(entry, target) {
  const e = Number(entry || 0);
  const t = Number(target || 0);
  if (!e || !t) return "—";
  const x = ((t - e) / e) * 100;
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
}

function timeAgo(ts) {
  if (!ts) return "—";
  const m = Math.max(0, Math.floor((Date.now() - Number(ts)) / 60000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d) return `${d}d ago`;
  if (h) return `${h}h ago`;
  return `${m}m ago`;
}

function hitCount(status) {
  return { active: 0, stopped: 0, tp1: 1, tp2: 2, tp3: 3, tp4: 4 }[status] || 0;
}

function statusLabel(status) {
  return {
    active: "Live",
    stopped: "Closed",
    tp1: "Target 1",
    tp2: "Target 2",
    tp3: "Target 3",
    tp4: "Completed",
  }[status] || "Live";
}

function userRole(user) {
  return String(user?.role || "FREE").toUpperCase();
}

function isVipUser(user) {
  return Boolean(user?.is_vip) || ["VIP", "ADMIN"].includes(userRole(user));
}

function isAdminUser(user) {
  return userRole(user) === "ADMIN";
}

function hasAutoCopyAccess(user, freeModeActive) {
  const role = userRole(user);
  const plan = String(user?.plan || user?.subscription_plan || user?.active_plan || "").toLowerCase();
  return Boolean(freeModeActive) || role === "ADMIN" || Boolean(user?.auto_copy_access) || Boolean(user?.has_auto_copy) || Boolean(user?.subscription_auto_copy) || plan.includes("auto");
}

function membershipLabel(user) {
  const role = userRole(user);
  if (role === "ADMIN") return "Admin";
  if (role === "VIP") return "VIP Active";
  return "Free Preview";
}


function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function CoinLogo({ symbol, logos }) {
  const s = sym(symbol);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const sources = [
    logos?.[s],
    DEFAULT_LOGOS[s],
    `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s.toLowerCase()}.png`,
    `https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/svg/color/${s.toLowerCase()}.svg`,
  ].filter(Boolean);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [s, logos]);

  if (failed || sources.length === 0) {
    return <div className="coinFallback">{s.slice(0, 3)}</div>;
  }

  return (
    <img
      className="coinLogo"
      src={sources[index]}
      alt={s}
      onError={() => index < sources.length - 1 ? setIndex(index + 1) : setFailed(true)}
    />
  );
}

function Landing({ onLogin, theme, toggleTheme }) {
  return (
    <div className={`landing ${theme === "light" ? "lightMode" : ""}`}>
      <nav className="nav">
        <div className="brand">
          <div className="bolt">⚡</div>
          <div>
            <b>SHAABAN SIGNAL PRO</b>
            <span>VIP MEMBERS AREA</span>
          </div>
        </div>
        <div className="navActions"><button className="ghostBtn" onClick={toggleTheme}>{theme === "light" ? "Dark" : "Light"}</button><button onClick={onLogin}>Login</button></div>
      </nav>

      <main className="landingMain">
        <section className="landingCopy">
          <span className="eyebrow">● VIP SIGNALS ONLY</span>
          <h1>A premium signal room built for VIP traders.</h1>
          <p>Follow VIP opportunities with a polished dashboard, live alerts, target tracking, and clean risk visibility — no copy trading, no auto execution.</p>
          <div className="landingBtns">
            <button onClick={onLogin}>Enter VIP Dashboard</button>
            <a href="https://t.me/signal252" target="_blank" rel="noreferrer">Join Telegram</a>
          </div>
          <div className="trustStrip"><span>Quality Checked</span><span>Live Target Updates</span><span>Mobile Ready</span></div>
          <div className="landingStats">
            <div><b>24/7</b><span>Signal Tracking</span></div>
            <div><b>VIP</b><span>Member Access</span></div>
            <div><b>Live</b><span>Target Updates</span></div>
          </div>
        </section>

        <section className="phonePreview premiumPreview">
          <div className="previewGlow" />
          <div className="previewHeader">
            <span>SHAABAN PRO LIVE</span>
            <b>Selective Mode</b>
          </div>

          <div className="previewHeroCard">
            <div>
              <small>Approved Signal</small>
              <strong>ONDO / USDT</strong>
            </div>
            <em>Live</em>
          </div>

          <div className="previewLevels">
            <div><span>Entry</span><b>$0.2698</b></div>
            <div><span>Next Target</span><b>$0.2833</b></div>
            <div><span>Score</span><b>9.4</b></div>
          </div>

          <div className="previewProgress">
            <i className="on">1</i><i>2</i><i>3</i><i>4</i>
          </div>

          <div className="previewMiniList">
            <div><span>🎯 Target 1</span><b>+5.08%</b></div>
            <div><span>🛡️ Risk Managed</span><b>Low</b></div>
            <div><span>⚡ Live Alerts</span><b>On</b></div>
          </div>
        </section>
      </main>

      <section className="howItWorks">
        <div><i>1</i><b>Signal detected</b><span>Market is scanned for clean opportunities.</span></div>
        <div><i>2</i><b>Quality checked</b><span>Only clean VIP signals appear in the dashboard.</span></div>
        <div><i>3</i><b>Members track live</b><span>Targets, status, and alerts update automatically.</span></div>
      </section>

      <section className="proFeatures">
        <div><b>Smart Entries</b><span>Quality checked setups only.</span></div>
        <div><b>Dynamic Targets</b><span>Targets and progress shown clearly.</span></div>
        <div><b>Quality Checked</b><span>No signal appears before approval.</span></div>
      </section>
    </div>
  );
}

function Login({ onLogin, onBack, theme, toggleTheme }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regTelegram, setRegTelegram] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");

  const [verifyUsername, setVerifyUsername] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token");
      if (token) {
        setResetToken(token);
        setMode("reset");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {}
  }, []);

  function openVerify({ email, username, message }) {
    setVerifyEmail(email || regEmail);
    setVerifyUsername(username || regUsername);
    setOtp("");
    setPendingMessage(message || "We sent a 6-digit verification code to your email. Please check Inbox or Spam.");
    setMode("verify");
  }

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${Connection_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.status === "pending_email") {
          openVerify({ email: data.email, username: data.username || username, message: "Please verify your email before login. Check Inbox or Spam." });
          return;
        }
        throw new Error(data.error || "Login failed");
      }
      if (remember) localStorage.setItem("shaaban_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    setErr("");
    setBusy(true);
    setPendingMessage("");
    try {
      const res = await fetch(`${Connection_URL}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          username: regUsername,
          email: regEmail,
          telegram: regTelegram,
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Registration failed");
      if (data.needs_verification) {
        openVerify(data);
        return;
      }
      if (data.user) {
        localStorage.setItem("shaaban_user", JSON.stringify(data.user));
        onLogin(data.user);
        return;
      }
      setPendingMessage(data.message || "Account created.");
      setMode("login");
    } catch (e) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailCode() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${Connection_URL}/api/auth/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: verifyUsername, email: verifyEmail, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Verification failed");
      localStorage.setItem("shaaban_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      setErr(e.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${Connection_URL}/api/auth/resend-verification`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: verifyUsername, email: verifyEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not resend code");
      setPendingMessage(data.message || "Verification code sent again. Check Inbox or Spam.");
    } catch (e) {
      setErr(e.message || "Could not resend code");
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset() {
    setErr("");
    setPendingMessage("");
    setBusy(true);
    try {
      const res = await fetch(`${Connection_URL}/api/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not send reset email");
      setPendingMessage(data.message || "If this email exists, a password reset link has been sent. Check Inbox or Spam.");
    } catch (e) {
      setErr(e.message || "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setErr("");
    setPendingMessage("");
    if (newPassword !== newPassword2) {
      setErr("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${Connection_URL}/api/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not reset password");
      setPendingMessage(data.message || "Password updated. Please login with your new password.");
      setPassword("");
      setMode("login");
    } catch (e) {
      setErr(e.message || "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "verify") {
    return (
      <div className={`loginPage ${theme === "light" ? "lightMode" : ""}`}>
        <div className="loginCard approvalCard">
          <button className="back" onClick={onBack}>← Back</button>
          <div className="bigBolt">📩</div>
          <h1>Verify Your Email</h1>
          <p>{pendingMessage || "We sent a 6-digit code to your email."}</p>
          <div className="approvalNote">Email: <b>{verifyEmail}</b><br />Please check Inbox or Spam.</div>
          <input className="otpInput" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e)=>e.key==="Enter"&&verifyEmailCode()} placeholder="6-digit code" />
          {err && <div className="error">{err}</div>}
          <button className="primary" onClick={verifyEmailCode} disabled={busy || otp.length !== 6}>{busy ? "Verifying..." : "Verify Email"}</button>
          <button className="clear full" onClick={resendCode} disabled={busy}>{busy ? "Please wait..." : "Resend Code"}</button>
          <button className="clear full" onClick={() => setMode("login")}>Back to Login</button>
        </div>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className={`loginPage ${theme === "light" ? "lightMode" : ""}`}>
        <div className="loginCard approvalCard">
          <button className="back" onClick={onBack}>← Back</button>
          <div className="bigBolt">🔐</div>
          <h1>Reset Password</h1>
          <p>Enter your account email. We will send a secure reset link.</p>
          <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Email" />
          {err && <div className="error">{err}</div>}
          {pendingMessage && <div className="successBox">{pendingMessage}</div>}
          <button className="primary" onClick={requestPasswordReset} disabled={busy}>{busy ? "Sending..." : "Send Reset Link"}</button>
          <button className="clear full" onClick={() => setMode("login")}>Back to Login</button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <div className={`loginPage ${theme === "light" ? "lightMode" : ""}`}>
        <div className="loginCard approvalCard">
          <button className="back" onClick={onBack}>← Back</button>
          <div className="bigBolt">🔑</div>
          <h1>Set New Password</h1>
          <p>Choose a new password for your account.</p>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password, min 8 characters" />
          <input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} placeholder="Confirm new password" />
          {err && <div className="error">{err}</div>}
          {pendingMessage && <div className="successBox">{pendingMessage}</div>}
          <button className="primary" onClick={resetPassword} disabled={busy}>{busy ? "Saving..." : "Update Password"}</button>
          <button className="clear full" onClick={() => setMode("login")}>Back to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`loginPage ${theme === "light" ? "lightMode" : ""}`}>
      <div className="loginCard">
        <button className="back" onClick={onBack}>← Back</button><button className="themeLogin" onClick={toggleTheme}>{theme === "light" ? "Dark" : "Light"}</button>
        <div className="bigBolt">⚡</div>
        <h1>SHAABAN SIGNAL PRO</h1>
        <p>{mode === "login" ? "VIP secure access" : "Create VIP account"}</p>

        <div className="authSwitch">
          <button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Login</button>
          <button className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(""); }}>Create Account</button>
        </div>

        {mode === "login" ? (
          <>
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submit()} placeholder="Username" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submit()} placeholder="Password" />
            <label className="remember"><input type="checkbox" checked={remember} onChange={(e)=>setRemember(e.target.checked)} /> Remember me</label>
            {pendingMessage && <div className="successBox">{pendingMessage}</div>}
            {err && <div className="error">{err}</div>}
            <button className="primary" onClick={submit} disabled={busy}>{busy ? "Opening..." : "Enter Dashboard"}</button>
            <button className="forgotLink" onClick={() => { setMode("forgot"); setErr(""); setPendingMessage(""); }}>Forgot password?</button>
          </>
        ) : (
          <>
            <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Full name" />
            <input value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Username" />
            <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email" />
            <input value={regTelegram} onChange={(e) => setRegTelegram(e.target.value)} placeholder="Telegram username optional" />
            <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Password, min 8 characters" />
            {err && <div className="error">{err}</div>}
            <button className="primary" onClick={register} disabled={busy}>{busy ? "Creating..." : "Create Account"}</button>
            <div className="approvalNote">We will send a verification code to your email. Check Inbox or Spam.</div>
          </>
        )}
      </div>
    </div>
  );
}

function Toasts({ items }) {
  return (
    <div className="toastWrap">
      {items.map((t) => <div className={`toast ${t.type || ""}`} key={t.id}><b>{t.icon}</b><span>{t.text}</span></div>)}
    </div>
  );
}

function Stat({ label, value, tone, onClick, active }) {
  return (
    <button className={`stat ${active ? "active" : ""}`} onClick={onClick}>
      <span>{label}</span>
      <b className={tone || ""}>{value}</b>
    </button>
  );
}

function Progress({ status }) {
  const h = hitCount(status);
  return <div className="progress">{[1,2,3,4].map(n => <i key={n} className={h >= n ? "done" : ""}>{n}</i>)}</div>;
}

function Tag({ text }) {
  const t = String(text || "Confirmed");
  const x = t.toLowerCase();
  let cls = "tag";
  if (x.includes("swing")) cls += " purple";
  if (x.includes("liquidity")) cls += " cyan";
  if (x.includes("strong")) cls += " green";
  if (x.includes("pre")) cls += " orange";
  return <span className={cls}>{t}</span>;
}

function UserWatermark({ user }) {
  const username = user?.username ? `@${user.username}` : "SHAABAN VIP";
  const uid = user?.id ? `ID ${user.id}` : "Protected";
  const stamp = new Date().toLocaleDateString();
  const text = `${username} • ${uid} • ${stamp}`;
  return (
    <div className="watermarkLayer" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => <span key={i}>{text}</span>)}
    </div>
  );
}

function planSavings(key, price) {
  const monthly = 30;
  const expected = { monthly: 30, quarterly: 90, six_months: 180, yearly: 360 }[key] || 0;
  const save = Math.max(0, expected - Number(price || 0));
  return save ? `Save $${save}` : "Starter";
}

function planBadge(key) {
  return { monthly: "Flexible", quarterly: "Popular", six_months: "Smart Deal", yearly: "Best Value" }[key] || "VIP";
}

function Skeleton() {
  return (
    <div className="skeleton">
      {[1,2,3,4,5].map(n => <div className="skRow" key={n}><i /><div><b /><span /></div><em /><em /></div>)}
    </div>
  );
}

function Timeline({ item }) {
  const hit = hitCount(item.status);
  const steps = ["Created", "Approved", "T1", "T2", "T3", "Done"];
  return (
    <div className="timeline">
      {steps.map((s, i) => {
        const done = i <= 1 || hit >= i - 1 || (item.status === "tp4" && i === 5);
        return <div key={s} className={done ? "done" : ""}><i /><span>{s}</span></div>;
      })}
    </div>
  );
}

function SignalRow({ signal, logos, compact, highlighted, onOpen, isAdmin, onMakeFreePreview, user }) {
  const [expanded, setExpanded] = useState(false);
  const s = sym(signal.symbol);
  const targets = Array.isArray(signal.targets) ? signal.targets : [];
  const hit = hitCount(signal.status);
  const next = signal.status === "active" ? targets[0] : targets[Math.max(0, hit - 1)];
  const confidence = Math.round(Number(signal.confidence || 0));

  return (
    <div className={`signal protectedSignal ${compact ? "compact" : ""} ${highlighted ? "highlight" : ""}`}>
      <UserWatermark user={user} />
      <button className="signalMain" onClick={() => setExpanded(!expanded)}>
        <div className="asset">
          <CoinLogo symbol={s} logos={logos} />
          <div>
            <b>{s}</b>
            <span>{signal.pair || `${s}/USDT`} · {timeAgo(signal.created_at)}</span><em className="rowQuality">{Number(signal.score || 0) >= 9 ? "Elite Signal" : Number(signal.score || 0) >= 8 ? "Strong Setup" : "Clean Setup"}</em>{signal.is_free_preview && <em className="freePreviewPill">Free Preview</em>}
          </div>
        </div>

        <div className="cell hideMobile"><span>Entry</span><b>${money(signal.entry)}</b></div>
        <div className="cell hideTablet"><span>{signal.status === "active" ? "Next" : "Reached"}</span><b>${money(next)}</b><em>{change(signal.entry, next)}</em></div>
        <div className="cell hideTablet"><span>Score</span><b>{Number(signal.score || 0).toFixed(1)}</b></div>
        <Progress status={signal.status} />
        <div className="statusBox">
          <strong className={`status ${signal.status}`}>{statusLabel(signal.status)}</strong>
          <small>{expanded ? "Hide" : "Details"}</small>
        </div>
      </button>

      {expanded && (
        <div className="expanded">
          <div className="expandedTop">
            <Tag text={signal.type} />
            <div className="expandedActions">
              {isAdmin && !signal.is_free_preview && <button onClick={() => onMakeFreePreview(signal)}>⭐ Make Free Preview</button>}
              {signal.is_free_preview && <span className="tag green">👁️ Free Preview</span>}
              <button onClick={() => onOpen(signal)}>Open full view</button>
            </div>
          </div>

          <div className="quickGrid">
            <div><span>Stop Loss</span><b className="red">${money(signal.sl)}</b><em>{change(signal.entry, signal.sl)}</em></div>
            <div><span>Confidence</span><b>{confidence}%</b><div className="bar"><i style={{width:`${confidence}%`}} /></div></div>
            <div><span>Setup</span><b>{signal.type || "Confirmed"}</b></div>
          </div>

          <div className="targetGrid">
            {targets.map((tp, i) => (
              <div className={hit > i ? "target done" : "target"} key={i}>
                <span>Target {i + 1}</span>
                <b>${money(tp)}</b>
                <em>{change(signal.entry, tp)}</em>
              </div>
            ))}
          </div>

          <Timeline item={signal} />
        </div>
      )}
    </div>
  );
}


function LockedSignalRow({ signal, compact }) {
  const age = timeAgo(signal.created_at);
  return (
    <div className={`signal lockedSignal ${compact ? "compact" : ""}`}>
      <div className="signalMain lockedMain">
        <div className="asset">
          <div className="coinFallback">VIP</div>
          <div>
            <b>VIP Signal Locked</b>
            <span>Approved setup · {age}</span>
            <em className="rowQuality">Upgrade to unlock coin, entry, SL and targets</em>
          </div>
        </div>
        <div className="cell hideMobile"><span>Entry</span><b>VIP Only</b></div>
        <div className="cell hideTablet"><span>Targets</span><b>Locked</b><em>Full access required</em></div>
        <div className="cell hideTablet"><span>Score</span><b>VIP</b></div>
        <div className="progress lockedProgress"><i>🔒</i><i>🔒</i><i>🔒</i><i>🔒</i></div>
        <div className="statusBox">
          <strong className="status locked">VIP Only</strong>
          <small>Subscribe to view</small>
        </div>
      </div>
      <div className="lockedOverlayText">🔒 This signal is locked for VIP members</div>
    </div>
  );
}

function SignalModal({ signal, logos, onClose, user }) {
  if (!signal) return null;
  const s = sym(signal.symbol);
  const targets = Array.isArray(signal.targets) ? signal.targets : [];
  const hit = hitCount(signal.status);
  const score = Number(signal.score || 0);
  const conf = Math.round(Number(signal.confidence || 0));

  return (
    <div className="modalShade" onClick={onClose}>
      <div className="modal protectedModal" onClick={(e)=>e.stopPropagation()}>
        <UserWatermark user={user} />
        <div className="modalHead">
          <div className="asset big">
            <CoinLogo symbol={s} logos={logos} />
            <div>
              <b>{s}</b>
              <span>{signal.pair || `${s}/USDT`} · {statusLabel(signal.status)}</span>
            </div>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modalSubline"><span>VIP signal tracking</span><b>{statusLabel(signal.status)}</b></div>
        <Tag text={signal.type} />

        <div className="qualityPanel">
          <div><span>Signal Quality</span><b>{score >= 9 ? "Elite" : score >= 8 ? "Strong" : "Balanced"}</b></div>
          <div><span>Risk Level</span><b>{Math.abs(Number(change(signal.entry, signal.sl).replace("%",""))) <= 3 ? "Low" : "Managed"}</b></div>
          <div><span>Target Progress</span><b>{hit}/4</b></div>
          <div><span>Trade Age</span><b>{timeAgo(signal.created_at)}</b></div>
        </div>

        <div className="modalGrid">
          <div><span>Entry</span><b>${money(signal.entry)}</b></div>
          <div><span>Stop Loss</span><b className="red">${money(signal.sl)}</b><em>{change(signal.entry, signal.sl)}</em></div>
          <div><span>Risk</span><b className="red">{change(signal.entry, signal.sl)}</b></div>
          <div><span>Age</span><b>{timeAgo(signal.created_at)}</b></div>
        </div>

        <div className="meters">
          <div><span>Score</span><b>{score.toFixed(1)}/10</b><div className="bar"><i style={{width:`${Math.min(100, score*10)}%`}} /></div></div>
          <div><span>Confidence</span><b>{conf}%</b><div className="bar"><i style={{width:`${Math.min(100, conf)}%`}} /></div></div>
        </div>

        <h3>Targets</h3>
        <div className="targetGrid">
          {targets.map((tp, i) => (
            <div className={hit > i ? "target done" : "target"} key={i}>
              <span>Target {i + 1}</span>
              <b>${money(tp)}</b>
              <em>{change(signal.entry, tp)}</em>
            </div>
          ))}
        </div>

        <h3>Tracking Timeline</h3>
        <Timeline item={signal} />

        <div className="note">Tracking only. </div>
      </div>
    </div>
  );
}

function Notifications({ open, items, onClose, onClear }) {
  if (!open) return null;
  return (
    <div className="drawerShade" onClick={onClose}>
      <aside className="drawer" onClick={(e)=>e.stopPropagation()}>
        <div className="drawerHead"><h3>Notifications</h3><button onClick={onClose}>×</button></div>
        <button className="clear" onClick={onClear}>Clear all</button>
        {items.length === 0 ? <div className="empty small">No notifications yet.</div> :
          <div className="notifList">{items.map(x => <div className={`notif ${x.type || ""}`} key={x.id}><b>{x.icon}</b><div><strong>{x.text}</strong><span>{x.time}</span></div></div>)}</div>
        }
      </aside>
    </div>
  );
}

function Activity({ items }) {
  return (
    <section className="activity">
      <div className="sectionHead"><h3>Live Activity</h3><span>Latest updates</span></div>
      {items.length === 0 ? <div className="empty small">Activity will appear here when signals update.</div> :
        items.slice(0, 6).map(x => <div className="activityItem" key={x.id}><b>{x.icon}</b><span>{x.text}</span><em>{x.time}</em></div>)
      }
    </section>
  );
}

function StatusPage({ api, sse, last }) {
  return (
    <section className="centerPage">
      <div className="panel">
        <h2>Service Status</h2>
        <p>Your signal dashboard connection status.</p>
        <div className="statusGrid">
          <div><span>Service</span><b className="greenText">Online</b></div>
          <div><span>Connection</span><b className={api ? "greenText" : "goldText"}>{api ? "Online" : "Checking"}</b></div>
          <div><span>Updates</span><b className={sse ? "greenText" : "goldText"}>{sse ? "Connected" : "Updating"}</b></div>
          <div><span>Last Update</span><b>{last || "—"}</b></div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="empty rich">
      <b>📭</b>
      <span>{filter === "active" ? "No active trades right now. SHAABAN bot is scanning for a clean setup." : "No signals found in this section."}</span>
    </div>
  );
}


function Welcome({ user, onContinue }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 1800);
    return () => clearTimeout(t);
  }, [onContinue]);

  return (
    <div className="welcomeScreen">
      <div className="welcomeCard">
        <div className="welcomeBolt">⚡</div>
        <span>Welcome back</span>
        <h1>{user?.name || "VIP Trader"}</h1>
        <p>SHAABAN SIGNAL PRO is loading your VIP signals dashboard.</p>
        <div className="welcomeLoader"><i /></div>
        <button onClick={onContinue}>Enter Now</button>
      </div>
    </div>
  );
}


function formatDate(ts) {
  if (!ts) return "—";
  try { return new Date(Number(ts)).toLocaleDateString(); } catch { return "—"; }
}

function SubscribePanel({ user, onUserUpdate }) {
  const [plans, setPlans] = useState([]);
  const [busyPlan, setBusyPlan] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch(`${Connection_URL}/api/auth/me`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        localStorage.setItem("shaaban_user", JSON.stringify(data.user));
        onUserUpdate?.(data.user);
        setMsg(data.user.is_vip ? "VIP access is active." : "Payment is still pending confirmation.");
      }
    } catch {}
  }, [onUserUpdate]);

  useEffect(() => {
    fetch(`${Connection_URL}/api/subscription/plans`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setPlans(d?.plans || []))
      .catch(() => setErr("Cannot load subscription plans."));
  }, []);

  async function pay(planKey) {
    setErr("");
    setMsg("");
    setBusyPlan(planKey);
    try {
      const res = await fetch(`${Connection_URL}/api/subscription/create-invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Cannot create payment invoice");
      if (!data.invoice_url) throw new Error("NOWPayments invoice URL was not returned");
      window.location.href = data.invoice_url;
    } catch (e) {
      setErr(e.message || "Payment error");
    } finally {
      setBusyPlan("");
    }
  }

  const order = ["monthly", "quarterly", "six_months", "yearly", "auto_monthly", "auto_quarterly", "auto_six_months", "auto_yearly"];
  const sortedPlans = [...plans].sort((a,b) => order.indexOf(a.key) - order.indexOf(b.key));
  const isVip = isVipUser(user);

  return (
    <section className="subscribePage subscribePro">
      <div className="subscribeHero upgraded">
        <span className="eyebrow">● SHAABAN VIP ACCESS</span>
        <h2>{isVip ? "Your VIP access is active" : "Choose your VIP plan"}</h2>
        <p>{isVip ? `Active until: ${formatDate(user?.subscription_expires_at)}` : "Unlock every approved signal, entry, stop loss, target tracking, and VIP push alerts."}</p>
        <div className="riskNote">⚠️ Signals are educational market alerts, not financial advice. Always manage risk and trade with money you can afford to lose.</div>
        <div className="subscribeHeroActions">
          <button className="clear" onClick={loadMe}>Refresh Access</button>
          {!isVip && <span>Payments are processed securely by NOWPayments.</span>}
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="successBox">{msg}</div>}

      <div className="planGrid proPlans">
        {sortedPlans.map((p) => {
          const monthly = p.days ? (Number(p.price_usd) / (Number(p.days) / 30)) : Number(p.price_usd);
          const isAuto = Boolean(p.auto_copy) || String(p.key).startsWith("auto_");
          const best = p.key === "yearly" || p.key === "auto_yearly";
          return (
            <div className={`planCard proPlanCard ${best ? "best" : ""}`} key={p.key}>
              <div className="planTopline"><span>{planBadge(p.key)}</span>{planSavings(p.key, p.price_usd) && <em>{planSavings(p.key, p.price_usd)}</em>}</div>
              <h3>{p.label}</h3>
              <strong>${Number(p.price_usd).toFixed(0)}</strong>
              <small>{p.days} days access · ≈ ${monthly.toFixed(1)} / month</small>
              <ul className="planFeatureList">
                <li>✅ All VIP signals unlocked</li>
                <li>✅ Entry, SL, targets and status</li>
                <li>✅ Push notifications for TP updates</li>
                <li>✅ Free preview limits removed</li>
                {isAuto && <li>🤖 Auto Copy Pro access included</li>}
                {isAuto && <li>🛡️ Stop Loss always ON</li>}
              </ul>
              <button className="primary" onClick={() => pay(p.key)} disabled={!!busyPlan}>
                {busyPlan === p.key ? "Opening payment..." : "Pay with Crypto"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="subscribeNote proNote">
        <b>How it works</b>
        <span>Choose a plan → pay with crypto → NOWPayments confirms the transaction → VIP access activates automatically. Use Refresh Access if blockchain confirmation takes a few minutes.</span>
      </div>
    </section>
  );
}

function normalizeCopySettings(payload) {
  const raw = payload?.settings || payload || {};
  const enabled = Boolean(raw.enabled ?? raw.auto_copy_enabled ?? raw.copy_enabled ?? payload?.enabled ?? payload?.auto_copy_enabled ?? false);
  const paused = Boolean(raw.paused ?? payload?.paused ?? (enabled && payload?.access_allowed === false));
  return {
    ...raw,
    enabled,
    effective_enabled: Boolean(raw.effective_enabled ?? payload?.effective_enabled ?? (paused ? false : enabled)),
    paused,
    pause_reason: raw.pause_reason ?? payload?.pause_reason ?? "",
    access_allowed: Boolean(raw.access_allowed ?? payload?.access_allowed ?? true),
    binance_connected: Boolean(raw.binance_connected ?? raw.binanceConnected ?? raw.connected ?? payload?.binance_connected ?? payload?.connected ?? false),
    trade_amount_usdt: raw.trade_amount_usdt ?? raw.trade_amount ?? payload?.trade_amount_usdt ?? 25,
    max_capital_usdt: raw.max_capital_usdt ?? raw.max_capital ?? payload?.max_capital_usdt ?? 100,
    exit_target: raw.exit_target ?? payload?.exit_target ?? "tp1",
    hard_max_open_trades: raw.hard_max_open_trades ?? payload?.hard_max_open_trades ?? 7,
  };
}

function AutoCopyPanel({ user, freeModeActive }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const access = hasAutoCopyAccess(user, freeModeActive);
  const settings = data?.settings || {};
  const [form, setForm] = useState({ enabled: false, trade_amount_usdt: 25, max_capital_usdt: 100, exit_target: "tp1" });

  const calcMaxOpen = useMemo(() => {
    const amount = Number(form.trade_amount_usdt || 0);
    const capital = Number(form.max_capital_usdt || 0);
    if (!amount || !capital) return 1;
    return Math.max(1, Math.min(Number(settings.hard_max_open_trades || 7), Math.floor(capital / amount)));
  }, [form.trade_amount_usdt, form.max_capital_usdt, settings.hard_max_open_trades]);

  async function load() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${Connection_URL}/api/copy/settings`, { credentials: "include" });
      const d = await res.json();
      if (!res.ok || !d.success) {
        if (res.status === 403 && !access) {
          const pausedSettings = normalizeCopySettings({
            success: true,
            access_allowed: false,
            paused: true,
            pause_reason: "subscription_required",
            settings: { enabled: false, effective_enabled: false, paused: true, access_allowed: false }
          });
          setData({ success: true, access_allowed: false, paused: true, pause_reason: "subscription_required", settings: pausedSettings, logs: [], trades: [] });
          return;
        }
        throw new Error(d.error || "Cannot load Auto Copy");
      }
      const s = normalizeCopySettings(d);
      setData({ ...d, settings: s });
      setForm({ enabled: !!s.enabled, trade_amount_usdt: s.trade_amount_usdt || 25, max_capital_usdt: s.max_capital_usdt || 100, exit_target: s.exit_target || "tp1" });
    } catch(e) { setErr(e.message || "Cannot load Auto Copy"); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [access]);

  async function connectBinance(e) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`${Connection_URL}/api/copy/binance/connect`, { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }) });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Binance connection failed");
      setMsg("Binance Spot connected successfully."); setApiKey(""); setApiSecret(""); await load();
    } catch(e) { setErr(e.message || "Binance connection failed"); }
    finally { setBusy(false); }
  }

  async function saveSettings(nextEnabled = form.enabled) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const payload = { ...form, enabled: nextEnabled, auto_copy_enabled: nextEnabled };
      const res = await fetch(`${Connection_URL}/api/copy/settings`, { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Could not save Auto Copy settings");
      const s = normalizeCopySettings({ ...d, settings: { ...(d.settings || {}), enabled: nextEnabled, auto_copy_enabled: nextEnabled } });
      setData({ ...d, settings: s });
      setForm(p => ({ ...p, enabled: nextEnabled }));
      setMsg(nextEnabled ? "Auto Copy Pro is ON." : "Auto Copy Pro is OFF.");
      setTimeout(load, 600);
    } catch(e) { setErr(e.message || "Could not save settings"); }
    finally { setBusy(false); }
  }

  const tradeAmountNum = Number(form.trade_amount_usdt || 0);
  const showHighTradeWarning = tradeAmountNum >= 1000;
  const showExtremeTradeWarning = tradeAmountNum >= 10000;

  const effectiveEnabled = Boolean(settings.effective_enabled ?? (settings.enabled && access));
  const pausedBySubscription = Boolean((data?.paused || settings.paused || (settings.enabled && !access)) && !effectiveEnabled);

  if (!access) {
    return (
      <section className="autoCopyPage">
        <div className="autoCopyHero paused">
          <div>
            <span className="eyebrow">● SUBSCRIPTION REQUIRED</span>
            <h2>⏸️ Auto Copy Paused</h2>
            <p>Auto Copy is paused because Free Mode is OFF and this account does not have an active Auto Copy Pro subscription.</p>
          </div>
          <div className="copyStatus paused" aria-label="Auto Copy paused">
            <small>Status</small>
            <b>PAUSED</b>
            <span>No new Binance trades will be copied</span>
          </div>
        </div>
        <div className="copyPausedBanner">
          🛡️ الحماية شغالة: لن يتم فتح صفقات جديدة على Binance. إذا كنت رابط Binance سابقاً، المفاتيح تبقى محفوظة ولا تُحذف.
        </div>
        {err && <div className="error">{err}</div>}
        <div className="autoCopyGrid">
          <div className="panel autoPanel pausedAccessCard">
            <h3>What happens now?</h3>
            <div className="safetyList vertical">
              <span>⏸️ Auto Copy is paused automatically.</span>
              <span>🚫 No new approved signals will be copied to Binance.</span>
              <span>🔐 Binance keys stay saved if they were connected before.</span>
              <span>✅ After subscribing, you can enable Auto Copy again.</span>
            </div>
            <button className="primary bigEnable" onClick={() => window.location.hash = "subscribe"}>Upgrade to Auto Copy Pro</button>
          </div>
          <div className="panel autoPanel pausedAccessCard">
            <h3>الحالة بالعربي</h3>
            <p className="mutedText">الأوتو كوبي متوقف مؤقتاً بسبب الاشتراك. هذا لا يعني حذف ربط Binance، فقط يمنع نسخ صفقات جديدة حتى يتم تفعيل الاشتراك أو يرجع Free Mode.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="autoCopyPage">
      <div className="autoCopyHero">
        <div><span className="eyebrow">● BINANCE SPOT ONLY</span><h2>🤖 SHAABAN Auto Copy Pro</h2><p>Copy approved SHAABAN signals automatically. Stop Loss is always ON.</p></div>
        <div className={pausedBySubscription ? "copyStatus paused" : effectiveEnabled ? "copyStatus on" : "copyStatus"} aria-label={pausedBySubscription ? "Auto Copy paused" : effectiveEnabled ? "Auto Copy status enabled" : "Auto Copy status disabled"}>
          <small>Status</small>
          <b>{pausedBySubscription ? "PAUSED" : effectiveEnabled ? "ON" : "OFF"}</b>
          <span>{pausedBySubscription ? "Subscription required" : effectiveEnabled ? "Auto Copy is active" : settings.binance_connected ? "Ready to enable below" : "Connect Binance first"}</span>
          {!effectiveEnabled && <em>Not a button</em>}
        </div>
      </div>
      {freeModeActive && <div className="copyFreeBanner">🎁 Free Mode Active — Auto Copy Pro access is open. It only runs if you enable it yourself.</div>}
      {pausedBySubscription && <div className="copyPausedBanner">⏸️ Auto Copy paused — subscription required. No new Binance trades will be copied, and your Binance connection stays saved.</div>}
      {err && <div className="error">{err}</div>}{msg && <div className="successBox">{msg}</div>}
      <div className="autoCopyGrid">
        <div className="panel autoPanel">
          <h3>1. Connect Binance Spot</h3>
          <p className="mutedText">Withdraw permission must be OFF. Add server IP to Binance whitelist: <b>{settings.server_ip || "check server IP"}</b></p>
          <form onSubmit={connectBinance} className="copyForm">
            <input value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Binance API Key" />
            <input value={apiSecret} onChange={e=>setApiSecret(e.target.value)} placeholder="Binance Secret Key" type="password" />
            <button className="primary" disabled={busy}>{settings.binance_connected ? "Re-Verify / Update Key" : "Verify Binance Connection"}</button>
          </form>
          <div className="safetyList"><span>✅ Spot Trading only</span><span>❌ Withdraw permission must be OFF</span><span>🛡️ Stop Loss always ON</span></div>
        </div>
        <div className="panel autoPanel">
          <h3>2. Copy Settings</h3>
          <div className="copySettingsGrid">
            <label>Trade Amount per Signal<input type="number" min="10" step="1" value={form.trade_amount_usdt} onChange={e=>setForm({...form, trade_amount_usdt:e.target.value})} /></label>
            {showHighTradeWarning && (
              <div className={showExtremeTradeWarning ? "copyRiskWarning extreme" : "copyRiskWarning"}>
                <b>⚠️ High Trade Amount</b>
                <span>المبلغ لكل صفقة كبير. تأكد من الرصيد والمخاطرة قبل تفعيل النسخ التلقائي.</span>
                <small>{showExtremeTradeWarning ? "Very high risk — ننصح بالتجربة بمبلغ أصغر أولًا." : "Risk reminder — Stop Loss is always ON, but crypto trading remains risky."}</small>
              </div>
            )}
            <label>Max Auto Copy Capital<input type="number" min="10" step="1" value={form.max_capital_usdt} onChange={e=>setForm({...form, max_capital_usdt:e.target.value})} /></label>
            <label>Exit Target<select value={form.exit_target} onChange={e=>setForm({...form, exit_target:e.target.value})}><option value="tp1">Sell at TP1</option><option value="tp2">Sell at TP2</option><option value="tp3">Sell at TP3</option><option value="tp4">Sell at TP4</option></select></label>
            <div className="computedBox"><span>Calculated Max Open</span><b>{calcMaxOpen}</b><small>Hard cap: {settings.hard_max_open_trades || 7}</small></div>
          </div>
          <div className={settings.binance_connected ? "copyEnableBox ready" : "copyEnableBox"}>
            <div>
              <b>{pausedBySubscription ? "Auto Copy is paused" : effectiveEnabled ? "Auto Copy is running" : settings.binance_connected ? "Ready to start" : "Connect Binance first"}</b>
              <span>{pausedBySubscription ? "النسخ متوقف مؤقتاً بسبب الاشتراك. لن يتم نسخ صفقات جديدة." : effectiveEnabled ? "اضغط Turn Auto Copy OFF لإيقاف النسخ التلقائي." : settings.binance_connected ? "اضغط Enable Auto Copy لتشغيل النسخ التلقائي." : "اربط Binance بالأعلى حتى تتفعل كبسة التشغيل."}</span>
            </div>
            <button className="primary bigEnable" onClick={() => saveSettings(true)} disabled={busy || !settings.binance_connected || effectiveEnabled || pausedBySubscription}>
              {pausedBySubscription ? "Paused — Subscription Required" : effectiveEnabled ? "Auto Copy Enabled" : settings.binance_connected ? "Enable Auto Copy" : "Connect Binance First"}
            </button>
          </div>
          <button className="clear stopCopyBtn" onClick={() => saveSettings(false)} disabled={busy || !settings.enabled}>Turn Auto Copy OFF</button>
        </div>
      </div>
      <div className="panel wide autoPanel"><h3>Live Copy Logs</h3>{(data?.logs || []).length === 0 ? <div className="empty small">No copy logs yet.</div> : <div className="copyLogs">{data.logs.map(l=><div key={l.id} className={`copyLog ${l.event_type}`}><b>{l.event_type}</b><span>{l.message}</span><em>{new Date(Number(l.created_at || 0)).toLocaleString()}</em></div>)}</div>}</div>
      <div className="panel wide autoPanel"><h3>Copied Trades</h3>{(data?.trades || []).length === 0 ? <div className="empty small">No copied trades yet.</div> : <div className="copyTradeList">{data.trades.map(t=><div key={t.id} className="copyTrade"><b>#{t.symbol}</b><span>{t.status} · {Number(t.trade_amount_usdt || 0).toFixed(2)} USDT · Exit {String(t.exit_target || '').toUpperCase()}</span><em>{t.pnl_pct ? `${Number(t.pnl_pct).toFixed(2)}%` : "—"}</em></div>)}</div>}</div>
    </section>
  );
}


function SecuritySessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [maxDevices, setMaxDevices] = useState(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`${Connection_URL}/api/auth/sessions`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.success) {
        setSessions(data.sessions || []);
        setMaxDevices(data.max_devices || 3);
      }
    } catch {}
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function logoutOthers() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${Connection_URL}/api/auth/sessions/logout-others`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not logout other devices");
      setMsg("Other devices were signed out.");
      loadSessions();
    } catch (e) { setMsg(e.message || "Security action failed"); }
    finally { setBusy(false); }
  }

  async function revoke(id) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${Connection_URL}/api/auth/sessions/${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not revoke session");
      setMsg("Device session revoked.");
      loadSessions();
    } catch (e) { setMsg(e.message || "Security action failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="securityPanel">
      <div className="securityHead">
        <div><b>Device Protection</b><span>Maximum active devices: {maxDevices}</span></div>
        <button onClick={logoutOthers} disabled={busy}>Logout other devices</button>
      </div>
      {msg && <div className="securityMsg">{msg}</div>}
      <div className="sessionList">
        {sessions.length === 0 ? <span className="mutedSmall">No active sessions found.</span> : sessions.map(s => (
          <div className={s.current ? "sessionItem current" : "sessionItem"} key={s.id}>
            <div><b>{s.device} · {s.browser}</b><span>{s.ip || "Unknown IP"} · {formatDate(s.created_at)}</span></div>
            {s.current ? <em>Current</em> : <button disabled={busy} onClick={() => revoke(s.id)}>Revoke</button>}
          </div>
        ))}
      </div>
    </div>
  );
}


function Dashboard({ user, onLogout, onUserUpdate, theme, toggleTheme }) {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState("active");
  const [tab, setTab] = useState("board");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [compact, setCompact] = useState(false);
  const [logos, setLogos] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [highlighted, setHighlighted] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [sseOnline, setSseOnline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [pushInfo, setPushInfo] = useState({ supported: false, enabled: false, configured: false, permission: "default", subscriptions: 0 });
  const [pushBusy, setPushBusy] = useState(false);
  const [platformSettings, setPlatformSettings] = useState({ free_mode: false, banner_title: "", banner_text: "" });
  const signalsRef = useRef([]);
  const loadRef = useRef({ inFlight: false, lastAt: 0 });
  const retryTimerRef = useRef(null);
  const sseRef = useRef(null);
  const lastWakeRef = useRef(Date.now());
  const freeModeActive = getPlatformFreeMode(platformSettings);
  const vipAccess = isVipUser(user) || freeModeActive;
  const adminAccess = isAdminUser(user);

  const openTab = useCallback((nextTab) => {
    const allowed = ["board", "alerts", "subscribe", "autoCopy", "profile"];
    let clean = allowed.includes(nextTab) ? nextTab : "board";
    // When Free Mode is active, subscriptions are not shown because access is open.
    if (freeModeActive && clean === "subscribe") clean = "board";
    setTab(clean);
    try {
      localStorage.setItem("shaaban_user_tab", clean);
      const hash = clean === "board" ? "" : `#${clean}`;
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${hash}`);
    } catch {}
  }, [freeModeActive]);

  const loadPlatformSettings = useCallback(async () => {
    try {
      const res = await fetch(`${Connection_URL}/api/platform-settings`, { credentials: "include" });
      const data = await parseApiJson(res);
      if (res.ok && data.success) setPlatformSettings(data);
    } catch {}
  }, []);

  useEffect(() => { loadPlatformSettings(); }, [loadPlatformSettings]);

  useEffect(() => {
    try {
      const hashTab = (window.location.hash || "").replace("#", "");
      const savedTab = localStorage.getItem("shaaban_user_tab");
      const allowed = ["board", "alerts", "subscribe", "autoCopy", "profile"];
      let initial = allowed.includes(hashTab) ? hashTab : (allowed.includes(savedTab || "") ? savedTab : "board");
      if (freeModeActive && initial === "subscribe") initial = "board";
      setTab(initial);
    } catch {}
  }, [freeModeActive]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("shaaban_ultra_compact");
      if (saved) setCompact(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("shaaban_ultra_compact", JSON.stringify(compact)); } catch {}
  }, [compact]);


  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function installApp() {
    if (!installPrompt) {
      addNotice("Install option will appear when your browser allows it.", "info", "📱");
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }


  async function refreshPushInfo() {
    const supported = pushSupported();
    let enabled = false;
    let configured = false;
    let subscriptions = 0;
    let permission = supported ? Notification.permission : "unsupported";
    try {
      const statusRes = await fetch(`${Connection_URL}/api/push/status`, { credentials: "include" });
      if (statusRes.ok) {
        const status = await statusRes.json();
        configured = Boolean(status.web_push);
        subscriptions = Number(status.subscriptions || 0);
      }
      if (supported) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        enabled = Boolean(sub) && permission === "granted";
      }
    } catch {
      enabled = false;
    }
    setPushInfo({ supported, enabled, configured, permission, subscriptions });
    return { supported, enabled, configured, permission, subscriptions };
  }

  async function enableNotifications() {
    setPushBusy(true);
    try {
      if (!pushSupported()) throw new Error("This browser does not support push notifications.");
      const keyRes = await fetch(`${Connection_URL}/api/push/vapid-public-key`, { credentials: "include" });
      const keyData = await keyRes.json();
      const publicKey = keyData.publicKey;
      if (!publicKey) throw new Error("Push notifications are not configured on the server.");
      let permission = Notification.permission;
      if (permission !== "granted") permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications permission was not allowed.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const res = await fetch(`${Connection_URL}/api/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "Cannot register this device for notifications.");
      addNotice("Notifications enabled on this device.", "target", "🔔");
      await refreshPushInfo();
    } catch (e) {
      addNotice(e.message || "Cannot enable notifications.", "closed", "⚠️");
    } finally {
      setPushBusy(false);
    }
  }

  const addNotice = useCallback((text, type="info", icon="📡") => {
    const item = { id: Date.now() + Math.random(), text, type, icon, time: new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) };
    setToasts(p => [...p, item]);
    setNotifs(p => [item, ...p].slice(0, 60));
    setTimeout(() => setToasts(p => p.filter(x => x.id !== item.id)), 4200);
  }, []);

  const highlight = useCallback((id) => {
    if (!id) return;
    setHighlighted(p => new Set([...p, id]));
    setTimeout(() => setHighlighted(p => {
      const s = new Set(p);
      s.delete(id);
      return s;
    }), 7500);
  }, []);

  const load = useCallback(async (opts = {}) => {
    const forced = Boolean(opts.force);
    const state = loadRef.current;
    const now = Date.now();
    if (!forced && state.inFlight) return;
    if (!forced && now - state.lastAt < 6000) return;

    state.inFlight = true;
    try {
      const res = await fetchWithTimeout(`${Connection_URL}/api/signals`, { credentials: "include" }, 12000);
      if (res.status === 401) {
        setApiOnline(false);
        setErr("Session expired. Please login again.");
        return;
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await parseApiJson(res);
      const list = Array.isArray(data) ? data : (Array.isArray(data.signals) ? data.signals : []); setSignals(list);
      signalsRef.current = Array.isArray(data) ? data : [];
      setApiOnline(true);
      setErr("");
      state.lastAt = Date.now();
      setLastUpdate(new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}));
    } catch (e) {
      setApiOnline(false);
      // Keep the last good signals on screen after laptop sleep / temporary network loss.
      if ((signalsRef.current || []).length === 0) {
        setErr("Cannot load signals. Check API connection.");
      } else {
        setErr("Connection paused. Reconnecting...");
      }
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => load({ force: true }), 3500);
    } finally {
      state.inFlight = false;
      setLoading(false);
    }
  }, []);

  const fullSync = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadPlatformSettings(), load({ force: true }), refreshPushInfo()]);
    addNotice("Synced now", "system", "🔄");
  }, [loadPlatformSettings, load, addNotice]);

  useEffect(() => { load({ force: true }); loadPlatformSettings(); }, [load, loadPlatformSettings]);

  // Keep Free Mode / Subscription Mode synced while the user keeps the app open.
  // This makes the VIP dashboard lock again shortly after Admin turns Free Mode OFF.
  useEffect(() => {
    const syncPlatformState = (force = false) => {
      loadPlatformSettings();
      load({ force });
    };

    const onWake = () => {
      const sleptLong = Date.now() - lastWakeRef.current > 30000;
      lastWakeRef.current = Date.now();
      syncPlatformState(true);
      if (sleptLong && sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
    };

    const interval = setInterval(() => {
      if (!document.hidden) syncPlatformState(false);
    }, 15000);

    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
      document.removeEventListener("visibilitychange", onWake);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [load, loadPlatformSettings]);

  useEffect(() => { refreshPushInfo(); }, []);
  const makeFreePreview = useCallback(async (signal) => {
    if (!signal?.key) {
      addNotice("Signal key is missing.", "closed", "⚠️");
      return;
    }
    try {
      const res = await fetch(`${Connection_URL}/api/admin/free-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: signal.key }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to set free preview");
      addNotice(`${sym(signal.symbol)} is now the Free Preview signal`, "target", "👁️");
      load();
    } catch (e) {
      addNotice(e.message || "Cannot set free preview", "closed", "⚠️");
    }
  }, [addNotice, load]);


  useEffect(() => {
    fetch("/logos.json").then(r => r.ok ? r.json() : {}).then(d => setLogos(d || {})).catch(() => {});
  }, []);

  useEffect(() => {
    let reconnectTimer = null;

    const connectSse = () => {
      if (document.hidden) return;
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }

      const es = new EventSource(`${Connection_URL}/api/events`, { withCredentials: true });
      sseRef.current = es;
      es.onopen = () => setSseOnline(true);
      es.onerror = () => {
        setSseOnline(false);
        try { es.close(); } catch {}
        if (sseRef.current === es) sseRef.current = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectSse, 4000);
      };

      es.addEventListener("new_signal", (e) => {
        try {
          const d = JSON.parse(e.data || "{}");
          addNotice(`New VIP signal: ${sym(d.symbol)}`, "new", "⚡");
          highlight(d.id);
        } catch {}
        load({ force: true });
      });

      es.addEventListener("status_update", (e) => {
        try {
          const d = JSON.parse(e.data || "{}");
          const isTarget = String(d.status || "").startsWith("tp");
          addNotice(`${sym(d.symbol)} ${isTarget ? "reached target" : "closed"}`, isTarget ? "target" : "closed", isTarget ? "🎯" : "🛑");
          highlight(d.id);
        } catch {}
        load({ force: true });
      });

      const refreshPlatform = () => {
        loadPlatformSettings();
        load({ force: true });
      };
      es.addEventListener("platform_settings", refreshPlatform);
      es.addEventListener("platform-settings", refreshPlatform);
      es.addEventListener("free_mode", refreshPlatform);
      es.addEventListener("free-mode", refreshPlatform);
    };

    connectSse();

    const onVisible = () => {
      if (!document.hidden && !sseRef.current) connectSse();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
    };
  }, [load, addNotice, highlight, loadPlatformSettings]);

  const stats = useMemo(() => {
    const stageOf = (x) => {
      const flags = x?.tp4_hit ? 4 : x?.tp3_hit ? 3 : x?.tp2_hit ? 2 : x?.tp1_hit ? 1 : 0;
      const statusStage = String(x?.status || "").startsWith("tp") ? Number(String(x.status).replace("tp","")) : 0;
      return Math.max(statusStage || 0, Number(x?.last_tp_update_stage || x?.highest_tp_stage || 0), flags);
    };
    const active = signals.filter(x => x._board_source === "open" || x.status === "active").length;
    const hit = signals.filter(x => stageOf(x) > 0).length;
    const closed = signals.filter(x => x.status === "stopped").length;
    const today = signals.filter(x => {
      const t = Number(x.created_at || x.updated_at || x.closed_at || 0);
      return t && Date.now() - t < 24 * 60 * 60 * 1000;
    }).length;
    return { active, hit, closed, today, total: signals.length };
  }, [signals]);

  const market = useMemo(() => {
    if (stats.active >= 6) return { icon:"🟢", title:"Active Market", text:"Multiple live approved opportunities." };
    if (stats.active >= 1) return { icon:"🟡", title:"Selective Market", text:"Clean approved setups are live." };
    return { icon:"🔵", title:"Waiting Mode", text:"Waiting for a clean approved setup." };
  }, [stats.active]);

  const list = useMemo(() => {
    let arr = [...signals];

    if (filter === "active") arr = arr.filter(x => x._board_source === "open" || x.status === "active");
    if (filter === "hit") arr = arr.filter(x => String(x.status || "").startsWith("tp") || x.tp1_hit || x.tp2_hit || x.tp3_hit || x.tp4_hit || Number(x.last_tp_update_stage || x.highest_tp_stage || 0) > 0);
    if (filter === "closed") arr = arr.filter(x => x.status === "stopped");

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      arr = arr.filter(x => sym(x.symbol).includes(q));
    }

    arr.sort((a,b) => {
      if (sort === "score") return Number(b.score || 0) - Number(a.score || 0);
      if (sort === "confidence") return Number(b.confidence || 0) - Number(a.confidence || 0);
      if (sort === "oldest") return Number(a.created_at || 0) - Number(b.created_at || 0);
      return Number(b.created_at || 0) - Number(a.created_at || 0);
    });

    return arr;
  }, [signals, filter, search, sort]);

  return (
    <div className={`dashboard ${theme === "light" ? "lightMode" : ""}`}>
      <Toasts items={toasts} />
      <Notifications open={drawerOpen} items={notifs} onClose={() => setDrawerOpen(false)} onClear={() => setNotifs([])} />
      <SignalModal signal={selected} logos={logos} user={user} onClose={() => setSelected(null)} />

      <header className="topbar">
        <button type="button" className="brand brandHome" onClick={() => openTab("board")} title="Back to home">
          <div className="bolt">⚡</div>
          <div><b>SHAABAN SIGNAL PRO</b><span>{freeModeActive ? "Free Mode Active" : (vipAccess ? "VIP Signals Dashboard" : "Free Preview Dashboard")}</span></div>
        </button>

        <div className="topActions">
          <button className="installBtn" onClick={installApp}>📱 Install</button>
          <button className={pushInfo.enabled ? "notifyEnabled" : "notifyBtn"} onClick={enableNotifications} disabled={pushBusy}>
            {pushInfo.enabled ? "🔔 Notifications On" : "🔔 Enable Alerts"}
          </button>
          <button className="themeToggle" onClick={toggleTheme}>{theme === "light" ? "🌙 Dark" : "☀️ Light"}</button>
          <button className="bell" onClick={() => setDrawerOpen(true)}>🔔 {notifs.length}</button>
          {!vipAccess && <button className="upgradeMini" onClick={() => openTab("subscribe")}>Upgrade</button>}
          <span>{user?.name || "Trader"} · {membershipLabel(user)}</span>
          <button onClick={fullSync}>Sync Now</button>
          <button onClick={async () => { try { await fetch(`${Connection_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {} localStorage.removeItem("shaaban_user"); onLogout(); }}>Logout</button>
        </div>
      </header>

      <main className="container">
        <section className="userQuickNav">
          <button className={tab === "board" ? "on" : ""} onClick={() => openTab("board")}>Signals</button>
          <button className={tab === "alerts" ? "on" : ""} onClick={() => openTab("alerts")}>Alerts</button>
          {!freeModeActive && <button className={tab === "subscribe" ? "on" : ""} onClick={() => openTab("subscribe")}>{vipAccess ? "Subscription" : "Upgrade"}</button>}
          <button className={tab === "autoCopy" ? "on" : ""} onClick={() => openTab("autoCopy")}>Auto Copy Pro</button>
          <button className={tab === "profile" ? "on" : ""} onClick={() => openTab("profile")}>Profile</button>
        </section>
        {tab !== "board" && (
          <button className="backToSignals" onClick={() => openTab("board")}>← Back to Signals</button>
        )}

        {freeModeActive && (
          <section className="freeModeBanner">
            <b>{platformSettings.banner_title || "🎁 Free Mode Active"}</b>
            <span>{platformSettings.banner_text || "جميع الإشارات مفتوحة ."}</span>
          </section>
        )}

        {tab === "board" && (
          <>
            <section className="marketBanner"><b>{market.icon} {market.title}</b><span>{market.text}</span></section>

            <section className="hero proHero">
              <div className="proRibbon">SHAABAN SIGNAL PRO · {vipAccess ? "VIP MEMBER AREA" : "FREE PREVIEW"}</div>
              <div>
                <span className="eyebrow">● {vipAccess ? "LIVE APPROVED SIGNALS" : "FREE PREVIEW SIGNAL"}</span>
                <h1>{vipAccess ? "VIP Signals Dashboard" : "Free Preview Dashboard"}</h1>
                <p>{vipAccess ? "VIP Signals Only • Risk Managed • Updates" : "View one selected signal. Upgrade to unlock all live trades."}</p>
                <div className="heroChips"><span>Quality Checked</span><span>Dynamic Targets</span><span>VIP Tracking</span></div>
              </div>
              <div className="heroCard"><span>Today</span><b>{stats.today}</b><em>approved signals</em></div>
            </section>

            {!vipAccess && (
              <section className="upgradeBanner">
                <div>
                  <b>🔒 Unlock all SHAABAN VIP signals</b>
                  <span>Free members can view one selected preview signal. VIP unlocks every coin, entry, SL, targets, and live alerts.</span>
                </div>
                <button onClick={() => openTab("subscribe")}>Upgrade to VIP</button>
              </section>
            )}

            <section className={pushInfo.enabled ? "pushBanner enabled" : "pushBanner"}>
              <div>
                <b>{pushInfo.enabled ? "🔔 Notifications enabled" : "🔔 Enable signal notifications"}</b>
                <span>{pushInfo.enabled ? "This device is registered for approved signals and target alerts." : "Turn on alerts to receive signals and TP updates even when the page is closed."}</span>
              </div>
              <div className="pushBannerActions">
                <button onClick={enableNotifications} disabled={pushBusy}>{pushInfo.enabled ? "Re-sync" : "Enable"}</button>
              </div>
            </section>

            <section className="stats">
              <Stat label="Open Trades" value={stats.active} tone="blueText" active={filter === "active"} onClick={() => setFilter("active")} />
              <Stat label="Targets Hit" value={stats.hit} tone="greenText" active={filter === "hit"} onClick={() => setFilter("hit")} />
              <Stat label="Closed / SL" value={stats.closed} tone="redText" active={filter === "closed"} onClick={() => setFilter("closed")} />
              <Stat label="Total Signals" value={stats.total} tone="goldText" active={filter === "all"} onClick={() => setFilter("all")} />
            </section>

            <section className="controls">
              <div className="tabs">
                <button className={filter==="active" ? "on" : ""} onClick={() => setFilter("active")}>Open</button>
                <button className={filter==="all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
                <button className={filter==="hit" ? "on" : ""} onClick={() => setFilter("hit")}>Targets Hit</button>
                <button className={filter==="closed" ? "on" : ""} onClick={() => setFilter("closed")}>Closed</button>
              </div>
              <div className="tools">
                <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search coin..." />
                <select value={sort} onChange={(e)=>setSort(e.target.value)}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="score">Best Score</option>
                  <option value="confidence">Confidence</option>
                </select>
                <button className={compact ? "on" : ""} onClick={() => setCompact(!compact)}>{compact ? "Comfort" : "Compact"}</button>
              </div>
            </section>

            {err && <div className="error">{err}</div>}

            <section className="boardInfo"><span>Live board updates automatically</span><b>Tracking approved signals only</b></section>

            <section className="labels">
              <span>Asset</span><span className="hideMobile">Entry</span><span className="hideTablet">Target</span><span className="hideTablet">Score</span><span>Targets</span><span>Status</span>
            </section>

            <section className="signals">
              {loading ? <Skeleton /> :
                list.length === 0 ? <EmptyState filter={filter} /> :
                list.map(signal => {
                  const unlockedByFreeMode = freeModeActive || vipAccess;
                  const isLocked = !unlockedByFreeMode && signal.locked;
                  return isLocked
                    ? <LockedSignalRow key={signal.id} signal={signal} compact={compact} />
                    : <SignalRow key={signal.id} signal={{ ...signal, locked: false }} logos={logos} compact={compact} highlighted={highlighted.has(signal.id)} onOpen={setSelected} isAdmin={adminAccess} onMakeFreePreview={makeFreePreview} user={user} />;
                })
              }
            </section>

            <Activity items={notifs} />
          </>
        )}

        {tab === "alerts" && (
          <section className="centerPage">
            <div className="panel wide">
              <h2>Alert Center</h2>
              <p>All updates received during your session.</p>
              {notifs.length === 0 ? <div className="empty small">No alerts yet.</div> :
                <div className="notifList embedded">{notifs.map(x => <div className={`notif ${x.type || ""}`} key={x.id}><b>{x.icon}</b><div><strong>{x.text}</strong><span>{x.time}</span></div></div>)}</div>
              }
            </div>
          </section>
        )}

        {tab === "subscribe" && !freeModeActive && <SubscribePanel user={user} onUserUpdate={onUserUpdate} />}

        {tab === "autoCopy" && <AutoCopyPanel user={user} freeModeActive={freeModeActive} />}

        {tab === "profile" && (
          <section className="centerPage">
            <div className="panel">
              <div className="avatar">{(user?.name || "S")[0]}</div>
              <h2>{user?.name || "Trader"}</h2>
              <p>{user?.role || "Member"}</p>
              <div className="profileInfo">
                <div><span>Membership</span><b>{membershipLabel(user)}</b></div>
                <div><span>Access</span><b className={vipAccess ? "greenText" : "goldText"}>{vipAccess ? "Full" : "Preview"}</b></div>
                <div><span>Version</span><b>PRO UI</b></div>
                <div><span>Last Update</span><b>{lastUpdate || "—"}</b></div>
              </div>
              <div className="statusGrid">
                <div><span>Total</span><b>{stats.total}</b></div>
                <div><span>Open</span><b>{stats.active}</b></div>
                <div><span>Connection</span><b className={apiOnline ? "greenText" : "goldText"}>{apiOnline ? "Live" : "Check"}</b></div>
                <div><span>Access</span><b className={vipAccess ? "greenText" : "goldText"}>{vipAccess ? "Full" : "Preview"}</b></div>
              </div>
              <SecuritySessionsPanel />
              {!vipAccess && (
                <div className="subscribeBox">
                  <b>Upgrade to VIP</b>
                  <span>Unlock all approved signals, targets, stop loss, live updates, and notifications.</span>
                  <button className="primary" onClick={() => openTab("subscribe")}>Pay with Crypto</button>
                </div>
              )}
              <button className="primary" onClick={async () => { try { await fetch(`${Connection_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {} localStorage.removeItem("shaaban_user"); onLogout(); }}>Logout</button>
            </div>
          </section>
        )}
      </main>

      <nav className="bottomNav">
        <button className={tab==="board" ? "on" : ""} onClick={() => openTab("board")}>Board</button>
        <button className={tab==="alerts" ? "on" : ""} onClick={() => openTab("alerts")}>Alerts</button>
        {!vipAccess && <button className={tab==="subscribe" ? "on" : ""} onClick={() => openTab("subscribe")}>VIP</button>}
        <button className={tab==="autoCopy" ? "on" : ""} onClick={() => openTab("autoCopy")}>Copy</button>
        <button className={tab==="profile" ? "on" : ""} onClick={() => openTab("profile")}>Profile</button>
      </nav>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [theme, setTheme] = useState(() => localStorage.getItem("shaaban_theme_mode") || "dark");
  const [showWelcome, setShowWelcome] = useState(false);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("shaaban_user") || "null"); }
    catch { return null; }
  });

  useEffect(() => {
    try { localStorage.setItem("shaaban_theme_mode", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme((t) => t === "light" ? "dark" : "light");

  useEffect(() => {
    fetch(`${Connection_URL}/api/auth/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success && d.user) {
          setUser(d.user);
          localStorage.setItem("shaaban_user", JSON.stringify(d.user));
        }
      })
      .catch(() => {});
  }, []);


  const isResetPasswordRoute = (() => {
    try { return window.location.pathname === "/reset-password" && new URLSearchParams(window.location.search).has("token"); }
    catch { return false; }
  })();

  if (isResetPasswordRoute) {
    return (
      <Login
        onLogin={(u) => { setUser(u); setShowWelcome(true); }}
        theme={theme}
        toggleTheme={toggleTheme}
        onBack={() => {
          try { window.history.replaceState({}, document.title, "/"); } catch {}
          setScreen("landing");
        }}
      />
    );
  }

  if (user && showWelcome) return <Welcome user={user} onContinue={() => setShowWelcome(false)} />;
  if (user) return <Dashboard user={user} theme={theme} toggleTheme={toggleTheme} onUserUpdate={(u) => setUser(u)} onLogout={() => { setUser(null); setScreen("landing"); }} />;
  if (screen === "login") return <Login onLogin={(u) => { setUser(u); setShowWelcome(true); }} theme={theme} toggleTheme={toggleTheme} onBack={() => setScreen("landing")} />;
  return <Landing theme={theme} toggleTheme={toggleTheme} onLogin={() => setScreen("login")} />;
}


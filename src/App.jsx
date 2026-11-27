import { useState, useEffect, useMemo, useRef } from "react";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Search, Trash2, Download, AlertTriangle, Undo2, Moon, Sun, LogIn, LogOut, Zap, Lock, Settings, X, Eye, EyeOff } from "lucide-react";
import ThreeBackground from "./ThreeBackground.jsx";

const categories = ["Food", "Housing", "Transport", "Entertainment", "Shopping", "Other"];
const frequencies = ["One-time", "Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"];
const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
];

function useCountUp(target, duration = 1100) {
  const [value, setValue] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = shownRef.current;
    if (reduceMotion || from === target) {
      shownRef.current = target;
      setValue(target);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      shownRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function ProgressRing({ pct, size = 124, stroke = 11, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - clamped)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState("One-time");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [monthFilter] = useState("All");
  const [liveNow, setLiveNow] = useState(new Date());
  const [error, setError] = useState("");
  const [lastDeleted, setLastDeleted] = useState(null);

  const [darkMode, setDarkMode] = useState(false);
  const toggleTheme = () => setDarkMode(!darkMode);

  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("cf_jwt") || null);

  // Auth State (Fixed: Added missing authMsg declaration)
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authMsg, setAuthMsg] = useState("");

  const [bills] = useState([]);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");

  // Settings state
  const [showSettings, setShowSettings] = useState(false);

  const API_URL = "https://expense-dashboard.andromedavile.workers.dev/api";

  const resetToBlank = () => {
    setExpenses([]);
    setMonthlyIncome(0);
    setSavingsGoal(0);
    setLastDeleted(null);
    setError("");
    setCurrency("USD");
  };

  useEffect(() => {
    const t = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load user session from localStorage on startup
  useEffect(() => {
    const token = localStorage.getItem("cf_jwt");
    const savedUser = localStorage.getItem("cf_user");
    if (token && savedUser) {
      setAuthToken(token);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Fetch user data from Cloudflare Worker when logged in
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/data`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        if (cancelled) return;

        setExpenses(data.expenses || []);
        setMonthlyIncome(data.settings?.monthly_income || 0);
        setSavingsGoal(data.settings?.savings_goal || 0);
      } catch (err) {
        console.error("Fetch data error:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [authToken]);

  const signInOrUp = async (e) => {
    e.preventDefault();
    setAuthMsg("");
    const endpoint = authMode === "signin" ? `${API_URL}/login` : `${API_URL}/signup`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthMsg(data.error || "Authentication failed");
        return;
      }

      if (authMode === "signup") {
        setAuthMsg("Account created successfully! Please sign in.");
        setAuthMode("signin");
      } else {
        localStorage.setItem("cf_jwt", data.token);
        localStorage.setItem("cf_user", JSON.stringify(data.user));
        setAuthToken(data.token);
        setUser(data.user);
        resetToBlank();
      }
    } catch {
      setAuthMsg("Network error connecting to Cloudflare backend.");
    }
  };

  const signOut = () => {
    localStorage.removeItem("cf_jwt");
    localStorage.removeItem("cf_user");
    setAuthToken(null);
    setUser(null);
    resetToBlank();
    setShowSettings(false);
  };

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = Math.min(now.getDate(), daysInMonth);
  const daysLeft = daysInMonth - daysPassed;

  const monthExpenses = monthFilter === "All" ? expenses : expenses.filter((e) => e.date.startsWith(monthFilter));
  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const balance = monthlyIncome - total;
  const savings = Math.max(balance, 0);
  const savingsPct = savingsGoal > 0 ? Math.min(Math.round((savings / savingsGoal) * 100), 100) : 0;
  const dailyAvg = daysPassed > 0 ? total / daysPassed : total;
  const projected = Math.round(dailyAvg * daysInMonth);

  const filtered = useMemo(() => {
    let list = monthExpenses.filter((e) => {
      const okSearch = e.title.toLowerCase().includes(search.toLowerCase());
      const okFilter = filter === "All" || e.category === filter;
      return okSearch && okFilter;
    });
    return list;
  }, [monthExpenses, search, filter]);

  const isFixedExpense = (e) => e.frequency && e.frequency !== "One-time";
  const fixedList = filtered.filter(isFixedExpense);
  const flexList = filtered.filter((e) => !isFixedExpense(e));
  const fixedTotal = fixedList.reduce((s, e) => s + Number(e.amount || 0), 0);
  const flexTotal = flexList.reduce((s, e) => s + Number(e.amount || 0), 0);

  const animatedIncome = useCountUp(monthlyIncome);
  const animatedTotal = useCountUp(total);
  const animatedBalance = useCountUp(balance);
  const animatedSavings = useCountUp(savings);
  const spentPct = monthlyIncome > 0 ? Math.min(total / monthlyIncome, 1) : 0;
  const animatedSpentPct = useCountUp(spentPct);

  const doAddExpense = (cleanTitle, num, cat, d, freq) => {
    const newExp = { id: Date.now(), title: cleanTitle, amount: num, category: cat, date: d, frequency: freq || "One-time" };
    setExpenses((prev) => [newExp, ...prev]);
  };

  const addExpense = (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const num = Number(amount);
    if (!cleanTitle) { setError("Add a title first."); return; }
    if (!num || num <= 0) { setError("Amount must be more than $0."); return; }
    setError("");
    doAddExpense(cleanTitle, num, category, date, frequency);
    setTitle(""); setAmount(""); setFrequency("One-time");
  };

  const quickAdd = (e) => {
    e.preventDefault();
    const num = Number(quickAmount);
    const t = quickTitle.trim() || "Quick expense";
    if (!num || num <= 0) { setError("Quick add needs an amount over $0."); return; }
    const d = new Date().toISOString().slice(0, 10);
    doAddExpense(t, num, quickCategory, d);
    setQuickAmount(""); setQuickTitle("");
  };

  const deleteExpense = (id) => {
    const found = expenses.find((e) => e.id === id);
    if (!found) return;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setLastDeleted(found);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setExpenses((prev) => [lastDeleted, ...prev]);
    setLastDeleted(null);
  };

  const exportCSV = () => {
    const header = "Title,Amount,Category,Date,Frequency\n";
    const rows = expenses.map((e) => `"${e.title.replace(/"/g, '""')}",${e.amount},${e.category},${e.date},${e.frequency || "One-time"}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "expenses.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || "$";

  // Auth Page Renderer
  if (!user) {
    return (
      <div className={`app login-page ${darkMode ? "dark" : ""}`} style={{ zIndex: 10 }}>
        <ThreeBackground dark={darkMode} />
        <div className="login-top">
          <div className="login-logo">
            <span className="login-logo-icon"><Wallet size={20} /></span>
            Money Dashboard (Cloudflare)
          </div>
          <button className="small-ghost-btn" onClick={toggleTheme}>{darkMode ? <Sun size={15} /> : <Moon size={15} />} {darkMode ? "Light mode" : "Dark mode"}</button>
        </div>

        <div className="login-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 420 }}>
          <div className="login-card">
            <h2>{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p>{authMode === "signup" ? "Sign up to store your data securely on Cloudflare." : "Sign in to access your expenses."}</p>
            <form onSubmit={signInOrUp} className="login-form">
              <div className="login-field">
                <label htmlFor="login-email">Email</label>
                <input id="login-email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="login-password"
                    type={showAuthPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Your password"
                    required
                  />
                  <button type="button" className="small-ghost-btn" onClick={() => setShowAuthPassword(!showAuthPassword)} style={{ position: "absolute", right: 8, top: 8, padding: 6, background: "none", border: "none" }}>
                    {showAuthPassword ? <EyeOff size={14} color="var(--ink-dim)" /> : <Eye size={14} color="var(--ink-dim)" />}
                  </button>
                </div>
              </div>
              {authMsg && <div className="form-error">{authMsg}</div>}
              <button type="submit" className="login-submit"><LogIn size={16} /> {authMode === "signup" ? "Sign up" : "Sign in"}</button>
            </form>
            <button type="button" className="login-toggle" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>
              {authMode === "signup" ? "Have an account? Sign in" : "No account? Sign up"}
            </button>
            <p className="login-note"><Lock size={13} /> Powered by Cloudflare Workers & D1 Database.</p>
          </div>
        </div>
      </div>
    );
  }

  const expenseRow = (e) => (
    <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
      <div>
        <strong>{e.title}</strong>
        <span><span className="cat-pill">{e.category}</span>{e.frequency && e.frequency !== "One-time" && <span className="cat-pill">{e.frequency}</span>}{e.date}</span>
      </div>
      <div className="row-right">
        <strong>{currencySymbol}{e.amount.toFixed(2)}</strong>
        <button onClick={() => deleteExpense(e.id)}><Trash2 size={16} /></button>
      </div>
    </div>
  );

  if (showSettings) {
    return (
      <div className={`app ${darkMode ? "dark" : ""}`} style={{ position: "relative", zIndex: 10 }}>
        <ThreeBackground dark={darkMode} />
        <header>
          <div className="header-top">
            <div>
              <h1>Settings</h1>
              <p>Manage your preferences.</p>
            </div>
            <button className="white-btn" onClick={() => setShowSettings(false)}>
              <X size={15} /> Back to Dashboard
            </button>
          </div>
        </header>

        <div className="settings-page-grid">
          <div className="card">
            <h3><Settings size={18} /> Preferences</h3>
            <div className="field">
              <label>Currency Display</label>
              <div style={{ position: "relative" }}>
                <button className="white-btn" onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>{currencySymbol} {currency}</span>
                  <span>▼</span>
                </button>
                {showCurrencyDropdown && (
                  <div className="currency-dropdown">
                    {CURRENCIES.map((c) => (
                      <button key={c.code} className="currency-option" onClick={() => { setCurrency(c.code); setShowCurrencyDropdown(false); }}>
                        <span>{c.symbol} {c.code}</span>
                        <small>{c.label}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? "dark" : ""}`} style={{ position: "relative", zIndex: 10 }}>
      <ThreeBackground dark={darkMode} />
      <header>
        <div className="header-top">
          <div>
            <h1>Money Dashboard</h1>
            <p>Welcome back, {user.email} - {daysLeft} days left - Projected: {currencySymbol}{projected}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="white-btn" onClick={() => setShowSettings(true)}><Settings size={15} /> Settings</button>
            <button className="white-btn" onClick={toggleTheme}>{darkMode ? <Sun size={15} /> : <Moon size={15} />} {darkMode ? "Light mode" : "Dark mode"}</button>
            <button className="white-btn" onClick={signOut}><LogOut size={15} /> Sign out</button>
          </div>
        </div>
        <div className="settings-row">
          <label>Income {currencySymbol} <input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value) || 0)} /></label>
          <label>Savings goal {currencySymbol} <input type="number" value={savingsGoal} onChange={(e) => setSavingsGoal(Number(e.target.value) || 0)} /></label>
          <button className="white-btn" onClick={exportCSV}><Download size={15} /> Export CSV</button>
        </div>
      </header>

      <div className="stats">
        <div className="card stat"><div className="stat-icon green"><Wallet size={22} /></div><div><span>Monthly Income</span><strong>{currencySymbol}{animatedIncome.toFixed(2)}</strong></div></div>
        <div className="card stat"><div className="stat-icon red"><TrendingDown size={22} /></div><div><span>Total Spent</span><strong>{currencySymbol}{animatedTotal.toFixed(2)}</strong></div></div>
        <div className="card stat"><div className="stat-icon blue"><TrendingUp size={22} /></div><div><span>Balance Left</span><strong className={balance < 0 ? "danger" : "good"}>{currencySymbol}{animatedBalance.toFixed(2)}</strong></div></div>
        <div className="card stat"><div className="stat-icon purple"><PiggyBank size={22} /></div><div><span>Savings</span><strong>{currencySymbol}{animatedSavings.toFixed(2)}</strong></div></div>
        <div className="card stat ring-card"><ProgressRing pct={animatedSpentPct} size={124} stroke={11}><strong>{currencySymbol}{animatedTotal.toFixed(0)}</strong><span>spent</span></ProgressRing><div><span>Spent of income</span><strong>{Math.round(animatedSpentPct * 100)}%</strong></div></div>
      </div>

      <div className="card quick-add">
        <h3><Zap size={18} /> Quick Add</h3>
        <form onSubmit={quickAdd} className="quick-form">
          <input type="number" step="0.01" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} placeholder={`Amount ${currencySymbol}`} required />
          <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="What was it?" />
          <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="submit">Add Today</button>
        </form>
      </div>

      <h2 className="section-heading">All Expenses</h2>
      <div className="bottom">
        <form onSubmit={addExpense} className="card form">
          <h3>Add Expense</h3>
          {error && <div className="form-error">{error}</div>}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you spend on?" />
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount ${currencySymbol}`} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>{frequencies.map((f) => <option key={f}>{f}</option>)}</select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit">Add Expense</button>
        </form>
        <div className="card">
          <h3>Your spending <small>{filtered.length} shown</small></h3>
          <div className="toolbar">
            <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="two-boxes">
        <div className="card fixed-box">
          <h3>Fixed <small>{currencySymbol}{fixedTotal.toFixed(2)}</small></h3>
          {fixedList.map(expenseRow)}
        </div>
        <div className="card flex-box">
          <h3>Flexible <small>{currencySymbol}{flexTotal.toFixed(2)}</small></h3>
          {flexList.map(expenseRow)}
        </div>
      </div>

      {lastDeleted && (
        <div className="toast">
          <span>Deleted {lastDeleted.title} - {currencySymbol}{lastDeleted.amount.toFixed(2)}</span>
          <button onClick={undoDelete}><Undo2 size={15} /> Undo</button>
        </div>
      )}
    </div>
  );
}
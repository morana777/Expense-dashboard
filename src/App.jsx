import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Search,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Undo2,
  Moon,
  Sun,
  LogIn,
  LogOut,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Check,
  X,
  Calendar,
} from "lucide-react";
import ThreeBackground from "./ThreeBackground.jsx";

const CATEGORIES = ["Food", "Housing", "Transport", "Entertainment", "Shopping", "Other"];
const FREQUENCIES = ["One-time", "Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"];
const DEFAULT_BUDGETS = {
  Food: 350,
  Housing: 1200,
  Transport: 180,
  Entertainment: 120,
  Shopping: 250,
  Other: 150,
};

const CAT_COLORS_DARK = ["#38bdf8", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#94a3b8"];
const CAT_COLORS_LIGHT = ["#0284c7", "#059669", "#d97706", "#7c3aed", "#e11d48", "#475569"];

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
];

const API_URL =
  typeof window !== "undefined" && window.location.hostname.endsWith(".workers.dev")
    ? "/api"
    : "https://expense-dashboard.andromedavile.workers.dev/api";

function computeSolarElevationDeg(date, lat, lon) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;
  const g = ((357.528 + 0.9856003 * d) % 360) * rad;
  const L = (280.46 + 0.9856474 * d) % 360;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * d) * rad;
  const sinDec = Math.sin(eps) * Math.sin(lambda);
  const cosDec = Math.sqrt(Math.max(0, 1 - sinDec * sinDec));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = 280.46061837 + 360.98564736629 * d;
  const ha = (gmst + lon - ra) * rad;
  const latRad = lat * rad;
  const sinAlt = Math.sin(latRad) * sinDec + Math.cos(latRad) * cosDec * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad;
}

function readStoredCoords() {
  try {
    const raw = localStorage.getItem("user_coords");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon) ? parsed : null;
  } catch {
    return null;
  }
}

function isNightAtLocation(date, coords) {
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
    return computeSolarElevationDeg(date, coords.lat, coords.lon) <= 0.5;
  }
  const h = date.getHours();
  return h >= 18 || h < 6;
}

function formatShortMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function ProgressRing({ pct, size = 96, stroke = 9, over = false, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`ring-fill ${over ? "over" : ""}`}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currencySymbol }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--surface-elevated)",
        border: "1px solid var(--stroke-strong)",
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "var(--shadow)",
        fontSize: 12,
      }}
    >
      {label && <div style={{ color: "var(--ink-dim)", marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            color: "var(--ink)",
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{entry.name}:</span>
          <strong>
            {currencySymbol}
            {Number(entry.value || 0).toFixed(2)}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [clockNow, setClockNow] = useState(() => new Date());
  const todayStr = useMemo(() => {
    const y = clockNow.getFullYear();
    const m = String(clockNow.getMonth() + 1).padStart(2, "0");
    const d = String(clockNow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [clockNow]);
  const currentMonthStr = todayStr.slice(0, 7);

  // Navigation & Modal UI state
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddModal, setShowAddModal] = useState(false);

  // Theme & Preferences
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem("theme_mode");
      return saved === "auto" || saved === "light" || saved === "dark" ? saved : "auto";
    } catch {
      return "auto";
    }
  });
  const [geoCoords, setGeoCoords] = useState(() => readStoredCoords());
  const [autoNight, setAutoNight] = useState(() => isNightAtLocation(new Date(), readStoredCoords()));
  const darkMode = themeMode === "dark" ? true : themeMode === "light" ? false : autoNight;
  const toggleTheme = () => setThemeMode(darkMode ? "light" : "dark");

  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem("user_currency") || "USD";
    } catch {
      return "USD";
    }
  });
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  // Auth State
  const [user, setUser] = useState(() => {
    try {
      const token = localStorage.getItem("cf_jwt");
      const raw = localStorage.getItem("cf_user");
      return token && raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("cf_jwt") || null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authMsg, setAuthMsg] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Core Financial Data
  const [expenses, setExpenses] = useState([]);
  const [bills, setBills] = useState([]);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataHydrated, setDataHydrated] = useState(false);

  // Filters, Search, Sorting & Editing
  const [monthFilter, setMonthFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedHeatDay, setSelectedHeatDay] = useState(null);
  const [chartView, setChartView] = useState("daily");

  // Form States
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  });
  const [frequency, setFrequency] = useState("One-time");

  const [quickAmount, setQuickAmount] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");
  const [quickFreq, setQuickFreq] = useState("One-time");

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Food");
  const [editFrequency, setEditFrequency] = useState("One-time");
  const [editDate, setEditDate] = useState("");

  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDue, setBillDue] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  });

  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [lastDeleted, setLastDeleted] = useState(null);

  // Persist Preferences
  useEffect(() => {
    try {
      localStorage.setItem("theme_mode", themeMode);
      localStorage.setItem("theme_dark", darkMode ? "true" : "false");
    } catch {}
  }, [themeMode, darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem("user_currency", currency);
    } catch {}
  }, [currency]);

  useEffect(() => {
    const id = setInterval(() => {
      const next = new Date();
      setClockNow(next);
      if (themeMode === "auto") {
        setAutoNight(isNightAtLocation(next, geoCoords));
      }
    }, 60000);
    return () => clearInterval(id);
  }, [themeMode, geoCoords]);

  useEffect(() => {
    if (themeMode !== "auto") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const lat = Number(pos.coords.latitude.toFixed(2));
        const lon = Number(pos.coords.longitude.toFixed(2));
        const next = { lat, lon };
        setGeoCoords(next);
        setAutoNight(isNightAtLocation(new Date(), next));
        try {
          localStorage.setItem("user_coords", JSON.stringify(next));
        } catch {}
      },
      () => {},
      { maximumAge: 1800000, timeout: 6000 }
    );
    return () => {
      cancelled = true;
    };
  }, [themeMode]);

  useEffect(() => {
    if (!lastDeleted) return;
    const t = setTimeout(() => setLastDeleted(null), 6500);
    return () => clearTimeout(t);
  }, [lastDeleted]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(""), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  // Local cache snapshot helper keyed by user id
  const writeCache = useCallback(
    (patch) => {
      if (!user?.id) return;
      try {
        const key = `cf_cache_${user.id}`;
        const prev = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(key, JSON.stringify({ ...prev, ...patch }));
      } catch {}
    },
    [user]
  );

  const resetToBlank = useCallback(() => {
    setExpenses([]);
    setBills([]);
    setBudgets(DEFAULT_BUDGETS);
    setMonthlyIncome(0);
    setSavingsGoal(0);
    setLastDeleted(null);
    setError("");
    setStatusMsg("");
    setDataHydrated(false);
  }, []);

  // Fetch user data from Cloudflare Worker on login
  useEffect(() => {
    if (!authToken || !user?.id) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setDataLoading(true);
      try {
        const cached = JSON.parse(localStorage.getItem(`cf_cache_${user.id}`) || "null");
        if (cached) {
          if (Array.isArray(cached.expenses)) setExpenses(cached.expenses);
          if (Array.isArray(cached.bills)) setBills(cached.bills);
          if (cached.budgets) setBudgets({ ...DEFAULT_BUDGETS, ...cached.budgets });
          if (typeof cached.monthlyIncome === "number") setMonthlyIncome(cached.monthlyIncome);
          if (typeof cached.savingsGoal === "number") setSavingsGoal(cached.savingsGoal);
        }
      } catch {}
      try {
        const res = await fetch(`${API_URL}/data`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.status === 401) {
          localStorage.removeItem("cf_jwt");
          localStorage.removeItem("cf_user");
          if (!cancelled) {
            setAuthToken(null);
            setUser(null);
            resetToBlank();
          }
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        if (cancelled) return;

        const nextExpenses = (data.expenses || []).map((r) => ({
          id: r.id,
          title: r.title,
          amount: Number(r.amount) || 0,
          category: r.category || "Other",
          date: r.date,
          frequency: r.frequency || "One-time",
        }));
        const nextBills = (data.bills || []).map((b) => ({
          id: b.id,
          title: b.title,
          amount: Number(b.amount) || 0,
          dueDate: b.due_date || b.dueDate,
          paid: Boolean(b.paid),
        }));
        const nextIncome = Number(data.settings?.monthly_income) || 0;
        const nextGoal = Number(data.settings?.savings_goal) || 0;
        const nextBudgets = { ...DEFAULT_BUDGETS };
        if (Array.isArray(data.budgets)) {
          data.budgets.forEach((b) => {
            if (b.category && Number.isFinite(Number(b.limit_amount))) {
              nextBudgets[b.category] = Number(b.limit_amount);
            }
          });
        }

        setExpenses(nextExpenses);
        setBills(nextBills);
        setMonthlyIncome(nextIncome);
        setSavingsGoal(nextGoal);
        setBudgets(nextBudgets);
        setDataHydrated(true);
        writeCache({
          expenses: nextExpenses,
          bills: nextBills,
          monthlyIncome: nextIncome,
          savingsGoal: nextGoal,
          budgets: nextBudgets,
        });
      } catch (err) {
        console.error("Fetch data error:", err);
        if (!cancelled) setDataHydrated(true);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, user?.id, resetToBlank, writeCache]);

  // Debounced sync for monthlyIncome & savingsGoal
  useEffect(() => {
    if (!authToken || !dataHydrated) return;
    writeCache({ monthlyIncome, savingsGoal });
    const t = setTimeout(() => {
      fetch(`${API_URL}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ monthly_income: monthlyIncome, savings_goal: savingsGoal, opening_balance: 0 }),
      }).catch(() => {});
    }, 650);
    return () => clearTimeout(t);
  }, [monthlyIncome, savingsGoal, authToken, dataHydrated, writeCache]);

  // Auth Actions
  const signInOrUp = async (e) => {
    e.preventDefault();
    setAuthMsg("");
    setAuthBusy(true);
    const endpoint = authMode === "signin" ? `${API_URL}/login` : `${API_URL}/signup`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthMsg(data.error || "Authentication failed");
        return;
      }

      if (authMode === "signup") {
        setAuthMsg("Account created! Sign in with your email and password.");
        setAuthMode("signin");
      } else {
        resetToBlank();
        localStorage.setItem("cf_jwt", data.token);
        localStorage.setItem("cf_user", JSON.stringify(data.user));
        setAuthToken(data.token);
        setUser(data.user);
      }
    } catch {
      setAuthMsg("Could not connect to the backend. Check your connection and try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("cf_jwt");
    localStorage.removeItem("cf_user");
    setAuthToken(null);
    setUser(null);
    resetToBlank();
    setActiveTab("overview");
  };

  // Financial Calculations
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol || "$";

  const availableMonths = useMemo(() => {
    const set = new Set([currentMonthStr]);
    expenses.forEach((e) => {
      if (e.date && e.date.length >= 7) set.add(e.date.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses, currentMonthStr]);

  const activeMonth = monthFilter === "All" ? currentMonthStr : monthFilter;

  const daysInMonth = useMemo(() => {
    const [y, m] = activeMonth.split("-").map(Number);
    return y && m ? new Date(y, m, 0).getDate() : 30;
  }, [activeMonth]);

  const daysPassed = activeMonth === currentMonthStr ? Math.min(clockNow.getDate(), daysInMonth) : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - daysPassed);

  const monthExpenses = useMemo(
    () => (monthFilter === "All" ? expenses : expenses.filter((e) => e.date?.startsWith(monthFilter))),
    [expenses, monthFilter]
  );

  const total = useMemo(() => monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [monthExpenses]);
  const balance = monthlyIncome - total;
  const savings = Math.max(balance, 0);
  const savingsPct = savingsGoal > 0 ? Math.min(Math.round((savings / savingsGoal) * 100), 100) : 0;
  const dailyAvg = daysPassed > 0 ? total / daysPassed : 0;
  const projected = Math.round(dailyAvg * daysInMonth);

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      const cat = e.category || "Other";
      map[cat] = (map[cat] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses]);

  const overBudgetCats = useMemo(
    () =>
      CATEGORIES.filter((c) => {
        const spent = byCategory.find((x) => x.name === c)?.value || 0;
        const limit = budgets[c] || 0;
        return limit > 0 && spent > limit;
      }),
    [byCategory, budgets]
  );

  // Chart Series: Daily Cumulative Burn vs Monthly Pace
  const dailySeries = useMemo(() => {
    const targetMonth = activeMonth;
    const perDay = {};
    expenses
      .filter((e) => e.date?.startsWith(targetMonth))
      .forEach((e) => {
        const day = Number(e.date.slice(8, 10));
        if (day >= 1 && day <= daysInMonth) {
          perDay[day] = (perDay[day] || 0) + Number(e.amount || 0);
        }
      });

    let running = 0;
    const list = [];
    const capDay = targetMonth === currentMonthStr ? daysPassed : daysInMonth;
    const dailyPace = monthlyIncome > 0 ? monthlyIncome / daysInMonth : 0;
    for (let d = 1; d <= capDay; d++) {
      running += perDay[d] || 0;
      list.push({
        label: `${targetMonth.slice(5)}/${d}`,
        Spent: Number(running.toFixed(2)),
        Pace: Number((dailyPace * d).toFixed(2)),
      });
    }
    return list;
  }, [expenses, activeMonth, daysInMonth, daysPassed, currentMonthStr, monthlyIncome]);

  // Chart Series: 6-Month Cashflow
  const sixMonthSeries = useMemo(() => {
    const [cy, cm] = currentMonthStr.split("-").map(Number);
    const rows = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(cy, cm - 1 - offset, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const spent = expenses
        .filter((e) => e.date?.startsWith(ym))
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      rows.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        Spent: Number(spent.toFixed(2)),
        Income: monthlyIncome,
      });
    }
    return rows;
  }, [expenses, currentMonthStr, monthlyIncome]);

  // Filtered & Sorted Ledger
  const isFixedExpense = (e) => e.frequency && e.frequency !== "One-time";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = monthExpenses.filter((e) => {
      if (q && !e.title.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false;
      if (categoryFilter !== "All" && e.category !== categoryFilter) return false;
      if (typeFilter === "Fixed" && !isFixedExpense(e)) return false;
      if (typeFilter === "Flexible" && isFixedExpense(e)) return false;
      if (selectedHeatDay && !e.date?.startsWith(`${activeMonth}-${String(selectedHeatDay).padStart(2, "0")}`)) {
        return false;
      }
      return true;
    });
    if (sortBy === "newest") list = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
    if (sortBy === "oldest") list = [...list].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id);
    if (sortBy === "highest") list = [...list].sort((a, b) => b.amount - a.amount);
    if (sortBy === "lowest") list = [...list].sort((a, b) => a.amount - b.amount);
    return list;
  }, [monthExpenses, search, categoryFilter, typeFilter, sortBy, selectedHeatDay, activeMonth]);

  const fixedList = useMemo(() => filtered.filter(isFixedExpense), [filtered]);
  const flexList = useMemo(() => filtered.filter((e) => !isFixedExpense(e)), [filtered]);
  const fixedTotal = useMemo(() => fixedList.reduce((s, e) => s + Number(e.amount || 0), 0), [fixedList]);
  const flexTotal = useMemo(() => flexList.reduce((s, e) => s + Number(e.amount || 0), 0), [flexList]);

  // Animated KPI Figures
  const animatedIncome = useCountUp(monthlyIncome);
  const animatedTotal = useCountUp(total);
  const animatedBalance = useCountUp(balance);
  const animatedSavings = useCountUp(savings);
  const spentPct = monthlyIncome > 0 ? Math.min(total / monthlyIncome, 1) : 0;
  const rawSpentPct = monthlyIncome > 0 ? Math.round((total / monthlyIncome) * 100) : 0;
  const animatedSpentPct = useCountUp(spentPct);

  // Calendar Heatmap Geometry
  const heatmapData = useMemo(() => {
    const [hy, hm] = activeMonth.split("-").map(Number);
    const totalDays = hy && hm ? new Date(hy, hm, 0).getDate() : 30;
    const firstWeekday = hy && hm ? new Date(hy, hm - 1, 1).getDay() : 0;
    const dayTotals = {};
    expenses
      .filter((e) => e.date?.startsWith(activeMonth))
      .forEach((e) => {
        const d = Number(e.date.slice(8, 10));
        dayTotals[d] = (dayTotals[d] || 0) + Number(e.amount || 0);
      });
    return { totalDays, firstWeekday, dayTotals };
  }, [expenses, activeMonth]);

  const heatLevel = (amt) => (amt <= 0 ? 0 : amt < 25 ? 1 : amt < 75 ? 2 : amt < 160 ? 3 : 4);

  // Expense Mutations (Worker + Optimistic Cache)
  const createExpense = async (cleanTitle, num, cat, d, freq) => {
    const tempId = Date.now() + Math.floor(Math.random() * 1000);
    const optimistic = { id: tempId, title: cleanTitle, amount: num, category: cat, date: d, frequency: freq || "One-time" };
    const nextList = [optimistic, ...expenses];
    setExpenses(nextList);
    writeCache({ expenses: nextList });

    if (authToken) {
      try {
        const res = await fetch(`${API_URL}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ title: cleanTitle, amount: num, category: cat, date: d, frequency: freq || "One-time" }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.id) {
            setExpenses((prev) => {
              const synced = prev.map((item) => (item.id === tempId ? { ...item, id: data.id } : item));
              writeCache({ expenses: synced });
              return synced;
            });
          }
        }
      } catch {}
    }
  };

  const handleAddModalSubmit = (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const num = Number(amount);
    if (!cleanTitle) {
      setError("Please enter a description.");
      return;
    }
    if (!Number.isFinite(num) || num <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    setError("");
    createExpense(cleanTitle, num, category, date, frequency);
    setTitle("");
    setAmount("");
    setFrequency("One-time");
    setShowAddModal(false);
    setStatusMsg("Expense recorded.");
  };

  const handleQuickAdd = (e) => {
    e.preventDefault();
    const num = Number(quickAmount);
    const t = quickTitle.trim() || quickCategory;
    if (!Number.isFinite(num) || num <= 0) {
      setError("Quick add needs an amount greater than zero.");
      return;
    }
    setError("");
    createExpense(t, num, quickCategory, todayStr, quickFreq);
    setQuickAmount("");
    setQuickTitle("");
    setQuickFreq("One-time");
  };

  const deleteExpense = (id) => {
    const found = expenses.find((e) => e.id === id);
    if (!found) return;
    const nextList = expenses.filter((e) => e.id !== id);
    setExpenses(nextList);
    writeCache({ expenses: nextList });
    setLastDeleted(found);

    if (authToken) {
      fetch(`${API_URL}/expenses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    createExpense(lastDeleted.title, lastDeleted.amount, lastDeleted.category, lastDeleted.date, lastDeleted.frequency);
    setLastDeleted(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditAmount(String(item.amount));
    setEditCategory(item.category);
    setEditFrequency(item.frequency || "One-time");
    setEditDate(item.date);
  };

  const saveEdit = () => {
    const cleanTitle = editTitle.trim();
    const num = Number(editAmount);
    if (!cleanTitle || !Number.isFinite(num) || num <= 0 || !editDate) {
      setError("Please provide a valid title, positive amount, and date.");
      return;
    }
    setError("");
    const updated = {
      id: editingId,
      title: cleanTitle,
      amount: num,
      category: editCategory,
      frequency: editFrequency,
      date: editDate,
    };
    const nextList = expenses.map((x) => (x.id === editingId ? updated : x));
    setExpenses(nextList);
    writeCache({ expenses: nextList });
    setEditingId(null);

    if (authToken) {
      fetch(`${API_URL}/expenses/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(updated),
      }).catch(() => {});
    }
  };

  // Budget & Bill Mutations
  const updateBudgetLimit = (cat, val) => {
    const limit = Math.max(0, Number(val) || 0);
    const nextBudgets = { ...budgets, [cat]: limit };
    setBudgets(nextBudgets);
    writeCache({ budgets: nextBudgets });

    if (authToken) {
      fetch(`${API_URL}/budgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ category: cat, limit_amount: limit }),
      }).catch(() => {});
    }
  };

  const addBill = async (e) => {
    e.preventDefault();
    const num = Number(billAmount);
    if (!billTitle.trim() || !Number.isFinite(num) || num <= 0 || !billDue) return;
    const tempId = Date.now();
    const newBill = { id: tempId, title: billTitle.trim(), amount: num, dueDate: billDue, paid: false };
    const nextBills = [...bills, newBill].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    setBills(nextBills);
    writeCache({ bills: nextBills });
    setBillTitle("");
    setBillAmount("");

    if (authToken) {
      try {
        const res = await fetch(`${API_URL}/bills`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ title: newBill.title, amount: newBill.amount, due_date: newBill.dueDate, paid: false }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.id) {
            setBills((prev) => {
              const synced = prev.map((b) => (b.id === tempId ? { ...b, id: data.id } : b));
              writeCache({ bills: synced });
              return synced;
            });
          }
        }
      } catch {}
    }
  };

  const toggleBillPaid = (bill) => {
    const nextPaid = !bill.paid;
    const nextBills = bills.map((b) => (b.id === bill.id ? { ...b, paid: nextPaid } : b));
    setBills(nextBills);
    writeCache({ bills: nextBills });
    if (authToken) {
      fetch(`${API_URL}/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ paid: nextPaid }),
      }).catch(() => {});
    }
  };

  const deleteBill = (id) => {
    const nextBills = bills.filter((b) => b.id !== id);
    setBills(nextBills);
    writeCache({ bills: nextBills });
    if (authToken) {
      fetch(`${API_URL}/bills/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
  };

  const recordBillAsExpense = (bill) => {
    createExpense(bill.title, Number(bill.amount), "Housing", todayStr, "Monthly");
    if (!bill.paid) toggleBillPaid(bill);
    setStatusMsg(`Recorded "${bill.title}" in expenses.`);
  };

  // CSV / JSON Tools
  const exportCSV = () => {
    const header = "Title,Amount,Category,Date,Frequency\n";
    const rows = expenses
      .map((e) => `"${e.title.replace(/"/g, '""')}",${e.amount},${e.category},${e.date},${e.frequency || "One-time"}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSVLine = (line) => {
    const m = line.match(/"([^"]*)"|[^,]+/g) || [];
    return m.map((s) => s.replace(/^"|"$/g, "").trim());
  };

  const importCSV = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    let addedCount = 0;
    for (const line of lines) {
      if (line.toLowerCase().startsWith("title,")) continue;
      const parts = parseCSVLine(line);
      if (parts.length < 2) continue;
      const amt = Number(parts[1]);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const cleanTitle = parts[0] || "Imported expense";
      const cat = CATEGORIES.includes(parts[2]) ? parts[2] : "Other";
      const d = parts[3] && /^\d{4}-\d{2}-\d{2}$/.test(parts[3]) ? parts[3] : todayStr;
      const freq = FREQUENCIES.includes(parts[4]) ? parts[4] : "One-time";
      await createExpense(cleanTitle, amt, cat, d, freq);
      addedCount++;
    }
    setStatusMsg(addedCount > 0 ? `Imported ${addedCount} expenses.` : "No valid rows found in CSV.");
    ev.target.value = "";
  };

  const backupJSON = () => {
    const data = { exportedAt: todayStr, monthlyIncome, savingsGoal, currency, budgets, bills, expenses };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `money-dashboard-backup-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg("Backup JSON downloaded.");
  };

  const catColors = darkMode ? CAT_COLORS_DARK : CAT_COLORS_LIGHT;

  const renderLedgerRow = (item) => {
    const isEditing = editingId === item.id;
    return (
      <div key={item.id} className="ledger-row">
        {isEditing ? (
          <div className="edit-inline">
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Description" />
            <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Amount" />
            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={editFrequency} onChange={(e) => setEditFrequency(e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            <div className="row-actions">
              <button type="button" onClick={saveEdit} aria-label="Save changes">
                <Check size={15} /> Save
              </button>
              <button type="button" className="ghost-btn" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                <X size={15} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="ledger-main">
              <span className="ledger-title">{item.title}</span>
              <div className="ledger-meta">
                <span>{item.category}</span>
                {item.frequency && item.frequency !== "One-time" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.frequency}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="mono">{item.date}</span>
              </div>
            </div>
            <div className="ledger-right">
              <strong className="row-amount">
                {currencySymbol}
                {Number(item.amount).toFixed(2)}
              </strong>
              <div className="row-actions">
                <button type="button" className="row-icon-btn" onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}>
                  <Pencil size={14} />
                </button>
                <button type="button" className="row-icon-btn del" onClick={() => deleteExpense(item.id)} aria-label={`Delete ${item.title}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // --- LOGIN / SIGNUP SCREEN ---
  if (!user) {
    return (
      <div className={`app login-page ${darkMode ? "dark" : ""}`}>
        <ThreeBackground dark={darkMode} />
        <div className="login-top">
          <div className="brand-lockup">
            <img src="/favicon.svg?v=2" alt="" className="brand-icon" width="32" height="32" />
            <span className="brand-mark">
              <span className="brand-primary">Money</span> <span className="brand-accent">Dashboard</span>
            </span>
          </div>
          <button type="button" className="ghost-btn" onClick={toggleTheme}>
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            <span>{darkMode ? "Light" : "Dark"}</span>
          </button>
        </div>

        <div className="login-wrap">
          <div className="login-card">
            <div className="login-brand">
              <img src="/favicon.svg?v=2" alt="Money Dashboard logo" className="login-favicon" width="50" height="50" />
              <h1 className="brand-mark">
                <span className="brand-primary">Money</span> <span className="brand-accent">Dashboard</span>
              </h1>
            </div>
            <h2>{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p>{authMode === "signup" ? "Sign up to track expenses, budgets, and savings across devices." : "Sign in to view your ledger and spending analytics."}</p>
            <form onSubmit={signInOrUp} className="login-form">
              <div className="field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="login-password"
                    type={showAuthPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={{ width: "100%", paddingRight: 42 }}
                    required
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setShowAuthPassword(!showAuthPassword)}
                    aria-label={showAuthPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, minHeight: 32, border: "none", background: "transparent" }}
                  >
                    {showAuthPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {authMsg && <div className="form-error">{authMsg}</div>}
              <button type="submit" disabled={authBusy}>
                <LogIn size={16} />
                <span>{authBusy ? "Please wait..." : authMode === "signup" ? "Create Account" : "Sign In"}</span>
              </button>
            </form>
            <button
              type="button"
              className="login-toggle"
              onClick={() => {
                setAuthMode(authMode === "signup" ? "signin" : "signup");
                setAuthMsg("");
              }}
            >
              {authMode === "signup" ? "Already have an account? Sign in" : "No account yet? Create one"}
            </button>
            <p className="login-note">
              <Lock size={13} />
              <span>Your ledger is stored securely under your account.</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <ThreeBackground dark={darkMode} />

      {/* 3-Zone Top Bar */}
      <nav className="topbar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <img src="/favicon.svg?v=2" alt="" className="brand-icon" width="32" height="32" />
          <span className="brand-mark">
            <span className="brand-primary">Money</span> <span className="brand-accent">Dashboard</span>
          </span>
        </div>

        <div className="nav-links" role="tablist">
          {[
            { id: "overview", label: "Overview" },
            { id: "transactions", label: "Transactions" },
            { id: "budgets", label: "Budgets & Bills" },
            { id: "settings", label: "Settings" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`nav-link ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            <span>Add Expense</span>
          </button>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Light mode" : "Dark mode"}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Workspace Control Strip */}
      <section className="workspace-bar" aria-label="Workspace summary and targets">
        <div className="workspace-greeting">
          <h1>{formatShortMonth(activeMonth)} Cashflow</h1>
          <div className="workspace-meta">
            <span>{user.email}</span>
            <span aria-hidden="true">·</span>
            <span>{daysLeft} days left in period</span>
            <span aria-hidden="true">·</span>
            <span className="num">
              Projected: {currencySymbol}
              {projected.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="workspace-controls">
          <select aria-label="Filter month" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setSelectedHeatDay(null); }}>
            <option value="All">All Months</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>
                {formatShortMonth(ym)}
              </option>
            ))}
          </select>

          <label className="inline-field">
            <span>Income {currencySymbol}</span>
            <input
              type="number"
              min="0"
              value={monthlyIncome || ""}
              placeholder="0"
              onChange={(e) => setMonthlyIncome(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>

          <label className="inline-field">
            <span>Goal {currencySymbol}</span>
            <input
              type="number"
              min="0"
              value={savingsGoal || ""}
              placeholder="0"
              onChange={(e) => setSavingsGoal(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>

          <button type="button" className="ghost-btn" onClick={exportCSV} disabled={expenses.length === 0}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* Status or Error Notifications */}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {statusMsg && (
        <div className="alert-banner" style={{ borderColor: "var(--good)", background: "var(--good-tint)", color: "var(--good)" }}>
          <div className="alert-left">
            <Check size={16} />
            <span>{statusMsg}</span>
          </div>
        </div>
      )}

      {(overBudgetCats.length > 0 || (balance < 0 && monthlyIncome > 0)) && expenses.length > 0 && (
        <div className={`alert-banner ${balance < 0 ? "danger" : ""}`}>
          <div className="alert-left">
            <AlertTriangle size={16} />
            <span>
              {overBudgetCats.length > 0 ? `Over monthly limit in ${overBudgetCats.join(", ")}. ` : ""}
              {balance < 0 ? `Spending exceeds income by ${currencySymbol}${Math.abs(balance).toFixed(2)}. ` : ""}
              {projected > monthlyIncome && monthlyIncome > 0 ? `Current pace projects ${currencySymbol}${projected} by month end.` : ""}
            </span>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setActiveTab("budgets")}>
            Review Budgets
          </button>
        </div>
      )}

      {/* ==================== TAB 1: OVERVIEW ==================== */}
      {activeTab === "overview" && (
        <>
          {/* 5-Card KPI Grid */}
          <div className="stats-grid">
            <div className="card stat">
              <div className="stat-icon income">
                <Wallet size={20} />
              </div>
              <div>
                <span className="stat-label">Monthly Income</span>
                <strong>
                  {currencySymbol}
                  {animatedIncome.toFixed(2)}
                </strong>
                <span className="stat-note">
                  {monthlyIncome > 0 ? `${currencySymbol}${(monthlyIncome / daysInMonth).toFixed(2)} / day budget` : "Set income above"}
                </span>
              </div>
            </div>

            <div className="card stat">
              <div className="stat-icon spent">
                <TrendingDown size={20} />
              </div>
              <div>
                <span className="stat-label">Total Spent</span>
                <strong>
                  {currencySymbol}
                  {animatedTotal.toFixed(2)}
                </strong>
                <span className="stat-note">
                  {monthExpenses.length} {monthExpenses.length === 1 ? "entry" : "entries"} · {currencySymbol}
                  {dailyAvg.toFixed(2)} / day avg
                </span>
              </div>
            </div>

            <div className="card stat">
              <div className="stat-icon balance">
                <TrendingUp size={20} />
              </div>
              <div>
                <span className="stat-label">Balance Left</span>
                <strong className={balance < 0 ? "danger" : "good"}>
                  {currencySymbol}
                  {animatedBalance.toFixed(2)}
                </strong>
                <span className="stat-note">{balance >= 0 ? "Available funds" : "Deficit"}</span>
              </div>
            </div>

            <div className="card stat">
              <div className="stat-icon savings">
                <PiggyBank size={20} />
              </div>
              <div>
                <span className="stat-label">Savings</span>
                <strong>
                  {currencySymbol}
                  {animatedSavings.toFixed(2)}
                </strong>
                <span className="stat-note">
                  {savingsGoal > 0 ? `${savingsPct}% of ${currencySymbol}${savingsGoal} goal` : "No goal set"}
                </span>
              </div>
            </div>

            <div className="card stat ring-card">
              <ProgressRing pct={animatedSpentPct} size={88} stroke={9} over={rawSpentPct > 100}>
                <strong>{Math.min(999, Math.round(animatedSpentPct * 100))}%</strong>
                <span>used</span>
              </ProgressRing>
              <div>
                <span className="stat-label">Income Used</span>
                <strong className={rawSpentPct > 100 ? "danger" : rawSpentPct > 80 ? "warn" : "good"}>
                  {rawSpentPct > 100 ? "Over" : rawSpentPct > 80 ? "Caution" : "Healthy"}
                </strong>
                <span className="stat-note">{monthlyIncome > 0 ? `${rawSpentPct}% of income` : "Add income"}</span>
              </div>
            </div>
          </div>

          {/* Quick Add Strip */}
          <div className="card quick-add-card">
            <div className="card-head" style={{ marginBottom: 12 }}>
              <h2>
                <Zap size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Quick Add Expense
              </h2>
              <span className="card-sub">Logs immediately for {todayStr}</span>
            </div>
            <form onSubmit={handleQuickAdd} className="quick-form">
              <input
                type="number"
                step="0.01"
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value)}
                placeholder={`Amount (${currencySymbol})`}
                required
              />
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Description (e.g. Groceries, Metro card)"
              />
              <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={quickFreq} onChange={(e) => setQuickFreq(e.target.value)}>
                {FREQUENCIES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <button type="submit">
                <Plus size={16} />
                <span>Add Entry</span>
              </button>
            </form>
          </div>

          {/* Recharts Visual Analytics Row */}
          <div className="charts-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Spending Pace & Cashflow</h3>
                  <span className="card-sub">
                    {chartView === "daily" ? `Cumulative spend vs daily budget (${formatShortMonth(activeMonth)})` : "6-month income vs total spend"}
                  </span>
                </div>
                <div className="segmented" role="group" aria-label="Chart range">
                  <button type="button" className={`seg-btn ${chartView === "daily" ? "active" : ""}`} onClick={() => setChartView("daily")}>
                    Daily Pace
                  </button>
                  <button type="button" className={`seg-btn ${chartView === "monthly" ? "active" : ""}`} onClick={() => setChartView("monthly")}>
                    6 Months
                  </button>
                </div>
              </div>

              {expenses.length === 0 ? (
                <div className="empty-state" style={{ padding: "48px 16px" }}>
                  <p>Log your first expense to visualize your spending pace against your income target.</p>
                  <button type="button" onClick={() => setShowAddModal(true)}>
                    <Plus size={15} />
                    <span>Log First Expense</span>
                  </button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartView === "daily" ? dailySeries : sixMonthSeries} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={darkMode ? "#38bdf8" : "#0284c7"} stopOpacity={0.34} />
                        <stop offset="100%" stopColor={darkMode ? "#38bdf8" : "#0284c7"} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                    <YAxis tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `${currencySymbol}${v}`} />
                    <Tooltip content={<ChartTooltip currencySymbol={currencySymbol} />} />
                    {monthlyIncome > 0 && (
                      <Area
                        type="monotone"
                        dataKey={chartView === "daily" ? "Pace" : "Income"}
                        stroke={darkMode ? "#34d399" : "#059669"}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        fill="transparent"
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="Spent"
                      stroke={darkMode ? "#38bdf8" : "#0284c7"}
                      strokeWidth={2.5}
                      fill="url(#spentGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Category Mix</h3>
                  <span className="card-sub">Click a category to filter</span>
                </div>
                {categoryFilter !== "All" && (
                  <button type="button" className="ghost-btn" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={() => setCategoryFilter("All")}>
                    Clear filter
                  </button>
                )}
              </div>

              {byCategory.length === 0 ? (
                <div className="empty-state" style={{ padding: "48px 16px" }}>
                  <p>Category shares will appear once you add transactions.</p>
                </div>
              ) : (
                <div className="donut-wrap">
                  <div style={{ width: 170, height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2}>
                          {byCategory.map((entry, idx) => (
                            <Cell
                              key={entry.name}
                              fill={catColors[CATEGORIES.indexOf(entry.name) >= 0 ? CATEGORIES.indexOf(entry.name) : idx % catColors.length]}
                              opacity={categoryFilter === "All" || categoryFilter === entry.name ? 1 : 0.3}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip currencySymbol={currencySymbol} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="cat-breakdown">
                    {byCategory.map((entry, idx) => {
                      const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                      const color = catColors[CATEGORIES.indexOf(entry.name) >= 0 ? CATEGORIES.indexOf(entry.name) : idx % catColors.length];
                      return (
                        <button
                          key={entry.name}
                          type="button"
                          className="cat-row"
                          onClick={() => setCategoryFilter(categoryFilter === entry.name ? "All" : entry.name)}
                          style={{
                            outline: categoryFilter === entry.name ? "1px solid var(--accent)" : "none",
                          }}
                        >
                          <span className="cat-row-left">
                            <span className="swatch" style={{ background: color }} />
                            <span>{entry.name}</span>
                          </span>
                          <span className="cat-row-right">
                            {currencySymbol}
                            {entry.value.toFixed(0)} · {pct}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lower Overview Split: Recent Ledger + Budget Snapshot */}
          <div className="overview-lower">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Recent Transactions</h3>
                  <span className="card-sub">
                    {filtered.length} matching · Fixed {currencySymbol}
                    {fixedTotal.toFixed(0)} · Flexible {currencySymbol}
                    {flexTotal.toFixed(0)}
                  </span>
                </div>
                <button type="button" className="ghost-btn" style={{ minHeight: 34, padding: "5px 12px", fontSize: 13 }} onClick={() => setActiveTab("transactions")}>
                  View all
                </button>
              </div>

              <div className="ledger-toolbar">
                <div className="search-box">
                  <Search size={15} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions..." />
                </div>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="All">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {dataLoading ? (
                <div>
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <p>No transactions match your current filter.</p>
                  <button type="button" onClick={() => setShowAddModal(true)}>
                    <Plus size={15} />
                    <span>Add Expense</span>
                  </button>
                </div>
              ) : (
                <div className="ledger-list">{filtered.slice(0, 8).map(renderLedgerRow)}</div>
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Monthly Budget Health</h3>
                  <span className="card-sub">Category spend vs target limits</span>
                </div>
                <button type="button" className="ghost-btn" style={{ minHeight: 34, padding: "5px 12px", fontSize: 13 }} onClick={() => setActiveTab("budgets")}>
                  Edit limits
                </button>
              </div>

              <div className="budget-list">
                {CATEGORIES.map((cat) => {
                  const spent = byCategory.find((x) => x.name === cat)?.value || 0;
                  const limit = budgets[cat] || 0;
                  const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
                  const state = limit > 0 && spent > limit ? "over" : limit > 0 && spent >= limit * 0.8 ? "warn" : "ok";
                  return (
                    <div key={cat}>
                      <div className="budget-item-head">
                        <span className="budget-name">{cat}</span>
                        <span className="budget-nums">
                          {currencySymbol}
                          {spent.toFixed(0)} / {currencySymbol}
                          {limit.toFixed(0)}
                        </span>
                      </div>
                      <div className="budget-track">
                        <div className={`budget-fill ${state === "over" ? "over" : state === "warn" ? "warn" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`budget-status-text ${state === "over" ? "danger" : state === "warn" ? "warn" : ""}`}>
                        {state === "over"
                          ? `Over limit by ${currencySymbol}${(spent - limit).toFixed(0)}`
                          : state === "warn"
                          ? `Approaching limit (${pct}%)`
                          : `${currencySymbol}${Math.max(0, limit - spent).toFixed(0)} remaining`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB 2: TRANSACTIONS & HEATMAP ==================== */}
      {activeTab === "transactions" && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div>
                <h2>Full Transaction Ledger</h2>
                <span className="card-sub">
                  Showing {filtered.length} entries
                  {selectedHeatDay ? ` for ${activeMonth}-${String(selectedHeatDay).padStart(2, "0")}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedHeatDay && (
                  <button type="button" className="ghost-btn" onClick={() => setSelectedHeatDay(null)}>
                    Clear Day Filter
                  </button>
                )}
                <label className="ghost-btn" htmlFor="import-csv-input" style={{ cursor: "pointer", minHeight: 40, padding: "8px 14px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
                  <Upload size={15} />
                  <span>Import CSV</span>
                </label>
                <input id="import-csv-input" type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
                <button type="button" onClick={() => setShowAddModal(true)}>
                  <Plus size={15} />
                  <span>New Expense</span>
                </button>
              </div>
            </div>

            <div className="ledger-toolbar">
              <div className="search-box">
                <Search size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or category..." />
              </div>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="All">All types</option>
                <option value="Fixed">Fixed recurring</option>
                <option value="Flexible">Flexible one-time</option>
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest amount</option>
                <option value="lowest">Lowest amount</option>
              </select>
            </div>
          </div>

          <div className="two-col-grid">
            <div className="card">
              <div className="card-head">
                <h3>Fixed Recurring</h3>
                <span className="num card-sub">
                  {fixedList.length} items · {currencySymbol}
                  {fixedTotal.toFixed(2)}
                </span>
              </div>
              {fixedList.length === 0 ? (
                <div className="empty-state">
                  <p>No recurring fixed expenses in this view.</p>
                </div>
              ) : (
                <div className="ledger-list">{fixedList.map(renderLedgerRow)}</div>
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Flexible One-Time</h3>
                <span className="num card-sub">
                  {flexList.length} items · {currencySymbol}
                  {flexTotal.toFixed(2)}
                </span>
              </div>
              {flexList.length === 0 ? (
                <div className="empty-state">
                  <p>No one-time expenses in this view.</p>
                </div>
              ) : (
                <div className="ledger-list">{flexList.map(renderLedgerRow)}</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>
                  <Calendar size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                  Daily Spending Map — {formatShortMonth(activeMonth)}
                </h3>
                <span className="card-sub">Click any day to filter transactions above</span>
              </div>
              {selectedHeatDay && (
                <button type="button" className="ghost-btn" onClick={() => setSelectedHeatDay(null)}>
                  Show All Days
                </button>
              )}
            </div>

            <div className="heatmap-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="heat-head">
                  {d}
                </div>
              ))}
              {Array.from({ length: heatmapData.firstWeekday }).map((_, idx) => (
                <div key={`blank-${idx}`} className="heat-day blank" />
              ))}
              {Array.from({ length: heatmapData.totalDays }).map((_, idx) => {
                const day = idx + 1;
                const amt = heatmapData.dayTotals[day] || 0;
                const isSelected = selectedHeatDay === day;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`heat-day heat-${heatLevel(amt)}`}
                    onClick={() => setSelectedHeatDay(isSelected ? null : day)}
                    style={{
                      outline: isSelected ? "2px solid var(--accent)" : "none",
                      color: amt > 0 ? "var(--ink)" : "var(--ink-dim)",
                    }}
                  >
                    <span>{day}</span>
                    {amt > 0 && (
                      <small>
                        {currencySymbol}
                        {Math.round(amt)}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB 3: BUDGETS & BILLS ==================== */}
      {activeTab === "budgets" && (
        <div className="two-col-grid">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Category Budget Limits</h2>
                <span className="card-sub">Adjust monthly caps per spending category</span>
              </div>
            </div>
            <div>
              {CATEGORIES.map((cat) => {
                const spent = byCategory.find((x) => x.name === cat)?.value || 0;
                const limit = budgets[cat] || 0;
                const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
                const state = limit > 0 && spent > limit ? "over" : limit > 0 && spent >= limit * 0.8 ? "warn" : "ok";
                return (
                  <div key={cat} className="budget-editor-row">
                    <div>
                      <strong style={{ display: "block", fontSize: 14 }}>{cat}</strong>
                      <span className={`num ${state === "over" ? "danger" : state === "warn" ? "warn" : "good"}`} style={{ fontSize: 12 }}>
                        {currencySymbol}
                        {spent.toFixed(0)} spent
                      </span>
                    </div>
                    <div>
                      <div className="budget-track">
                        <div className={`budget-fill ${state === "over" ? "over" : state === "warn" ? "warn" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="budget-status-text">{limit > 0 ? `${pct}% used` : "No cap set"}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      aria-label={`${cat} monthly budget`}
                      value={limit}
                      onChange={(e) => updateBudgetLimit(cat, e.target.value)}
                      className="mono"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2>Upcoming Bills</h2>
                <span className="card-sub">
                  {bills.filter((b) => !b.paid).length} unpaid ·{" "}
                  <span className="num">
                    {currencySymbol}
                    {bills
                      .filter((b) => !b.paid)
                      .reduce((s, b) => s + Number(b.amount || 0), 0)
                      .toFixed(2)}
                  </span>{" "}
                  due
                </span>
              </div>
            </div>

            <form onSubmit={addBill} className="bill-form">
              <input value={billTitle} onChange={(e) => setBillTitle(e.target.value)} placeholder="Bill name (e.g. Internet)" required />
              <input type="number" step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder={currencySymbol} required />
              <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} required />
              <button type="submit">
                <Plus size={15} />
                <span>Add</span>
              </button>
            </form>

            {bills.length === 0 ? (
              <div className="empty-state">
                <p>Track recurring rent, utilities, and subscriptions to avoid missed due dates.</p>
              </div>
            ) : (
              <div>
                {bills.map((bill) => (
                  <div key={bill.id} className={`bill-row ${bill.paid ? "paid" : ""}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <button
                        type="button"
                        className={`bill-check ${bill.paid ? "done" : ""}`}
                        onClick={() => toggleBillPaid(bill)}
                        aria-label={bill.paid ? `Mark ${bill.title} unpaid` : `Mark ${bill.title} paid`}
                      >
                        {bill.paid && <Check size={14} />}
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <strong className="bill-title" style={{ display: "block", fontSize: 14 }}>
                          {bill.title}
                        </strong>
                        <span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                          Due {bill.dueDate} · {bill.paid ? "Paid" : "Unpaid"}
                        </span>
                      </div>
                    </div>
                    <div className="row-actions">
                      <strong className="row-amount">
                        {currencySymbol}
                        {Number(bill.amount).toFixed(2)}
                      </strong>
                      {!bill.paid && (
                        <button type="button" className="ghost-btn" style={{ minHeight: 34, padding: "4px 10px", fontSize: 12 }} onClick={() => recordBillAsExpense(bill)}>
                          Log Expense
                        </button>
                      )}
                      <button type="button" className="row-icon-btn del" onClick={() => deleteBill(bill.id)} aria-label={`Delete ${bill.title}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 4: SETTINGS ==================== */}
      {activeTab === "settings" && (
        <div className="settings-grid">
          <div className="card">
            <div className="card-head">
              <h2>Appearance & Display</h2>
              <span className="card-sub">Theme and currency formatting</span>
            </div>

            <div className="field" style={{ marginBottom: 20 }}>
              <label>Theme Mode</label>
              <div className="segmented" style={{ width: "fit-content" }}>
                {[
                  { id: "auto", label: "Auto Solar" },
                  { id: "light", label: "Light" },
                  { id: "dark", label: "Dark" },
                ].map((opt) => (
                  <button key={opt.id} type="button" className={`seg-btn ${themeMode === opt.id ? "active" : ""}`} onClick={() => setThemeMode(opt.id)}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                {themeMode === "auto"
                  ? "Follows sunrise and sunset at your local coordinates."
                  : `Locked to ${themeMode === "dark" ? "Midnight Obsidian" : "Silver Pearl"} mode.`}
              </span>
            </div>

            <div className="field">
              <label>Currency Display</label>
              <div style={{ position: "relative", maxWidth: 280 }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <span>
                    {currencySymbol} {currency}
                  </span>
                  <span style={{ fontSize: 11 }}>{showCurrencyDropdown ? "▲" : "▼"}</span>
                </button>
                {showCurrencyDropdown && (
                  <div className="currency-dropdown">
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className="currency-option"
                        onClick={() => {
                          setCurrency(c.code);
                          setShowCurrencyDropdown(false);
                        }}
                      >
                        <span>
                          {c.symbol} {c.code}
                        </span>
                        <small style={{ color: "var(--ink-dim)" }}>{c.label}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Account & Data</h2>
              <span className="card-sub">Export, import, and session management</span>
            </div>

            <div className="field" style={{ marginBottom: 18 }}>
              <label>Signed in as</label>
              <div style={{ fontWeight: 600 }}>{user.email}</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="ghost-btn" onClick={exportCSV}>
                <Download size={15} />
                <span>Export CSV</span>
              </button>
              <button type="button" className="ghost-btn" onClick={backupJSON}>
                <Download size={15} />
                <span>Backup JSON</span>
              </button>
              <button type="button" className="danger-ghost-btn" onClick={signOut}>
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: NEW EXPENSE ==================== */}
      {showAddModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-modal-title" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-head" style={{ marginBottom: 4 }}>
              <h2 id="add-modal-title">Log New Expense</h2>
              <button type="button" className="icon-btn" onClick={() => setShowAddModal(false)} aria-label="Close modal">
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-dim)" }}>Add a fixed recurring charge or one-time flexible purchase.</p>

            <form onSubmit={handleAddModalSubmit} className="modal-form">
              <div className="field">
                <label htmlFor="modal-title">Description</label>
                <input id="modal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Apartment Rent" autoFocus required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field">
                  <label htmlFor="modal-amount">Amount ({currencySymbol})</label>
                  <input id="modal-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
                </div>
                <div className="field">
                  <label htmlFor="modal-date">Date</label>
                  <input id="modal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field">
                  <label htmlFor="modal-category">Category</label>
                  <select id="modal-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="modal-freq">Frequency</label>
                  <select id="modal-freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    {FREQUENCIES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" className="ghost-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit">
                  <Plus size={15} />
                  <span>Save Expense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {lastDeleted && (
        <div className="toast" role="status">
          <span>
            Removed {lastDeleted.title} ({currencySymbol}
            {Number(lastDeleted.amount).toFixed(2)})
          </span>
          <button type="button" onClick={undoDelete}>
            <Undo2 size={14} />
            <span>Undo</span>
          </button>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend } from "recharts";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Search, Trash2, Target, Download, RotateCcw, AlertTriangle, Undo2, Plus, Pencil, Moon, Sun, CalendarDays, Upload, Printer, Check, LogIn, LogOut, Zap, Lock, ShieldCheck, Sparkles } from "lucide-react";

// REAL-LIFE VERSION - START BLANK
// No sample expenses, bills or sections. Add only your real data.
// Supabase schema: expense_dashboard (see supabase-schema.sql - one main file)
// SUPABASE ONLY - no local mode, no guest mode.
// Sign in is required. All expenses, bills, sections and settings live in Supabase
// schema expense_dashboard, filtered by user_id. Nothing is saved in localStorage
// except the dark/light theme, which is just a display setting.
// Deploy: see netlify.toml + manifest.webmanifest

const SUPABASE_SCHEMA = "expense_dashboard";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabaseClient = null;
async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const mod = await import("@supabase/supabase-js");
    supabaseClient = mod.createClient(supabaseUrl, supabaseKey);
    return supabaseClient;
  } catch { return null; }
}

const categories = ["Food", "Housing", "Transport", "Entertainment", "Shopping", "Other"];
const frequencies = ["One-time", "Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"];
const budgets = { Food: 300, Housing: 1000, Transport: 150, Entertainment: 100, Shopping: 250, Other: 100 };
const COLORS = ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#94a3b8"];








export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState("One-time");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [liveNow, setLiveNow] = useState(new Date());
  const [sortBy, setSortBy] = useState("newest");
  const [error, setError] = useState("");
  const [lastDeleted, setLastDeleted] = useState(null);
  const [sections, setSections] = useState([]);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem("theme_dark") === "true"; } catch { return false; } });
  const [syncStatus, setSyncStatus] = useState(supabaseUrl ? "loading" : "not-configured");
  const [syncError, setSyncError] = useState("");
  // Show the real Supabase reason instead of just the word "error".
  const failSync = (err) => {
    const msg = err && err.message ? err.message : "Unknown Supabase error";
    setSyncError(msg); setSyncStatus("error"); console.error("Supabase error:", err);
  };
  // Save the user's settings row without upsert/onConflict.
  // onConflict needs a unique constraint on user_id, and the live
  // settings table (old v1, id = 1 as primary key) does not have one,
  // which is what caused "no unique or exclusion constraint matching
  // the ON CONFLICT specification". Update if the row exists, else insert.
  const saveSettingsRow = async (db, uid, values) => {
    const { data: existing } = await db.from("settings").select("user_id").eq("user_id", uid).maybeSingle();
    if (existing) return await db.from("settings").update(values).eq("user_id", uid);
    return await db.from("settings").insert({ user_id: uid, ...values });
  };
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [authMsg, setAuthMsg] = useState("");
  const [authStep, setAuthStep] = useState("form"); // "form" or "verify"
  const [verifyCode, setVerifyCode] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Food");
  const [editDate, setEditDate] = useState("");
  const [editFrequency, setEditFrequency] = useState("One-time");
  const [bills, setBills] = useState([]);
  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDue, setBillDue] = useState(new Date().toISOString().slice(0, 10));
  const [showReport, setShowReport] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [closedMonths, setClosedMonths] = useState([]); // session only, not saved in Supabase yet
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const [history, setHistory] = useState([]); // session only
  const [quickAmount, setQuickAmount] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");

  const resetToBlank = () => {
    setExpenses([]); setBills([]); setSections([]);
    setMonthlyIncome(0); setSavingsGoal(0); setOpeningBalance(0);
    setClosedMonths([]); setHistory([]); setLastDeleted(null);
    setPendingDuplicate(null); setError("");
  };

  // Only the dark/light theme lives in localStorage - it is a display
  // setting, not your money data. All money data is in Supabase only.
  useEffect(() => { try { localStorage.setItem("theme_dark", darkMode ? "true" : "false"); } catch { } }, [darkMode]);
  // Real-time date and time, ticks every second.
  useEffect(() => {
    const t = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!lastDeleted) return;
    const t = setTimeout(() => setLastDeleted(null), 6000);
    return () => clearTimeout(t);
  }, [lastDeleted]);

  const logHistory = (action, detail) => {
    setHistory((prev) => [{ at: new Date().toISOString(), action, detail }, ...prev].slice(0, 50));
  };
  const isMonthClosed = (monthStr) => monthStr !== "All" && closedMonths.includes(monthStr);
  const currentMonthClosed = isMonthClosed(monthFilter);

  // Auth: get session on start
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = await getSupabase();
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!cancelled && data.session) setUser(data.session.user);
      client.auth.onAuthStateChange((_event, session) => {
        if (!cancelled) setUser(session ? session.user : null);
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const signInOrUp = async (e) => {
    e.preventDefault();
    const client = await getSupabase();
    if (!client) { setAuthMsg("Supabase is not configured yet. Add .env keys first."); return; }
    setAuthMsg("");
    // Sign-in: email + password, straight in, no code needed.
    if (authMode === "signin") {
      const { data, error } = await client.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) { setAuthMsg(error.message); return; }
      if (data.user) {
        resetToBlank();
        setUser(data.user);
        setAuthMsg("Signed in.");
      }
      return;
    }
    // Sign-up: create the account, Supabase emails a 6-digit code.
    // The user is NOT signed in yet - they must enter the code first.
    // Tag this account with the app it signed up from, so in Supabase
    // Authentication > Users you can tell it came from the expense
    // dashboard, not your other projects that share this Supabase project.
    // Click a user there, then look at User Metadata: app = "expense-dashboard".
    const { data, error } = await client.auth.signUp({ email: authEmail, password: authPassword, options: { data: { app: "expense-dashboard" } } });
    if (error) { setAuthMsg(error.message); return; }
    if (data.user) {
      setVerifyCode("");
      setAuthStep("verify");
      setAuthMsg(`We sent a 6-digit code to ${authEmail}. Enter it below to verify your email.`);
    } else {
      setAuthMsg("Check your email to confirm, then sign in.");
    }
  };
  // Step 2 of sign-up: check the 6-digit code from the email.
  const verifySignupCode = async (e) => {
    e.preventDefault();
    const client = await getSupabase();
    if (!client) { setAuthMsg("Supabase is not configured yet."); return; }
    const code = verifyCode.trim();
    if (code.length !== 6) { setAuthMsg("That code should be 6 digits. Check your email again."); return; }
    setAuthMsg("");
    const { data, error } = await client.auth.verifyOtp({ email: authEmail, token: code, type: "signup" });
    if (error) { setAuthMsg(error.message); return; }
    const verifiedUser = data.user || data.session?.user;
    if (verifiedUser) {
      resetToBlank();
      setUser(verifiedUser);
      const c = await getSupabase();
      if (c) await saveSettingsRow(c.schema(SUPABASE_SCHEMA), verifiedUser.id, { monthly_income: 0, savings_goal: 0, opening_balance: 0 });
      setAuthStep("form");
      setVerifyCode("");
      setAuthMsg("Email verified. Welcome!");
    }
  };
  const resendSignupCode = async () => {
    const client = await getSupabase();
    if (!client) { setAuthMsg("Supabase is not configured yet."); return; }
    const { error } = await client.auth.resend({ type: "signup", email: authEmail });
    if (error) setAuthMsg(error.message);
    else setAuthMsg(`Sent a new code to ${authEmail}. Check your inbox and spam.`);
  };
  const signOut = async () => {
    const client = await getSupabase();
    if (client) await client.auth.signOut();
    setUser(null);
    resetToBlank();
    setCloudLoaded(false);
    setSyncStatus(supabaseUrl ? "loading" : "not-configured");
  };

  // Supabase load: only for the logged-in user, in expense_dashboard schema
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const client = await getSupabase();
      if (!client) return;
      setSyncStatus("syncing");
      const db = client.schema(SUPABASE_SCHEMA);
      const [expRes, billRes, secRes, itemRes, setRes] = await Promise.all([
        db.from("expenses").select("*").eq("user_id", user.id).order("date", { ascending: false }),
        db.from("bills").select("*").eq("user_id", user.id).order("due_date", { ascending: true }),
        db.from("sections").select("*").eq("user_id", user.id).order("id", { ascending: true }),
        db.from("section_items").select("*").eq("user_id", user.id).order("section_id", { ascending: true }).order("position", { ascending: true }),
        db.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const firstErr = expRes.error || billRes.error || secRes.error || itemRes.error || setRes.error;
      if (firstErr) { failSync(firstErr); setCloudLoaded(false); return; }
      // This load replaces the view completely, even with
      // empty results. A new user with no rows gets a blank dashboard.
      setExpenses((expRes.data || []).map((r) => ({ id: r.id, title: r.title, amount: Number(r.amount), category: r.category || "Other", date: r.date, frequency: r.frequency || "One-time" })));
      setBills((billRes.data || []).map((r) => ({ id: r.id, title: r.title, amount: Number(r.amount), dueDate: r.due_date, paid: !!r.paid })));
      const itemsBySection = {};
      (itemRes.data || []).forEach((r) => {
        if (!itemsBySection[r.section_id]) itemsBySection[r.section_id] = [];
        itemsBySection[r.section_id].push({ id: r.id, name: r.name, amount: Number(r.amount), note: r.note || "" });
      });
      setSections((secRes.data || []).map((s) => ({ id: s.id, title: s.title, items: itemsBySection[s.id] || [] })));
      setMonthlyIncome(setRes.data && setRes.data.monthly_income ? Number(setRes.data.monthly_income) : 0);
      setSavingsGoal(setRes.data && setRes.data.savings_goal ? Number(setRes.data.savings_goal) : 0);
      setOpeningBalance(setRes.data && setRes.data.opening_balance ? Number(setRes.data.opening_balance) : 0);
      setClosedMonths([]);
      setSyncError("");
      setSyncStatus("synced");
      setCloudLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const syncNow = async () => {
    const client = await getSupabase();
    if (!client) { alert("Supabase is not set up yet. Run supabase-schema.sql, add .env keys, run npm install @supabase/supabase-js, and restart."); return; }
    if (!user) { alert("Sign in first. Your data lives in Supabase under your account only."); return; }
    setSyncStatus("syncing");
    const db = client.schema(SUPABASE_SCHEMA);
    await db.from("expenses").delete().eq("user_id", user.id);
    const expPayload = expenses.map((e) => ({ user_id: user.id, title: e.title, amount: e.amount, category: e.category, date: e.date, frequency: e.frequency || "One-time" }));
    const { error: expErr } = await db.from("expenses").insert(expPayload);
    if (expErr) { failSync(expErr); return; }
    await db.from("bills").delete().eq("user_id", user.id);
    const billPayload = bills.map((b) => ({ user_id: user.id, title: b.title, amount: b.amount, due_date: b.dueDate, paid: !!b.paid }));
    const { error: billErr } = await db.from("bills").insert(billPayload);
    if (billErr) { failSync(billErr); return; }
    const { error: setErr } = await saveSettingsRow(db, user.id, { monthly_income: monthlyIncome, savings_goal: savingsGoal, opening_balance: openingBalance });
    if (setErr) { failSync(setErr); return; }
    await db.from("section_items").delete().neq("id", 0);
    await db.from("sections").delete().eq("user_id", user.id);
    for (const section of sections) {
      const { data: secData, error: secErr } = await db.from("sections").insert({ user_id: user.id, title: section.title }).select("id").single();
      if (secErr || !secData) { failSync(secErr || new Error("Could not create section")); return; }
      if (section.items.length > 0) {
        const itemPayload = section.items.map((item, idx) => ({ section_id: secData.id, user_id: user.id, name: item.name, amount: Number(item.amount) || 0, note: item.note || "", position: idx }));
        await db.from("section_items").insert(itemPayload);
      }
    }
    setSyncStatus("synced");
  };

  // Save bills, sections and settings to Supabase. Expenses are saved
  // per-item by syncInsert / syncDelete / syncUpdate, so this does not touch them.
  const saveCloudMeta = async () => {
    const client = await getSupabase();
    if (!client || !user) return false;
    setSyncStatus("saving");
    const db = client.schema(SUPABASE_SCHEMA);
    const { error: setErr } = await saveSettingsRow(db, user.id, { monthly_income: monthlyIncome, savings_goal: savingsGoal, opening_balance: openingBalance });
    if (setErr) { failSync(setErr); return false; }
    await db.from("bills").delete().eq("user_id", user.id);
    const billPayload = bills.map((b) => ({ user_id: user.id, title: b.title, amount: b.amount, due_date: b.dueDate, paid: !!b.paid }));
    if (billPayload.length > 0) { const { error: billErr } = await db.from("bills").insert(billPayload); if (billErr) { failSync(billErr); return false; } }
    await db.from("section_items").delete().eq("user_id", user.id);
    await db.from("sections").delete().eq("user_id", user.id);
    for (const section of sections) {
      const { data: secData, error: secErr } = await db.from("sections").insert({ user_id: user.id, title: section.title }).select("id").single();
      if (secErr || !secData) { failSync(secErr || new Error("Could not create section")); return false; }
      if (section.items.length > 0) {
        const itemPayload = section.items.map((item, idx) => ({ section_id: secData.id, user_id: user.id, name: item.name, amount: Number(item.amount) || 0, note: item.note || "", position: idx }));
        await db.from("section_items").insert(itemPayload);
      }
    }
    setSyncStatus("synced");
    return true;
  };
  // Auto-save: after the cloud load finishes, any change to bills,
  // sections, income or goal is saved to Supabase automatically,
  // 800ms after you stop changing it. No Sync button needed.
  useEffect(() => {
    if (!user || !cloudLoaded) return;
    const t = setTimeout(() => { saveCloudMeta(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, sections, monthlyIncome, savingsGoal, openingBalance, user, cloudLoaded]);

  const syncInsert = async (expense) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").insert({ user_id: user.id, title: expense.title, amount: expense.amount, category: expense.category, date: expense.date, frequency: expense.frequency || "One-time" });
  };
  const syncDelete = async (id) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").delete().eq("id", id).eq("user_id", user.id);
  };
  const syncUpdate = async (expense) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").update({ title: expense.title, amount: expense.amount, category: expense.category, date: expense.date, frequency: expense.frequency || "One-time" }).eq("id", expense.id).eq("user_id", user.id);
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

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [monthExpenses]);

  const topCategory = byCategory.length ? [...byCategory].sort((a, b) => b.value - a.value)[0] : null;
  const topPct = total > 0 && topCategory ? Math.round((topCategory.value / total) * 100) : 0;
  const biggest = monthExpenses.length ? [...monthExpenses].sort((a, b) => b.amount - a.amount)[0] : null;
  const overBudget = categories.filter((c) => (byCategory.find((x) => x.name === c)?.value || 0) > budgets[c]);
  const titleCounts = {};
  expenses.forEach((e) => { titleCounts[e.title] = (titleCounts[e.title] || 0) + 1; });
  const months = ["All", ...new Set([...expenses.map((e) => e.date.slice(0, 7)), ...(monthFilter !== "All" ? [monthFilter] : [])])];

  const filtered = useMemo(() => {
    let list = monthExpenses.filter((e) => {
      const okSearch = e.title.toLowerCase().includes(search.toLowerCase());
      const okFilter = filter === "All" || e.category === filter;
      return okSearch && okFilter;
    });
    if (sortBy === "newest") list = [...list].sort((a, b) => b.date.localeCompare(a.date));
    if (sortBy === "oldest") list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    if (sortBy === "highest") list = [...list].sort((a, b) => b.amount - a.amount);
    if (sortBy === "lowest") list = [...list].sort((a, b) => a.amount - b.amount);
    return list;
  }, [monthExpenses, search, filter, sortBy]);

  // Two boxes: Fixed repeats every month, Flexible is one-off.
  const isFixedExpense = (e) => e.frequency && e.frequency !== "One-time";
  const fixedList = filtered.filter(isFixedExpense);
  const flexList = filtered.filter((e) => !isFixedExpense(e));
  const fixedTotal = fixedList.reduce((s, e) => s + Number(e.amount || 0), 0);
  const flexTotal = flexList.reduce((s, e) => s + Number(e.amount || 0), 0);

  const monthlyData = [
    { month: "Jun", spent: 0, income: monthlyIncome },
    { month: "Jul", spent: 0, income: monthlyIncome },
    { month: "Aug", spent: 0, income: monthlyIncome },
    { month: "Sep", spent: 0, income: monthlyIncome },
    { month: "Oct", spent: 0, income: monthlyIncome },
    { month: "Nov", spent: Number(total.toFixed(2)), income: monthlyIncome },
  ];

  const daysUntil = (due) => {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
    const d = new Date(due + "T00:00:00");
    return Math.ceil((d - today) / 86400000);
  };
  const unpaidBills = bills.filter((b) => !b.paid);
  const unpaidTotal = unpaidBills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const sortedBills = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const addBill = (e) => {
    e.preventDefault();
    const num = Number(billAmount);
    if (!billTitle.trim() || !num || num <= 0 || !billDue) return;
    setBills((prev) => [...prev, { id: Date.now(), title: billTitle.trim(), amount: num, dueDate: billDue, paid: false }]);
    logHistory("Bill added", `${billTitle.trim()} $${num}`);
    setBillTitle(""); setBillAmount("");
  };
  const toggleBill = (id) => setBills((prev) => prev.map((b) => (b.id === id ? { ...b, paid: !b.paid } : b)));
  const deleteBill = (id) => setBills((prev) => prev.filter((b) => b.id !== id));
  const addDueBillsAsExpenses = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const due = bills.filter((b) => !b.paid && b.dueDate <= todayStr);
    if (due.length === 0) { setImportMsg("No unpaid bills are due yet."); return; }
    const newExps = due.map((b) => ({ id: Date.now() + Math.random(), title: b.title, amount: Number(b.amount), category: "Housing", date: todayStr, frequency: "One-time" }));
    setExpenses((prev) => [...newExps, ...prev]);
    newExps.forEach((e) => syncInsert(e));
    setBills((prev) => prev.map((b) => (due.find((d) => d.id === b.id) ? { ...b, paid: true } : b)));
    logHistory("Bills added as expenses", `${due.length} bills, $${due.reduce((s, b) => s + Number(b.amount), 0).toFixed(2)}`);
    setImportMsg(`Added ${due.length} due bills as expenses and marked them paid.`);
  };

  const heatMonth = new Date().toISOString().slice(0, 7);
  const [heatYear, heatMon] = heatMonth.split("-").map(Number);
  const heatDays = new Date(heatYear, heatMon, 0).getDate();
  const heatFirst = new Date(heatYear, heatMon - 1, 1).getDay();
  const heatTotals = {};
  expenses.filter((e) => e.date.startsWith(heatMonth)).forEach((e) => {
    const day = Number(e.date.slice(8, 10));
    heatTotals[day] = (heatTotals[day] || 0) + Number(e.amount);
  });
  const heatLevel = (amt) => (amt <= 0 ? 0 : amt < 20 ? 1 : amt < 60 ? 2 : amt < 150 ? 3 : 4);

  const doAddExpense = (cleanTitle, num, cat, d, freq) => {
    const newExp = { id: Date.now(), title: cleanTitle, amount: num, category: cat, date: d, frequency: freq || "One-time" };
    setExpenses((prev) => [newExp, ...prev]);
    syncInsert(newExp);
    logHistory("Expense added", `${cleanTitle} $${num}`);
  };
  const addExpense = (e, force = false) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const num = Number(amount);
    if (!cleanTitle) { setError("Add a title first."); return; }
    if (!num || num <= 0) { setError("Amount must be more than $0."); return; }
    if (num > 100000) { setError("That amount looks like a typo, max is $100,000."); return; }
    if (isMonthClosed(date.slice(0, 7))) { setError(`That month is closed and locked. Reopen it to add expenses.`); return; }
    const dup = expenses.find((x) => x.title.toLowerCase() === cleanTitle.toLowerCase() && x.amount === num && x.date === date);
    if (dup && !force) { setPendingDuplicate({ title: cleanTitle, amount: num, date }); setError(`This looks like a duplicate of "${dup.title}" $${dup.amount} on ${dup.date}.`); return; }
    setError(""); setPendingDuplicate(null);
    doAddExpense(cleanTitle, num, category, date, frequency);
    setTitle(""); setAmount(""); setFrequency("One-time");
  };
  const quickAdd = (e) => {
    e.preventDefault();
    const num = Number(quickAmount);
    const t = quickTitle.trim() || "Quick expense";
    if (!num || num <= 0) { setError("Quick add needs an amount over $0."); return; }
    const d = new Date().toISOString().slice(0, 10);
    if (isMonthClosed(d.slice(0, 7))) { setError("This month is closed and locked."); return; }
    doAddExpense(t, num, quickCategory, d);
    setQuickAmount(""); setQuickTitle("");
  };

  const deleteExpense = (id) => {
    const found = expenses.find((e) => e.id === id);
    if (!found) return;
    if (isMonthClosed(found.date.slice(0, 7))) { setError("That month is closed and locked."); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    syncDelete(id);
    logHistory("Expense deleted", `${found.title} $${found.amount}`);
    setLastDeleted(found);
  };
  const undoDelete = () => {
    if (!lastDeleted) return;
    setExpenses((prev) => [lastDeleted, ...prev]);
    setLastDeleted(null);
  };
  const startEdit = (e) => {
    if (isMonthClosed(e.date.slice(0, 7))) { setError("That month is closed and locked."); return; }
    setEditingId(e.id); setEditTitle(e.title); setEditAmount(String(e.amount)); setEditCategory(e.category); setEditDate(e.date); setEditFrequency(e.frequency || "One-time");
  };
  const saveEdit = () => {
    const num = Number(editAmount);
    if (!editTitle.trim() || !num || num <= 0) { setError("Edit needs a title and amount over $0."); return; }
    const updated = { id: editingId, title: editTitle.trim(), amount: num, category: editCategory, date: editDate, frequency: editFrequency };
    setExpenses((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
    syncUpdate(updated);
    logHistory("Expense edited", `${updated.title} $${updated.amount}`);
    setEditingId(null); setError("");
  };

  const exportCSV = () => {
    const header = "Title,Amount,Category,Date,Frequency\n";
    const rows = expenses.map((e) => `"${e.title.replace(/"/g, '""')}",${e.amount},${e.category},${e.date},${e.frequency || "One-time"}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "expenses.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  const parseCSVLine = (line) => {
    const m = line.match(/"([^"]*)"|[^,]+/g) || [];
    return m.map((s) => s.replace(/^"|"$/g, "").trim());
  };
  const importCSV = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows = [];
    lines.forEach((line) => {
      if (line.toLowerCase().startsWith("title,")) return;
      const parts = parseCSVLine(line);
      if (parts.length < 4) return;
      const amt = Number(parts[1]);
      if (!amt || amt <= 0) return;
      rows.push({ id: Date.now() + Math.random(), title: parts[0] || "Imported", amount: amt, category: categories.includes(parts[2]) ? parts[2] : "Other", date: parts[3] || new Date().toISOString().slice(0, 10), frequency: frequencies.includes(parts[4]) ? parts[4] : "One-time" });
    });
    if (rows.length) { setExpenses((prev) => [...rows, ...prev]); rows.forEach((r) => syncInsert(r)); }
    setImportMsg(rows.length ? `Imported ${rows.length} real expenses from CSV.` : "No valid rows found in that CSV.");
    ev.target.value = "";
  };
  const backupJSON = () => {
    const data = { exportedAt: new Date().toISOString(), monthlyIncome, savingsGoal, openingBalance, expenses, sections, bills, closedMonths };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "money-dashboard-backup.json"; a.click();
    URL.revokeObjectURL(url);
    setImportMsg("Backup downloaded as money-dashboard-backup.json");
  };
  const restoreJSON = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.expenses)) {
        setExpenses(data.expenses.map((e) => ({ ...e, frequency: e.frequency || "One-time" })));
        const client = await getSupabase();
        if (client && user) {
          const db = client.schema(SUPABASE_SCHEMA);
          await db.from("expenses").delete().eq("user_id", user.id);
          const payload = data.expenses.map((e) => ({ user_id: user.id, title: e.title, amount: e.amount, category: e.category || "Other", date: e.date, frequency: e.frequency || "One-time" }));
          if (payload.length > 0) await db.from("expenses").insert(payload);
        }
      }
      if (Array.isArray(data.sections)) setSections(data.sections);
      if (Array.isArray(data.bills)) setBills(data.bills);
      if (data.monthlyIncome) setMonthlyIncome(Number(data.monthlyIncome));
      if (data.savingsGoal) setSavingsGoal(Number(data.savingsGoal));
      if (data.openingBalance) setOpeningBalance(Number(data.openingBalance));
      setImportMsg("Backup restored.");
    } catch { setImportMsg("That backup file could not be read."); }
    ev.target.value = "";
  };
  const resetAll = async () => {
    if (!window.confirm("Start blank again? This clears all your real expenses, bills and sections in Supabase.")) return;
    setExpenses([]); setBills([]); setSections([]); setClosedMonths([]); setLastDeleted(null);
    const client = await getSupabase();
    if (client && user) {
      const db = client.schema(SUPABASE_SCHEMA);
      await db.from("expenses").delete().eq("user_id", user.id);
      await db.from("bills").delete().eq("user_id", user.id);
      await db.from("section_items").delete().eq("user_id", user.id);
      await db.from("sections").delete().eq("user_id", user.id);
    }
    logHistory("Reset", "Started blank again");
  };
  const closeMonth = () => {
    if (monthFilter === "All") { setError("Pick a calculation month first, then mark it done."); return; }
    if (!closedMonths.includes(monthFilter)) { setClosedMonths((prev) => [...prev, monthFilter]); logHistory("Month done", `${monthFilter} marked as done and locked`); }
  };
  const reopenMonth = () => {
    if (monthFilter === "All") return;
    setClosedMonths((prev) => prev.filter((m) => m !== monthFilter));
    logHistory("Month reopened", `${monthFilter} reopened for editing`);
  };

  const sectionTotal = (section) => section.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const addSection = () => {
    const name = newSectionTitle.trim();
    if (!name) return;
    setSections((prev) => [...prev, {
      id: Date.now(), title: name, items: [
        { id: Date.now() + 1, name: "Person 1", amount: 0, note: "" },
        { id: Date.now() + 2, name: "Person 2", amount: 0, note: "" },
        { id: Date.now() + 3, name: "Person 3", amount: 0, note: "" },
      ]
    }]);
    setNewSectionTitle("");
  };
  const updateSectionTitle = (sectionId, newTitle) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s)));
  };
  const updateItem = (sectionId, itemId, field, value) => {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : { ...s, items: s.items.map((item) => item.id === itemId ? { ...item, [field]: field === "amount" ? Number(value) || 0 : value } : item) }));
  };
  const addItemToSection = (sectionId) => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, items: [...s.items, { id: Date.now(), name: `Person ${s.items.length + 1}`, amount: 0, note: "" }] } : s));
  };
  const deleteItemFromSection = (sectionId, itemId) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s)));
  };
  const deleteSection = (sectionId) => {
    if (!window.confirm("Delete this whole section?")) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };
  const addSectionTotalToMain = (section) => {
    const stotal = sectionTotal(section);
    if (stotal <= 0) return;
    const newExp = { id: Date.now(), title: `${section.title} - Total (${section.items.length} persons)`, amount: Number(stotal.toFixed(2)), category: "Transport", date: new Date().toISOString().slice(0, 10), frequency: "One-time" };
    setExpenses((prev) => [newExp, ...prev]);
    syncInsert(newExp);
  };
  const sectionTotals = sections.map((s) => ({ title: s.title, total: sectionTotal(s) }));

  // SUPABASE ONLY: the dashboard lives behind the login screen.
  // Features are hardcoded in this file, Supabase only stores the data.
  if (!user) {
    return (
      <div className={`app login-page ${darkMode ? "dark" : ""}`}>
        <div className="login-top">
          <div className="login-logo">
            <span className="login-logo-icon"><Wallet size={20} /></span>
            Money Dashboard
          </div>
          <button className="small-ghost-btn" onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={15} /> : <Moon size={15} />} {darkMode ? "Light mode" : "Dark mode"}</button>
        </div>
        <div className="login-wrap">
          <div className="login-brand">
            <h2>Your money, tracked monthly.</h2>
            <p>Note down what you spend, see where it goes, and finish the month knowing your real numbers.</p>
            <div className="login-features">
              <div className="login-feature"><TrendingUp size={18} /> Charts and budgets for every category</div>
              <div className="login-feature"><CalendarDays size={18} /> Bills and due dates, with reminders</div>
              <div className="login-feature"><PiggyBank size={18} /> Savings goal, tracked to 100%</div>
              <div className="login-feature"><ShieldCheck size={18} /> Private - only your account can see it</div>
            </div>
          </div>
          <div className="login-card">
            {authStep === "verify" ? (
              <>
                <h2>Check your email</h2>
                <p>We sent a 6-digit code to <strong>{authEmail}</strong>. Enter it below to verify your email and finish signing up.</p>
                <form onSubmit={verifySignupCode} className="login-form">
                  <div className="login-field">
                    <label htmlFor="verify-code">6-digit code</label>
                    <input id="verify-code" type="text" inputMode="numeric" maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456" required />
                  </div>
                  {authMsg && <div className="form-error">{authMsg}</div>}
                  <button type="submit" className="login-submit"><ShieldCheck size={16} /> Verify code</button>
                </form>
                <button type="button" className="login-toggle" onClick={resendSignupCode}>Didn't get it? Send a new code</button>
                <button type="button" className="login-toggle" onClick={() => { setAuthStep("form"); setAuthMode("signin"); setAuthMsg(""); }}>Back to sign in</button>
              </>
            ) : (
              <>
                <h2>{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
                <p>{authMode === "signup" ? "Sign up once, then we will email you a 6-digit code to verify your email." : "Sign in to see your expenses and add new ones."}</p>
                {!supabaseUrl && <div className="form-error">Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, run npm install @supabase/supabase-js, and restart npm run dev.</div>}
                <form onSubmit={signInOrUp} className="login-form">
                  <div className="login-field">
                    <label htmlFor="login-email">Email</label>
                    <input id="login-email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" required />
                  </div>
                  <div className="login-field">
                    <label htmlFor="login-password">Password</label>
                    <input id="login-password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Your password" required />
                  </div>
                  {authMsg && <div className="form-error">{authMsg}</div>}
                  <button type="submit" className="login-submit"><LogIn size={16} /> {authMode === "signup" ? "Sign up" : "Sign in"}</button>
                </form>
                <button type="button" className="login-toggle" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Have an account? Sign in" : "No account? Sign up"}</button>
              </>
            )}
            <p className="login-note"><Lock size={13} /> Your data lives in Supabase only, under your account. Nothing is stored on this device.</p>
          </div>
        </div>
        <div className="login-foot">Money Dashboard - a monthly expense tracker</div>
      </div>
    );
  }

  // One transaction row, used by both the Fixed and the Flexible box.
  const expenseRow = (e) => (
    <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
      {editingId === e.id ? (
        <div className="edit-row">
          <input value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} placeholder="Title" />
          <input type="number" step="0.01" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} placeholder="Amount" />
          <select value={editCategory} onChange={(ev) => setEditCategory(ev.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={editFrequency} onChange={(ev) => setEditFrequency(ev.target.value)}>{frequencies.map((f) => <option key={f}>{f}</option>)}</select>
          <input type="date" value={editDate} onChange={(ev) => setEditDate(ev.target.value)} />
          <div className="edit-actions">
            <button onClick={saveEdit}>Save</button>
            <button className="small-ghost-btn" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <strong>{e.title} {titleCounts[e.title] > 1 && <span className="cat-pill" style={{ background: "#fef3c7", color: "#92400e" }}>Recurring</span>}</strong>
            <span><span className="cat-pill">{e.category}</span>{e.frequency && e.frequency !== "One-time" && <span className="cat-pill" style={{ background: "#ede9fe", color: "#6d28d9" }}>{e.frequency}</span>}{e.date}</span>
          </div>
          <div className="row-right">
            <strong>${e.amount.toFixed(2)}</strong>
            <button className="edit-btn" onClick={() => startEdit(e)}><Pencil size={15} /></button>
            <button onClick={() => deleteExpense(e.id)}><Trash2 size={16} /></button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <header>
        <div className="header-top">
          <div>
            <h1>Money Dashboard</h1>
            <p>{expenses.length === 0 ? `Welcome, ${user.email} - your dashboard is empty, start with your real numbers` : `Welcome back, ${user.email} - ${daysLeft} days left this month - Projected spend: $${projected}`}</p>
            <p className="live-date">{liveNow.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} - {liveNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
          </div>
          <div className="badge">Signed in: {user.email} - Supabase: {syncStatus}</div>
        </div>
        <div className="settings-row">
          <label>Income $ <input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value) || 0)} /></label>
          <label>Savings goal $ <input type="number" value={savingsGoal} onChange={(e) => setSavingsGoal(Number(e.target.value) || 0)} /></label>
          <button className="white-btn" onClick={exportCSV}><Download size={15} /> Export CSV</button>
          <button className="white-btn" onClick={resetAll}><RotateCcw size={15} /> Start Blank</button>
          <button className="white-btn" onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={15} /> : <Moon size={15} />} {darkMode ? "Light mode" : "Dark mode"}</button>
          <button className="white-btn" onClick={syncNow}>Save to Supabase</button>
          {user && <button className="white-btn" onClick={signOut}><LogOut size={15} /> Sign out</button>}
        </div>
      </header>

      {syncStatus === "error" && (
        <div className="alert" style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fca5a5" }}>
          <AlertTriangle size={18} />
          <span><strong>Supabase error:</strong> {syncError || "Could not load or save your data."} Nothing is being saved to Supabase right now.
            {syncError.includes("foreign key constraint") && syncError.includes("user_id") && (
              <> Your sign-in session does not match this Supabase project - the login id the browser is holding is not in this project's user list. Sign out and sign in again to get a fresh session.</>
            )}
          </span>
          {syncError.includes("foreign key constraint") && syncError.includes("user_id")
            ? <button className="pill" onClick={signOut}>Sign out and sign in again</button>
            : <button className="pill" onClick={() => window.location.reload()}>Try again</button>}
        </div>
      )}

      {(overBudget.length > 0 || balance < 200) && expenses.length > 0 && (
        <div className="alert">
          <AlertTriangle size={18} />
          <span>
            {overBudget.length > 0 ? `Over budget in: ${overBudget.join(", ")}. ` : ""}
            {balance < 200 ? `Low balance, only $${balance.toFixed(2)} left. ` : ""}
            {projected > monthlyIncome && monthlyIncome > 0 ? `At this pace you will spend $${projected} this month, over your income.` : ""}
          </span>
        </div>
      )}
      {currentMonthClosed && (
        <div className="alert" style={{ background: "#f1f5f9", borderColor: "#cbd5e1", color: "#334155" }}>
          <Lock size={18} /><span>This month ({monthFilter}) is closed and locked. Reopen it to add, edit or delete expenses in it.</span>
        </div>
      )}

      <div className="stats">
        <div className="card stat"><div className="stat-icon green"><Wallet size={22} /></div><div><span>Monthly Income</span><strong>${monthlyIncome.toFixed(2)}</strong><small>Your real income</small></div></div>
        <div className="card stat"><div className="stat-icon red"><TrendingDown size={22} /></div><div><span>Total Spent</span><strong>${total.toFixed(2)}</strong><small>{monthExpenses.length} transactions</small></div></div>
        <div className="card stat"><div className="stat-icon blue"><TrendingUp size={22} /></div><div><span>Balance Left</span><strong className={balance < 0 ? "danger" : "good"}>${balance.toFixed(2)}</strong><small>${dailyAvg.toFixed(2)} / day avg</small></div></div>
        <div className="card stat"><div className="stat-icon purple"><PiggyBank size={22} /></div><div><span>Savings</span><strong>${savings.toFixed(2)}</strong><small>Goal ${savingsGoal} - {savingsPct}%</small></div></div>
      </div>

      <div className="card quick-add">
        <h3><Zap size={18} /> Quick Add - 10 seconds at the store</h3>
        <form onSubmit={quickAdd} className="quick-form">
          <input type="number" step="0.01" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} placeholder="Amount $" required />
          <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="What was it?" />
          <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="submit">Add Today</button>
        </form>
      </div>


      <h2 className="section-heading">All Expenses</h2>
      <div className="bottom">
        <form onSubmit={(e) => addExpense(e, false)} className="card form">
          <h3>Add Expense</h3>
          {error && <div className="form-error">{error}</div>}
          {pendingDuplicate && (
            <div className="form-error" style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }}>
              <span>Duplicate? Add it anyway?</span>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={(e) => addExpense(e, true)}>Add anyway</button>
                <button type="button" className="small-ghost-btn" onClick={() => { setPendingDuplicate(null); setError(""); }}>Cancel</button>
              </div>
            </div>
          )}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you spend on?" />
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} title="How often does this repeat?">{frequencies.map((f) => <option key={f}>{f}</option>)}</select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Start date - which month this belongs to" />
          <button type="submit">Add Expense</button>
          <small style={{ color: "#64748b" }}>Pick a repeat - Monthly, Weekly or Biweekly goes in the Fixed box, One-time goes in the Flexible box. The date is the start date.</small>
        </form>
        <div className="card">
          <h3>Your spending <small>{filtered.length} shown - search and sort apply to both boxes below</small></h3>
          <div className="toolbar">
            <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest">Highest $</option><option value="lowest">Lowest $</option>
            </select>
          </div>
          <p className="box-note">Fixed repeats every month - rent, transport, bills. Flexible is one-off - an extra product, a treat, anything that is not fixed.</p>
          <div className="box-total">Fixed: ${fixedTotal.toFixed(2)} / month &nbsp;•&nbsp; Flexible total: ${flexTotal.toFixed(2)}</div>
        </div>
      </div>

      <div className="two-boxes">
        <div className="card fixed-box">
          <h3>Fixed - every month <small>{fixedList.length} expenses - ${fixedTotal.toFixed(2)} a month</small></h3>
          <p className="box-note">Rent, transport, bills - the ones that come back every month.</p>
          {fixedList.length === 0 && <p style={{ color: "#64748b" }}>No fixed expenses yet. Add one above and pick Monthly, Weekly or Biweekly as the repeat.</p>}
          {fixedList.map(expenseRow)}
        </div>
        <div className="card flex-box">
          <h3>Flexible - one-off <small>{flexList.length} expenses - ${flexTotal.toFixed(2)}</small></h3>
          <p className="box-note">One-off buys and extra things - anything that is not fixed.</p>
          {flexList.length === 0 && <p style={{ color: "#64748b" }}>No flexible expenses yet. Add one above and leave the repeat as One-time.</p>}
          {flexList.map(expenseRow)}
        </div>
      </div>

      <div className="card sections-area">
        <h3>My Expense Sections <small>Create any block you want - School Transport, Groceries, Rent, etc.</small></h3>
        <div className="add-section-row">
          <input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="New section name, e.g. School Transport" onKeyDown={(e) => { if (e.key === "Enter") addSection(); }} />
          <button onClick={addSection}><Plus size={16} /> Add Section</button>
        </div>
        {sections.length === 0 && <p style={{ color: "#64748b" }}>No sections yet. Type a name above and click Add Section.</p>}
        {sections.map((section) => {
          const stotal = sectionTotal(section);
          const avg = section.items.length ? stotal / section.items.length : 0;
          return (
            <div key={section.id} className="section-card">
              <div className="section-title-row">
                <input className="section-title" value={section.title} onChange={(e) => updateSectionTitle(section.id, e.target.value)} />
                <button className="delete-section-btn" onClick={() => deleteSection(section.id)}><Trash2 size={16} /> Delete section</button>
              </div>
              <div className="transport-grid">
                {section.items.map((item) => {
                  const share = stotal > 0 ? Math.round(((Number(item.amount) || 0) / stotal) * 100) : 0;
                  return (
                    <div key={item.id} className="person-card">
                      <div className="field">
                        <label>Name</label>
                        <input className="person-name" value={item.name} onChange={(e) => updateItem(section.id, item.id, "name", e.target.value)} placeholder="Person name" />
                      </div>
                      <div className="field">
                        <label>Amount $</label>
                        <input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updateItem(section.id, item.id, "amount", e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Note</label>
                        <input value={item.note} onChange={(e) => updateItem(section.id, item.id, "note", e.target.value)} placeholder="Bus pass, fuel..." />
                      </div>
                      <div className="person-share">
                        <span>${(Number(item.amount) || 0).toFixed(2)} - {share}% of total</span>
                        <div className="budget-bar"><div className="budget-fill" style={{ width: `${share}%`, background: "#f59e0b" }} /></div>
                      </div>
                      <button className="small-ghost-btn" onClick={() => deleteItemFromSection(section.id, item.id)}>Remove person</button>
                    </div>
                  );
                })}
              </div>
              <div className="section-actions">
                <button className="small-ghost-btn" onClick={() => addItemToSection(section.id)}><Plus size={14} /> Add person</button>
              </div>
              <div className="transport-total">
                <div className="total-stat">
                  <span>Total - {section.title}</span>
                  <strong>${stotal.toFixed(2)}</strong>
                  <small>{section.items.length} persons</small>
                </div>
                <div className="total-stat">
                  <span>Average per person</span>
                  <strong>${avg.toFixed(2)}</strong>
                  <small>total / {section.items.length}</small>
                </div>
                <div className="total-stat">
                  <span>Items</span>
                  <strong>{section.items.length}</strong>
                  <small>rows in this section</small>
                </div>
                <button onClick={() => addSectionTotalToMain(section)} disabled={stotal <= 0}>
                  Add ${stotal.toFixed(2)} to main expenses
                </button>
              </div>
              <div className="split-box">
                <strong>Split equally: ${avg.toFixed(2)} each</strong>
                {section.items.map((item) => {
                  const diff = (Number(item.amount) || 0) - avg;
                  return (
                    <div key={item.id} className="split-row">
                      <span>{item.name} paid ${(Number(item.amount) || 0).toFixed(2)}</span>
                      <span>{diff > 0.01 ? `is owed $${diff.toFixed(2)}` : diff < -0.01 ? `owes $${Math.abs(diff).toFixed(2)}` : "settled"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="charts">
        <div className="card">
          <h3>Spending Trend <small>Income vs spent</small></h3>
          {expenses.length === 0 ? <p style={{ color: "#64748b" }}>No data yet - add real expenses to see your trend.</p> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="#d1fae5" name="Income" />
                <Area type="monotone" dataKey="spent" stroke="#7c3aed" fill="#ede9fe" name="Spent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h3>Where It Goes <small>Donut by category</small></h3>
          {byCategory.length === 0 ? <p style={{ color: "#64748b" }}>No data yet.</p> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {byCategory.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {byCategory.map((c, i) => <span key={c.name}><span className="dot" style={{ background: COLORS[i % COLORS.length] }} />{c.name} ${c.value}</span>)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="charts-2">
        <div className="card">
          <h3>Spending by Category <small>Bar chart</small></h3>
          {byCategory.length === 0 ? <p style={{ color: "#64748b" }}>No data yet.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="value" fill="#7c3aed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h3>Budgets <small>How close are you to the limit?</small></h3>
          {categories.map((cat, i) => {
            const spent = byCategory.find((c) => c.name === cat)?.value || 0;
            const limit = budgets[cat];
            const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
            const over = spent > limit;
            return (
              <div key={cat} className="budget-row">
                <div className="budget-top"><span>{cat}</span><span><strong>${spent}</strong> / ${limit} - {pct}% {over ? "OVER" : ""}</span></div>
                <div className="budget-bar"><div className="budget-fill" style={{ width: `${pct}%`, background: over ? "#ef4444" : COLORS[i % COLORS.length] }} /></div>
              </div>
            );
          })}
          <div className="goal-box">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Target size={20} color="#7c3aed" /><strong>Savings Goal: ${savingsGoal}</strong></div>
            <p style={{ margin: "8px 0" }}>You have saved ${savings.toFixed(2)} this month - {savingsPct}% of your goal.</p>
            <div className="budget-bar"><div className="budget-fill" style={{ width: `${savingsPct}%`, background: "#10b981" }} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Daily Spending - {heatMonth} <small>Darker = spent more that day</small></h3>
        {expenses.length === 0 ? <p style={{ color: "#64748b" }}>No data yet.</p> : (
          <div className="heatmap">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="heat-head">{d}</div>)}
            {Array.from({ length: heatFirst }).map((_, i) => <div key={`blank-${i}`} className="heat-day blank" />)}
            {Array.from({ length: heatDays }).map((_, i) => {
              const day = i + 1;
              const amt = heatTotals[day] || 0;
              return (
                <div key={day} className={`heat-day heat-${heatLevel(amt)}`} title={`${heatMonth}-${String(day).padStart(2, "0")}: $${amt.toFixed(2)}`}>
                  <span>{day}</span>
                  {amt > 0 && <small>${Math.round(amt)}</small>}
                </div>
              );
            })}
          </div>
        )}
        <p style={{ color: "#64748b", fontSize: 13 }}>Daily spending for this month.</p>
      </div>

      <div className="card data-tools-card">
        <div className="tools-head">
          <strong>Data tools</strong>
          <span>Backup, import, and reports live here</span>
        </div>
        <div className="tools-buttons">
          <button onClick={backupJSON}>Backup JSON</button>
          <label className="tool-label" htmlFor="restore-json">Restore JSON</label>
          <input id="restore-json" type="file" accept=".json" onChange={restoreJSON} style={{ display: "none" }} />
          <label className="tool-label" htmlFor="import-csv"><Upload size={14} /> Import Bank CSV</label>
          <input id="import-csv" type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
          <button onClick={() => setShowReport(!showReport)}><Printer size={15} /> {showReport ? "Hide Report" : "Monthly Report"}</button>
        </div>
        {importMsg && <div className="import-msg">{importMsg}</div>}
        <p className="tools-note">Everything is saved in Supabase under your account only.</p>
      </div>

      {showReport && (
        <div className="card report-card">
          <h3>Monthly Report - {monthFilter === "All" ? "All months" : monthFilter}</h3>
          <div className="report-grid">
            <div><span>Income</span><strong>${monthlyIncome.toFixed(2)}</strong></div>
            <div><span>Spent</span><strong>${total.toFixed(2)}</strong></div>
            <div><span>Balance</span><strong>${balance.toFixed(2)}</strong></div>
            <div><span>Projected</span><strong>${projected}</strong></div>
            <div><span>Transactions</span><strong>{monthExpenses.length}</strong></div>
            <div><span>Top category</span><strong>{topCategory ? `${topCategory.name} $${topCategory.value}` : "-"}</strong></div>
            <div><span>Biggest expense</span><strong>{biggest ? `${biggest.title} $${biggest.amount.toFixed(2)}` : "-"}</strong></div>
            <div><span>Unpaid bills</span><strong>${unpaidTotal.toFixed(2)}</strong></div>
          </div>
          <h4>Section totals</h4>
          {sectionTotals.length === 0 ? <p>No sections.</p> : sectionTotals.map((s) => <div key={s.title} className="split-row"><span>{s.title}</span><strong>${s.total.toFixed(2)}</strong></div>)}
          {overBudget.length > 0 && <p style={{ color: "#dc2626" }}>Over budget: {overBudget.join(", ")}</p>}
          <h4>Recent changes</h4>
          {history.length === 0 ? <p>No changes yet.</p> : history.slice(0, 5).map((h, i) => <div key={i} className="split-row"><span>{h.action} - {h.detail}</span><span>{new Date(h.at).toLocaleString()}</span></div>)}
          <button onClick={() => window.print()}><Printer size={15} /> Print Report</button>
        </div>
      )}

      {lastDeleted && (
        <div className="toast">
          <span>Deleted {lastDeleted.title} - ${lastDeleted.amount.toFixed(2)}</span>
          <button onClick={undoDelete}><Undo2 size={15} /> Undo</button>
        </div>
      )}
    </div>
  );
}

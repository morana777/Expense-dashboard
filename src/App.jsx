import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend } from "recharts";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Search, Trash2, Target, Download, RotateCcw, AlertTriangle, Undo2, Plus, Pencil, Moon, Sun, CalendarDays, Upload, Printer, Check, LogIn, LogOut, Zap, Lock, ShieldCheck, Sparkles } from "lucide-react";

// REAL-LIFE VERSION - START BLANK
// No sample expenses, bills or sections. Add only your real data.
// Supabase schema: expense_dashboard (see supabase-schema.sql - one main file)
// Auth is required for sync. Without login, the app works local-only.
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
const budgets = { Food: 300, Housing: 1000, Transport: 150, Entertainment: 100, Shopping: 250, Other: 100 };
const COLORS = ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#94a3b8"];

function loadExpenses() {
  try {
    const raw = localStorage.getItem("expenses_v2");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.title === "string" && typeof e.amount === "number" && !isNaN(e.amount) && e.amount > 0 && e.date);
  } catch { return []; }
}
function loadNumber(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return !isNaN(v) && v >= 0 ? v : fallback;
  } catch { return fallback; }
}
function saveSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}
function loadSections() {
  try {
    const raw = localStorage.getItem("custom_sections_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function loadBills() {
  try {
    const raw = localStorage.getItem("bills_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function App() {
  const [expenses, setExpenses] = useState(loadExpenses);
  const [monthlyIncome, setMonthlyIncome] = useState(() => loadNumber("income_v2", 0));
  const [savingsGoal, setSavingsGoal] = useState(() => loadNumber("goal_v2", 0));
  const [openingBalance, setOpeningBalance] = useState(() => loadNumber("opening_v1", 0));
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [error, setError] = useState("");
  const [lastDeleted, setLastDeleted] = useState(null);
  const [sections, setSections] = useState(loadSections);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem("theme_dark") === "true"; } catch { return false; } });
  const [syncStatus, setSyncStatus] = useState(supabaseUrl ? "local" : "local-only");
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [authMsg, setAuthMsg] = useState("");
  const [authDismissed, setAuthDismissed] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Food");
  const [editDate, setEditDate] = useState("");
  const [bills, setBills] = useState(loadBills);
  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDue, setBillDue] = useState(new Date().toISOString().slice(0, 10));
  const [showReport, setShowReport] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [closedMonths, setClosedMonths] = useState(() => loadList("closed_months_v1"));
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const [history, setHistory] = useState(() => loadList("history_v1"));
  const [quickAmount, setQuickAmount] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");

  const resetToBlankPersonal = () => {
    setExpenses([]); setBills([]); setSections([]);
    setMonthlyIncome(0); setSavingsGoal(0); setOpeningBalance(0);
    setClosedMonths([]); setHistory([]); setLastDeleted(null);
    setPendingDuplicate(null); setError("");
  };
  const restoreGuestLocal = () => {
    setExpenses(loadExpenses()); setBills(loadBills()); setSections(loadSections());
    setMonthlyIncome(loadNumber("income_v2", 0)); setSavingsGoal(loadNumber("goal_v2", 0));
    setOpeningBalance(loadNumber("opening_v1", 0));
    setClosedMonths(loadList("closed_months_v1")); setHistory(loadList("history_v1"));
  };

  // Guest mode only: localStorage is the guest store.
  // Signed-in mode: Supabase is the source of truth, do NOT
  // overwrite the guest local data with personal data, or vice versa.
  useEffect(() => { if (!user) saveSafe("expenses_v2", expenses); }, [expenses, user]);
  useEffect(() => { if (!user) saveSafe("income_v2", monthlyIncome); }, [monthlyIncome, user]);
  useEffect(() => { if (!user) saveSafe("goal_v2", savingsGoal); }, [savingsGoal, user]);
  useEffect(() => { if (!user) saveSafe("opening_v1", openingBalance); }, [openingBalance, user]);
  useEffect(() => { if (!user) saveSafe("custom_sections_v1", sections); }, [sections, user]);
  useEffect(() => { if (!user) saveSafe("bills_v1", bills); }, [bills, user]);
  useEffect(() => { if (!user) saveSafe("closed_months_v1", closedMonths); }, [closedMonths, user]);
  useEffect(() => { if (!user) saveSafe("history_v1", history.slice(0, 50)); }, [history, user]);
  useEffect(() => { try { localStorage.setItem("theme_dark", darkMode ? "true" : "false"); } catch { } }, [darkMode]);

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
    const { data, error } = authMode === "signup"
      ? await client.auth.signUp({ email: authEmail, password: authPassword })
      : await client.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) { setAuthMsg(error.message); return; }
    if (data.user) {
      // Signed-in mode is NOT guest mode: start from a blank
      // personal dashboard, never from guest local data.
      // The load effect below then fills it with ONLY this
      // user's Supabase rows. If they have none, it stays blank.
      resetToBlankPersonal();
      setUser(data.user);
      if (authMode === "signup") {
        const c = await getSupabase();
        if (c) await c.schema(SUPABASE_SCHEMA).from("settings").upsert({ user_id: data.user.id, monthly_income: 0, savings_goal: 0, opening_balance: 0 }, { onConflict: "user_id" });
      }
    }
    if (authMode === "signup") setAuthMsg("Check your email to confirm, then sign in.");
    else setAuthMsg("Signed in.");
  };
  const signOut = async () => {
    const client = await getSupabase();
    if (client) await client.auth.signOut();
    setUser(null);
    // Back to guest mode: show the local guest data again,
    // not the personal data you just signed out of.
    restoreGuestLocal();
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
        db.from("section_items").select("*").order("section_id", { ascending: true }).order("position", { ascending: true }),
        db.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (expRes.error || billRes.error || secRes.error) { setSyncStatus("error"); return; }
      // Signed-in mode replaces the view completely, even with
      // empty results. A new user with no rows gets a blank
      // personal dashboard, NOT the guest local data.
      setExpenses((expRes.data || []).map((r) => ({ id: r.id, title: r.title, amount: Number(r.amount), category: r.category || "Other", date: r.date })));
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
      setSyncStatus("synced");
    })();
    return () => { cancelled = true; };
  }, [user]);

  const syncNow = async () => {
    const client = await getSupabase();
    if (!client) { alert("Supabase is not set up yet. Run supabase-schema.sql, add .env keys, run npm install @supabase/supabase-js, and restart."); return; }
    if (!user) { alert("Sign in first to sync. Your data is private to your account."); return; }
    setSyncStatus("syncing");
    const db = client.schema(SUPABASE_SCHEMA);
    await db.from("expenses").delete().eq("user_id", user.id);
    const expPayload = expenses.map((e) => ({ user_id: user.id, title: e.title, amount: e.amount, category: e.category, date: e.date }));
    const { error: expErr } = await db.from("expenses").insert(expPayload);
    if (expErr) { setSyncStatus("error"); return; }
    await db.from("bills").delete().eq("user_id", user.id);
    const billPayload = bills.map((b) => ({ user_id: user.id, title: b.title, amount: b.amount, due_date: b.dueDate, paid: !!b.paid }));
    const { error: billErr } = await db.from("bills").insert(billPayload);
    if (billErr) { setSyncStatus("error"); return; }
    const { error: setErr } = await db.from("settings").upsert({ user_id: user.id, monthly_income: monthlyIncome, savings_goal: savingsGoal, opening_balance: openingBalance }, { onConflict: "user_id" });
    if (setErr) { setSyncStatus("error"); return; }
    await db.from("section_items").delete().neq("id", 0);
    await db.from("sections").delete().eq("user_id", user.id);
    for (const section of sections) {
      const { data: secData, error: secErr } = await db.from("sections").insert({ user_id: user.id, title: section.title }).select("id").single();
      if (secErr || !secData) { setSyncStatus("error"); return; }
      if (section.items.length > 0) {
        const itemPayload = section.items.map((item, idx) => ({ section_id: secData.id, user_id: user.id, name: item.name, amount: Number(item.amount) || 0, note: item.note || "", position: idx }));
        await db.from("section_items").insert(itemPayload);
      }
    }
    setSyncStatus("synced");
  };
  const syncInsert = async (expense) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").insert({ user_id: user.id, title: expense.title, amount: expense.amount, category: expense.category, date: expense.date });
  };
  const syncDelete = async (id) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").delete().eq("id", id).eq("user_id", user.id);
  };
  const syncUpdate = async (expense) => {
    const client = await getSupabase(); if (!client || !user) return;
    await client.schema(SUPABASE_SCHEMA).from("expenses").update({ title: expense.title, amount: expense.amount, category: expense.category, date: expense.date }).eq("id", expense.id).eq("user_id", user.id);
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
  const months = ["All", ...new Set(expenses.map((e) => e.date.slice(0, 7)))];

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
    const newExps = due.map((b) => ({ id: Date.now() + Math.random(), title: b.title, amount: Number(b.amount), category: "Housing", date: todayStr }));
    setExpenses((prev) => [...newExps, ...prev]);
    setBills((prev) => prev.map((b) => (due.find((d) => d.id === b.id) ? { ...b, paid: true } : b)));
    logHistory("Bills added as expenses", `${due.length} bills, $${due.reduce((s, b) => s + Number(b.amount), 0).toFixed(2)}`);
    setImportMsg(`Added ${due.length} due bills as expenses and marked them paid.`);
  };

  const heatMonth = monthFilter !== "All" ? monthFilter : "2026-11";
  const [heatYear, heatMon] = heatMonth.split("-").map(Number);
  const heatDays = new Date(heatYear, heatMon, 0).getDate();
  const heatFirst = new Date(heatYear, heatMon - 1, 1).getDay();
  const heatTotals = {};
  expenses.filter((e) => e.date.startsWith(heatMonth)).forEach((e) => {
    const day = Number(e.date.slice(8, 10));
    heatTotals[day] = (heatTotals[day] || 0) + Number(e.amount);
  });
  const heatLevel = (amt) => (amt <= 0 ? 0 : amt < 20 ? 1 : amt < 60 ? 2 : amt < 150 ? 3 : 4);

  const doAddExpense = (cleanTitle, num, cat, d) => {
    const newExp = { id: Date.now(), title: cleanTitle, amount: num, category: cat, date: d };
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
    doAddExpense(cleanTitle, num, category, date);
    setTitle(""); setAmount("");
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
    setEditingId(e.id); setEditTitle(e.title); setEditAmount(String(e.amount)); setEditCategory(e.category); setEditDate(e.date);
  };
  const saveEdit = () => {
    const num = Number(editAmount);
    if (!editTitle.trim() || !num || num <= 0) { setError("Edit needs a title and amount over $0."); return; }
    const updated = { id: editingId, title: editTitle.trim(), amount: num, category: editCategory, date: editDate };
    setExpenses((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
    syncUpdate(updated);
    logHistory("Expense edited", `${updated.title} $${updated.amount}`);
    setEditingId(null); setError("");
  };

  const exportCSV = () => {
    const header = "Title,Amount,Category,Date\n";
    const rows = expenses.map((e) => `"${e.title.replace(/"/g, '""')}",${e.amount},${e.category},${e.date}`).join("\n");
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
      rows.push({ id: Date.now() + Math.random(), title: parts[0] || "Imported", amount: amt, category: categories.includes(parts[2]) ? parts[2] : "Other", date: parts[3] || new Date().toISOString().slice(0, 10) });
    });
    if (rows.length) setExpenses((prev) => [...rows, ...prev]);
    setImportMsg(rows.length ? `Imported ${rows.length} real expenses from CSV. Check them against your bank balance below.` : "No valid rows found in that CSV.");
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
      if (Array.isArray(data.expenses)) setExpenses(data.expenses);
      if (Array.isArray(data.sections)) setSections(data.sections);
      if (Array.isArray(data.bills)) setBills(data.bills);
      if (data.monthlyIncome) setMonthlyIncome(Number(data.monthlyIncome));
      if (data.savingsGoal) setSavingsGoal(Number(data.savingsGoal));
      if (data.openingBalance) setOpeningBalance(Number(data.openingBalance));
      setImportMsg("Backup restored.");
    } catch { setImportMsg("That backup file could not be read."); }
    ev.target.value = "";
  };
  const resetAll = () => {
    if (!window.confirm("Start blank again? This clears all your real expenses, bills and sections.")) return;
    setExpenses([]); setBills([]); setSections([]); setClosedMonths([]); setLastDeleted(null);
    logHistory("Reset", "Started blank again");
  };
  const closeMonth = () => {
    if (monthFilter === "All") { setError("Pick a month pill first, then close it."); return; }
    if (!closedMonths.includes(monthFilter)) setClosedMonths((prev) => [...prev, monthFilter]);
  };
  const reopenMonth = () => {
    if (monthFilter === "All") return;
    setClosedMonths((prev) => prev.filter((m) => m !== monthFilter));
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
    const newExp = { id: Date.now(), title: `${section.title} - Total (${section.items.length} persons)`, amount: Number(stotal.toFixed(2)), category: "Transport", date: new Date().toISOString().slice(0, 10) };
    setExpenses((prev) => [newExp, ...prev]);
    syncInsert(newExp);
  };
  const sectionTotals = sections.map((s) => ({ title: s.title, total: sectionTotal(s) }));

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <header>
        <div className="header-top">
          <div>
            <h1>Money Dashboard</h1>
            <p>{user ? (expenses.length === 0 ? `Welcome, ${user.email} - your personal dashboard is empty, start with your real numbers` : `Welcome back, ${user.email} - ${daysLeft} days left this month - Projected spend: $${projected}`) : (expenses.length === 0 ? "Guest mode - start blank, add your first real expense below" : `${daysLeft} days left this month - Projected spend: $${projected}`)}</p>
          </div>
          <div className="badge">{user ? `Signed in: ${user.email}` : syncStatus === "local-only" ? "Local only" : `Sync: ${syncStatus}`}</div>
        </div>
        <div className="settings-row">
          <label>Income $ <input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value) || 0)} /></label>
          <label>Savings goal $ <input type="number" value={savingsGoal} onChange={(e) => setSavingsGoal(Number(e.target.value) || 0)} /></label>
          <button className="white-btn" onClick={exportCSV}><Download size={15} /> Export CSV</button>
          <button className="white-btn" onClick={resetAll}><RotateCcw size={15} /> Start Blank</button>
          <button className="white-btn" onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={15} /> : <Moon size={15} />} {darkMode ? "Light mode" : "Dark mode"}</button>
          <button className="white-btn" onClick={syncNow}>Sync: {syncStatus}</button>
          {user && <button className="white-btn" onClick={signOut}><LogOut size={15} /> Sign out</button>}
        </div>
      </header>

      {supabaseUrl && !user && !authDismissed && (
        <div className="card auth-card">
          <h3><ShieldCheck size={18} /> Sign in to make it private and real</h3>
          <p style={{ color: "#64748b" }}>Your data will be saved under your account only, in the expense_dashboard schema. Without sign-in it stays local only.</p>
          <form onSubmit={signInOrUp} className="auth-form">
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email" required />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password" required />
            <button type="submit"><LogIn size={15} /> {authMode === "signup" ? "Sign up" : "Sign in"}</button>
            <button type="button" className="small-ghost-btn" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Have an account? Sign in" : "No account? Sign up"}</button>
            <button type="button" className="small-ghost-btn" onClick={() => setAuthDismissed(true)}>Continue locally for now</button>
          </form>
          {authMsg && <p style={{ color: "#dc2626" }}>{authMsg}</p>}
        </div>
      )}

      {expenses.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon"><Sparkles size={26} /></div>
          <h3>{user ? "Welcome to your dashboard" : "Your money, from scratch"}</h3>
          <p>{user ? "This is yours only. No guest data, no prebuilt stuff. Just your real numbers, when you are ready." : "No fake data here. Just your real numbers, when you are ready."}</p>
          <div className="empty-steps">
            <div><span>1</span> Set your real income above</div>
            <div><span>2</span> Add your first expense below, or import your bank CSV</div>
            <div><span>3</span> Add more as you spend, and check your totals at the end of the month</div>
          </div>
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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit">Add Expense</button>
          <small style={{ color: "#64748b" }}>Tip: use Quick Add above for fast entry, or Import Bank CSV for real data.</small>
        </form>

        <div className="card">
          <h3>Transactions <small>{filtered.length} shown - click Edit to fix one</small></h3>
          <div className="toolbar">
            <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest">Highest $</option><option value="lowest">Lowest $</option>
            </select>
          </div>
          {filtered.length === 0 && <p style={{ color: "#64748b" }}>No transactions yet. Add your first real one above.</p>}
          {filtered.map((e) => (
            <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
              {editingId === e.id ? (
                <div className="edit-row">
                  <input value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} placeholder="Title" />
                  <input type="number" step="0.01" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} placeholder="Amount" />
                  <select value={editCategory} onChange={(ev) => setEditCategory(ev.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
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
                    <span><span className="cat-pill">{e.category}</span>{e.date}</span>
                  </div>
                  <div className="row-right">
                    <strong>${e.amount.toFixed(2)}</strong>
                    <button className="edit-btn" onClick={() => startEdit(e)}><Pencil size={15} /></button>
                    <button onClick={() => deleteExpense(e.id)}><Trash2 size={16} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="month-pills">
        {months.map((m) => (
          <button key={m} className={monthFilter === m ? "pill active" : "pill"} onClick={() => setMonthFilter(m)}>{m === "All" ? "All months" : m}</button>
        ))}
        {monthFilter !== "All" && (
          currentMonthClosed
            ? <button className="pill" onClick={reopenMonth}><Lock size={14} /> Reopen {monthFilter}</button>
            : <button className="pill" onClick={closeMonth}><Lock size={14} /> Close {monthFilter}</button>
        )}
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

      <div className="charts-2">
        <div className="card">
          <h3><CalendarDays size={18} /> Bills &amp; Due Dates <small>Unpaid total: ${unpaidTotal.toFixed(2)}</small></h3>
          <form onSubmit={addBill} className="bill-form">
            <input value={billTitle} onChange={(e) => setBillTitle(e.target.value)} placeholder="Bill, e.g. Rent" />
            <input type="number" step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="$" />
            <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} />
            <button type="submit">Add Bill</button>
          </form>
          <button className="small-ghost-btn" onClick={addDueBillsAsExpenses} style={{ marginBottom: 12 }}>Add due bills as expenses</button>
          {sortedBills.length === 0 && <p style={{ color: "#64748b" }}>No bills yet. Add your real rent, Netflix, bus pass, etc.</p>}
          {sortedBills.map((b) => {
            const d = daysUntil(b.dueDate);
            return (
              <div key={b.id} className={`bill-row ${b.paid ? "paid" : ""}`}>
                <button className="bill-check" onClick={() => toggleBill(b.id)}>{b.paid ? <Check size={16} /> : null}</button>
                <div className="bill-info">
                  <strong style={{ textDecoration: b.paid ? "line-through" : "none" }}>{b.title}</strong>
                  <span>{b.paid ? "Paid" : d < 0 ? `Overdue by ${Math.abs(d)} days` : d === 0 ? "Due today" : `Due in ${d} days`} - {b.dueDate}</span>
                </div>
                <strong>${Number(b.amount).toFixed(2)}</strong>
                <button className="bill-delete" onClick={() => deleteBill(b.id)}><Trash2 size={15} /></button>
              </div>
            );
          })}
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
          <p style={{ color: "#64748b", fontSize: 13 }}>Tip: change the month pills above to see a different month's heatmap.</p>
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
        {!supabaseUrl && <p className="tools-note">Supabase not configured, so your data is local only for now. Add your .env keys to sync.</p>}
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

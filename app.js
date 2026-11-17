const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_CATS = [
  { name: "Food", color: "#f59e0b" }, { name: "Travel", color: "#34b89a" },
  { name: "Shopping", color: "#6c47ff" }, { name: "Bills", color: "#ef4444" },
  { name: "Health", color: "#3b82f6" }, { name: "Other", color: "#8a8fa8" },
];

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
let expenses = load("spendly.expenses", []);
let categories = load("spendly.categories", DEFAULT_CATS);
let editingId = null;

const colorOf = (name) => categories.find((c) => c.name === name)?.color || "#8a8fa8";
const persist = () => {
  localStorage.setItem("spendly.expenses", JSON.stringify(expenses));
  localStorage.setItem("spendly.categories", JSON.stringify(categories));
  render();
};
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Views ---------- */
const VIEWS = {
  overview: { title: "Expense overview", sub: "Here's what's happening with your money.", show: ["overview", "transactions"] },
  transactions: { title: "Transactions", sub: "Search, filter and manage every expense.", show: ["transactions"] },
  categories: { title: "Categories", sub: "Organise how your spending is grouped.", show: ["categories"] },
};
function route() {
  const key = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
  const v = VIEWS[key];
  $("pageTitle").textContent = v.title; $("pageSub").textContent = v.sub;
  document.querySelectorAll(".view").forEach((el) => (el.hidden = !v.show.includes(el.id.replace("view-", ""))));
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === key));
}

/* ---------- Rendering ---------- */
const inThisMonth = (e) => { const d = new Date(e.date + "T00:00"), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };
const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

function renderStats() {
  const total = sum(expenses), month = sum(expenses.filter(inThisMonth));
  $("statTotal").textContent = fmt(total);
  $("statMonth").textContent = fmt(month);
  $("statCount").textContent = expenses.length;
  $("statAvg").textContent = fmt(expenses.length ? total / expenses.length : 0);
}

function totalsByCategory(list) {
  const t = {};
  list.forEach((e) => (t[e.category] = (t[e.category] || 0) + e.amount));
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
}

function renderDonut() {
  const list = $("period").value === "month" ? expenses.filter(inThisMonth) : expenses;
  const rows = totalsByCategory(list), total = sum(list);
  const r = 70, C = 2 * Math.PI * r;
  let offset = 0, rings = "", legend = "";
  if (!rows.length) rings = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="#eceef5" stroke-width="22"/>`;
  rows.forEach(([cat, amt]) => {
    const len = (amt / total) * C;
    rings += `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${colorOf(cat)}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"/>`;
    offset += len;
    legend += `<li><span class="dot" style="background:${colorOf(cat)}"></span>${esc(cat)}<span class="muted">${fmt(amt)}</span><b>${Math.round((amt / total) * 100)}%</b></li>`;
  });
  $("donut").innerHTML = `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Spending by category">${rings}
    <text x="90" y="88" text-anchor="middle" font-size="18" font-weight="700" fill="#14142b">${fmt(total).replace(/\.00$/, "")}</text>
    <text x="90" y="106" text-anchor="middle" font-size="11" fill="#8a8fa8">Total spent</text></svg>`;
  $("legend").innerHTML = legend || `<li class="muted">No spending to show yet.</li>`;
}

function renderInsights() {
  if (!expenses.length) { $("insights").innerHTML = `<p class="empty">Add your first expense to see insights.</p>`; return; }
  const [topCat, topAmt] = totalsByCategory(expenses)[0];
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)[0];
  const month = sum(expenses.filter(inThisMonth)), total = sum(expenses);
  $("insights").innerHTML = `
    <div class="insight"><div class="insight-icon">📈</div><div><small>Top spending category</small><b>${esc(topCat)} · ${fmt(topAmt)}</b></div></div>
    <div class="insight"><div class="insight-icon">🕒</div><div><small>Most recent expense</small><b>${esc(recent.desc)} · ${fmt(recent.amount)}</b></div></div>
    <div class="tip">${esc(topCat)} is your highest spending category (${Math.round((topAmt / total) * 100)}% of all spending). This month you've spent ${fmt(month)}.</div>`;
}

function getVisible() {
  const q = $("search").value.trim().toLowerCase(), cat = $("filterCat").value;
  const sorts = {
    newest: (a, b) => b.date.localeCompare(a.date) || b.created - a.created,
    oldest: (a, b) => a.date.localeCompare(b.date) || a.created - b.created,
    high: (a, b) => b.amount - a.amount, low: (a, b) => a.amount - b.amount,
  };
  return expenses.filter((e) => e.desc.toLowerCase().includes(q) && (cat === "all" || e.category === cat)).sort(sorts[$("sortBy").value]);
}

function renderTable() {
  const rows = getVisible();
  $("tbody").innerHTML = rows.map((e) => `<tr>
    <td><div class="desc"><span class="dot" style="background:${colorOf(e.category)}"></span>${esc(e.desc)}</div></td>
    <td><span class="badge">${esc(e.category)}</span></td>
    <td>${fmtDate(e.date)}</td>
    <td class="num">${fmt(e.amount)}</td>
    <td class="num"><button class="icon-btn" data-edit="${e.id}" aria-label="Edit ${esc(e.desc)}">✎</button><button class="icon-btn del" data-del="${e.id}" aria-label="Delete ${esc(e.desc)}">✕</button></td>
  </tr>`).join("");
  const msg = $("emptyMsg");
  msg.hidden = rows.length > 0;
  msg.textContent = expenses.length ? "No expenses match your search or filter." : "No expenses yet. Select “Add expense” to record your first one.";
}

function renderCategories() {
  const opts = categories.map((c) => `<option>${esc(c.name)}</option>`).join("");
  const keepCat = $("filterCat").value;
  $("fCat").innerHTML = opts;
  $("filterCat").innerHTML = `<option value="all">All categories</option>` + opts;
  if ([...$("filterCat").options].some((o) => o.value === keepCat)) $("filterCat").value = keepCat;
  $("catList").innerHTML = categories.map((c) => {
    const n = expenses.filter((e) => e.category === c.name).length;
    return `<li><span class="dot" style="background:${c.color}"></span>${esc(c.name)}<small>${n} expense${n === 1 ? "" : "s"}</small><button class="icon-btn del" data-delcat="${esc(c.name)}" aria-label="Delete ${esc(c.name)}">✕</button></li>`;
  }).join("");
}

function render() { renderCategories(); renderStats(); renderDonut(); renderInsights(); renderTable(); }

/* ---------- Actions ---------- */
function openModal(expense) {
  editingId = expense?.id || null;
  $("modalTitle").textContent = expense ? "Edit expense" : "Add expense";
  $("fDesc").value = expense?.desc || "";
  $("fAmount").value = expense?.amount || "";
  $("fCat").value = expense?.category || categories[0].name;
  $("fDate").value = expense?.date || todayISO();
  $("modal").showModal();
}

function exportCSV() {
  if (!expenses.length) return toast("Nothing to export yet");
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Description", "Category", "Date", "Amount"], ...getVisible().map((e) => [e.desc, e.category, e.date, e.amount])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  a.download = `spendly-expenses-${todayISO()}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  toast("Expenses exported");
}

/* ---------- Events ---------- */
$("addBtn").onclick = () => openModal();
$("cancelBtn").onclick = () => $("modal").close();
$("exportBtn").onclick = exportCSV;
$("period").onchange = renderDonut;
["search", "filterCat", "sortBy"].forEach((id) => $(id).addEventListener("input", renderTable));

$("expenseForm").addEventListener("submit", () => {
  const data = { desc: $("fDesc").value.trim(), amount: parseFloat($("fAmount").value), category: $("fCat").value, date: $("fDate").value };
  if (editingId) { expenses = expenses.map((e) => (e.id === editingId ? { ...e, ...data } : e)); toast("Expense updated"); }
  else { expenses.push({ id: crypto.randomUUID(), created: Date.now(), ...data }); toast("Expense added"); }
  persist();
});

$("tbody").addEventListener("click", (ev) => {
  const edit = ev.target.closest("[data-edit]"), del = ev.target.closest("[data-del]");
  if (edit) openModal(expenses.find((e) => e.id === edit.dataset.edit));
  if (del && confirm("Delete this expense?")) { expenses = expenses.filter((e) => e.id !== del.dataset.del); persist(); toast("Expense deleted"); }
});

$("catForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const name = $("catName").value.trim();
  if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast("That category already exists");
  categories.push({ name, color: $("catColor").value });
  $("catName").value = ""; persist(); toast("Category added");
});

$("catList").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-delcat]"); if (!btn) return;
  const name = btn.dataset.delcat;
  if (categories.length <= 1) return toast("Keep at least one category");
  if (expenses.some((e) => e.category === name)) return toast("Move or delete its expenses first");
  categories = categories.filter((c) => c.name !== name); persist(); toast("Category deleted");
});

window.addEventListener("hashchange", route);

/* ---------- Init ---------- */
$("todayDate").textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
route();
render();

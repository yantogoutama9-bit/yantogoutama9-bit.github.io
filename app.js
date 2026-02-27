/* ===========================
 Master ERP (Offline + PWA)
 - LocalStorage DB
 - Purchasing -> Receive
 - Inventory Adjustment
 - Production -> Complete
 - Sales -> Invoice + Ship
 - Shipping -> Deliver
 - Returns (Customer/Vendor)
 - Finance (auto + manual)
 - Reports (PnL)
=========================== */

const LS_KEY = "MASTER_ERP_DB_V1";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtIDR = (n) => {
  const x = Number(n || 0);
  return "Rp " + x.toLocaleString("id-ID");
};

const uid = () => {
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
};

const todayStr = () => new Date().toISOString().slice(0,10);

function defaultDB(){
  return {
    meta: { version: 1, createdAt: new Date().toISOString() },
    vendors: [],
    customers: [],
    items: [], // {id,name,type,uom,sellPrice,stock,avgCost}
    po: [], // {id,date,vendorId,itemId,qty,price,total,status:open/received}
    wo: [], // {id,date,consumeItemId,consumeQty,outputItemId,outputQty,status:open/complete}
    so: [], // {id,date,customerId,itemId,qty,price,total,status:open/invoiced/shipping/delivered}
    shipments: [], // {id,soId,date,status:pending/delivered}
    returns: [], // {id,date,type:'customer'|'vendor',partnerId,itemId,qty,reason}
    finance: [], // {id,date,type:income|expense,category,amount,note,refType,refId}
    activity: [] // {id,ts,text}
  };
}

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    return parsed;
  }catch(e){
    console.error("loadDB error", e);
    return defaultDB();
  }
}

function saveDB(){
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
}

function addActivity(text){
  DB.activity.unshift({ id: uid(), ts: new Date().toISOString(), text });
  DB.activity = DB.activity.slice(0, 25);
  saveDB();
}

function findById(arr, id){
  return arr.find(x => x.id === id);
}

function ensureBase(){
  // set default dates on forms
  ["formPO","formWO","formSO","formFinance"].forEach(fid=>{
    const f = document.getElementById(fid);
    if(!f) return;
    const date = f.querySelector('input[type="date"][name="date"]');
    if(date && !date.value) date.value = todayStr();
  });

  // report default range = this month
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const to = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
  $("#repFrom").value = from;
  $("#repTo").value = to;
}

function navInit(){
  $$("#tabs .tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$("#tabs .tab").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;
      $$(".panel").forEach(p=>p.classList.remove("active"));
      document.querySelector(`.panel[data-panel="${tab}"]`).classList.add("active");

      renderAll();
    });
  });
}

function pwaInit(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

function exportCSV(){
  // export a simple flat CSV: finance + stock + sales + purchasing
  const rows = [];
  rows.push(["TYPE","DATE","CATEGORY","AMOUNT","NOTE","REF"].join(","));

  DB.finance.forEach(f=>{
    rows.push([
      f.type,
      f.date,
      (f.category||"").replaceAll(","," "),
      f.amount,
      (f.note||"").replaceAll(","," "),
      `${f.refType||""}:${f.refId||""}`
    ].join(","));
  });

  const csv = rows.join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `master-erp-export-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function backupJSON(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `master-erp-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed || !parsed.items || !parsed.finance){
        alert("Format JSON tidak sesuai.");
        return;
      }
      DB = parsed;
      saveDB();
      addActivity("Import JSON backup");
      renderAll();
      alert("Import sukses ✅");
    }catch(e){
      alert("Gagal import: JSON error");
    }
  };
  reader.readAsText(file);
}

function resetAll(){
  if(!confirm("Yakin reset semua data? Ini tidak bisa dibatalkan.")) return;
  DB = defaultDB();
  saveDB();
  renderAll();
  alert("Data direset.");
}

/* ===========================
  MASTER DATA CRUD
=========================== */

function addVendor(data){
  DB.vendors.push({ id: uid(), ...data });
  addActivity(`Tambah vendor: ${data.name}`);
  saveDB();
}
function delVendor(id){
  DB.vendors = DB.vendors.filter(v=>v.id!==id);
  addActivity("Hapus vendor");
  saveDB();
}

function addCustomer(data){
  DB.customers.push({ id: uid(), ...data });
  addActivity(`Tambah customer: ${data.name}`);
  saveDB();
}
function delCustomer(id){
  DB.customers = DB.customers.filter(c=>c.id!==id);
  addActivity("Hapus customer");
  saveDB();
}

function addItem(data){
  DB.items.push({
    id: uid(),
    name: data.name,
    type: data.type,
    uom: data.uom || "pcs",
    sellPrice: Number(data.sellPrice||0),
    stock: 0,
    avgCost: 0
  });
  addActivity(`Tambah item: ${data.name}`);
  saveDB();
}
function delItem(id){
  DB.items = DB.items.filter(i=>i.id!==id);
  addActivity("Hapus item");
  saveDB();
}

/* ===========================
  TRANSACTIONS
=========================== */

// Purchasing -> PO
function addPO(data){
  const qty = Number(data.qty);
  const price = Number(data.price);
  const total = qty * price;
  DB.po.push({
    id: uid(),
    date: data.date,
    vendorId: data.vendorId,
    itemId: data.itemId,
    qty, price, total,
    status: "open"
  });
  addActivity("Buat PO");
  saveDB();
}

function receivePO(poId){
  const po = findById(DB.po, poId);
  if(!po || po.status==="received") return;

  // add stock + avg cost
  const item = findById(DB.items, po.itemId);
  if(item){
    const oldStock = Number(item.stock||0);
    const oldCost = Number(item.avgCost||0);
    const newStock = oldStock + po.qty;

    // weighted average
    const newCost = newStock === 0 ? 0 : ((oldStock*oldCost) + (po.qty*po.price)) / newStock;

    item.stock = newStock;
    item.avgCost = Math.round(newCost);
  }

  po.status = "received";

  // finance expense auto
  DB.finance.push({
    id: uid(),
    date: po.date,
    type: "expense",
    category: "Purchasing",
    amount: po.total,
    note: "Receive PO",
    refType: "PO",
    refId: po.id
  });

  addActivity("Receive PO (stok masuk + expense)");
  saveDB();
}

// Inventory adjustment
function adjustStock(data){
  const item = findById(DB.items, data.itemId);
  if(!item) return;
  const qty = Number(data.qty);
  item.stock = Number(item.stock||0) + qty;
  addActivity(`Adjustment stok ${item.name}: ${qty}`);
  saveDB();
}

// Production
function addWO(data){
  DB.wo.push({
    id: uid(),
    date: data.date,
    consumeItemId: data.consumeItemId,
    consumeQty: Number(data.consumeQty),
    outputItemId: data.outputItemId,
    outputQty: Number(data.outputQty),
    status: "open"
  });
  addActivity("Buat Work Order");
  saveDB();
}

function completeWO(woId){
  const wo = findById(DB.wo, woId);
  if(!wo || wo.status==="complete") return;

  const consume = findById(DB.items, wo.consumeItemId);
  const output = findById(DB.items, wo.outputItemId);

  if(!consume || !output){
    alert("Item WO tidak valid.");
    return;
  }
  if(Number(consume.stock||0) < wo.consumeQty){
    alert("Stok bahan tidak cukup.");
    return;
  }

  consume.stock = Number(consume.stock||0) - wo.consumeQty;
  output.stock = Number(output.stock||0) + wo.outputQty;

  // carry avg cost (simple template)
  output.avgCost = Math.max(Number(output.avgCost||0), Number(consume.avgCost||0));

  wo.status = "complete";
  addActivity("WO complete (consume bahan → output jadi)");
  saveDB();
}

// Sales
function addSO(data){
  const qty = Number(data.qty);
  const price = Number(data.price);
  const total = qty * price;
  DB.so.push({
    id: uid(),
    date: data.date,
    customerId: data.customerId,
    itemId: data.itemId,
    qty, price, total,
    status: "open"
  });
  addActivity("Buat Sales Order");
  saveDB();
}

function invoiceSO(soId){
  const so = findById(DB.so, soId);
  if(!so) return;

  // allow invoice once
  if(so.status === "invoiced" || so.status==="shipping" || so.status==="delivered") return;

  so.status = "invoiced";

  DB.finance.push({
    id: uid(),
    date: so.date,
    type: "income",
    category: "Sales",
    amount: so.total,
    note: "Invoice SO",
    refType: "SO",
    refId: so.id
  });

  addActivity("SO invoiced (income masuk)");
  saveDB();
}

function shipSO(soId){
  const so = findById(DB.so, soId);
  if(!so) return;

  if(so.status === "open"){
    alert("Invoice dulu biar rapi ya bro 😄");
    return;
  }
  if(so.status === "shipping" || so.status==="delivered") return;

  so.status = "shipping";
  DB.shipments.push({
    id: uid(),
    soId: so.id,
    date: todayStr(),
    status: "pending"
  });

  addActivity("Buat shipment dari SO");
  saveDB();
}

function deliverShipment(shipId){
  const sh = findById(DB.shipments, shipId);
  if(!sh || sh.status==="delivered") return;

  const so = findById(DB.so, sh.soId);
  if(!so) return;

  const item = findById(DB.items, so.itemId);
  if(!item) return;

  if(Number(item.stock||0) < so.qty){
    alert("Stok tidak cukup untuk deliver.");
    return;
  }

  item.stock = Number(item.stock||0) - so.qty;
  sh.status = "delivered";
  so.status = "delivered";

  addActivity("Deliver shipment (stok keluar)");
  saveDB();
}

// Returns
function addReturnCustomer(data){
  const item = findById(DB.items, data.itemId);
  if(item){
    item.stock = Number(item.stock||0) + Number(data.qty);
  }
  DB.returns.push({
    id: uid(),
    date: todayStr(),
    type: "customer",
    partnerId: data.customerId,
    itemId: data.itemId,
    qty: Number(data.qty),
    reason: data.reason || ""
  });
  addActivity("Retur customer (stok masuk)");
  saveDB();
}

function addReturnVendor(data){
  const item = findById(DB.items, data.itemId);
  if(item){
    const q = Number(data.qty);
    if(Number(item.stock||0) < q){
      alert("Stok tidak cukup untuk retur ke vendor.");
      return;
    }
    item.stock = Number(item.stock||0) - q;
  }
  DB.returns.push({
    id: uid(),
    date: todayStr(),
    type: "vendor",
    partnerId: data.vendorId,
    itemId: data.itemId,
    qty: Number(data.qty),
    reason: data.reason || ""
  });
  addActivity("Retur ke vendor (stok keluar)");
  saveDB();
}

// Finance manual
function addFinance(data){
  DB.finance.push({
    id: uid(),
    date: data.date,
    type: data.type,
    category: data.category,
    amount: Number(data.amount),
    note: data.note || "",
    refType: "MANUAL",
    refId: ""
  });
  addActivity("Input finance manual");
  saveDB();
}

function delFinance(id){
  DB.finance = DB.finance.filter(x=>x.id!==id);
  addActivity("Hapus transaksi finance");
  saveDB();
}

/* ===========================
  REPORTS / CALC
=========================== */

function monthKey(dateStr){
  return (dateStr || "").slice(0,7);
}

function calcPnL(from, to){
  const f = from || "0000-01-01";
  const t = to || "9999-12-31";
  let income = 0;
  let expense = 0;

  DB.finance.forEach(x=>{
    if(x.date >= f && x.date <= t){
      if(x.type === "income") income += Number(x.amount||0);
      if(x.type === "expense") expense += Number(x.amount||0);
    }
  });

  return { income, expense, profit: income - expense };
}

function calcThisMonthPnL(){
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const to = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
  return calcPnL(from, to);
}

function calcSalesThisMonth(){
  const mk = monthKey(todayStr());
  let total = 0;
  DB.finance.forEach(x=>{
    if(x.type==="income" && x.category==="Sales" && monthKey(x.date)===mk){
      total += Number(x.amount||0);
    }
  });
  return total;
}

function stockValue(){
  let total = 0;
  DB.items.forEach(i=>{
    total += Number(i.stock||0) * Number(i.avgCost||0);
  });
  return total;
}

/* ===========================
  RENDER
=========================== */

function renderSelectOptions(){
  const vendorOpt = DB.vendors.map(v=>`<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("");
  const customerOpt = DB.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  const itemOpt = DB.items.map(i=>`<option value="${i.id}">${escapeHtml(i.name)} (${i.uom})</option>`).join("");

  ["#poVendor","#retVenVendor"].forEach(sel=>{
    const el = $(sel); if(el) el.innerHTML = `<option value="">-- pilih --</option>` + vendorOpt;
  });

  ["#soCustomer","#retCustCustomer"].forEach(sel=>{
    const el = $(sel); if(el) el.innerHTML = `<option value="">-- pilih --</option>` + customerOpt;
  });

  ["#poItem","#adjItem","#woConsumeItem","#woOutputItem","#soItem","#retCustItem","#retVenItem"].forEach(sel=>{
    const el = $(sel); if(el) el.innerHTML = `<option value="">-- pilih --</option>` + itemOpt;
  });
}

function renderVendors(){
  const tb = $("#tblVendors tbody");
  tb.innerHTML = DB.vendors.map(v=>{
    return `<tr>
      <td><b>${escapeHtml(v.name)}</b></td>
      <td class="muted">${escapeHtml(v.phone||"")}<br>${escapeHtml(v.email||"")}</td>
      <td><button class="btn ghost" data-del-vendor="${v.id}">Hapus</button></td>
    </tr>`;
  }).join("");

  $$("[data-del-vendor]").forEach(b=>{
    b.onclick = () => { delVendor(b.dataset.delVendor); renderAll(); };
  });
}

function renderCustomers(){
  const tb = $("#tblCustomers tbody");
  tb.innerHTML = DB.customers.map(c=>{
    return `<tr>
      <td><b>${escapeHtml(c.name)}</b></td>
      <td class="muted">${escapeHtml(c.phone||"")}<br>${escapeHtml(c.email||"")}</td>
      <td><button class="btn ghost" data-del-customer="${c.id}">Hapus</button></td>
    </tr>`;
  }).join("");

  $$("[data-del-customer]").forEach(b=>{
    b.onclick = () => { delCustomer(b.dataset.delCustomer); renderAll(); };
  });
}

function renderItems(){
  const tb = $("#tblItems tbody");
  tb.innerHTML = DB.items.map(i=>{
    return `<tr>
      <td><b>${escapeHtml(i.name)}</b><div class="muted small">${escapeHtml(i.uom||"")}</div></td>
      <td><span class="badge">${escapeHtml(i.type)}</span></td>
      <td><b>${Number(i.stock||0)}</b></td>
      <td><button class="btn ghost" data-del-item="${i.id}">Hapus</button></td>
    </tr>`;
  }).join("");

  $$("[data-del-item]").forEach(b=>{
    b.onclick = () => { delItem(b.dataset.delItem); renderAll(); };
  });
}

function renderPO(){
  const tb = $("#tblPO tbody");
  tb.innerHTML = DB.po.slice().reverse().map(p=>{
    const v = findById(DB.vendors, p.vendorId);
    const i = findById(DB.items, p.itemId);
    const status = p.status==="received"
      ? `<span class="badge">received</span>`
      : `<span class="badge" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)">open</span>`;

    const action = p.status==="open"
      ? `<button class="btn" data-recv-po="${p.id}">Receive</button>`
      : `<span class="muted small">—</span>`;

    return `<tr>
      <td>${p.date}</td>
      <td>${escapeHtml(v?.name||"-")}</td>
      <td>${escapeHtml(i?.name||"-")}</td>
      <td><b>${p.qty}</b></td>
      <td><b>${fmtIDR(p.total)}</b></td>
      <td>${status}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");

  $$("[data-recv-po]").forEach(b=>{
    b.onclick = () => { receivePO(b.dataset.recvPo); renderAll(); };
  });
}

function renderStock(){
  const tb = $("#tblStock tbody");
  tb.innerHTML = DB.items.map(i=>{
    return `<tr>
      <td><b>${escapeHtml(i.name)}</b><div class="muted small">${escapeHtml(i.uom||"")}</div></td>
      <td>${escapeHtml(i.type)}</td>
      <td><b>${Number(i.stock||0)}</b></td>
      <td>${fmtIDR(i.avgCost||0)}</td>
    </tr>`;
  }).join("");
}

function renderWO(){
  const tb = $("#tblWO tbody");
  tb.innerHTML = DB.wo.slice().reverse().map(w=>{
    const c = findById(DB.items, w.consumeItemId);
    const o = findById(DB.items, w.outputItemId);

    const status = w.status==="complete"
      ? `<span class="badge">complete</span>`
      : `<span class="badge" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)">open</span>`;

    const action = w.status==="open"
      ? `<button class="btn" data-comp-wo="${w.id}">Complete</button>`
      : `<span class="muted small">—</span>`;

    return `<tr>
      <td>${w.date}</td>
      <td>${escapeHtml(c?.name||"-")}</td>
      <td><b>${w.consumeQty}</b></td>
      <td>${escapeHtml(o?.name||"-")}</td>
      <td><b>${w.outputQty}</b></td>
      <td>${status}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");

  $$("[data-comp-wo]").forEach(b=>{
    b.onclick = () => { completeWO(b.dataset.compWo); renderAll(); };
  });
}

function renderSO(){
  const tb = $("#tblSO tbody");
  tb.innerHTML = DB.so.slice().reverse().map(s=>{
    const c = findById(DB.customers, s.customerId);
    const i = findById(DB.items, s.itemId);

    let statusBadge = `<span class="badge">${escapeHtml(s.status)}</span>`;
    if(s.status==="open"){
      statusBadge = `<span class="badge" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)">open</span>`;
    }

    const btnInvoice = (s.status==="open")
      ? `<button class="btn" data-inv-so="${s.id}">Invoice</button>`
      : `<button class="btn ghost" disabled>Invoice</button>`;

    const btnShip = (s.status==="invoiced")
      ? `<button class="btn" data-ship-so="${s.id}">Ship</button>`
      : `<button class="btn ghost" disabled>Ship</button>`;

    return `<tr>
      <td>${s.date}</td>
      <td>${escapeHtml(c?.name||"-")}</td>
      <td>${escapeHtml(i?.name||"-")}</td>
      <td><b>${s.qty}</b></td>
      <td><b>${fmtIDR(s.total)}</b></td>
      <td>${statusBadge}</td>
      <td style="display:flex; gap:6px; flex-wrap:wrap">${btnInvoice}${btnShip}</td>
    </tr>`;
  }).join("");

  $$("[data-inv-so]").forEach(b=>{
    b.onclick = () => { invoiceSO(b.dataset.invSo); renderAll(); };
  });
  $$("[data-ship-so]").forEach(b=>{
    b.onclick = () => { shipSO(b.dataset.shipSo); renderAll(); };
  });
}

function renderShipments(){
  const tb = $("#tblShip tbody");
  tb.innerHTML = DB.shipments.slice().reverse().map(sh=>{
    const so = findById(DB.so, sh.soId);
    const c = so ? findById(DB.customers, so.customerId) : null;
    const i = so ? findById(DB.items, so.itemId) : null;

    const status = sh.status==="delivered"
      ? `<span class="badge">delivered</span>`
      : `<span class="badge" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)">pending</span>`;

    const action = sh.status==="pending"
      ? `<button class="btn" data-deliver="${sh.id}">Deliver</button>`
      : `<span class="muted small">—</span>`;

    return `<tr>
      <td>${sh.date}</td>
      <td>${escapeHtml(c?.name||"-")}</td>
      <td>${escapeHtml(i?.name||"-")}</td>
      <td><b>${so?.qty||0}</b></td>
      <td>${status}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");

  $$("[data-deliver]").forEach(b=>{
    b.onclick = () => { deliverShipment(b.dataset.deliver); renderAll(); };
  });
}

function renderReturns(){
  const tb = $("#tblReturns tbody");
  tb.innerHTML = DB.returns.slice().reverse().map(r=>{
    const partner = r.type==="customer"
      ? findById(DB.customers, r.partnerId)
      : findById(DB.vendors, r.partnerId);
    const item = findById(DB.items, r.itemId);

    return `<tr>
      <td>${r.date}</td>
      <td><span class="badge">${r.type}</span></td>
      <td>${escapeHtml(partner?.name||"-")}</td>
      <td>${escapeHtml(item?.name||"-")}</td>
      <td><b>${r.qty}</b></td>
      <td class="muted">${escapeHtml(r.reason||"")}</td>
    </tr>`;
  }).join("");
}

function renderFinance(){
  const tb = $("#tblFinance tbody");
  tb.innerHTML = DB.finance.slice().reverse().map(f=>{
    const badge = f.type==="income"
      ? `<span class="badge">income</span>`
      : `<span class="badge" style="background:rgba(255,77,77,.16);border-color:rgba(255,77,77,.35)">expense</span>`;

    const delBtn = (f.refType==="MANUAL")
      ? `<button class="btn ghost" data-del-fin="${f.id}">Hapus</button>`
      : `<span class="muted small">auto</span>`;

    return `<tr>
      <td>${f.date}</td>
      <td>${badge}</td>
      <td><b>${escapeHtml(f.category||"")}</b></td>
      <td><b>${fmtIDR(f.amount)}</b></td>
      <td class="muted">${escapeHtml(f.note||"")}</td>
      <td>${delBtn}</td>
    </tr>`;
  }).join("");

  $$("[data-del-fin]").forEach(b=>{
    b.onclick = () => { delFinance(b.dataset.delFin); renderAll(); };
  });
}

function renderDashboard(){
  $("#kpiTotalItems").textContent = DB.items.length;
  $("#kpiStockValue").textContent = fmtIDR(stockValue());
  $("#kpiSalesMonth").textContent = fmtIDR(calcSalesThisMonth());

  const pnl = calcThisMonthPnL();
  $("#kpiProfitMonth").textContent = fmtIDR(pnl.profit);

  // activity
  const box = $("#recentActivity");
  box.innerHTML = DB.activity.slice(0,8).map(a=>{
    const dt = new Date(a.ts);
    return `<div class="inner" style="padding:10px">
      <div style="font-weight:900">${escapeHtml(a.text)}</div>
      <div class="muted small">${dt.toLocaleString("id-ID")}</div>
    </div>`;
  }).join("") || `<div class="muted">Belum ada aktivitas.</div>`;

  // simple bar chart: income vs expense
  const mk = monthKey(todayStr());
  const from = mk + "-01";
  const to = mk + "-31";
  const {income, expense} = calcPnL(from,to);

  const max = Math.max(income, expense, 1);
  const hIncome = Math.round((income/max)*100);
  const hExpense = Math.round((expense/max)*100);

  $("#chartPnL").innerHTML = `
    <div class="bar" style="height:${hIncome}%"><span>${fmtIDR(income)}</span></div>
    <div class="bar" style="height:${hExpense}%; background: linear-gradient(180deg, rgba(255,77,77,.9), rgba(255,77,77,.2))">
      <span>${fmtIDR(expense)}</span>
    </div>
  `;
}

function renderReports(){
  const from = $("#repFrom").value || "0000-01-01";
  const to = $("#repTo").value || "9999-12-31";
  const pnl = calcPnL(from,to);

  $("#repIncome").textContent = fmtIDR(pnl.income);
  $("#repExpense").textContent = fmtIDR(pnl.expense);
  $("#repProfit").textContent = fmtIDR(pnl.profit);

  const sum = $("#summaryBox");
  sum.innerHTML = `
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Total Vendor</div>
      <div class="muted">${DB.vendors.length}</div>
    </div>
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Total Customer</div>
      <div class="muted">${DB.customers.length}</div>
    </div>
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Total Item</div>
      <div class="muted">${DB.items.length}</div>
    </div>
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Total PO</div>
      <div class="muted">${DB.po.length}</div>
    </div>
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Total SO</div>
      <div class="muted">${DB.so.length}</div>
    </div>
    <div class="inner" style="padding:10px">
      <div style="font-weight:900">Transaksi Finance</div>
      <div class="muted">${DB.finance.length}</div>
    </div>
  `;
}

function renderAll(){
  renderSelectOptions();
  renderVendors();
  renderCustomers();
  renderItems();
  renderPO();
  renderStock();
  renderWO();
  renderSO();
  renderShipments();
  renderReturns();
  renderFinance();
  renderDashboard();
  renderReports();
}

/* ===========================
  EVENTS
=========================== */

function formToObj(form){
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function bindEvents(){
  $("#formVendor").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    addVendor(data);
    e.target.reset();
    renderAll();
  });

  $("#formCustomer").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    addCustomer(data);
    e.target.reset();
    renderAll();
  });

  $("#formItem").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    addItem(data);
    e.target.reset();
    renderAll();
  });

  $("#formPO").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.vendorId || !data.itemId) return alert("Vendor & Item wajib dipilih.");
    addPO(data);
    e.target.reset();
    e.target.querySelector('input[name="date"]').value = todayStr();
    renderAll();
  });

  $("#formAdjust").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.itemId) return alert("Item wajib dipilih.");
    adjustStock(data);
    e.target.reset();
    renderAll();
  });

  $("#formWO").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.consumeItemId || !data.outputItemId) return alert("Item wajib dipilih.");
    if(data.consumeItemId === data.outputItemId) return alert("Consume & Output tidak boleh sama.");
    addWO(data);
    e.target.reset();
    e.target.querySelector('input[name="date"]').value = todayStr();
    renderAll();
  });

  $("#formSO").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.customerId || !data.itemId) return alert("Customer & Item wajib dipilih.");
    addSO(data);
    e.target.reset();
    e.target.querySelector('input[name="date"]').value = todayStr();
    renderAll();
  });

  $("#formReturnCustomer").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.customerId || !data.itemId) return alert("Customer & Item wajib dipilih.");
    addReturnCustomer(data);
    e.target.reset();
    renderAll();
  });

  $("#formReturnVendor").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    if(!data.vendorId || !data.itemId) return alert("Vendor & Item wajib dipilih.");
    addReturnVendor(data);
    e.target.reset();
    renderAll();
  });

  $("#formFinance").addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = formToObj(e.target);
    addFinance(data);
    e.target.reset();
    e.target.querySelector('input[name="date"]').value = todayStr();
    renderAll();
  });

  $("#btnRunReport").addEventListener("click", ()=>{
    renderReports();
  });

  $("#btnExportCsv").addEventListener("click", exportCSV);
  $("#btnBackupJson").addEventListener("click", backupJSON);
  $("#btnResetAll").addEventListener("click", resetAll);

  $("#fileImportJson").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSON(f);
    e.target.value = "";
  });
}

/* ===========================
  INIT
=========================== */

(function init(){
  ensureBase();
  navInit();
  bindEvents();
  pwaInit();
  renderAll();
})();

const DATA_DIR = "plants_damage_data";
const INDEX_CSV = `${DATA_DIR}/index.csv`;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

const els = {
  // tabs
  tabs: document.querySelectorAll(".tab"),
  panels: { damage: $("tab-damage"), fuse: $("tab-fuse") },

  // damage
  plant: $("plant"),
  variant: $("variant"),
  kg: $("kg"),
  lvl: $("lvl"),
  calcDamage: $("calcDamage"),
  copyDamage: $("copyDamage"),
  outDamage: $("outDamage"),

  // fuse
  fPlant: $("fPlant"),
  fLvl: $("fLvl"),
  kgA: $("kgA"),
  kgB: $("kgB"),
  mutA: $("mutA"),
  mutB: $("mutB"),
  calcFuse: $("calcFuse"),
  copyFuse: $("copyFuse"),
  outFuse: $("outFuse"),
};

const mutChoices = [
  "Gold (2x)",
  "Foggy (2x)",
  "Electrified (2x)",
  "Scorched (2x)",
  "Diamond (3x)",
  "Ruby (4x)",
  "Frozen (4x)",
  "Neon (5x)",
];

let plants = new Map();          // plantName -> [{label,mult,file}]
let plantNames = [];
let tableCache = new Map();      // filePath -> table Map(kgKey -> [10])

// ---------------- tabs ----------------
els.tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    els.tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    Object.values(els.panels).forEach(p => p.classList.remove("active"));
    els.panels[tab].classList.add("active");
  });
});

// ---------------- init ----------------
init().catch(err => {
  console.error(err);
  statusEl.textContent = "Error loading data. Check console.";
});

async function init(){
  statusEl.textContent = "Loading index.csv…";
  const idxText = await fetchText(INDEX_CSV);
  loadIndex(idxText);

  // fill dropdowns
  fillSelect(els.plant, plantNames);
  fillSelect(els.fPlant, plantNames);
  fillSelect(els.mutA, mutChoices);
  fillSelect(els.mutB, mutChoices);

  // default selections
  els.plant.selectedIndex = 0;
  els.fPlant.selectedIndex = 0;
  els.mutA.selectedIndex = 0;
  els.mutB.selectedIndex = 2;

  await refreshVariants();

  // events
  els.plant.addEventListener("change", refreshVariants);
  els.variant.addEventListener("change", () => { els.copyDamage.disabled = true; els.outDamage.value = ""; });
  els.calcDamage.addEventListener("click", onCalcDamage);
  els.copyDamage.addEventListener("click", () => copyOut(els.outDamage, els.copyDamage));

  els.fPlant.addEventListener("change", () => { els.outFuse.value = ""; els.copyFuse.disabled = true; });
  els.calcFuse.addEventListener("click", onCalcFuse);
  els.copyFuse.addEventListener("click", () => copyOut(els.outFuse, els.copyFuse));

  statusEl.textContent = `Loaded ${plantNames.length} plants ✅`;
}

// ---------------- CSV loading ----------------
async function fetchText(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
  return await r.text();
}

function loadIndex(text){
  plants = new Map();
  plantNames = [];

  const lines = text.split(/\r?\n/).map(l => l.replace(/^\uFEFF/, "").trim()).filter(Boolean);
  for(const line of lines){
    if(line.startsWith("plant,label,multiplier,file")) continue;

    const fields = parseCSVLine(line);
    if(fields.length < 4) continue;

    const p = fields[0].trim();
    const label = fields[1].trim();
    const mult = fields[2].trim();      // string
    const file = fields[3].trim();

    if(!p || !file) continue;

    if(!plants.has(p)){
      plants.set(p, []);
      plantNames.push(p);
    }
    plants.get(p).push({label, mult, file});
  }
}

// Handles quoted CSV fields too (basic)
function parseCSVLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(ch === ',' && !inQ){
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function fillSelect(sel, items){
  sel.innerHTML = "";
  for(const it of items){
    const opt = document.createElement("option");
    opt.value = it;
    opt.textContent = it;
    sel.appendChild(opt);
  }
}

// ---------------- damage tab ----------------
async function refreshVariants(){
  const plant = els.plant.value;
  const vars = plants.get(plant) || [];
  els.variant.innerHTML = "";

  for(const v of vars){
    const opt = document.createElement("option");
    opt.value = v.file;
    opt.textContent = `${v.label}${v.mult ? `  [${v.mult}x]` : ""}`;
    opt.dataset.mult = v.mult || "";
    els.variant.appendChild(opt);
  }
  els.variant.selectedIndex = 0;
  els.outDamage.value = "";
  els.copyDamage.disabled = true;
}

async function onCalcDamage(){
  try{
    const plant = els.plant.value;
    const vars = plants.get(plant) || [];
    const idx = els.variant.selectedIndex;
    if(idx < 0 || idx >= vars.length) return showDamage("Pick a variant.");

    const kg = numberOrNull(els.kg.value);
    const lvl = numberOrNull(els.lvl.value);
    if(kg === null) return showDamage("KG value isn't a number.");
    if(lvl === null) return showDamage("Level isn't a number.");
    if(lvl < 1 || lvl > 10) return showDamage("Level must be 1 to 10.");

    const v = vars[idx];
    const filePath = `${DATA_DIR}/${v.file}`;
    const dmg = await lookupDamageByFile(filePath, kg, lvl);

    const kgRounded = clampKg(kg);

    const txt =
`Plant:   ${plant}
Variant: ${v.label}${v.mult ? `  [${v.mult}x]` : ""}
KG:      ${formatKgKey(kgRounded)}
Level:   ${lvl}
--------------------------------
Damage:  ${formatNumber(dmg)}`;

    els.outDamage.value = txt;
    els.copyDamage.disabled = false;

  }catch(err){
    console.error(err);
    showDamage(`Error: ${err.message}`);
  }
}

function showDamage(msg){
  els.outDamage.value = msg;
  els.copyDamage.disabled = true;
}

// ---------------- fuse tab ----------------
async function onCalcFuse(){
  try{
    els.copyFuse.disabled = true;
    els.outFuse.value = "";

    const plant = els.fPlant.value;

    const kgA = numberOrNull(els.kgA.value);
    const kgB = numberOrNull(els.kgB.value);
    if(kgA === null || kgB === null) return showFuse("KG A / KG B must be numbers.");

    const infoA = parseMutation(els.mutA.value);
    const infoB = parseMutation(els.mutB.value);

    // can't fuse same mutation
    if(infoA.name && infoA.name === infoB.name) return showFuse(`You can't fuse the same mutation with itself (${infoA.name} + ${infoB.name}).`);

    const kgR = fuseResultKg(kgA, kgB);

    const fuse = fuseResultMult(infoA, infoB);
    if(!fuse) return showFuse("Unsupported fusion combo.");

    let txt =
`Plant A: ${plant} | ${formatKg(kgA)}kg | ${els.mutA.value}
Plant B: ${plant} | ${formatKg(kgB)}kg | ${els.mutB.value}
--------------------------------
Result KG:       ${formatKg(kgR)}kg
Result Mutation: ${fuse.label}  [${fuse.mult}x]
Rule used:       ${fuse.note}`;

    if(kgR > 30.0) txt += `\nNote: Damage tables cap at 30kg, so lookup uses 30.0kg.`;

    // optional damage lookup
    let lvlR = numberOrNull(els.fLvl.value);
    if(lvlR === null) lvlR = 1;
    lvlR = clampInt(lvlR, 1, 10);

    const dmg = await lookupDamageByMultiplier(plant, fuse.mult, kgR, lvlR);
    txt += `\n--------------------------------
Damage lookup (Result Plant: ${plant})
Level: ${lvlR} | KG: ${formatKgKey(clampKg(kgR))} | Variant: ${fuse.label}
Damage: ${formatNumber(dmg)}`;

    els.outFuse.value = txt;
    els.copyFuse.disabled = false;
  }catch(err){
    console.error(err);
    showFuse(`Error: ${err.message}`);
  }
}

function showFuse(msg){
  els.outFuse.value = msg;
  els.copyFuse.disabled = true;
}

function fuseResultKg(kgA, kgB){
  const avg = (kgA + kgB) / 2;
  const ceil = Math.ceil(avg);
  return isWhole(avg) ? (ceil + 1) : ceil;
}

function fuseResultMult(a, b){
  // Neon overrides
  if(a.class === "neon" || b.class === "neon"){
    return { mult: 6.25, label: "Fusion 6.25x", note: "Neon + anything => 6.25x" };
  }
  // Ruby/Frozen (4x) rule
  if(a.class === "ruby" || b.class === "ruby"){
    return { mult: 5.25, label: "Fusion 5.25x", note: "Ruby/Frozen + any mutation => 5.25x" };
  }
  // 2x + 2x
  if(a.class === "2x" && b.class === "2x"){
    return { mult: 3.15, label: "Fusion 3.15x", note: "2x + 2x => 3.15x" };
  }
  // 2x + Diamond
  if((a.class === "2x" && b.class === "diamond") || (b.class === "2x" && a.class === "diamond")){
    return { mult: 4.25, label: "Fusion 4.25x", note: "2x + Diamond => 4.25x" };
  }
  return null;
}

function parseMutation(text){
  const s = text.trim();
  if(s.includes("Gold")) return { name:"Gold", class:"2x", mult:2.0 };
  if(s.includes("Foggy")) return { name:"Foggy", class:"2x", mult:2.0 };
  if(s.includes("Electrified")) return { name:"Electrified", class:"2x", mult:2.0 };
  if(s.includes("Scorched")) return { name:"Scorched", class:"2x", mult:2.0 };
  if(s.includes("Diamond")) return { name:"Diamond", class:"diamond", mult:3.0 };
  if(s.includes("Ruby")) return { name:"Ruby", class:"ruby", mult:4.0 };
  if(s.includes("Frozen")) return { name:"Frozen", class:"ruby", mult:4.0 };
  if(s.includes("Neon")) return { name:"Neon", class:"neon", mult:5.0 };
  return { name:"", class:"unknown", mult:null };
}

// ---------------- lookup helpers ----------------
function clampKg(kg){
  let k = Math.round(kg * 10) / 10;
  if(k < 1.0) k = 1.0;
  if(k > 30.0) k = 30.0;
  return k;
}
function formatKgKey(k){ return k.toFixed(1); }
function isWhole(x){ return Math.abs(x - Math.round(x)) < 1e-9; }

function numberOrNull(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clampInt(n, lo, hi){
  n = Math.trunc(n);
  if(n < lo) n = lo;
  if(n > hi) n = hi;
  return n;
}
function formatKg(n){
  if(Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return stripZeros(n.toFixed(2));
}
function formatNumber(n){
  if(Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return stripZeros(Number(n).toFixed(2));
}
function stripZeros(s){
  return s.replace(/0+$/,"").replace(/\.$/,"");
}

async function getTable(filePath){
  if(tableCache.has(filePath)) return tableCache.get(filePath);

  const text = await fetchText(filePath);
  const table = loadVariantTable(text);
  tableCache.set(filePath, table);
  return table;
}

function loadVariantTable(text){
  const table = new Map();
  const lines = text.split(/\r?\n/).map(l => l.replace(/^\uFEFF/,"").trim());

  let started = false;
  for(const line of lines){
    if(!line) continue;

    if(!started){
      if(line.startsWith("kg,")) started = true;
      continue;
    }

    const fields = parseCSVLine(line);
    if(fields.length < 11) continue;

    const kgNum = Number(fields[0]);
    if(!Number.isFinite(kgNum)) continue;

    const kgKey = formatKgKey(Math.round(kgNum * 10) / 10);
    const lvls = [];
    for(let i=1;i<=10;i++){
      const n = Number(fields[i]);
      lvls.push(Number.isFinite(n) ? n : null);
    }
    table.set(kgKey, lvls);
  }
  return table;
}

async function lookupDamageByFile(filePath, kg, lvl){
  const t = await getTable(filePath);
  if(t.size === 0) throw new Error(`Couldn't load data table: ${filePath}`);

  const kgKey = formatKgKey(clampKg(kg));
  let row = t.get(kgKey);

  if(!row){
    // fallback: nearest kg key
    let bestKey = null;
    let bestDist = Infinity;
    const target = Number(kgKey);
    for(const k of t.keys()){
      const kn = Number(k);
      const d = Math.abs(kn - target);
      if(d < bestDist){ bestDist = d; bestKey = k; }
    }
    if(!bestKey) throw new Error("No KG data found in table.");
    row = t.get(bestKey);
  }

  const val = row[lvl - 1];
  if(val == null || val === 0) throw new Error(`No damage value found at KG ${kgKey}, level ${lvl}.`);
  return val;
}

async function lookupDamageByMultiplier(plantName, multNum, kg, lvl){
  const vars = plants.get(plantName) || [];
  const target = Math.round(multNum * 100) / 100;

  let match = null;
  for(const v of vars){
    const mv = Number(v.mult);
    if(Number.isFinite(mv) && (Math.round(mv * 100) / 100) === target){
      match = v;
      break;
    }
  }
  if(!match) throw new Error(`No variant table found for ${target}x for plant ${plantName}`);

  return await lookupDamageByFile(`${DATA_DIR}/${match.file}`, kg, lvl);
}

// ---------------- copy ----------------
async function copyOut(textarea, btn){
  const txt = textarea.value.trim();
  if(!txt) return;
  await navigator.clipboard.writeText(txt);
  const old = btn.textContent;
  btn.textContent = "Copied ✅";
  setTimeout(() => btn.textContent = old, 800);
}

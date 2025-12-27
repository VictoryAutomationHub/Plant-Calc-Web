const $ = (id) => document.getElementById(id);

const statusEl = $("status");

const els = {
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

// ============================================================
// MUTATIONS + FUSION MATRIX (from your newest chart)
// ============================================================

// Base exists for damage lookup, but NOT allowed as a fuse input.
const BASE_VARIANT = { name: "Base", label: "Base (1x)", mult: 1.0, group: "base" };

// These are the selectable SINGLE mutations for fuse inputs.
const MUTS_SINGLE = [
  { name: "Corrupted",   label: "Corrupted (1x)",   mult: 1.0, group: "corrupted" },

  { name: "Gold",        label: "Gold (2x)",        mult: 2.0, group: "any2" },
  { name: "Foggy",       label: "Foggy (2x)",       mult: 2.0, group: "any2" },
  { name: "Electrified", label: "Electrified (2x)", mult: 2.0, group: "any2" },
  { name: "Scorched",    label: "Scorched (2x)",    mult: 2.0, group: "any2" },

  { name: "Diamond",     label: "Diamond (3x)",     mult: 3.0, group: "diamond" },

  { name: "Ruby",        label: "Ruby (4x)",        mult: 4.0, group: "ruby4" },
  { name: "Frozen",      label: "Frozen (4x)",      mult: 4.0, group: "ruby4" },

  { name: "Neon",        label: "Neon (5x)",        mult: 5.0, group: "neon" },

  { name: "Wrapped",     label: "Wrapped (5.5x)",   mult: 5.5, group: "wrapped" },
];

// Group-based fusion results (order independent).
// Key is sorted "a|b". Only combos shown in your chart are included.
const FUSION_MATRIX = {
  "any2|corrupted": 2.65,
  "any2|any2":      3.15,
  "any2|diamond":   4.40,
  "any2|ruby4":     5.40,
  "any2|neon":      6.40,
  "any2|wrapped":   6.50,

  "corrupted|diamond": 3.15,
  "corrupted|ruby4":   3.70,
  "corrupted|neon":    4.20,

  "diamond|ruby4":   5.50,
  "diamond|neon":    6.50,
  "diamond|wrapped": 6.75,

  "ruby4|ruby4":     5.25,
  "neon|ruby4":      6.65,
  "ruby4|wrapped":   7.00,

  "neon|wrapped":    7.50
};

function getFusionMult(groupA, groupB) {
  const k = [groupA, groupB].sort().join("|");
  return Object.prototype.hasOwnProperty.call(FUSION_MATRIX, k) ? FUSION_MATRIX[k] : null;
}

// Build Damage Lookup variants:
// - Base
// - All single mutations
// - All allowed fused combos as NAMED entries (Gold + Wrapped, etc.)
const DAMAGE_VARIANTS = buildDamageVariants();

function buildDamageVariants() {
  const out = [];

  // base + singles
  out.push({ label: BASE_VARIANT.label, mult: BASE_VARIANT.mult });
  for (const m of MUTS_SINGLE) out.push({ label: m.label, mult: m.mult });

  // named fusions from all unique pairs of single mutations
  for (let i = 0; i < MUTS_SINGLE.length; i++) {
    for (let j = i + 1; j < MUTS_SINGLE.length; j++) {
      const a = MUTS_SINGLE[i], b = MUTS_SINGLE[j];

      // can't fuse the exact same mutation
      if (a.name === b.name) continue;

      const mult = getFusionMult(a.group, b.group);
      if (mult == null) continue;

      out.push({
        label: `${a.name} + ${b.name} (${formatNumber(mult)}x)`,
        mult
      });
    }
  }

  // optional: sort by multiplier then name (makes it easier to browse)
  out.sort((x, y) => {
    if (x.mult !== y.mult) return x.mult - y.mult;
    return x.label.localeCompare(y.label);
  });

  return out;
}

// ============================================================
// APP STATE
// ============================================================

let plants = new Map();   // name -> {base, cd?}
let plantNames = [];

// tabs
els.tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    els.tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    Object.values(els.panels).forEach(p => p.classList.remove("active"));
    els.panels[tab].classList.add("active");
  });
});

init().catch(err => {
  console.error(err);
  statusEl.textContent = "Error loading plant data. Check console.";
});

async function init() {
  statusEl.textContent = "Loading plants_base.json…";

  const data = await fetch("plants_base.json").then(r => {
    if (!r.ok) throw new Error(`Failed to fetch plants_base.json (${r.status})`);
    return r.json();
  });

  plants.clear();
  plantNames = [];

  for (const p of data.plants || []) {
    if (!p?.name || !Number.isFinite(Number(p.base))) continue;
    plants.set(p.name, {
      base: Number(p.base),
      cd: Number.isFinite(Number(p.cd)) ? Number(p.cd) : null
    });
    plantNames.push(p.name);
  }

  plantNames.sort((a, b) => a.localeCompare(b));

  fillSelect(els.plant, plantNames);
  fillSelect(els.fPlant, plantNames);

  // Damage lookup variants
  fillVariants();

  // Fuse inputs: only SINGLE mutations (no Base, no already-fused)
  fillSelect(els.mutA, MUTS_SINGLE.map(m => m.label));
  fillSelect(els.mutB, MUTS_SINGLE.map(m => m.label));

  // defaults
  els.plant.selectedIndex = 0;
  els.fPlant.selectedIndex = 0;
  els.variant.selectedIndex = 0;
  els.mutA.selectedIndex = 0;
  els.mutB.selectedIndex = Math.min(2, els.mutB.options.length - 1);

  // events
  els.plant.addEventListener("change", () => { els.copyDamage.disabled = true; els.outDamage.value = ""; });
  els.variant.addEventListener("change", () => { els.copyDamage.disabled = true; els.outDamage.value = ""; });
  els.calcDamage.addEventListener("click", onCalcDamage);
  els.copyDamage.addEventListener("click", () => copyOut(els.outDamage, els.copyDamage));

  els.fPlant.addEventListener("change", () => { els.copyFuse.disabled = true; els.outFuse.value = ""; });
  els.calcFuse.addEventListener("click", onCalcFuse);
  els.copyFuse.addEventListener("click", () => copyOut(els.outFuse, els.copyFuse));

  statusEl.textContent = `Loaded ${plantNames.length} plants ✅`;
}

function fillSelect(sel, items) {
  sel.innerHTML = "";
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it;
    opt.textContent = it;
    sel.appendChild(opt);
  }
}

function fillVariants() {
  els.variant.innerHTML = "";
  for (const v of DAMAGE_VARIANTS) {
    const opt = document.createElement("option");
    opt.value = String(v.mult);
    opt.textContent = v.label;        // already includes name + multiplier for fused entries
    opt.setAttribute("data-label", v.label);
    els.variant.appendChild(opt);
  }
}

// ============================================================
// DAMAGE TAB
// ============================================================

function onCalcDamage() {
  const plantName = els.plant.value;
  const plant = plants.get(plantName);
  if (!plant) return showDamage("Unknown plant.");

  const kgIn = numberOrNull(els.kg.value);
  const lvlIn = numberOrNull(els.lvl.value);

  if (kgIn === null) return showDamage("KG value isn't a number.");
  if (lvlIn === null) return showDamage("Level isn't a number.");

  const lvl = clampInt(lvlIn, 1, 10);

  const mult = Number(els.variant.value);
  const label = els.variant.selectedOptions[0]?.getAttribute("data-label") || "Variant";

  const kgRounded = roundKg(kgIn);
  const kgUsed = clampKgForDamage(kgRounded);

  const dmg = calcDamage(plant.base, kgUsed, mult, lvl);

  let txt =
`Plant:   ${plantName}
Variant: ${label}
KG:      ${kgRounded.toFixed(1)}${kgRounded > 30 ? "  (capped to 30.0 for damage)" : ""}
Level:   ${lvl}
--------------------------------
Damage:  ${formatNumber(dmg)}`;

  if (plant.cd && plant.cd > 0) {
    const dps = dmg / plant.cd;
    txt += `\nCD:      ${plant.cd}s\nDPS:     ${formatNumber(dps)}`;
  }

  els.outDamage.value = txt;
  els.copyDamage.disabled = false;
}

function showDamage(msg) {
  els.outDamage.value = msg;
  els.copyDamage.disabled = true;
}

// ============================================================
// FUSE TAB
// ============================================================

function onCalcFuse() {
  els.copyFuse.disabled = true;
  els.outFuse.value = "";

  const plantName = els.fPlant.value;
  const plant = plants.get(plantName);
  if (!plant) return showFuse("Unknown plant.");

  const kgA = numberOrNull(els.kgA.value);
  const kgB = numberOrNull(els.kgB.value);
  if (kgA === null || kgB === null) return showFuse("KG A / KG B must be numbers.");

  const infoA = parseMutation(els.mutA.value);
  const infoB = parseMutation(els.mutB.value);

  if (!infoA.name || !infoB.name) return showFuse("Pick two valid mutations.");

  // Can't fuse same mutation name
  if (infoA.name === infoB.name) {
    return showFuse(`You can't fuse the same mutation with itself (${infoA.name} + ${infoB.name}).`);
  }

  // Result KG rule (your weight rules)
  const kgR = fuseResultKg(kgA, kgB);

  // Fusion result from matrix
  const fuse = fuseResultMult(infoA, infoB);
  if (!fuse) return showFuse("Unsupported fusion combo (not in the current matrix).");

  let lvlR = numberOrNull(els.fLvl.value);
  if (lvlR === null) lvlR = 1;
  lvlR = clampInt(lvlR, 1, 10);

  const kgUsed = clampKgForDamage(kgR);
  const dmg = calcDamage(plant.base, kgUsed, fuse.mult, lvlR);

  let txt =
`Plant A: ${plantName} | ${formatKg(kgA)}kg | ${els.mutA.value}
Plant B: ${plantName} | ${formatKg(kgB)}kg | ${els.mutB.value}
--------------------------------
Result KG:       ${kgR.toFixed(1)}kg${kgR > 30 ? "  (capped to 30.0 for damage)" : ""}
Result Mutation: ${fuse.label}  [${formatNumber(fuse.mult)}x]
Rule used:       ${fuse.note}
--------------------------------
Damage (Level ${lvlR}): ${formatNumber(dmg)}`;

  if (plant.cd && plant.cd > 0) {
    const dps = dmg / plant.cd;
    txt += `\nCD: ${plant.cd}s | DPS: ${formatNumber(dps)}`;
  }

  els.outFuse.value = txt;
  els.copyFuse.disabled = false;
}

function showFuse(msg) {
  els.outFuse.value = msg;
  els.copyFuse.disabled = true;
}

function fuseResultKg(kgA, kgB) {
  // Your rule:
  // avg = (kgA + kgB)/2
  // ceil(avg)
  // if avg is whole number -> add +1kg after ceil
  const avg = (kgA + kgB) / 2;
  const c = Math.ceil(avg);
  const out = isWhole(avg) ? (c + 1) : c;
  return roundKg(out);
}

function fuseResultMult(a, b) {
  const mult = getFusionMult(a.group, b.group);
  if (mult == null) return null;

  return {
    mult,
    label: `${a.name} + ${b.name}`,
    note: `${a.group} + ${b.group} => ${formatNumber(mult)}x`
  };
}

function parseMutation(labelText) {
  const m = MUTS_SINGLE.find(x => x.label === labelText);
  if (!m) return { name: "", group: "unknown", mult: null };
  return { name: m.name, group: m.group, mult: m.mult };
}

// ============================================================
// MATH + FORMAT HELPERS
// ============================================================

function levelFactor(lvl) { return (lvl + 1) / 2; }
function calcDamage(base, kg, mult, lvl) { return base * kg * mult * levelFactor(lvl); }

function clampKgForDamage(kg) {
  const k = roundKg(kg);
  return Math.min(k, 30.0);
}

function roundKg(kg) {
  return Math.round(Number(kg) * 10) / 10;
}

function isWhole(x) {
  return Math.abs(x - Math.round(x)) < 1e-9;
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(n, lo, hi) {
  n = Math.trunc(n);
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

function formatKg(n) {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return stripZeros(Number(n).toFixed(2));
}

function formatNumber(n) {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return stripZeros(Number(n).toFixed(2));
}

function stripZeros(s) {
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

// ============================================================
// COPY
// ============================================================

async function copyOut(textarea, btn) {
  const txt = textarea.value.trim();
  if (!txt) return;
  await navigator.clipboard.writeText(txt);
  const old = btn.textContent;
  btn.textContent = "Copied ✅";
  setTimeout(() => btn.textContent = old, 800);
}

// ---------- KIMYOVIY FORMULA PARSERI ----------
// Qo'llab-quvvatlanadi: element belgilari, ko'p xonali indekslar,
// ichma-ich qavslar ( ), [ ], va gidrat yozuvi ("*5H2O" yoki "·5H2O").
// Masalan: H2O, C6H12O6, Ca(OH)2, Al2(SO4)3, [Cu(NH3)4]SO4, CuSO4*5H2O

function parseSimpleFormula(formula) {
  let i = 0;

  function parseNumber() {
    const start = i;
    while (i < formula.length && /[0-9]/.test(formula[i])) i++;
    return i > start ? parseInt(formula.slice(start, i), 10) : 1;
  }

  function parseGroup() {
    const counts = {};
    while (i < formula.length && formula[i] !== ")" && formula[i] !== "]") {
      const ch = formula[i];
      if (ch === "(" || ch === "[") {
        i++;
        const inner = parseGroup();
        if (formula[i] !== ")" && formula[i] !== "]") {
          throw new Error("Formulada qavs yopilmagan");
        }
        i++;
        const mult = parseNumber();
        for (const [el, n] of Object.entries(inner)) {
          counts[el] = (counts[el] || 0) + n * mult;
        }
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i++;
        if (i < formula.length && /[a-z]/.test(formula[i])) {
          sym += formula[i];
          i++;
        }
        if (!ATOMIC_WEIGHTS.hasOwnProperty(sym)) {
          throw new Error(`Noma'lum element belgisi: "${sym}"`);
        }
        const n = parseNumber();
        counts[sym] = (counts[sym] || 0) + n;
      } else {
        throw new Error(`Formulada kutilmagan belgi: "${ch}"`);
      }
    }
    return counts;
  }

  const counts = parseGroup();
  if (i !== formula.length) throw new Error("Formulada ortiqcha yopuvchi qavs bor");

  let mass = 0;
  for (const [el, n] of Object.entries(counts)) mass += ATOMIC_WEIGHTS[el] * n;
  return { counts, mass };
}

function parseFormula(rawFormula) {
  const formula = rawFormula.replace(/\s+/g, "");
  if (!formula) throw new Error("Formula bo'sh bo'lmasligi kerak");

  // Gidrat yozuvi: "asosiyQism * son gidratQism" (masalan CuSO4*5H2O)
  const hydrateMatch = formula.match(/^(.+?)[*·](\d*)(.+)$/);
  if (hydrateMatch) {
    const [, mainPart, countStr, hydratePart] = hydrateMatch;
    const count = countStr ? parseInt(countStr, 10) : 1;
    const mainResult = parseSimpleFormula(mainPart);
    const hydrateResult = parseSimpleFormula(hydratePart);

    const counts = { ...mainResult.counts };
    for (const [el, n] of Object.entries(hydrateResult.counts)) {
      counts[el] = (counts[el] || 0) + n * count;
    }
    return { counts, mass: mainResult.mass + hydrateResult.mass * count };
  }

  return parseSimpleFormula(formula);
}

function formatNum(n, digits = 4) {
  if (!isFinite(n)) return "—";
  const rounded = Number(n.toFixed(digits));
  return rounded.toString();
}

// ---------- TAB ALMASHTIRISH ----------
document.querySelectorAll(".calc-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".calc-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".calc-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
  });
});

// ---------- 1. MOLYAR MASSA ----------
document.getElementById("calcMolarBtn").addEventListener("click", () => {
  const out = document.getElementById("molarResult");
  const formula = document.getElementById("formulaInput").value;
  try {
    const { counts, mass } = parseFormula(formula);
    const rows = Object.entries(counts)
      .map(([el, n]) => `<tr><td>${el}</td><td>${n}</td><td>${formatNum(ATOMIC_WEIGHTS[el], 3)}</td><td>${formatNum(ATOMIC_WEIGHTS[el] * n, 3)}</td></tr>`)
      .join("");
    out.innerHTML = `
      <div class="calc-big">M = ${formatNum(mass, 4)} g/mol</div>
      <table class="calc-table">
        <thead><tr><th>Element</th><th>Soni</th><th>Ar (g/mol)</th><th>Ulush (g/mol)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    out.classList.remove("error");
  } catch (err) {
    out.innerHTML = `⚠️ ${err.message}`;
    out.classList.add("error");
  }
});

// ---------- 2. MOLARLIK: M = n / V ----------
document.getElementById("calcMolarityBtn").addEventListener("click", () => {
  const out = document.getElementById("molarityResult");
  const n = parseFloat(document.getElementById("molarityMol").value);
  const v = parseFloat(document.getElementById("molarityVol").value);
  if (!isFinite(n) || !isFinite(v) || v <= 0) {
    out.innerHTML = "⚠️ Mol miqdori va hajmni (hajm 0 dan katta) to'g'ri kiriting";
    out.classList.add("error");
    return;
  }
  const molarity = n / v;
  out.innerHTML = `<div class="calc-big">C = ${formatNum(molarity)} mol/L</div>
    <p>${formatNum(n)} mol modda ${formatNum(v)} L eritmada</p>`;
  out.classList.remove("error");
});

// ---------- 3. SUYULTIRISH: C1V1 = C2V2 ----------
document.getElementById("calcDilutionBtn").addEventListener("click", () => {
  const out = document.getElementById("dilutionResult");
  const rawIds = ["dC1", "dV1", "dC2", "dV2"];
  const raw = rawIds.map((id) => document.getElementById(id).value.trim());
  const vals = raw.map((v) => (v === "" ? null : parseFloat(v)));
  const missingCount = vals.filter((v) => v === null).length;

  if (missingCount !== 1) {
    out.innerHTML = "⚠️ Aynan 3 ta qiymatni kiriting, topilishi kerak bo'lgan 1 tasini bo'sh qoldiring";
    out.classList.add("error");
    return;
  }

  const [c1, v1, c2, v2] = vals;
  let result, label;
  if (c1 === null) { result = (c2 * v2) / v1; label = "C₁"; }
  else if (v1 === null) { result = (c2 * v2) / c1; label = "V₁"; }
  else if (c2 === null) { result = (c1 * v1) / v2; label = "C₂"; }
  else { result = (c1 * v1) / c2; label = "V₂"; }

  if (!isFinite(result)) {
    out.innerHTML = "⚠️ Hisoblab bo'lmadi — kiritilgan qiymatlarni tekshiring (nolga bo'lish mumkin emas)";
    out.classList.add("error");
    return;
  }
  const unit = label.startsWith("C") ? "mol/L" : "L";
  out.innerHTML = `<div class="calc-big">${label} = ${formatNum(result)} ${unit}</div>
    <p>C₁V₁ = C₂V₂ tenglamasidan topildi</p>`;
  out.classList.remove("error");
});

// ---------- 4. MASSA <-> MOL: n = m / M ----------
document.getElementById("calcConvertBtn").addEventListener("click", () => {
  const out = document.getElementById("convertResult");
  const formula = document.getElementById("convFormula").value;
  const massRaw = document.getElementById("convMass").value.trim();
  const molRaw = document.getElementById("convMol").value.trim();

  let parsed;
  try {
    parsed = parseFormula(formula);
  } catch (err) {
    out.innerHTML = `⚠️ ${err.message}`;
    out.classList.add("error");
    return;
  }

  if ((massRaw === "" && molRaw === "") || (massRaw !== "" && molRaw !== "")) {
    out.innerHTML = "⚠️ Faqat massa YOKI faqat mol maydonini to'ldiring (ikkalasini emas)";
    out.classList.add("error");
    return;
  }

  const M = parsed.mass;
  if (massRaw !== "") {
    const m = parseFloat(massRaw);
    const n = m / M;
    out.innerHTML = `<div class="calc-big">n = ${formatNum(n)} mol</div>
      <p>M(${escapeHtml(formula)}) = ${formatNum(M, 4)} g/mol, n = m / M</p>`;
  } else {
    const n = parseFloat(molRaw);
    const m = n * M;
    out.innerHTML = `<div class="calc-big">m = ${formatNum(m)} g</div>
      <p>M(${escapeHtml(formula)}) = ${formatNum(M, 4)} g/mol, m = n × M</p>`;
  }
  out.classList.remove("error");
});

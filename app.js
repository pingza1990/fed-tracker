/* =============================================================================
 *  app.js — ตรรกะการแสดงผลทั้งหมด (vanilla JS, ไม่มี dependency)
 *  วาดกราฟด้วย SVG เอง: FedWatch bars, Dot Plot, Rate Path
 * ========================================================================== */

const fmtPct = (n) => `${n.toFixed(2)}%`;
const fmtRange = (r) => `${r.lower.toFixed(2)}–${r.upper.toFixed(2)}%`;

// ---------- tooltip ใช้ร่วมกันทั้งหน้า ----------
const tip = document.createElement("div");
tip.className = "tip";
document.body.appendChild(tip);
function showTip(html, e) {
  tip.innerHTML = html;
  tip.classList.add("show");
  moveTip(e);
}
function moveTip(e) {
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tip.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip() { tip.classList.remove("show"); }

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* ---------------------------------------------------------------------------
 *  1) สรุปด้านบน (KPIs)
 * ------------------------------------------------------------------------- */
function renderSummary() {
  const cur = FedData.currentRate;
  document.getElementById("curRate").textContent = fmtRange(cur);
  document.getElementById("curRateFoot").textContent = "Target Range · กลางกรอบ " +
    (((cur.lower + cur.upper) / 2).toFixed(3)) + "%";

  const next = FedData.meetings[0];
  document.getElementById("nextMeeting").textContent = next.label;
  document.getElementById("nextMeetingFoot").textContent = next.date;

  // หาผลที่ตลาดให้น้ำหนักมากสุดในการประชุมถัดไป
  const top = topOutcome(next);
  document.getElementById("nextExpect").textContent = `${top.prob}%`;
  document.getElementById("nextExpectFoot").textContent = outcomeText(top.bucket);

  // คาดว่าจะลดดอกเบี้ยครั้งแรกเมื่อใด (ความน่าจะเป็นสะสมของ "ลด" > 50%)
  const fc = firstCutMeeting();
  if (fc) {
    document.getElementById("firstCut").textContent = fc.label;
    document.getElementById("firstCutFoot").textContent =
      `โอกาสลดสะสม ${fc.cumCut}% ภายในเดือนนี้`;
  } else {
    document.getElementById("firstCut").textContent = "—";
    document.getElementById("firstCutFoot").textContent = "ยังไม่เกิน 50% ในช่วงที่ดู";
  }

  document.getElementById("lastUpdated").textContent = FedData.lastUpdated;
  document.getElementById("sepDate").textContent = FedData.dotPlot.sepDate;
}

function topOutcome(meeting) {
  let best = { bucket: null, prob: -1 };
  for (const b in meeting.probs) {
    if (meeting.probs[b] > best.prob) best = { bucket: +b, prob: meeting.probs[b] };
  }
  return best;
}

// เทียบ bucket กับขอบล่างปัจจุบัน → ขึ้น/ลง/คง
function classify(bucketLower) {
  const curLower = FedData.currentRate.lower;
  if (Math.abs(bucketLower - curLower) < 0.001) return "hold";
  return bucketLower < curLower ? "cut" : "hike";
}
function outcomeText(bucketLower) {
  const c = classify(bucketLower);
  const diff = Math.round(Math.abs(bucketLower - FedData.currentRate.lower) * 100);
  if (c === "hold") return "คงดอกเบี้ยที่กรอบเดิม";
  if (c === "cut") return `ลดดอกเบี้ย ${diff} bps → ${bucketLower.toFixed(2)}–${(bucketLower+0.25).toFixed(2)}%`;
  return `ขึ้นดอกเบี้ย ${diff} bps → ${bucketLower.toFixed(2)}–${(bucketLower+0.25).toFixed(2)}%`;
}

// การประชุมแรกที่โอกาส "ลด" สะสมเกิน 50%
function firstCutMeeting() {
  for (const m of FedData.meetings) {
    let cumCut = 0;
    for (const b in m.probs) if (classify(+b) === "cut") cumCut += m.probs[b];
    if (cumCut >= 50) return { ...m, cumCut: Math.round(cumCut) };
  }
  return null;
}

/* ---------------------------------------------------------------------------
 *  2) FedWatch bars
 * ------------------------------------------------------------------------- */
function renderFedWatch() {
  const wrap = document.getElementById("fedwatch");
  wrap.innerHTML = "";

  FedData.meetings.forEach((m) => {
    const row = document.createElement("div");
    row.className = "fw-row";

    const meta = document.createElement("div");
    meta.className = "fw-meeting";
    meta.innerHTML = `<span class="m-label">${m.label}</span><span class="m-date">${m.date}</span>`;
    row.appendChild(meta);

    const bar = document.createElement("div");
    bar.className = "fw-bar";

    // เรียง bucket จากสูง→ต่ำ เพื่อให้ "ขึ้น" อยู่ซ้าย, "ลด" อยู่ขวา
    const buckets = Object.keys(m.probs).map(Number).sort((a, b) => b - a);
    buckets.forEach((b) => {
      const prob = m.probs[b];
      const cls = classify(b);
      const seg = document.createElement("div");
      seg.className = `fw-seg seg-${cls}`;
      seg.style.flex = prob;
      if (prob >= 8) {
        seg.innerHTML = `<span class="seg-prob">${prob}%</span><span class="seg-rate">${b.toFixed(2)}%</span>`;
      }
      seg.addEventListener("mousemove", (e) =>
        showTip(`<b>${m.label}</b><br>กรอบ ${b.toFixed(2)}–${(b+0.25).toFixed(2)}%<br>${outcomeText(b)}<br>โอกาส <b>${prob}%</b>`, e));
      seg.addEventListener("mouseleave", hideTip);
      bar.appendChild(seg);
    });
    row.appendChild(bar);
    wrap.appendChild(row);
  });

  // legend
  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `
    <span><i class="dot" style="background:var(--cut)"></i> ลดดอกเบี้ย</span>
    <span><i class="dot" style="background:var(--hold)"></i> คงดอกเบี้ย</span>
    <span><i class="dot" style="background:var(--hike)"></i> ขึ้นดอกเบี้ย</span>`;
  wrap.appendChild(legend);
}

/* ---------------------------------------------------------------------------
 *  3) Dot Plot (SVG)
 * ------------------------------------------------------------------------- */
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function renderDotPlot() {
  const wrap = document.getElementById("dotplot");
  wrap.innerHTML = "";

  const years = FedData.dotPlot.years;
  const cols = Object.keys(years);
  const colLabels = cols.map((c) => (c === "LongRun" ? "ระยะยาว" : c));

  // หาช่วงค่า y
  let all = [];
  cols.forEach((c) => all.push(...years[c]));
  const yMin = Math.floor(Math.min(...all) * 4) / 4 - 0.25;
  const yMax = Math.ceil(Math.max(...all) * 4) / 4 + 0.25;

  const W = Math.max(680, cols.length * 150);
  const H = 420;
  const m = { top: 20, right: 24, bottom: 40, left: 54 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });

  const yToPx = (v) => m.top + plotH * (1 - (v - yMin) / (yMax - yMin));
  const colX = (i) => m.left + plotW * ((i + 0.5) / cols.length);

  // เส้น grid แนวนอน ทุก 0.25%
  for (let v = Math.ceil(yMin * 4) / 4; v <= yMax + 0.001; v += 0.25) {
    const y = yToPx(v);
    svg.appendChild(el("line", { class: "dp-grid", x1: m.left, y1: y, x2: W - m.right, y2: y }));
    const t = el("text", { class: "dp-text-mono", x: m.left - 10, y: y + 4, "text-anchor": "end" });
    t.textContent = v.toFixed(2);
    svg.appendChild(t);
  }

  // แกน x labels + จุด
  cols.forEach((c, i) => {
    const x = colX(i);
    const t = el("text", { class: "dp-text", x, y: H - 14, "text-anchor": "middle" });
    t.textContent = colLabels[i];
    svg.appendChild(t);

    // นับจำนวนจุดที่ค่าเดียวกันเพื่อกระจายแนวนอน (jitter แบบเป็นระเบียบ)
    const counts = {};
    years[c].forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const placed = {};
    years[c].forEach((v) => {
      const total = counts[v];
      const idx = placed[v] = (placed[v] || 0) + 1;
      const spread = 13;
      const offset = (idx - (total + 1) / 2) * spread;
      const cx = x + offset;
      const cy = yToPx(v);
      const dot = el("circle", { class: "dp-dot", cx, cy, r: 5.5, fill: "var(--accent)", "fill-opacity": 0.85, stroke: "#0b1020", "stroke-width": 1 });
      dot.addEventListener("mousemove", (e) =>
        showTip(`<b>${colLabels[i]}</b><br>มอง ${v.toFixed(3)}% (กรอบ ${(v-0.125).toFixed(2)}–${(v+0.125).toFixed(2)}%)`, e));
      dot.addEventListener("mouseleave", hideTip);
      svg.appendChild(dot);
    });

    // เส้น median
    const med = median(years[c]);
    const my = yToPx(med);
    svg.appendChild(el("line", { class: "dp-median", x1: x - 50, y1: my, x2: x + 50, y2: my }));
    const ml = el("text", { class: "dp-median-label", x: x, y: my - 9, "text-anchor": "middle" });
    ml.textContent = "med " + med.toFixed(2);
    svg.appendChild(ml);
  });

  // เส้นแกน
  svg.appendChild(el("line", { class: "dp-axis", x1: m.left, y1: m.top, x2: m.left, y2: H - m.bottom }));

  wrap.appendChild(svg);
}

/* ---------------------------------------------------------------------------
 *  4) Rate Path — ประวัติจริง + เส้นทางคาดการณ์จาก FedWatch
 * ------------------------------------------------------------------------- */
// อัตราคาดการณ์ของแต่ละ meeting = ผลรวมถ่วงน้ำหนัก (expected value) ของ bucket
function expectedRate(meeting) {
  let ev = 0, tot = 0;
  for (const b in meeting.probs) {
    // ใช้กลางกรอบ = bucketLower + 0.125
    ev += (+b + 0.125) * meeting.probs[b];
    tot += meeting.probs[b];
  }
  return tot ? ev / tot : null;
}

function renderRatePath() {
  const wrap = document.getElementById("ratepath");
  wrap.innerHTML = "";

  // ชุดประวัติ (ใช้ขอบบน → แปลงเป็นกลางกรอบ -0.125)
  const hist = FedData.rateHistory.map((d) => ({ label: d.date, val: d.rate - 0.125, type: "hist" }));
  // เริ่มเส้น proj จากจุดปัจจุบัน (กลางกรอบ)
  const curMid = (FedData.currentRate.lower + FedData.currentRate.upper) / 2;
  const proj = [{ label: "ปัจจุบัน", val: curMid, type: "proj" }];
  FedData.meetings.forEach((m) => proj.push({ label: m.label, val: expectedRate(m), type: "proj" }));

  const points = [...hist, ...proj];
  const vals = points.map((p) => p.val);
  const yMin = Math.floor(Math.min(...vals) * 2) / 2 - 0.25;
  const yMax = Math.ceil(Math.max(...vals) * 2) / 2 + 0.25;

  const W = Math.max(720, points.length * 58);
  const H = 320;
  const m = { top: 20, right: 24, bottom: 54, left: 50 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });

  // gradient ใต้เส้น
  const defs = el("defs");
  const grad = el("linearGradient", { id: "rpGrad", x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el("stop", { offset: "0%", "stop-color": "var(--accent)" }));
  grad.appendChild(el("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const xAt = (i) => m.left + plotW * (i / (points.length - 1));
  const yAt = (v) => m.top + plotH * (1 - (v - yMin) / (yMax - yMin));

  // grid + y labels ทุก 0.5%
  for (let v = Math.ceil(yMin * 2) / 2; v <= yMax + 0.001; v += 0.5) {
    const y = yAt(v);
    svg.appendChild(el("line", { class: "dp-grid", x1: m.left, y1: y, x2: W - m.right, y2: y }));
    const t = el("text", { class: "dp-text-mono", x: m.left - 8, y: y + 4, "text-anchor": "end" });
    t.textContent = v.toFixed(2);
    svg.appendChild(t);
  }

  const lineFor = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${xAt(p.gi)},${yAt(p.val)}`).join(" ");

  // ผูก global index
  points.forEach((p, i) => (p.gi = i));
  const histPts = points.filter((p) => p.type === "hist");
  const projPts = points.filter((p) => p.type === "proj");

  // area ใต้เส้นประวัติ
  if (histPts.length) {
    const area = `${lineFor(histPts)} L${xAt(histPts[histPts.length-1].gi)},${yAt(yMin)} L${xAt(histPts[0].gi)},${yAt(yMin)} Z`;
    svg.appendChild(el("path", { class: "rp-area", d: area }));
  }

  svg.appendChild(el("path", { class: "rp-line-hist", d: lineFor(histPts) }));
  svg.appendChild(el("path", { class: "rp-line-proj", d: lineFor(projPts) }));

  // จุด + x labels (แสดง label เว้นระยะถ้าแน่นไป)
  const step = points.length > 12 ? 2 : 1;
  points.forEach((p, i) => {
    const cx = xAt(i), cy = yAt(p.val);
    const dot = el("circle", { class: p.type === "hist" ? "rp-dot-hist" : "rp-dot-proj", cx, cy, r: 4 });
    dot.addEventListener("mousemove", (e) =>
      showTip(`<b>${p.label}</b><br>${p.type === "hist" ? "อัตราจริง" : "ตลาดคาด"} ~ <b>${p.val.toFixed(2)}%</b>`, e));
    dot.addEventListener("mouseleave", hideTip);
    svg.appendChild(dot);

    if (i % step === 0 || i === points.length - 1) {
      const t = el("text", { class: "dp-text-mono", x: cx, y: H - 18, "text-anchor": "middle", transform: `rotate(-35 ${cx} ${H - 18})` });
      t.textContent = p.label;
      svg.appendChild(t);
    }
  });

  // legend
  const lg = el("g");
  lg.appendChild(el("line", { x1: m.left, y1: H - 6, x2: m.left + 22, y2: H - 6, class: "rp-line-hist" }));
  const t1 = el("text", { class: "dp-text", x: m.left + 28, y: H - 2 }); t1.textContent = "อัตราจริง";
  lg.appendChild(t1);
  lg.appendChild(el("line", { x1: m.left + 110, y1: H - 6, x2: m.left + 132, y2: H - 6, class: "rp-line-proj" }));
  const t2 = el("text", { class: "dp-text", x: m.left + 138, y: H - 2 }); t2.textContent = "ตลาดคาด (FedWatch)";
  lg.appendChild(t2);
  svg.appendChild(lg);

  wrap.appendChild(svg);
}

/* ---------------------------------------------------------------------------
 *  5) Dot Plot vs Market — เทียบมุมมอง Fed กับที่ตลาดคาด (SVG)
 * ------------------------------------------------------------------------- */
// อัตราที่ตลาดคาด ณ สิ้นปีนั้น = expected rate ของการประชุมรอบสุดท้ายในปีนั้น
function marketYearEnd(year) {
  const ms = FedData.meetings.filter((m) => m.date.startsWith(year));
  if (!ms.length) return null;
  const last = ms[ms.length - 1];
  return { rate: expectedRate(last), label: last.label, isDec: last.date.slice(5, 7) === "12" };
}

function renderCompare() {
  const wrap = document.getElementById("compare");
  wrap.innerHTML = "";

  // เฉพาะปีปฏิทิน (ตัด LongRun) ที่มีทั้ง dot plot และข้อมูลตลาด
  const years = Object.keys(FedData.dotPlot.years).filter((y) => y !== "LongRun");
  const rows = years.map((y) => {
    const dots = FedData.dotPlot.years[y];
    return {
      year: y,
      med: median(dots),
      min: Math.min(...dots),
      max: Math.max(...dots),
      market: marketYearEnd(y),
    };
  });

  // ขอบเขตแกน y
  let vals = [];
  rows.forEach((r) => { vals.push(r.min, r.max); if (r.market) vals.push(r.market.rate); });
  const yMin = Math.floor(Math.min(...vals) * 4) / 4 - 0.25;
  const yMax = Math.ceil(Math.max(...vals) * 4) / 4 + 0.25;

  const W = Math.max(620, rows.length * 160);
  const H = 380;
  const m = { top: 22, right: 24, bottom: 56, left: 54 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });

  const yToPx = (v) => m.top + plotH * (1 - (v - yMin) / (yMax - yMin));
  const colX = (i) => m.left + plotW * ((i + 0.5) / rows.length);

  for (let v = Math.ceil(yMin * 4) / 4; v <= yMax + 0.001; v += 0.25) {
    const y = yToPx(v);
    svg.appendChild(el("line", { class: "dp-grid", x1: m.left, y1: y, x2: W - m.right, y2: y }));
    const t = el("text", { class: "dp-text-mono", x: m.left - 10, y: y + 4, "text-anchor": "end" });
    t.textContent = v.toFixed(2);
    svg.appendChild(t);
  }

  rows.forEach((r, i) => {
    const x = colX(i);
    // แท่งช่วง Fed (min–max)
    svg.appendChild(el("rect", {
      x: x - 9, y: yToPx(r.max), width: 18, height: Math.max(2, yToPx(r.min) - yToPx(r.max)),
      rx: 6, fill: "var(--accent)", "fill-opacity": 0.22, stroke: "var(--accent)", "stroke-opacity": 0.5,
    }));
    // เส้น median
    const my = yToPx(r.med);
    svg.appendChild(el("line", { class: "dp-median", x1: x - 22, y1: my, x2: x + 22, y2: my }));
    const ml = el("text", { class: "dp-median-label", x: x + 26, y: my + 4, "text-anchor": "start" });
    ml.textContent = r.med.toFixed(2);
    svg.appendChild(ml);

    // เพชรเขียว = ตลาดคาด
    if (r.market) {
      const mk = yToPx(r.market.rate);
      const s = 7;
      const dia = el("path", {
        d: `M${x},${mk - s} L${x + s},${mk} L${x},${mk + s} L${x - s},${mk} Z`,
        fill: "var(--cut)", stroke: "#0b1020", "stroke-width": 1,
      });
      const gapBps = Math.round((r.med - r.market.rate) * 100);
      const gapTxt = (gapBps >= 0 ? "+" : "") + gapBps + " bps";
      dia.addEventListener("mousemove", (e) => showTip(
        `<b>${r.year}</b><br>Fed median: ${r.med.toFixed(2)}%<br>ตลาดคาด (${r.market.label}): ${r.market.rate.toFixed(2)}%<br>ส่วนต่าง: <b>${gapTxt}</b>`, e));
      dia.addEventListener("mouseleave", hideTip);
      svg.appendChild(dia);

      // ป้ายส่วนต่าง
      const gl = el("text", { class: "dp-text-mono", x: x - 26, y: mk + 4, "text-anchor": "end" });
      gl.setAttribute("fill", gapBps > 5 ? "var(--hike)" : gapBps < -5 ? "var(--cut)" : "var(--muted)");
      gl.textContent = gapTxt;
      svg.appendChild(gl);
    }

    // ป้ายปี + หมายเหตุถ้าตลาดไม่ครบปี
    const t = el("text", { class: "dp-text", x, y: H - 30, "text-anchor": "middle" });
    t.textContent = r.year === "LongRun" ? "ระยะยาว" : r.year;
    svg.appendChild(t);
    if (r.market && !r.market.isDec) {
      const note = el("text", { class: "dp-text-mono", x, y: H - 14, "text-anchor": "middle" });
      note.setAttribute("fill", "var(--muted)");
      note.textContent = `ตลาดถึง ${r.market.label}`;
      svg.appendChild(note);
    } else if (!r.market) {
      const note = el("text", { class: "dp-text-mono", x, y: H - 14, "text-anchor": "middle" });
      note.setAttribute("fill", "var(--muted)");
      note.textContent = "ไม่มีข้อมูลตลาด";
      svg.appendChild(note);
    }
  });

  svg.appendChild(el("line", { class: "dp-axis", x1: m.left, y1: m.top, x2: m.left, y2: H - m.bottom }));
  wrap.appendChild(svg);
}

/* ---------------------------------------------------------------------------
 *  6) ดึงข้อมูลสด: backend > live_data.json > sample (data.js)
 * ------------------------------------------------------------------------- */
let fwSource = "sample";   // แหล่งข้อมูล FedWatch ปัจจุบัน
let fredLive = false;      // true เมื่อกรอบดอกเบี้ยดึงจาก FRED จริง

function setSource(kind, asOf) {
  fwSource = kind;
  const badge = document.getElementById("dataSource");
  const map = {
    yahoo: ["LIVE · Yahoo futures", "src-live"],
    mixed: ["LIVE · mixed", "src-live"],
    manual: ["ราคาที่กรอกเอง", "src-live"],
    live: ["LIVE", "src-live"],
    sample: ["ข้อมูลตัวอย่าง", "src-sample"],
  };
  const [text, cls] = map[kind] || map.sample;
  badge.textContent = asOf ? `${text} · ${asOf.slice(0, 16).replace("T", " ")}` : text;
  badge.className = "src-badge " + cls;
}

async function loadData() {
  // 1) backend API (single origin, ไม่มี CORS)
  try {
    const r = await fetch("api/fedwatch", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j.meetings && j.meetings.length) {
        FedData.meetings = j.meetings;
        if (j.currentRate) FedData.currentRate = j.currentRate;
        if (j.rateSource === "fred") fredLive = true;  // กรอบดอกเบี้ยมาจาก FRED (ผ่าน workflow/backend)
        setSource(j.source || "live", j.asOf);
        return;
      }
    }
  } catch (e) { /* ไม่มี backend — ลองวิธีถัดไป */ }

  // 2) ไฟล์ที่ generate ไว้ล่วงหน้า (สำหรับ static hosting + GitHub Action)
  try {
    const r = await fetch("live_data.json", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j.meetings && j.meetings.length) {
        FedData.meetings = j.meetings;
        if (j.currentRate) FedData.currentRate = j.currentRate;
        if (j.rateSource === "fred") fredLive = true;  // กรอบดอกเบี้ยมาจาก FRED (ผ่าน workflow/backend)
        setSource(j.source || "live", j.asOf);
        return;
      }
    }
  } catch (e) { /* ไม่มีไฟล์ */ }

  // 3) ข้อมูลตัวอย่างใน data.js
  setSource("sample", FedData.lastUpdated);
}

/* ---------------------------------------------------------------------------
 *  6b) ประวัติการเปลี่ยนแปลงโอกาส
 * ------------------------------------------------------------------------- */
let FedHistory = [];
let histSource = "sample";

// รวมโอกาสของการประชุมหนึ่งเป็น ลด/คง/ขึ้น
function aggregateMeeting(meeting) {
  let cut = 0, hold = 0, hike = 0;
  for (const b in meeting.probs) {
    const c = classify(+b), v = meeting.probs[b];
    if (c === "cut") cut += v; else if (c === "hike") hike += v; else hold += v;
  }
  return { cut: +cut.toFixed(1), hold: +hold.toFixed(1), hike: +hike.toFixed(1) };
}

async function loadHistory() {
  // ใช้ประวัติจริงเมื่อมี ≥ 2 จุด (น้อยกว่านั้นกราฟยังไม่มีความหมาย → โชว์ตัวอย่าง)
  for (const [url, tag] of [["api/history", "backend"], ["history.json", "live"]]) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && j.length >= 2) { FedHistory = j; histSource = tag; return; }
      }
    } catch (e) { /* ลองถัดไป */ }
  }
  FedHistory = (FedData.sampleHistory || []).slice();
  histSource = "sample";
}

function populateHistMeetings() {
  const sel = document.getElementById("histMeeting");
  // รวมการประชุมที่ปรากฏในประวัติ
  const seen = new Map();
  FedHistory.forEach((s) => (s.snap || []).forEach((e) => {
    if (!seen.has(e.date)) seen.set(e.date, e.label || e.date);
  }));
  // ถ้าประวัติว่าง ใช้รายการการประชุมปัจจุบัน
  if (!seen.size) FedData.meetings.forEach((m) => seen.set(m.date, m.label));
  const prev = sel.value;
  sel.innerHTML = "";
  for (const [date, label] of seen) {
    const o = document.createElement("option");
    o.value = date; o.textContent = label;
    sel.appendChild(o);
  }
  if (prev && seen.has(prev)) sel.value = prev;
}

function renderHistory() {
  const wrap = document.getElementById("history");
  const sel = document.getElementById("histMeeting");
  const srcEl = document.getElementById("histSrc");
  wrap.innerHTML = "";
  const srcMap = { backend: "ข้อมูลจริงจาก backend", live: "จากไฟล์ที่บันทึกไว้", sample: "ข้อมูลตัวอย่าง" };
  srcEl.textContent = srcMap[histSource] || "";

  const meetingDate = sel.value;
  // จุดข้อมูลของการประชุมที่เลือก เรียงตามวันที่ snapshot
  const series = FedHistory
    .map((s) => {
      const e = (s.snap || []).find((x) => x.date === meetingDate);
      return e ? { label: s.date, cut: e.cut, hold: e.hold, hike: e.hike } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  if (series.length < 2) {
    const p = document.createElement("p");
    p.className = "al-empty";
    p.textContent = series.length === 1
      ? "มีข้อมูลเพียง 1 จุด — ประวัติจะสะสมขึ้นเรื่อยๆ เมื่อรันผ่าน backend ทุกวัน"
      : "ยังไม่มีประวัติของการประชุมนี้";
    wrap.appendChild(p);
    return;
  }

  const W = Math.max(720, series.length * 64);
  const H = 300;
  const m = { top: 18, right: 20, bottom: 46, left: 44 };
  const plotW = W - m.left - m.right, plotH = H - m.top - m.bottom;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H });

  const xAt = (i) => m.left + plotW * (i / (series.length - 1));
  const yAt = (v) => m.top + plotH * (1 - v / 100);

  for (let v = 0; v <= 100; v += 25) {
    const y = yAt(v);
    svg.appendChild(el("line", { class: "dp-grid", x1: m.left, y1: y, x2: W - m.right, y2: y }));
    const t = el("text", { class: "dp-text-mono", x: m.left - 8, y: y + 4, "text-anchor": "end" });
    t.textContent = v + "%";
    svg.appendChild(t);
  }

  const path = (key) => series.map((p, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(p[key])}`).join(" ");
  svg.appendChild(el("path", { class: "hl-hold", d: path("hold") }));
  svg.appendChild(el("path", { class: "hl-hike", d: path("hike") }));
  svg.appendChild(el("path", { class: "hl-cut", d: path("cut") }));

  const colorOf = { cut: "var(--cut)", hold: "var(--hold)", hike: "var(--hike)" };
  series.forEach((p, i) => {
    ["hold", "hike", "cut"].forEach((key) => {
      const dot = el("circle", { cx: xAt(i), cy: yAt(p[key]), r: 3.2, fill: colorOf[key] });
      dot.addEventListener("mousemove", (e) => showTip(
        `<b>${p.label}</b><br>ลด ${p.cut}% · คง ${p.hold}% · ขึ้น ${p.hike}%`, e));
      dot.addEventListener("mouseleave", hideTip);
      svg.appendChild(dot);
    });
    if (i % (series.length > 12 ? 2 : 1) === 0 || i === series.length - 1) {
      const t = el("text", { class: "dp-text-mono", x: xAt(i), y: H - 26, "text-anchor": "middle",
        transform: `rotate(-30 ${xAt(i)} ${H - 26})` });
      t.textContent = p.label.slice(5); // MM-DD
      svg.appendChild(t);
    }
  });

  // legend
  const lg = el("g");
  const items = [["ลด", "var(--cut)"], ["คง", "var(--hold)"], ["ขึ้น", "var(--hike)"]];
  items.forEach(([txt, col], i) => {
    const x = m.left + i * 70;
    lg.appendChild(el("line", { x1: x, y1: H - 6, x2: x + 18, y2: H - 6, stroke: col, "stroke-width": 2.5 }));
    const t = el("text", { class: "dp-text", x: x + 24, y: H - 2 }); t.textContent = txt;
    lg.appendChild(t);
  });
  svg.appendChild(lg);

  wrap.appendChild(svg);
}

/* ---------------------------------------------------------------------------
 *  6c) Alerts — เตือนเมื่อโอกาส ลด/ขึ้น ≥ threshold
 * ------------------------------------------------------------------------- */
const ALERT_KEY = "fedAlerts";
const firedKeys = new Set();   // กันยิงซ้ำในเซสชันเดียว

function loadRules() {
  try { return JSON.parse(localStorage.getItem(ALERT_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveRules(rules) { localStorage.setItem(ALERT_KEY, JSON.stringify(rules)); }

function populateAlertMeetings() {
  const sel = document.getElementById("alMeeting");
  const prev = sel.value;
  sel.innerHTML = "";
  FedData.meetings.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.date; o.textContent = m.label;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

function addRule() {
  const date = document.getElementById("alMeeting").value;
  const label = document.getElementById("alMeeting").selectedOptions[0]?.textContent || date;
  const dir = document.getElementById("alDir").value;
  const thresh = Math.min(100, Math.max(1, parseInt(document.getElementById("alThresh").value, 10) || 50));
  const rules = loadRules();
  // กันซ้ำ
  if (!rules.some((r) => r.date === date && r.dir === dir && r.thresh === thresh)) {
    rules.push({ date, label, dir, thresh });
    saveRules(rules);
  }
  renderAlerts();
}

function removeRule(idx) {
  const rules = loadRules();
  rules.splice(idx, 1);
  saveRules(rules);
  renderAlerts();
}

// คืนรายการเงื่อนไขที่ "เข้าเกณฑ์" ตามข้อมูลปัจจุบัน
function evaluateRules() {
  const rules = loadRules();
  return rules.map((r) => {
    const m = FedData.meetings.find((x) => x.date === r.date);
    let val = null, fired = false;
    if (m) {
      const a = aggregateMeeting(m);
      val = r.dir === "cut" ? a.cut : a.hike;
      fired = val >= r.thresh;
    }
    return { ...r, val, fired, meetingExists: !!m };
  });
}

function dirText(dir) { return dir === "cut" ? "ลดดอกเบี้ย" : "ขึ้นดอกเบี้ย"; }

function renderAlerts() {
  const evals = evaluateRules();
  const list = document.getElementById("alList");
  const banner = document.getElementById("alBanner");

  // รายการเงื่อนไข
  list.innerHTML = "";
  if (!evals.length) {
    list.innerHTML = `<p class="al-empty">ยังไม่มีเงื่อนไข — เพิ่มด้านบนเพื่อให้เตือนเมื่อโอกาสถึงเกณฑ์</p>`;
  } else {
    evals.forEach((r, idx) => {
      const row = document.createElement("div");
      row.className = "al-rule";
      const state = !r.meetingExists
        ? `<span class="al-state al-off">— ไม่มีการประชุมนี้แล้ว</span>`
        : r.fired
          ? `<span class="al-state al-on">● เข้าเกณฑ์ (${r.val}%)</span>`
          : `<span class="al-state al-off">ปัจจุบัน ${r.val}%</span>`;
      row.innerHTML = `
        <span class="al-tag ${r.dir}">${dirText(r.dir)}</span>
        <span>${r.label} · โอกาส ≥ <b>${r.thresh}%</b></span>
        ${state}
        <button class="al-del" title="ลบ" data-idx="${idx}">✕</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll(".al-del").forEach((b) =>
      b.addEventListener("click", () => removeRule(+b.dataset.idx)));
  }

  // banner เฉพาะที่เข้าเกณฑ์
  banner.innerHTML = "";
  const fired = evals.filter((r) => r.fired);
  fired.forEach((r) => {
    const div = document.createElement("div");
    div.className = `al-fire dir-${r.dir}`;
    div.innerHTML = `🔔 <span><b>${r.label}</b> — โอกาส${dirText(r.dir)} <b>${r.val}%</b> (≥ ${r.thresh}%)</span>`;
    banner.appendChild(div);
  });

  // desktop notification สำหรับที่เพิ่งเข้าเกณฑ์ (กันซ้ำด้วย asOf)
  if (window.Notification && Notification.permission === "granted") {
    const stamp = document.getElementById("dataSource").textContent;
    fired.forEach((r) => {
      const key = `${r.date}|${r.dir}|${r.thresh}|${stamp}`;
      if (!firedKeys.has(key)) {
        firedKeys.add(key);
        new Notification("Fed Tracker — แจ้งเตือน", {
          body: `${r.label}: โอกาส${dirText(r.dir)} ${r.val}% (≥ ${r.thresh}%)`,
        });
      }
    });
  }
}

function requestNotify() {
  const status = document.getElementById("fredStatus");
  if (!window.Notification) return;
  Notification.requestPermission().then((p) => {
    if (p === "granted") renderAlerts();
  });
}

/* ---------------------------------------------------------------------------
 *  6d) Backtest — เทียบ FedWatch (ก่อนประชุม) กับผลจริงย้อนหลัง
 * ------------------------------------------------------------------------- */
function bpsText(bps) {
  const n = Math.abs(bps);
  if (bps === 0) return "คง";
  return (bps < 0 ? "ลด " : "ขึ้น ") + n;
}
function bpsClass(bps) {
  if (bps === 0) return "hold";
  return bps < 0 ? "cut" : "hike";
}
function argmaxOutcome(probs) {
  let best = null, bp = -1;
  for (const k in probs) if (probs[k] > bp) { bp = probs[k]; best = +k; }
  return best;
}

function renderBacktest() {
  const wrap = document.getElementById("backtest");
  const sum = document.getElementById("btSummary");
  wrap.innerHTML = "";
  const data = FedData.backtest || [];
  if (!data.length) { wrap.innerHTML = `<p class="al-empty">ยังไม่มีข้อมูลย้อนหลัง</p>`; return; }

  let hits = 0, confSum = 0;
  data.forEach((d) => {
    if (argmaxOutcome(d.probs) === d.actual) hits++;
    confSum += d.probs[String(d.actual)] || 0;
  });
  const n = data.length;
  const hitRate = Math.round((hits / n) * 100);
  const avgConf = Math.round(confSum / n);

  sum.innerHTML = `
    <div class="bt-kpi"><span class="bt-k-val">${hitRate}%</span><span class="bt-k-lab">ทายถูก (top outcome)</span><span class="bt-k-foot">${hits}/${n} ครั้ง</span></div>
    <div class="bt-kpi"><span class="bt-k-val">${avgConf}%</span><span class="bt-k-lab">โอกาสเฉลี่ยที่ให้กับผลจริง</span><span class="bt-k-foot">ยิ่งสูง = ตลาดมั่นใจและถูก</span></div>
    <div class="bt-kpi"><span class="bt-k-val">${n}</span><span class="bt-k-lab">จำนวนการประชุมที่เทียบ</span><span class="bt-k-foot">${data[0].label} – ${data[n-1].label}</span></div>`;

  // แสดงใหม่สุดบนสุด
  [...data].reverse().forEach((d) => {
    const top = argmaxOutcome(d.probs);
    const hit = top === d.actual;
    const conf = d.probs[String(d.actual)] || 0;

    const row = document.createElement("div");
    row.className = "bt-row";

    const meta = document.createElement("div");
    meta.className = "bt-meeting";
    meta.innerHTML = `<span class="m-label">${d.label}</span><span class="m-date">${d.date}</span>`;
    row.appendChild(meta);

    const bar = document.createElement("div");
    bar.className = "bt-bar";
    // เรียง bps จากมาก(ขึ้น)→น้อย(ลด): ขึ้นซ้าย ลดขวา
    const keys = Object.keys(d.probs).map(Number).sort((a, b) => b - a);
    keys.forEach((bps) => {
      const p = d.probs[bps];
      const seg = document.createElement("div");
      seg.className = `bt-seg seg-${bpsClass(bps)}` + (bps === d.actual ? " bt-actual" : "");
      seg.style.flex = p;
      if (p >= 10) seg.innerHTML = `<span class="seg-prob">${p}%</span><span class="seg-rate">${bpsText(bps)}</span>`;
      seg.addEventListener("mousemove", (e) => showTip(
        `<b>${d.label}</b><br>ผล ${bpsText(bps)} bps<br>ตลาดให้โอกาส <b>${p}%</b>` +
        (bps === d.actual ? "<br>← <b>เกิดขึ้นจริง</b>" : ""), e));
      seg.addEventListener("mouseleave", hideTip);
      bar.appendChild(seg);
    });
    row.appendChild(bar);

    const verdict = document.createElement("div");
    verdict.className = "bt-verdict " + (hit ? "bt-hit" : "bt-miss");
    verdict.innerHTML = `<span class="bt-mark">${hit ? "✓ ตรง" : "✗ พลาด"}</span>` +
      `<span class="bt-conf">ให้ผลจริง ${conf}%</span>`;
    row.appendChild(verdict);

    wrap.appendChild(row);
  });

  // legend
  const lg = document.createElement("div");
  lg.className = "legend";
  lg.innerHTML = `
    <span><i class="dot" style="background:var(--cut)"></i> ลดดอกเบี้ย</span>
    <span><i class="dot" style="background:var(--hold)"></i> คงดอกเบี้ย</span>
    <span><i class="dot" style="background:var(--hike)"></i> ขึ้นดอกเบี้ย</span>
    <span><i class="dot" style="border:2px solid #fff;background:transparent"></i> กรอบขาว = ผลที่เกิดจริง</span>`;
  wrap.appendChild(lg);
}

/* ---------------------------------------------------------------------------
 *  7) FRED API — ดึง effective fed funds target สด (ไม่บังคับ)
 *     ผ่าน backend /api/rate ก่อน (เลี่ยง CORS) ถ้าไม่มีค่อยยิงตรง
 *     ขอ key ฟรีที่ https://fred.stlouisfed.org/docs/api/api_key.html
 * ------------------------------------------------------------------------- */
async function fetchFredRate() {
  const key = document.getElementById("fredKey").value.trim();
  const status = document.getElementById("fredStatus");
  if (!key) { status.textContent = "ใส่ FRED API key ก่อน"; return; }
  status.textContent = "กำลังดึงข้อมูล…";

  // ลองผ่าน backend ก่อน
  try {
    const r = await fetch(`api/rate?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j.lower != null) {
        FedData.currentRate = { lower: j.lower, upper: j.upper };
        fredLive = true;
        status.textContent = `อัปเดตแล้ว (backend): ${fmtRange(FedData.currentRate)} (${j.date})`;
        renderAll();
        return;
      }
    }
  } catch (e) { /* ไม่มี backend — ยิงตรงต่อ */ }

  // ยิงตรงไป FRED (อาจติด CORS เมื่อเปิดแบบ static)
  try {
    const base = "https://api.stlouisfed.org/fred/series/observations";
    const q = (id) => `${base}?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=1`;
    const [loR, upR] = await Promise.all([fetch(q("DFEDTARL")), fetch(q("DFEDTARU"))]);
    if (!loR.ok || !upR.ok) throw new Error("HTTP " + loR.status + "/" + upR.status);
    const lo = await loR.json(), up = await upR.json();
    const lower = parseFloat(lo.observations[0].value);
    const upper = parseFloat(up.observations[0].value);
    FedData.currentRate = { lower, upper };
    fredLive = true;
    status.textContent = `อัปเดตแล้ว: ${fmtRange({lower, upper})} (${up.observations[0].date})`;
    renderAll();
  } catch (e) {
    status.textContent = "ดึงไม่สำเร็จ: " + e.message + " (ติด CORS — แนะนำรันผ่าน backend: python server.py)";
  }
}

/* ---------------------------------------------------------------------------
 *  init
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 *  สถานะข้อมูลรายส่วน (footer) — บอกชัดว่าส่วนไหนจริง/ตัวอย่าง
 * ------------------------------------------------------------------------- */
function renderDataStatus() {
  const box = document.getElementById("dataStatus");
  if (!box) return;
  const fwLive = fwSource !== "sample";
  const histLive = histSource !== "sample";

  // state: "real" (เขียว) · "mixed" (ส้ม) · "sample" (เหลือง)
  const items = [
    ["FedWatch (โอกาสปรับดอกเบี้ย)", fwLive ? "real" : "sample",
      fwLive ? "จาก Fed Funds futures (อัปเดตวันละครั้ง)" : "ยังไม่ได้ดึงข้อมูลสด"],
    ["กรอบดอกเบี้ยปัจจุบัน", fredLive ? "real" : "mixed",
      fredLive ? "จาก FRED (อัปเดตวันละครั้ง)" : "ค่าตั้งต้นในโค้ด — ตั้ง secret FRED_API_KEY เพื่อดึงจริง"],
    ["Dot Plot", "real", "Fed SEP มี.ค. 2026 (อัปเดตมือทุกไตรมาส)"],
    ["ประวัติการเปลี่ยนแปลงโอกาส", histLive ? "real" : "sample",
      histLive ? "สะสมรายวันจาก backend" : "รอสะสม ≥ 2 วัน"],
    ["Backtest (ผลย้อนหลัง)", "mixed",
      "ผลจริงจาก FRED · โอกาสก่อนประชุมอ้างอิง CME/ข่าว"],
  ];

  const stateLabel = { real: "ข้อมูลจริง", mixed: "จริงบางส่วน", sample: "ตัวอย่าง" };
  box.innerHTML = items.map(([name, state, note]) => `
    <div class="ds-item">
      <span class="ds-dot ds-${state}"></span>
      <span class="ds-name">${name}</span>
      <span class="ds-note ${state === "real" ? "ds-note-real" : state === "mixed" ? "ds-note-mixed" : ""}">${stateLabel[state]} · ${note}</span>
    </div>`).join("");
}

function renderAll() {
  renderSummary();
  renderFedWatch();
  renderDotPlot();
  renderCompare();
  renderRatePath();
  populateAlertMeetings();
  renderAlerts();
  renderHistory();
  renderBacktest();
  renderDataStatus();
}
document.addEventListener("DOMContentLoaded", async () => {
  // event handlers
  document.getElementById("fredBtn").addEventListener("click", fetchFredRate);
  document.getElementById("alAdd").addEventListener("click", addRule);
  document.getElementById("alNotify").addEventListener("click", requestNotify);
  document.getElementById("histMeeting").addEventListener("change", renderHistory);
  window.addEventListener("resize", () => {
    renderDotPlot(); renderCompare(); renderRatePath(); renderHistory();
  });

  // ปุ่มดึง FRED สดใช้ได้เฉพาะตอนมี backend (บน static hosting เช่น Pages จะติด CORS)
  // → ซ่อนไว้ถ้าไม่มี backend เพื่อไม่ให้ผู้ใช้กดแล้วพัง
  let backendOK = false;
  try { backendOK = (await fetch("api/health", { cache: "no-store" })).ok; } catch (e) { backendOK = false; }
  if (!backendOK) {
    const fred = document.querySelector(".fred");
    if (fred) fred.style.display = "none";
  }

  renderAll();                 // วาดด้วย sample ก่อน (เห็นผลทันที)
  await Promise.all([loadData(), loadHistory()]);  // ดึงข้อมูลสด + ประวัติ
  populateHistMeetings();
  renderAll();                 // วาดใหม่ด้วยข้อมูลที่ได้
});

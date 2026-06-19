"""
fedwatch.py — คำนวณความน่าจะเป็น FedWatch จาก 30-Day Fed Funds Futures
================================================================================
ใช้เฉพาะ Python standard library (ไม่ต้อง pip install อะไรเลย)

วิธีการ (อิงตาม CME FedWatch methodology แบบมาตรฐาน):
  1. ดึงราคา Fed Funds futures (ZQ) ของเดือนที่เกี่ยวข้องจาก Yahoo Finance
  2. อัตราเฉลี่ยรายเดือนที่ตลาด imply = 100 - ราคา futures
  3. หา "อัตราหลังการประชุม" ของแต่ละรอบ FOMC:
       - ถ้าเดือนถัดไป "ไม่มี" ประชุม → ใช้อัตรา imply ของเดือนถัดไปตรงๆ
       - ถ้าเดือนถัดไป "มี" ประชุม (เดือนติดกัน) → ถ่วงน้ำหนักรายวันในเดือนประชุม
  4. แปลงเป็นจำนวน step (25bps) ต่อการประชุม แล้ว convolve เป็น distribution สะสม
     → ได้ความน่าจะเป็นของแต่ละกรอบดอกเบี้ยในแต่ละการประชุม

⚠️ เป็น implementation แบบ standard/simplified — ตัวเลขอาจต่างจากที่ CME เผยแพร่
   เล็กน้อย (CME ใช้ conditional probability tree เต็มรูปแบบ) แต่ทิศทางตรงกัน

ถ้าดึง Yahoo ไม่ได้ (โดน block/ออฟไลน์) จะ fallback ไปใช้ราคาใน futures_prices.json
"""

import calendar
import datetime as dt
import json
import math
import os
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
STEP = 0.25  # ขนาดการปรับดอกเบี้ยมาตรฐาน (25 bps)

# รหัสเดือนของสัญญา futures (CME month codes)
MONTH_CODES = {1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
               7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z"}

THAI_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

# ตารางการประชุม FOMC (วันแถลงผล = วันที่ 2 ของการประชุม)
# อัปเดตได้จาก https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
FOMC_MEETINGS = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
    "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-16",
]

# กรอบดอกเบี้ยปัจจุบันเริ่มต้น (ใช้เมื่อไม่ได้ดึงจาก FRED) — ค่าจริง ณ มิ.ย. 2026
DEFAULT_RATE = {"lower": 3.50, "upper": 3.75}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


# ---------------------------------------------------------------------------
# ดึงข้อมูลภายนอก
# ---------------------------------------------------------------------------
def yahoo_symbol(year: int, month: int) -> str:
    """สร้างสัญลักษณ์ Yahoo เช่น ZQN26.CBT (Fed Funds futures ก.ค. 2026)"""
    return f"ZQ{MONTH_CODES[month]}{year % 100:02d}.CBT"


def _http_json(url: str, timeout: int = 12) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_future_price(year: int, month: int) -> float | None:
    """ดึงราคาปิดล่าสุดของสัญญา ZQ เดือนนั้น คืน None ถ้าดึงไม่ได้"""
    sym = yahoo_symbol(year, month)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=10d"
    try:
        data = _http_json(url)
        res = data["chart"]["result"][0]
        closes = res["indicators"]["quote"][0]["close"]
        for c in reversed(closes):
            if c is not None:
                return float(c)
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError,
            ValueError, TypeError, TimeoutError):
        return None
    return None


def fred_current_rate(api_key: str) -> dict | None:
    """ดึงกรอบดอกเบี้ยนโยบายล่าสุดจาก FRED (DFEDTARL/DFEDTARU)"""
    base = "https://api.stlouisfed.org/fred/series/observations"

    def last(series: str):
        url = (f"{base}?series_id={series}&api_key={api_key}"
               f"&file_type=json&sort_order=desc&limit=1")
        obs = _http_json(url)["observations"][0]
        return float(obs["value"]), obs["date"]

    try:
        lower, _ = last("DFEDTARL")
        upper, date = last("DFEDTARU")
        return {"lower": lower, "upper": upper, "date": date}
    except Exception:
        return None


def _load_manual_prices() -> dict:
    """ราคาสำรองจาก futures_prices.json รูปแบบ {"2026-07": 96.03, ...}"""
    path = os.path.join(HERE, "futures_prices.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (ValueError, OSError):
            return {}
    return {}


# ---------------------------------------------------------------------------
# ตรรกะการคำนวณ
# ---------------------------------------------------------------------------
def _meeting_months() -> set:
    """เซตของ (ปี, เดือน) ที่มีการประชุม FOMC — ใช้ตรวจเดือนติดกัน"""
    out = set()
    for s in FOMC_MEETINGS:
        d = dt.date.fromisoformat(s)
        out.add((d.year, d.month))
    return out


def _next_month(year: int, month: int):
    return (year + 1, 1) if month == 12 else (year, month + 1)


def build_payload(current_rate: dict | None = None,
                  fred_key: str | None = None,
                  today: dt.date | None = None) -> dict:
    """
    คืน dict โครงสร้างเดียวกับ FedData (frontend เสียบใช้ได้ทันที):
      { source, asOf, currentRate, meetings:[{date,label,probs}], note }
    raise RuntimeError ถ้าหาราคาไม่ได้เลย (ให้ frontend fallback ไป sample)
    """
    today = today or dt.date.today()

    # 1) กรอบดอกเบี้ยปัจจุบัน + แหล่งที่มา
    if current_rate is None:
        fetched = fred_current_rate(fred_key) if fred_key else None
        if fetched:
            current_rate, rate_source = fetched, "fred"
        else:
            current_rate, rate_source = dict(DEFAULT_RATE), "default"
    else:
        rate_source = "provided"
    cur_mid = (current_rate["lower"] + current_rate["upper"]) / 2
    cur_lower = current_rate["lower"]

    # 2) การประชุมที่ยังไม่เกิดขึ้น (สูงสุด 8 รอบข้างหน้า)
    upcoming = [dt.date.fromisoformat(s) for s in FOMC_MEETINGS
                if dt.date.fromisoformat(s) >= today][:8]
    if not upcoming:
        raise RuntimeError("ไม่มีการประชุมในตาราง FOMC ที่ยังไม่เกิดขึ้น")

    meeting_months = _meeting_months()

    # 3) รวบรวมเดือนที่ต้องใช้ราคา (เดือนประชุม + เดือนถัดไปของแต่ละรอบ)
    needed = set()
    for d in upcoming:
        needed.add((d.year, d.month))
        needed.add(_next_month(d.year, d.month))

    manual = _load_manual_prices()
    prices = {}            # (year,month) -> price
    used_live = False
    used_manual = False
    for (y, m) in sorted(needed):
        p = fetch_future_price(y, m)
        if p is not None:
            prices[(y, m)] = p
            used_live = True
        else:
            key = f"{y}-{m:02d}"
            if key in manual:
                prices[(y, m)] = float(manual[key])
                used_manual = True

    if not prices:
        raise RuntimeError("ดึงราคา Fed Funds futures ไม่ได้ (Yahoo block และไม่มี futures_prices.json)")

    def implied_avg(y, m):
        p = prices.get((y, m))
        return None if p is None else round(100 - p, 4)

    # 4) หา "อัตราหลังการประชุม" ของแต่ละรอบ (ในหน่วยอัตรากลางกรอบ)
    end_rates = []
    start_rate = cur_mid
    for d in upcoming:
        N = calendar.monthrange(d.year, d.month)[1]
        n = d.day  # วันที่แถลงผล; อัตราใหม่มีผลตั้งแต่วันถัดไป
        ny, nm = _next_month(d.year, d.month)

        next_has_meeting = (ny, nm) in meeting_months
        nxt = implied_avg(ny, nm)
        same = implied_avg(d.year, d.month)

        if not next_has_meeting and nxt is not None:
            # เดือนถัดไปไม่มีประชุม → อัตราเฉลี่ยของมันคืออัตราหลังประชุมเต็มๆ
            end = nxt
        elif same is not None and (N - n) > 0:
            # เดือนติดกัน → ถ่วงน้ำหนักรายวัน: avg = (n*start + (N-n)*end)/N
            end = (same * N - start_rate * n) / (N - n)
        elif nxt is not None:
            end = nxt
        else:
            # ไม่มีราคาให้คำนวณ — สมมติคงเดิม
            end = start_rate

        end_rates.append(end)
        start_rate = end

    # 5) แปลงเป็น distribution สะสม โดย convolve การเคลื่อนไหวรายรอบ
    meetings_out = []
    prev_rate = cur_mid
    cum = {0: 1.0}  # จำนวน step สะสมจากปัจจุบัน -> ความน่าจะเป็น
    for d, end in zip(upcoming, end_rates):
        e = (end - prev_rate) / STEP        # step ของรอบนี้ (เทียบรอบก่อน)
        lo = math.floor(e)
        hi = math.ceil(e)
        if lo == hi:
            move = {lo: 1.0}
        else:
            move = {hi: e - lo, lo: hi - e}

        new_cum = {}
        for s, p in cum.items():
            for ds, pm in move.items():
                new_cum[s + ds] = new_cum.get(s + ds, 0.0) + p * pm
        cum = new_cum
        prev_rate = end

        probs = {}
        for s, p in cum.items():
            pct = round(p * 100, 1)
            if pct < 0.3:
                continue  # ตัดทิ้งหางที่เล็กมาก
            bucket = round(cur_lower + s * STEP, 2)
            probs[f"{bucket:.2f}"] = pct

        meetings_out.append({
            "date": d.isoformat(),
            "label": f"{THAI_MON[d.month]} {d.year}",
            "probs": probs,
        })

    source = "yahoo" if used_live else ("manual" if used_manual else "unknown")
    if used_live and used_manual:
        source = "mixed"

    return {
        "source": source,
        "rateSource": rate_source,       # "fred" | "default" | "provided"
        "asOf": dt.datetime.now().isoformat(timespec="seconds"),
        "currentRate": current_rate,
        "meetings": meetings_out,
        "note": "คำนวณจาก Fed Funds futures ตามวิธี CME (simplified)",
    }


# ---------------------------------------------------------------------------
# ประวัติ: เก็บ snapshot โอกาส ลด/คง/ขึ้น ของแต่ละการประชุมตามเวลา
# ---------------------------------------------------------------------------
def aggregate(probs: dict, current_lower: float):
    """รวมโอกาสเป็น 3 กลุ่ม: ลด / คง / ขึ้น เทียบกับกรอบปัจจุบัน"""
    cut = hold = hike = 0.0
    for k, v in probs.items():
        b = float(k)
        if abs(b - current_lower) < 1e-6:
            hold += v
        elif b < current_lower:
            cut += v
        else:
            hike += v
    return round(cut, 1), round(hold, 1), round(hike, 1)


def expected_rate(probs: dict) -> float:
    ev = tot = 0.0
    for k, v in probs.items():
        ev += (float(k) + 0.125) * v
        tot += v
    return ev / tot if tot else 0.0


def append_history(payload: dict, path: str | None = None) -> dict:
    """บันทึก snapshot ลง history.json (1 จุดต่อวัน, เก็บไม่เกิน 365 จุด)"""
    path = path or os.path.join(HERE, "history.json")
    hist = []
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                hist = json.load(f)
        except (ValueError, OSError):
            hist = []

    cl = payload["currentRate"]["lower"]
    snap = {
        "asOf": payload["asOf"],
        "date": payload["asOf"][:10],
        "currentRate": payload["currentRate"],
        "snap": [],
    }
    for m in payload["meetings"]:
        cut, hold, hike = aggregate(m["probs"], cl)
        snap["snap"].append({
            "date": m["date"], "label": m["label"],
            "cut": cut, "hold": hold, "hike": hike,
            "ev": round(expected_rate(m["probs"]), 3),
        })

    hist = [s for s in hist if s.get("date") != snap["date"]]  # แทนที่ของวันเดียวกัน
    hist.append(snap)
    hist = sorted(hist, key=lambda s: s["date"])[-365:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)
    return snap


# ---------------------------------------------------------------------------
# รันตรงๆ เพื่อทดสอบ / สร้างไฟล์ live_data.json
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    key = os.environ.get("FRED_API_KEY")
    try:
        payload = build_payload(fred_key=key)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        if "--write" in sys.argv:
            out = os.path.join(HERE, "live_data.json")
            with open(out, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            append_history(payload)
            print(f"\n[เขียนไฟล์] {out} + history.json", file=sys.stderr)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

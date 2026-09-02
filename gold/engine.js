(() => {
  const STRATS = [
    ["rsi", "RSI pattern", "Buy the climb out of oversold. Sell overbought."],
    ["macd", "MACD oscillator", "Signal-line cross."],
    ["bollinger", "Bollinger bands", "Tag the band, fade to mid."],
    ["psar", "Parabolic SAR", "Flip when price crosses the dots."],
    ["ao", "Awesome oscillator", "Zero-line cross, 5/34 midpoint."],
    ["heikin", "Heikin-Ashi", "Three green HA in, first red out."],
    ["london", "London breakout", "Break of prior bar range."],
    ["dual", "Dual thrust", "Open ± 0.5 × 4-bar range."],
    ["shooting", "Shooting star", "Star after a run sells. Hammer after a slide buys."],
    ["golden", "Golden cross", "50/200 SMA."],
  ];
  const ANCHORS = [
    ["1975-01-02", 185], ["1979-12-31", 512], ["1980-01-21", 850], ["1982-06-21", 297],
    ["1985-02-25", 284], ["1987-12-14", 500], ["1993-03-10", 326], ["1999-08-25", 252],
    ["2001-04-02", 257], ["2006-05-12", 725], ["2008-03-17", 1030], ["2008-11-12", 712],
    ["2011-09-06", 1920], ["2013-06-28", 1192], ["2015-12-17", 1050], ["2018-08-16", 1174],
    ["2019-09-04", 1557], ["2020-08-06", 2063], ["2021-03-08", 1681], ["2022-03-08", 2070],
    ["2022-11-03", 1629], ["2023-12-04", 2135], ["2024-10-30", 2788], ["2025-04-22", 3420],
    ["2025-10-16", 3985], ["2026-04-14", 4610], ["2026-09-01", 4325],
  ];

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function utc(iso) { return Date.parse(iso + "T00:00:00Z"); }
  function r2(n) { return Math.round(n * 100) / 100; }

  function syntheticGold() {
    const rng = mulberry32(1971);
    const anchors = ANCHORS.map(([d, p]) => [utc(d), p]);
    const start = anchors[0][0], end = anchors[anchors.length - 1][0];
    const bars = [];
    let resid = 0, prev = anchors[0][1];
    for (let t = start; t <= end; t += 86400000) {
      const wd = new Date(t).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      let a = anchors[0], b = anchors[anchors.length - 1];
      for (let i = 0; i < anchors.length - 1; i++) {
        if (t >= anchors[i][0] && t <= anchors[i + 1][0]) { a = anchors[i]; b = anchors[i + 1]; break; }
      }
      const w = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
      const target = Math.exp(Math.log(a[1]) * (1 - w) + Math.log(b[1]) * w);
      resid = 0.96 * resid + 0.0075 * randn(rng);
      const close = Math.max(50, target * Math.exp(resid));
      const open = prev * (1 + 0.0012 * randn(rng));
      const atr = 0.009 + 0.004 * Math.abs(resid);
      const high = Math.max(open, close) * (1 + atr * Math.abs(randn(rng)));
      const low = Math.min(open, close) * (1 - atr * Math.abs(randn(rng)));
      bars.push({ t, o: r2(open), h: r2(Math.max(open, close, high)), l: r2(Math.min(open, close, low)), c: r2(close) });
      prev = close;
    }
    return bars;
  }

  function sma(src, n) {
    const out = Array(src.length).fill(NaN); let sum = 0;
    for (let i = 0; i < src.length; i++) {
      sum += src[i]; if (i >= n) sum -= src[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }
  function ema(src, n) {
    const out = Array(src.length).fill(NaN); const k = 2 / (n + 1); let prev = src[0];
    for (let i = 0; i < src.length; i++) {
      prev = i === 0 ? src[0] : src[i] * k + prev * (1 - k);
      if (i >= n - 1) out[i] = prev;
    }
    return out;
  }
  function rsi(src, n) {
    const out = Array(src.length).fill(NaN); let g = 0, l = 0;
    for (let i = 1; i < src.length; i++) {
      const ch = src[i] - src[i - 1];
      const G = Math.max(ch, 0), L = Math.max(-ch, 0);
      if (i <= n) { g += G; l += L; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (n - 1) + G) / n; l = (l * (n - 1) + L) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return out;
  }
  function macd(src) {
    const f = ema(src, 12), s = ema(src, 26);
    const line = src.map((_, i) => f[i] - s[i]);
    const sig = ema(line.map((x) => (Number.isFinite(x) ? x : 0)), 9);
    return { line, sig };
  }
  function bb(src, n = 20, k = 2) {
    const mid = sma(src, n), up = Array(src.length).fill(NaN), lo = Array(src.length).fill(NaN);
    for (let i = n - 1; i < src.length; i++) {
      let ss = 0; for (let j = i - n + 1; j <= i; j++) ss += (src[j] - mid[i]) ** 2;
      const sd = Math.sqrt(ss / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
    }
    return { mid, up, lo };
  }
  function psar(bars) {
    const out = Array(bars.length).fill(NaN);
    if (bars.length < 3) return out;
    let bull = bars[1].c >= bars[0].c, af = 0.02, ep = bull ? bars[1].h : bars[1].l, sar = bull ? bars[0].l : bars[0].h;
    out[1] = sar;
    for (let i = 2; i < bars.length; i++) {
      sar = sar + af * (ep - sar);
      if (bull) {
        sar = Math.min(sar, bars[i - 1].l, bars[i - 2].l);
        if (bars[i].l < sar) { bull = false; sar = ep; ep = bars[i].l; af = 0.02; }
        else if (bars[i].h > ep) { ep = bars[i].h; af = Math.min(0.2, af + 0.02); }
      } else {
        sar = Math.max(sar, bars[i - 1].h, bars[i - 2].h);
        if (bars[i].h > sar) { bull = true; sar = ep; ep = bars[i].h; af = 0.02; }
        else if (bars[i].l < ep) { ep = bars[i].l; af = Math.min(0.2, af + 0.02); }
      }
      out[i] = sar;
    }
    return out;
  }
  function ao(bars) {
    const mp = bars.map((b) => (b.h + b.l) / 2);
    const f = sma(mp, 5), s = sma(mp, 34);
    return f.map((x, i) => x - s[i]);
  }
  function heikin(bars) {
    const ha = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const c = (b.o + b.h + b.l + b.c) / 4;
      const o = i === 0 ? (b.o + b.c) / 2 : (ha[i - 1].o + ha[i - 1].c) / 2;
      ha.push({ o, c, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c) });
    }
    return ha;
  }

  function signals(bars, id, longshort) {
    const c = bars.map((b) => b.c);
    const out = [];
    const enter = (i, side) => out.push({ i, kind: "enter", side });
    const exit = (i, side) => out.push({ i, kind: "exit", side });
    if (id === "rsi") {
      const r = rsi(c, 14);
      for (let i = 2; i < bars.length; i++) {
        if (r[i - 1] < 30 && r[i] >= 30) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (r[i - 1] > 70 && r[i] <= 70) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "macd") {
      const m = macd(c);
      for (let i = 2; i < bars.length; i++) {
        const up = m.line[i - 1] <= m.sig[i - 1] && m.line[i] > m.sig[i];
        const dn = m.line[i - 1] >= m.sig[i - 1] && m.line[i] < m.sig[i];
        if (up) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (dn) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "bollinger") {
      const b = bb(c);
      for (let i = 2; i < bars.length; i++) {
        if (c[i - 1] < b.lo[i - 1] && c[i] > b.lo[i]) enter(i, "long");
        if (c[i - 1] > b.mid[i - 1] && c[i] < b.mid[i]) exit(i, "long");
        if (longshort) {
          if (c[i - 1] > b.up[i - 1] && c[i] < b.up[i]) enter(i, "short");
          if (c[i - 1] < b.mid[i - 1] && c[i] > b.mid[i]) exit(i, "short");
        }
      }
    } else if (id === "psar") {
      const p = psar(bars);
      for (let i = 3; i < bars.length; i++) {
        const was = p[i - 1] < bars[i - 1].c, now = p[i] < bars[i].c;
        if (!was && now) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (was && !now) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "ao") {
      const a = ao(bars);
      for (let i = 3; i < bars.length; i++) {
        if (a[i - 1] <= 0 && a[i] > 0) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (a[i - 1] >= 0 && a[i] < 0) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "heikin") {
      const ha = heikin(bars);
      for (let i = 3; i < bars.length; i++) {
        const green = ha[i].c > ha[i].o && ha[i - 1].c > ha[i - 1].o && ha[i - 2].c > ha[i - 2].o;
        const red = ha[i].c < ha[i].o;
        if (green && ha[i - 3].c <= ha[i - 3].o) enter(i, "long");
        if (red && ha[i - 1].c > ha[i - 1].o) { exit(i, "long"); if (longshort) enter(i, "short"); }
        if (longshort && green) exit(i, "short");
      }
    } else if (id === "london") {
      for (let i = 2; i < bars.length; i++) {
        const p = bars[i - 1];
        if (bars[i].c > p.h) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (bars[i].c < p.l) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "dual") {
      for (let i = 5; i < bars.length; i++) {
        let hh = -1e9, lc = 1e9, hc = -1e9, ll = 1e9;
        for (let j = i - 4; j < i; j++) { hh = Math.max(hh, bars[j].h); lc = Math.min(lc, bars[j].c); hc = Math.max(hc, bars[j].c); ll = Math.min(ll, bars[j].l); }
        const range = Math.max(hh - lc, hc - ll);
        if (bars[i].h >= bars[i].o + 0.5 * range && bars[i].c > bars[i].o) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (bars[i].l <= bars[i].o - 0.5 * range && bars[i].c < bars[i].o) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    } else if (id === "shooting") {
      for (let i = 3; i < bars.length; i++) {
        const b = bars[i], body = Math.abs(b.c - b.o);
        const upper = b.h - Math.max(b.c, b.o), lower = Math.min(b.c, b.o) - b.l;
        const star = upper > 2 * body && lower < body * 0.4 && b.c < b.o;
        const ham = lower > 2 * body && upper < body * 0.4 && b.c > b.o;
        const up = b.c > bars[i - 1].c && bars[i - 1].c > bars[i - 2].c;
        const dn = b.c < bars[i - 1].c && bars[i - 1].c < bars[i - 2].c;
        if (star && up) { exit(i, "long"); if (longshort) enter(i, "short"); }
        if (ham && dn) { enter(i, "long"); if (longshort) exit(i, "short"); }
      }
    } else if (id === "golden") {
      const f = sma(c, 50), s = sma(c, 200);
      for (let i = 2; i < bars.length; i++) {
        if (f[i - 1] <= s[i - 1] && f[i] > s[i]) { enter(i, "long"); if (longshort) exit(i, "short"); }
        if (f[i - 1] >= s[i - 1] && f[i] < s[i]) { exit(i, "long"); if (longshort) enter(i, "short"); }
      }
    }
    return out;
  }

  function run(all, from, to, id, longshort, cost) {
    const bars = all.filter((b) => b.t >= from && b.t <= to);
    if (bars.length < 40) return null;
    const raw = signals(bars, id, longshort);
    const enter = new Map(), exitL = new Set(), exitS = new Set();
    for (const s of raw) {
      if (s.kind === "enter") enter.set(s.i, s.side);
      else if (s.side === "short") exitS.add(s.i);
      else exitL.add(s.i);
    }
    const start = 100000;
    let book = start, pos = null, peak = start;
    const trades = [], equity = [], bh = [], dd = [];
    const first = bars[0].c;
    const dir = (side) => (side === "long" ? 1 : -1);
    const flatten = (i, fill) => {
      if (!pos) return;
      const pnl = pos.qty * dir(pos.side) * (fill - pos.px) - cost * pos.qty;
      book += pnl;
      trades.push({ side: pos.side, in: bars[pos.i].t, out: bars[i].t, entry: pos.px, exit: fill, pnl, ret: pnl / (pos.px * pos.qty), bars: Math.max(1, i - pos.i) });
      pos = null;
    };
    for (let i = 0; i < bars.length; i++) {
      const fill = bars[i].o, prev = i - 1;
      if (pos && prev >= 0) {
        const want = pos.side === "long" ? exitL.has(prev) : exitS.has(prev);
        const flip = enter.has(prev) && enter.get(prev) !== pos.side;
        if (want || flip) flatten(i, fill);
      }
      if (!pos && prev >= 0 && enter.has(prev)) {
        const side = enter.get(prev);
        if (side === "long" || longshort) {
          const qty = fill > 0 ? book / fill : 0;
          if (qty > 0) { book -= cost * qty; pos = { side, i, px: fill, qty }; }
        }
      }
      const v = pos ? book + pos.qty * dir(pos.side) * (bars[i].c - pos.px) : book;
      peak = Math.max(peak, v);
      equity.push({ t: bars[i].t, v });
      bh.push({ t: bars[i].t, v: start * (bars[i].c / first) });
      dd.push({ t: bars[i].t, v: peak > 0 ? v / peak - 1 : 0 });
    }
    if (pos) flatten(bars.length - 1, bars[bars.length - 1].c);
    const end = equity[equity.length - 1].v;
    const yrs = Math.max((equity[equity.length - 1].t - equity[0].t) / (365.25 * 864e5), 1 / 365);
    const rets = [];
    for (let i = 1; i < equity.length; i++) rets.push(equity[i].v / equity[i - 1].v - 1);
    const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1);
    const varr = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length || 1);
    const neg = rets.filter((x) => x < 0);
    const down = neg.length ? neg.reduce((s, x) => s + x * x, 0) / neg.length : 0;
    const bpy = rets.length / yrs;
    const vol = Math.sqrt(varr * bpy);
    const sharpe = vol > 0 ? (mean * bpy - 0.04) / vol : 0;
    const sortino = down > 0 ? (mean * bpy - 0.04) / Math.sqrt(down * bpy) : 0;
    let maxDd = 0, pkv = start, ddDays = 0, ds = equity[0].t;
    for (const p of equity) {
      if (p.v > pkv) { pkv = p.v; ds = p.t; }
      const d = 1 - p.v / pkv;
      if (d > maxDd) { maxDd = d; ddDays = (p.t - ds) / 864e5; }
    }
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const gw = wins.reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const cagr = (end / start) ** (1 / yrs) - 1;
    const tot = end / start - 1;
    const bhr = bh[bh.length - 1].v / start - 1;
    return {
      trades, equity, bh, dd,
      m: {
        trades: trades.length, winRate: trades.length ? wins.length / trades.length : 0,
        pf: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
        exp: trades.length ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
        tot, cagr, sharpe, sortino, calmar: maxDd > 0 ? cagr / maxDd : 0,
        maxDd, ddDays, vol, end, bhr, excess: tot - bhr,
      },
    };
  }

  function usd(n, d = 0) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function pct(n) { return (n * 100).toFixed(1) + "%"; }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function lttb(pts, n) {
    if (pts.length <= n) return pts;
    const sampled = [pts[0]];
    const bucket = (pts.length - 2) / (n - 2);
    let a = 0;
    for (let i = 0; i < n - 2; i++) {
      const start = Math.floor((i + 1) * bucket) + 1;
      const end = Math.min(Math.floor((i + 2) * bucket) + 1, pts.length);
      let avgT = 0, avgV = 0, count = Math.max(end - start, 1);
      for (let j = start; j < end; j++) { avgT += pts[j].t; avgV += pts[j].v; }
      avgT /= count; avgV /= count;
      const rs = Math.floor(i * bucket) + 1, re = Math.floor((i + 1) * bucket) + 1;
      let max = -1, next = rs;
      const pa = pts[a];
      for (let j = rs; j < re; j++) {
        const area = Math.abs((pa.t - avgT) * (pts[j].v - pa.v) - (pa.t - pts[j].t) * (avgV - pa.v));
        if (area > max) { max = area; next = j; }
      }
      sampled.push(pts[next]); a = next;
    }
    sampled.push(pts[pts.length - 1]);
    return sampled;
  }
  function chart(el, series, h) {
    const all = series.flatMap((s) => s.pts);
    if (all.length < 2) { el.innerHTML = ""; return; }
    const sampled = series.map((s) => ({ ...s, pts: lttb(s.pts, 500) }));
    const vals = sampled.flatMap((s) => s.pts.map((p) => p.v));
    const ts = sampled.flatMap((s) => s.pts.map((p) => p.t));
    const minV = Math.min(...vals), maxV = Math.max(...vals), minT = Math.min(...ts), maxT = Math.max(...ts);
    const pad = (maxV - minV) * 0.06 || 1, y0 = minV - pad, y1 = maxV + pad, w = 640;
    const x = (t) => ((t - minT) / (maxT - minT || 1)) * w;
    const y = (v) => h - ((v - y0) / (y1 - y0 || 1)) * h;
    const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${sampled.map((s) => `<path d="${path(s.pts)}" fill="none" stroke="${s.stroke}" stroke-width="1.8"/>`).join("")}</svg>`;
  }

  const BOOK = syntheticGold();
  let bars = BOOK;
  let strat = "rsi";
  const $ = (id) => document.getElementById(id);

  STRATS.forEach(([id, name]) => {
    const b = document.createElement("button");
    b.className = "s" + (id === strat ? " on" : "");
    b.textContent = name;
    b.onclick = () => { strat = id; document.querySelectorAll("button.s").forEach((x) => x.classList.remove("on")); b.classList.add("on"); render(); };
    $("strats").appendChild(b);
  });
  const to = bars[bars.length - 1].t;
  const from = bars.find((b) => b.t >= to - 15 * 365.25 * 864e5)?.t ?? bars[0].t;
  $("from").value = iso(from);
  $("to").value = iso(to);
  $("src").textContent = "Synthetic daily book · 1975–2026, anchored to published yearly gold.";
  ["from", "to", "side", "cost"].forEach((id) => $(id).addEventListener("change", render));

  $("file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("src").textContent = "Parsing " + file.name + "…";
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const out = [];
    let map = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line.split(/[,;\t]/).map((x) => x.replace(/"/g, "").trim());
      if (!map) {
        const low = cells.map((c) => c.toLowerCase());
        if (low.some((c) => c === "date" || c === "close" || c === "time")) {
          map = {
            t: low.findIndex((c) => ["date", "time", "datetime", "timestamp"].includes(c)),
            o: low.findIndex((c) => c === "open"),
            h: low.findIndex((c) => c === "high"),
            l: low.findIndex((c) => c === "low"),
            c: low.findIndex((c) => c === "close" || c === "price"),
          };
          if (map.t < 0) map.t = 0;
          if (map.c < 0) map.c = cells.length - 1;
          continue;
        }
        map = { t: 0, o: 1, h: 2, l: 3, c: 4 };
      }
      const t = Date.parse(cells[map.t]);
      const c = Number(cells[map.c]);
      if (!Number.isFinite(t) || !Number.isFinite(c) || c <= 0) continue;
      const o = Number(cells[map.o] ?? c), h = Number(cells[map.h] ?? c), l = Number(cells[map.l] ?? c);
      out.push({ t, o: o || c, h: h || c, l: l || c, c });
    }
    out.sort((a, b) => a.t - b.t);
    if (out.length < 50) { $("src").textContent = "Need 50+ bars. Use date, open, high, low, close."; return; }
    let use = out;
    if (file.size > 6e6 || out.length > 40000) {
      const ms = 3600000;
      const folded = [];
      let cur = null, bucket = -1;
      for (const b of out) {
        const k = Math.floor(b.t / ms);
        if (k !== bucket) { if (cur) folded.push(cur); bucket = k; cur = { t: k * ms, o: b.o, h: b.h, l: b.l, c: b.c }; }
        else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; }
      }
      if (cur) folded.push(cur);
      use = folded;
    }
    bars = use;
    $("from").value = iso(use[0].t);
    $("to").value = iso(use[use.length - 1].t);
    $("src").textContent = file.name + " · " + use.length.toLocaleString() + " bars.";
    render();
  });

  function render() {
    const longshort = $("side").value === "longshort";
    const cost = Number($("cost").value) || 0;
    const from = Date.parse($("from").value + "T00:00:00Z");
    const to = Date.parse($("to").value + "T00:00:00Z");
    const book = run(bars, from, to, strat, longshort, cost);
    const name = STRATS.find((s) => s[0] === strat);
    $("blurb").textContent = name[2];
    if (!book) { $("verdict").textContent = "Not enough bars."; return; }
    const m = book.m;
    $("verdict").textContent = m.excess > 0 ? "Beats buy-and-hold on this window." : "Loses to sitting on the metal.";
    $("sub").textContent = `Strategy ${pct(m.tot)} · buy & hold ${pct(m.bhr)} · excess ${pct(m.excess)}. Win rate ${pct(m.winRate)} on ${m.trades} trades. Max DD ${pct(m.maxDd)}.`;
    chart($("eq"), [
      { pts: book.equity, stroke: "#2c3436" },
      { pts: book.bh, stroke: "#9a9388" },
    ], 160);
    chart($("dd"), [{ pts: book.dd, stroke: "#6b2e2a" }], 110);
    const cells = [
      ["CAGR", pct(m.cagr)], ["Sharpe (rf 4%)", m.sharpe.toFixed(2)], ["Sortino", m.sortino.toFixed(2)], ["Calmar", m.calmar.toFixed(2)],
      ["Win rate", pct(m.winRate)], ["Profit factor", m.pf.toFixed(2)], ["Expectancy", usd(m.exp)], ["Trades", String(m.trades)],
      ["Max DD", pct(m.maxDd)], ["DD length", m.ddDays.toFixed(0) + "d"], ["Ann. vol", pct(m.vol)], ["End equity", usd(m.end)],
    ];
    $("sheet").innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("");
    const months = new Map();
    for (const p of book.equity) {
      const d = new Date(p.t), y = d.getUTCFullYear(), mo = d.getUTCMonth(), key = y + "-" + mo;
      const cur = months.get(key);
      if (!cur) months.set(key, { y, mo, s: p.v, e: p.v });
      else cur.e = p.v;
    }
    const years = [...new Set([...months.values()].map((x) => x.y))];
    let heat = "<table><thead><tr><th>Year</th>" + "JFMAMJJASOND".split("").map((mth) => `<th>${mth}</th>`).join("") + "</tr></thead><tbody>";
    for (const y of years) {
      heat += `<tr><td>${y}</td>`;
      for (let mo = 0; mo < 12; mo++) {
        const cell = months.get(y + "-" + mo);
        if (!cell) { heat += "<td></td>"; continue; }
        const r = cell.e / cell.s - 1;
        heat += `<td class="${r > 0 ? "ok" : r < 0 ? "bad" : ""}">${(r * 100).toFixed(1)}</td>`;
      }
      heat += "</tr>";
    }
    $("heat").innerHTML = heat + "</tbody></table>";
    const last = book.trades.slice(-80).reverse();
    $("trades").innerHTML = "<table><thead><tr><th>Side</th><th>In</th><th>Out</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead><tbody>" +
      last.map((t) => `<tr><td>${t.side}</td><td>${iso(t.in)}</td><td>${iso(t.out)}</td><td>${usd(t.entry, 2)}</td><td>${usd(t.exit, 2)}</td><td class="${t.pnl >= 0 ? "ok" : "bad"}">${usd(t.pnl)}</td></tr>`).join("") +
      "</tbody></table>";
  }
  render();
})();

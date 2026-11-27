/* 자몽스튜디오 계산기 3종 — assets/app.js */
(function () {
  "use strict";

  /* ───────── 기준값 (2026년) ───────── */
  var RATE = {
    pension: 0.0475,          // 국민연금 근로자 4.75% (총 9.5%)
    health: 0.03595,          // 건강보험 근로자 3.595% (총 7.19%)
    ltcFromHealth: 0.1314,    // 장기요양 = 건강보험료 × 13.14% (총 0.9448%)
    employ: 0.009             // 고용보험 실업급여 근로자 0.9%
  };
  var PENSION_MIN = 410000;   // 기준소득월액 하한 (2026.7~2027.6)
  var PENSION_MAX = 6590000;  // 기준소득월액 상한
  var PERSONAL_DEDUCTION = 1500000;
  var STANDARD_CREDIT = 130000;

  /* ───────── 계산 코어 ───────── */
  function floor10(v) { return Math.floor(v / 10) * 10; }
  function floor1000(v) { return Math.floor(v / 1000) * 1000; }
  function won(v) { return Math.round(v); }

  function laborDeduction(gross) {
    if (gross <= 5000000) return gross * 0.7;
    if (gross <= 15000000) return 3500000 + (gross - 5000000) * 0.4;
    if (gross <= 45000000) return 7500000 + (gross - 15000000) * 0.15;
    if (gross <= 100000000) return 12000000 + (gross - 45000000) * 0.05;
    return Math.min(20000000, 14750000 + (gross - 100000000) * 0.02);
  }

  function basicTax(base) {
    var b = Math.max(0, base);
    if (b <= 14000000) return b * 0.06;
    if (b <= 50000000) return b * 0.15 - 1260000;
    if (b <= 88000000) return b * 0.24 - 5760000;
    if (b <= 150000000) return b * 0.35 - 15440000;
    if (b <= 300000000) return b * 0.38 - 19940000;
    if (b <= 500000000) return b * 0.40 - 25940000;
    if (b <= 1000000000) return b * 0.42 - 35940000;
    return b * 0.45 - 65940000;
  }

  function creditLimit(total) {
    if (total <= 33000000) return 740000;
    if (total <= 70000000) return Math.max(660000, 740000 - (total - 33000000) * 0.008);
    if (total <= 120000000) return Math.max(500000, 660000 - (total - 70000000) * 0.5);
    return Math.max(200000, 500000 - (total - 120000000) * 0.5);
  }

  function earnedCredit(san, total) {
    var raw = san <= 1300000 ? san * 0.55 : 715000 + (san - 1300000) * 0.30;
    return Math.max(0, Math.min(raw, creditLimit(total), san));
  }

  function calcSalary(p) {
    var annual = Math.max(0, p.annual || 0);
    var nonTax = Math.max(0, p.nonTaxable || 0);
    var dependents = Math.max(1, Math.min(11, Math.round(p.dependents || 1)));

    var monthlyGross = annual / 12;
    var monthlyTaxable = Math.max(0, monthlyGross - nonTax);

    var pensionBase = Math.min(PENSION_MAX, Math.max(PENSION_MIN, floor1000(monthlyTaxable)));
    var pension = floor10(pensionBase * RATE.pension);
    var health = floor10(monthlyTaxable * RATE.health);
    var ltc = floor10(health * RATE.ltcFromHealth);
    var employ = floor10(monthlyTaxable * RATE.employ);
    var insuranceM = pension + health + ltc + employ;

    var totalTaxable = monthlyTaxable * 12;
    var labor = laborDeduction(totalTaxable);
    var personal = PERSONAL_DEDUCTION * dependents;

    // (A) 보험료공제(건강·요양·고용) + 연금보험료공제 → 표준세액공제 없음
    var baseA = totalTaxable - labor - personal - insuranceM * 12;
    var sanA = basicTax(baseA);
    var decA = Math.max(0, sanA - earnedCredit(sanA, totalTaxable));

    // (B) 연금보험료공제만 + 표준세액공제 13만 원
    var baseB = totalTaxable - labor - personal - pension * 12;
    var sanB = basicTax(baseB);
    var decB = Math.max(0, sanB - earnedCredit(sanB, totalTaxable) - STANDARD_CREDIT);

    var decided = Math.min(decA, decB);
    var taxM = floor10(decided / 12);
    var localM = floor10(taxM * 0.1);

    var net = monthlyGross - insuranceM - taxM - localM;
    return {
      annual: annual,
      monthlyGross: monthlyGross,
      monthlyTaxable: monthlyTaxable,
      pension: pension, health: health, ltc: ltc, employ: employ,
      insurance: insuranceM,
      tax: taxM, local: localM,
      deduction: insuranceM + taxM + localM,
      net: net,
      netRate: monthlyGross > 0 ? (net / monthlyGross) * 100 : 0,
      annualNet: net * 12,
      annualTax: decided
    };
  }

  function calcFuel(p) {
    var km = Math.max(0, p.roundTrip || 0);
    var eff = Math.max(0.1, p.efficiency || 0);
    var price = Math.max(0, p.price || 0);
    var days = Math.max(0, Math.min(31, p.days || 0));
    var toll = Math.max(0, p.toll || 0);

    var litersPerDay = km / eff;
    var costPerDay = litersPerDay * price;
    var monthlyFuel = costPerDay * days;
    var monthlyTotal = monthlyFuel + toll;
    return {
      perDay: costPerDay,
      perKm: price / eff,
      monthlyFuel: monthlyFuel,
      monthlyTotal: monthlyTotal,
      annualFuel: monthlyFuel * 12,
      annualTotal: monthlyTotal * 12,
      litersMonth: litersPerDay * days,
      kmMonth: km * days,
      kmYear: km * days * 12
    };
  }

  function calcFixed(p) {
    var income = Math.max(0, p.income || 0);
    var total = (p.items || []).reduce(function (a, b) { return a + Math.max(0, b || 0); }, 0);
    var ratio = income > 0 ? (total / income) * 100 : 0;

    var livingRate = ratio > 40 ? 0.2 : 0.3;
    var acctFixed = Math.ceil(total / 10000) * 10000;
    var living = Math.round((income * livingRate) / 10000) * 10000;
    var save = income - acctFixed - living;
    var trimmed = false;
    if (save < 0) {
      living = Math.max(0, Math.round((income - acctFixed) / 10000) * 10000);
      save = Math.max(0, income - acctFixed - living);
      trimmed = true;
    }

    var band, badgeClass;
    if (ratio <= 30) { band = "안정 구간"; badgeClass = ""; }
    else if (ratio <= 40) { band = "적정 구간"; badgeClass = ""; }
    else if (ratio <= 50) { band = "주의 구간"; badgeClass = "warn"; }
    else { band = "위험 구간"; badgeClass = "danger"; }

    return {
      income: income, total: total, ratio: ratio, band: band, badgeClass: badgeClass,
      acctFixed: acctFixed, living: living, save: save, trimmed: trimmed,
      left: income - total, emergency: total * 3,
      savingIfCut10: total * 0.1 * 12
    };
  }

  // 계산 코어를 밖에서도 검증할 수 있게 노출
  window.ZamongCalc = { calcSalary: calcSalary, calcFuel: calcFuel, calcFixed: calcFixed };

  /* ───────── 숫자 포맷 ───────── */
  function fmt(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("ko-KR");
  }
  function fmtWon(n) { return fmt(n) + "원"; }
  function num(el) {
    if (!el) return 0;
    var v = String(el.value).replace(/[^\d.]/g, "");
    var parts = v.split(".");
    if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
    var f = parseFloat(v);
    return isFinite(f) ? f : 0;
  }

  /* ───────── 입력 콤마 처리 ───────── */
  function attachFormatter(el, allowDecimal) {
    el.addEventListener("input", function () {
      var raw = el.value;
      var caret = el.selectionStart || 0;
      var digitsBefore = (raw.slice(0, caret).match(/[\d.]/g) || []).length;
      var cleaned = raw.replace(/[^\d.]/g, "");
      if (!allowDecimal) cleaned = cleaned.replace(/\./g, "");
      else {
        var i = cleaned.indexOf(".");
        if (i >= 0) cleaned = cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, "");
      }
      var nums = cleaned.split(".");
      var head = nums[0].replace(/^0+(?=\d)/, "");
      var out = head ? Number(head).toLocaleString("ko-KR") : (/^0/.test(head) ? "0" : "");
      if (nums.length > 1) out += "." + nums[1].slice(0, 2);
      el.value = out;

      // 캐럿 복원
      var count = 0, pos = 0;
      for (; pos < el.value.length; pos++) {
        if (/[\d.]/.test(el.value[pos])) count++;
        if (count >= digitsBefore) { pos++; break; }
      }
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    });
    el.addEventListener("blur", function () {
      if (el.value === ".") el.value = "0";
    });
  }

  /* ───────── 탭 ───────── */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));

  function showTab(name) {
    tabs.forEach(function (t) {
      var on = t.dataset.panel === name;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      var on = p.id === "panel-" + name;
      p.classList.toggle("is-on", on);
      if (on) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
    });
    if (history.replaceState) history.replaceState(null, "", "#" + name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.panel); });
  });

  /* ───────── ① 월급 ───────── */
  var sIncome = document.getElementById("s-income");
  var sIncomeLabel = document.getElementById("s-income-label");
  var sNontax = document.getElementById("s-nontax");
  var sFamily = document.getElementById("s-family");
  var salaryMode = "annual";
  var lastSalaryNet = 0;

  function readSalary() {
    var income = num(sIncome);
    var annual = salaryMode === "annual" ? income : income * 12;
    return { annual: annual, nonTaxable: num(sNontax), dependents: num(sFamily) || 1 };
  }

  function renderSalary() {
    var r = calcSalary(readSalary());
    lastSalaryNet = r.net;

    document.getElementById("r-salary-net").textContent = fmt(r.net);
    document.getElementById("r-salary-sub").textContent =
      "세전 " + fmtWon(r.monthlyGross) + "에서 " + fmtWon(r.deduction) + "이 빠집니다";
    document.getElementById("r-salary-bar").style.width =
      Math.max(0, Math.min(100, r.netRate)) + "%";

    var cells = {
      pension: r.pension, health: r.health, ltc: r.ltc, employ: r.employ,
      tax: r.tax, local: r.local, deduct: r.deduction
    };
    Object.keys(cells).forEach(function (k) {
      var el = document.querySelector('#r-salary-table [data-cell="' + k + '"]');
      if (el) el.textContent = fmtWon(cells[k]);
    });

    var facts = {
      gross: fmtWon(r.monthlyGross),
      annualNet: fmtWon(r.annualNet),
      rate: (r.monthlyGross > 0 ? (r.deduction / r.monthlyGross * 100).toFixed(1) : "0.0") + "%"
    };
    Object.keys(facts).forEach(function (k) {
      var el = document.querySelector('#r-salary [data-fact="' + k + '"]');
      if (el) el.textContent = facts[k];
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-salary-mode]"), function (b) {
    b.addEventListener("click", function () {
      var mode = b.dataset.salaryMode;
      if (mode === salaryMode) return;
      var cur = num(sIncome);
      if (mode === "monthly") cur = Math.round(cur / 12);
      else cur = Math.round(cur * 12);
      salaryMode = mode;
      sIncome.value = fmt(cur);
      sIncomeLabel.textContent = mode === "annual" ? "연봉" : "월급";
      document.querySelectorAll("[data-salary-mode]").forEach(function (x) {
        x.classList.toggle("is-on", x.dataset.salaryMode === mode);
      });
      renderSalary(); save();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-annual]"), function (b) {
    b.addEventListener("click", function () {
      salaryMode = "annual";
      sIncomeLabel.textContent = "연봉";
      document.querySelectorAll("[data-salary-mode]").forEach(function (x) {
        x.classList.toggle("is-on", x.dataset.salaryMode === "annual");
      });
      sIncome.value = fmt(Number(b.dataset.annual));
      renderSalary(); save();
    });
  });

  /* ───────── ② 유류비 ───────── */
  function renderFuel() {
    var r = calcFuel({
      roundTrip: num(document.getElementById("f-distance")),
      efficiency: num(document.getElementById("f-eff")),
      price: num(document.getElementById("f-price")),
      days: num(document.getElementById("f-days")),
      toll: num(document.getElementById("f-toll"))
    });
    document.getElementById("r-fuel-month").textContent = fmt(r.monthlyTotal);
    document.getElementById("r-fuel-sub").textContent =
      "유류비 " + fmtWon(r.monthlyFuel) + " + 톨게이트 " + fmtWon(Math.max(0, num(document.getElementById("f-toll"))));
    document.getElementById("r-fuel-day").textContent = fmtWon(r.perDay);
    document.getElementById("r-fuel-year").textContent = fmtWon(r.annualTotal);
    document.getElementById("r-fuel-km").textContent = fmt(r.perKm) + "원";

    var cells = {
      monthlyFuel: fmtWon(r.monthlyFuel),
      toll: fmtWon(Math.max(0, num(document.getElementById("f-toll")))),
      monthlyTotal: fmtWon(r.monthlyTotal),
      annualTotal: fmtWon(r.annualTotal),
      liters: r.litersMonth.toFixed(1) + " L",
      kmMonth: fmt(r.kmMonth) + " km"
    };
    Object.keys(cells).forEach(function (k) {
      var el = document.querySelector('#r-fuel-table [data-cell="' + k + '"]');
      if (el) el.textContent = cells[k];
    });
  }

  /* ───────── ③ 고정비 ───────── */
  function renderFixed() {
    var r = calcFixed({
      income: num(document.getElementById("x-income")),
      items: ["x-rent", "x-tel", "x-ins", "x-sub", "x-trans", "x-etc"].map(function (id) {
        return num(document.getElementById(id));
      })
    });

    document.getElementById("r-fixed-ratio").textContent = r.ratio.toFixed(1);
    var badge = document.getElementById("r-fixed-badge");
    badge.textContent = r.band;
    badge.className = "r-badge" + (r.badgeClass ? " " + r.badgeClass : "");

    var sub = "월 실수령 " + fmtWon(r.income) + " 중 " + fmtWon(r.total) + "이 먼저 빠져나갑니다.";
    if (r.badgeClass === "warn") sub += " 고정비를 10%만 줄여도 1년에 " + fmtWon(r.savingIfCut10) + "이 남습니다.";
    if (r.badgeClass === "danger") sub += " 구독·보험처럼 줄일 수 있는 항목부터 정리하세요.";
    if (r.trimmed) sub += " 남는 돈이 없어 생활비를 " + fmtWon(r.living) + "으로 줄여 계산했습니다.";
    document.getElementById("r-fixed-sub").textContent = sub;

    document.getElementById("r-fixed-scale").style.width =
      Math.max(0, Math.min(100, (r.ratio / 60) * 100)) + "%";

    var cells = {
      acctFixed: fmtWon(r.acctFixed),
      acctLiving: fmtWon(r.living),
      acctSave: fmtWon(r.save)
    };
    Object.keys(cells).forEach(function (k) {
      var el = document.querySelector('#r-fixed-table [data-cell="' + k + '"]');
      if (el) el.textContent = cells[k];
    });

    var facts = {
      fixedTotal: fmtWon(r.total),
      left: fmtWon(r.left),
      emergency: fmtWon(r.emergency)
    };
    Object.keys(facts).forEach(function (k) {
      var el = document.querySelector('#r-fixed [data-fact="' + k + '"]');
      if (el) el.textContent = facts[k];
    });
  }

  document.getElementById("x-pull").addEventListener("click", function () {
    if (!lastSalaryNet) renderSalary();
    if (lastSalaryNet > 0) {
      document.getElementById("x-income").value = fmt(lastSalaryNet);
      renderFixed(); save();
    }
  });

  /* ───────── 저장/복원 ───────── */
  var KEY = "zamong-tools-v1";
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var data = { mode: salaryMode, values: {} };
        ["s-income", "s-nontax", "s-family", "f-distance", "f-eff", "f-price", "f-days", "f-toll",
          "x-income", "x-rent", "x-tel", "x-ins", "x-sub", "x-trans", "x-etc"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) data.values[id] = el.value;
        });
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {}
    }, 350);
  }
  function restore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.mode === "monthly") {
        salaryMode = "monthly";
        sIncomeLabel.textContent = "월급";
        Array.prototype.forEach.call(document.querySelectorAll("[data-salary-mode]"), function (x) {
          x.classList.toggle("is-on", x.dataset.salaryMode === "monthly");
        });
      }
      Object.keys(data.values || {}).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && data.values[id] != null) el.value = data.values[id];
      });
    } catch (e) {}
  }

  /* ───────── 초기화 ───────── */
  ["s-income", "s-nontax", "s-family", "f-price", "f-days", "f-toll",
    "x-income", "x-rent", "x-tel", "x-ins", "x-sub", "x-trans", "x-etc"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) attachFormatter(el, false);
  });
  ["f-distance", "f-eff"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) attachFormatter(el, true);
  });

  restore();
  renderSalary();
  renderFuel();
  renderFixed();

  Array.prototype.forEach.call(document.querySelectorAll("input"), function (el) {
    el.addEventListener("input", function () {
      if (el.closest("#panel-salary")) renderSalary();
      else if (el.closest("#panel-fuel")) renderFuel();
      else renderFixed();
      save();
    });
  });

  var start = (location.hash || "").replace("#", "");
  if (["salary", "fuel", "fixed"].indexOf(start) >= 0) {
    tabs.forEach(function (t) {
      var on = t.dataset.panel === start;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      var on = p.id === "panel-" + start;
      p.classList.toggle("is-on", on);
      if (on) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
    });
    window.scrollTo(0, 0);
  }
})();

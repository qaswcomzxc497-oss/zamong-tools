/* 차곡카 × 자몽스튜디오 — 내 차 정비·소모품 체크
   계산 로직 + 입력 저장(localStorage) + 캘린더(.ics) 내보내기 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zamong_car_check_v1';
  var MO = 2629800000; // 평균 한 달(ms)
  var DEFAULTS = { fuel: 'gasoline', year: 2019, regMonth: 0, odo: 80000, monthly: 1000, lastOil: null, lastTire: null, step: 1 };

  var FUEL_LABEL = { gasoline: '가솔린', diesel: '디젤', hybrid: '하이브리드', ev: '전기차' };
  var EV_NOTE = '전기차는 엔진오일과 변속기 오일이 없습니다. 감속기 오일과 고전압 배터리 냉각수를 대신 확인하세요.';
  var ICE_NOTE = '유종·주행거리 기준 일반 승용차 참고치입니다. 시내 단거리 주행이 많으면 주기를 조금 짧게 잡으세요.';

  /* ── 쿠팡 파트너스 추천 상품 ───────────────────────────────
     추천 링크가 생기면 아래 주석을 풀고 값을 채우세요.
     비어 있으면 화면에 아무것도 나오지 않습니다.
     예) { name: '불스원 레인OK 와이퍼', price: '12,900원', url: 'https://link.coupang.com/a/xxxx', tag: '차량용품' }
  ─────────────────────────────────────────────────────────── */
  var COUPANG_ITEMS = [
    // { name: '', price: '', url: '', tag: '차량용품' }
  ];

  /* ── 소모품 정의 (일반 승용차 기준 참고치) ───────────────── */
  function itemsFor(fuel) {
    var tire = {
      key: 'tire', name: '타이어 위치교환 · 교체', tire: true,
      replaceKm: fuel === 'ev' ? 40000 : 50000, replaceMo: 60,
      period: '위치교환 10,000km마다 · 교체는 ' + (fuel === 'ev' ? '40,000km' : '50,000km') + ' 또는 5년 전후',
      note: '마모선(1.6mm)과 옆면 갈라짐을 확인하세요. 위치교환만 해도 수명이 20% 늘어납니다.'
    };
    var common = [
      { key: 'ac', name: '에어컨 필터', km: 15000, mo: 12, ageNew: true,
        period: '15,000km 또는 12개월', note: '냄새가 나거나 바람이 약하면 더 자주 교체하세요. 직접 교체도 쉽습니다.' },
      { key: 'brakeFluid', name: '브레이크 오일', km: 40000, mo: 24, ageNew: true,
        period: '40,000km 또는 24개월', note: '수분이 차면 제동 거리가 길어집니다. 2년마다 교체가 안전합니다.' },
      { key: 'pad', name: '브레이크 패드', km: fuel === 'hybrid' || fuel === 'ev' ? 70000 : 50000,
        period: (fuel === 'hybrid' || fuel === 'ev' ? '50,000~70,000km' : '앞 40,000~50,000km · 뒤 60,000~80,000km'),
        note: '금속 긁는 소리나 밀리는 느낌이 있으면 즉시 점검하세요.' },
      tire
    ];

    if (fuel === 'ev') {
      return [
        { key: 'reducer', name: '감속기 오일', km: 80000, mo: 60, ageNew: true,
          period: '80,000km 또는 60개월', note: '전기차에는 엔진오일이 없습니다. 감속기 오일만 확인하세요.' },
        { key: 'ac', name: '에어컨 필터', km: 15000, mo: 12, ageNew: true,
          period: '15,000km 또는 12개월', note: '미세먼지가 많은 계절에는 6개월마다 갈아도 좋습니다.' },
        { key: 'brakeFluid', name: '브레이크 오일', km: 40000, mo: 24, ageNew: true,
          period: '40,000km 또는 24개월', note: '회생제동 차량도 브레이크 오일은 일반차와 같습니다.' },
        { key: 'pad', name: '브레이크 패드', km: 70000,
          period: '60,000~70,000km (점검은 연 1회)', note: '회생제동 덕에 마모가 느리지만, 1년에 한 번 두께를 확인하세요.' },
        tire,
        { key: 'hvcool', name: '고전압 배터리 냉각수', km: 60000, mo: 48, ageNew: true,
          period: '60,000km 또는 48개월', note: '배터리 열관리의 핵심입니다. 정비소에서 누유·수위를 함께 확인하세요.' },
        { key: 'hvcheck', name: '고전압 배터리 상태 점검', mo: 12, ageNew: true,
          period: '12개월마다 (SOH 점검)', note: '배터리 건강도(SOH)를 연 1회 점검하세요. 보증 조건도 함께 확인하면 좋습니다.' },
        { key: 'battery', name: '12V 보조 배터리', mo: 48, ageNew: true, absoluteAge: true,
          period: '36~48개월', note: '전기차도 12V 배터리는 소모품입니다. 시동(전원)이 늦으면 점검하세요. 최근에 갈았다면 여유가 있습니다.' }
      ];
    }

    var oil = { key: 'oil', name: '엔진오일 · 오일필터', km: 10000, mo: 12, baseline: 'lastOil',
      period: (fuel === 'diesel' ? '7,500~10,000km 또는 12개월' : '10,000km 또는 12개월'),
      note: fuel === 'diesel'
        ? '디젤은 연료 그을음이 많아 7,500km 전후로 짧게 잡는 경우가 많습니다.'
        : '가장 기본이 되는 소모품입니다. 시내 단거리 위주라면 7,500km마다 권장합니다.' };

    var trans = { key: 'trans', name: '변속기(미션) 오일', km: 80000, mo: 60, ageNew: true,
      period: '80,000km 또는 60개월', note: '제조사에 따라 무교환으로 표기되기도 합니다. 차량 매뉴얼을 함께 확인하세요.' };

    var coolant = { key: 'coolant', name: '냉각수', km: 100000, mo: 60, ageNew: true,
      period: '100,000km 또는 60개월', note: '보충할 때는 정품 냉각수를 쓰세요. 엔진 과열의 주범입니다.' };

    var battery = { key: 'battery', name: '12V 배터리', mo: 48, ageNew: true, absoluteAge: true,
      period: '36~48개월', note: '3~5년이 평균 수명입니다. 시동이 늦거나 실내등이 어두우면 교체 시기입니다. 최근에 갈았다면 여유가 있습니다.' };

    return [oil].concat(common, [trans, coolant, battery]);
  }

  /* ── 유틸 ─────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function parseNum(v) { var s = String(v == null ? '' : v).replace(/[^0-9]/g, ''); return s === '' ? null : Number(s); }
  function addMonths(d, m) { var x = new Date(d.getTime()); x.setDate(1); x.setMonth(x.getMonth() + Math.round(m)); return x; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function ym(d) { return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월'; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = Object.assign({}, DEFAULTS);
  var hasResult = false;
  var lastResult = null;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      ['fuel', 'year', 'regMonth', 'odo', 'monthly', 'lastOil', 'lastTire', 'step'].forEach(function (k) {
        if (s[k] !== undefined) state[k] = s[k];
      });
      return !!s.hasResult;
    } catch (e) { return false; }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fuel: state.fuel, year: state.year, regMonth: state.regMonth, odo: state.odo, monthly: state.monthly,
        lastOil: state.lastOil, lastTire: state.lastTire, step: state.step, hasResult: hasResult
      }));
    } catch (e) { /* 저장 공간이 없어도 계산은 계속 */ }
  }

  /* ── 차량 객체 ─────────────────────────────────────────── */
  function carOf() {
    var m = state.regMonth || 0;
    var odo = state.odo || 0;
    // 계기판보다 큰 교체 기록은 입력 실수로 보고 무시한다
    var lastOil = state.lastOil != null && state.lastOil <= odo ? state.lastOil : null;
    var lastTire = state.lastTire != null && state.lastTire <= odo ? state.lastTire : null;
    return {
      fuel: state.fuel,
      year: state.year,
      regMonth: m,
      odo: odo,
      monthly: state.monthly || 0,
      lastOil: lastOil,
      lastTire: lastTire,
      // 출고 시점 추정: 월을 모르면 그해 6월 중순으로 본다(오차 ±6개월)
      start: new Date(state.year, m ? m - 1 : 5, 15)
    };
  }

  /* ── 진단 ─────────────────────────────────────────────── */
  function diagnose(item, car, now) {
    var ageMo = Math.max(0, (now - car.start) / MO);
    var hasBase = !!(item.baseline && car[item.baseline] != null);
    var kmUsed = null, kmLeft = null, moUsed = null, moLeft = null;

    if (item.km) {
      kmUsed = hasBase ? Math.max(0, car.odo - car[item.baseline]) : (car.odo % item.km);
      kmLeft = Math.max(0, item.km - kmUsed);
    }
    if (item.mo && !hasBase) {
      // 교체 기록이 없으면 ‘주기 경계에서 마지막으로 갈았다’고 보고 추정한다(타이어·배터리는 신차 기준)
      moUsed = item.absoluteAge ? ageMo : (ageMo % item.mo);
      moLeft = Math.max(0, item.mo - moUsed);
    }

    var ratio = 0;
    if (item.km) ratio = Math.max(ratio, kmUsed / item.km);
    if (moUsed != null) ratio = Math.max(ratio, moUsed / item.mo);
    var st = ratio >= 1 ? 'late' : ratio >= 0.8 ? 'soon' : 'ok';

    // 남은 시간(개월): 주행거리 기준과 기간 기준 중 빨리 오는 쪽
    var months = [];
    if (item.km && car.monthly > 0) months.push(kmLeft / car.monthly);
    if (moLeft != null) months.push(moLeft);
    var leftMonths = months.length ? Math.min.apply(null, months) : null;

    // 어느 쪽이 먼저 오는지
    var kmRatioLeft = item.km ? kmLeft / item.km : Infinity;
    var moRatioLeft = moLeft != null ? moLeft / item.mo : Infinity;

    var main, sub = '';
    if (st === 'late') {
      var over = '';
      if (item.km && kmUsed > item.km) over = fmt(kmUsed - item.km) + 'km';
      else if (moUsed != null && moUsed > item.mo) over = Math.round(moUsed - item.mo) + '개월';
      main = '권장 주기 ' + (over ? over + ' 초과 · ' : '') + '지금 교체하세요';
    } else if (kmRatioLeft <= moRatioLeft && item.km) {
      main = '약 ' + fmt(kmLeft) + 'km 남음' + (leftMonths != null ? ' · ' + ym(addMonths(now, leftMonths)) + '쯤' : '');
      if (moLeft != null) sub = '기간 기준 약 ' + Math.round(moLeft) + '개월';
    } else if (moLeft != null) {
      main = '약 ' + Math.round(moLeft) + '개월 남음 · ' + ym(addMonths(now, leftMonths != null ? leftMonths : moLeft)) + '쯤';
      if (item.km) sub = '주행거리 기준 약 ' + fmt(kmLeft) + 'km';
    } else {
      main = item.km ? '약 ' + fmt(kmLeft) + 'km 남음' : '—';
    }

    return {
      key: item.key, name: item.name, period: item.period, note: item.note,
      state: st, ratio: clamp(ratio, 0, 1), main: main, sub: sub,
      estimated: !hasBase, leftMonths: leftMonths,
      dueDate: leftMonths != null ? addMonths(now, Math.max(0, leftMonths)) : null
    };
  }

  function diagnoseTire(item, car, now) {
    var ageMo = Math.max(0, (now - car.start) / MO);
    var rotUsed = car.odo % 10000;
    var rotLeft = Math.max(0, 10000 - rotUsed);
    var repUsed = car.lastTire != null ? Math.max(0, car.odo - car.lastTire) : (car.odo % item.replaceKm);
    var repLeft = Math.max(0, item.replaceKm - repUsed);
    var repMoUsed = car.lastTire != null ? null : ageMo;
    var repMoLeft = repMoUsed != null ? Math.max(0, item.replaceMo - repMoUsed) : null;

    var repRatio = repUsed / item.replaceKm;
    if (repMoUsed != null) repRatio = Math.max(repRatio, repMoUsed / item.replaceMo);
    var ratio = Math.max(repRatio, rotUsed / 10000);
    var st = repRatio >= 1 ? 'late' : ratio >= 0.8 ? 'soon' : 'ok';

    var months = [];
    if (car.monthly > 0) { months.push(repLeft / car.monthly); months.push(rotLeft / car.monthly); }
    if (repMoLeft != null) months.push(repMoLeft);
    var leftMonths = months.length ? Math.min.apply(null, months) : null;

    var main;
    if (repRatio >= 1) {
      var over = repUsed > item.replaceKm ? fmt(repUsed - item.replaceKm) + 'km' : Math.round((repMoUsed || 0) - item.replaceMo) + '개월';
      main = '교체 주기 ' + over + ' 초과 · 지금 교체하세요';
    } else {
      var repSoon = repMoLeft != null && repMoLeft < repLeft / (car.monthly || 1);
      main = repSoon
        ? '교체까지 약 ' + Math.round(repMoLeft) + '개월 · ' + ym(addMonths(now, repMoLeft)) + '쯤'
        : '교체까지 약 ' + fmt(repLeft) + 'km' + (car.monthly > 0 ? ' · ' + ym(addMonths(now, repLeft / car.monthly)) + '쯤' : '');
    }

    var rotMonths = car.monthly > 0 ? rotLeft / car.monthly : null;
    var rotText = '위치교환 약 ' + fmt(rotLeft) + 'km' + (rotMonths != null ? ' (' + ym(addMonths(now, rotMonths)) + '쯤)' : '');

    return {
      key: item.key, name: item.name, period: item.period, note: item.note,
      state: st, ratio: clamp(ratio, 0, 1), main: main, sub: rotText,
      subState: rotUsed / 10000 >= 1 ? 'late' : rotUsed / 10000 >= 0.8 ? 'soon' : 'ok',
      estimated: car.lastTire == null, leftMonths: leftMonths,
      dueDate: leftMonths != null ? addMonths(now, Math.max(0, leftMonths)) : null,
      isTire: true
    };
  }

  /* ── 정기검사 ─────────────────────────────────────────── */
  function inspection(car, now) {
    var y0 = car.year + 4;                       // 신차 등록 4년 후 첫 검사
    var month = car.regMonth || 0;
    var due;
    if (month) {
      due = new Date(y0, month - 1, 15);
      while (due < now) due = new Date(due.getFullYear() + 2, month - 1, 15);
    } else {
      due = new Date(y0, 0, 1);
      while (due.getFullYear() < now.getFullYear()) due = new Date(due.getFullYear() + 2, 0, 1);
    }
    var months = (due - now) / MO;
    var big = (month ? ym(due) : due.getFullYear() + '년 (연중)');
    var sub;
    if (months < 0) sub = '검사 기한이 지났습니다 · 바로 검사받으세요';
    else if (!month) sub = due.getFullYear() + '년 안에 받으시면 됩니다 · 정확한 기한은 등록일 기준';
    else if (months < 1) sub = '한 달 안에 검사받으셔야 합니다';
    else sub = '약 ' + Math.round(months) + '개월 남음 · 비사업용 승용차 기준';
    return { due: due, big: big, sub: sub, months: months, exact: !!month };
  }

  /* ── 캘린더(.ics) ─────────────────────────────────────── */
  function icsEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsDate(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
  function icsStamp(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  // 75바이트에서 접는(iCalendar 규칙) — 한글은 3바이트라 글자 단위로 센다
  function icsFold(line) {
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      var b = ch.charCodeAt(0) < 128 ? 1 : 3;
      if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function buildICS(events, calName) {
    var now = new Date();
    var L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZAMONG STUDIO//Car Care//KO',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(calName || '차량 점검 일정')
    ];
    events.forEach(function (e, i) {
      L.push('BEGIN:VEVENT');
      L.push('UID:' + (e.uid || ('car-' + i + '-' + icsDate(e.date))) + '@zamong-tools');
      L.push('DTSTAMP:' + icsStamp(now));
      L.push('DTSTART;VALUE=DATE:' + icsDate(e.date));
      L.push('DTEND;VALUE=DATE:' + icsDate(addDays(e.date, 1)));
      L.push('SUMMARY:' + icsEsc(e.summary));
      if (e.desc) L.push('DESCRIPTION:' + icsEsc(e.desc));
      L.push('BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.summary), 'END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }
  function downloadICS(events, name) {
    var text = buildICS(events, name);
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '_' + icsDate(new Date()) + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    var hint = $('#icsHint');
    if (hint) {
      hint.textContent = '캘린더 파일을 내려받았습니다. 아이폰은 ‘파일’ 앱에서 .ics 파일을 눌러 캘린더에 추가하세요.';
    }
  }

  /* ── 화면: 단계 ───────────────────────────────────────── */
  function goStep(n) {
    state.step = n;
    $all('.step-panel').forEach(function (p) { p.hidden = Number(p.dataset.panel) !== n; });
    $all('#steps li').forEach(function (li) {
      var s = Number(li.dataset.step);
      li.classList.toggle('is-on', s === n);
      li.classList.toggle('is-done', s < n);
    });
    $('#prevBtn').hidden = n === 1;
    $('#nextBtn').hidden = n === 3;
    $('#submitBtn').hidden = n !== 3;
    $('#oilField').hidden = state.fuel === 'ev';
    save();
  }

  function syncFromInputs() {
    var fuel = $('input[name="fuel"]:checked');
    if (fuel) state.fuel = fuel.value;
    state.year = Number($('#year').value) || state.year;
    state.regMonth = Number($('#regMonth').value) || 0;
    state.odo = parseNum($('#odo').value) || 0;
    state.monthly = parseNum($('#monthly').value) || 0;
    state.lastOil = parseNum($('#lastOil').value);
    state.lastTire = parseNum($('#lastTire').value);
  }

  function syncFuelUI() {
    $all('.fuel').forEach(function (lab) {
      var input = lab.querySelector('input');
      lab.classList.toggle('is-on', !!(input && input.checked));
    });
  }

  function fillInputs() {
    var f = $('input[name="fuel"][value="' + state.fuel + '"]');
    if (f) f.checked = true;
    syncFuelUI();
    $('#year').value = String(state.year);
    $('#regMonth').value = String(state.regMonth || 0);
    $('#odo').value = state.odo ? fmt(state.odo) : '';
    $('#monthly').value = state.monthly ? fmt(state.monthly) : '';
    $('#lastOil').value = state.lastOil != null ? fmt(state.lastOil) : '';
    $('#lastTire').value = state.lastTire != null ? fmt(state.lastTire) : '';
  }

  /* ── 화면: 결과 ───────────────────────────────────────── */
  function render() {
    syncFromInputs();
    var now = new Date();
    var car = carOf();
    var defs = itemsFor(car.fuel);
    var results = defs.map(function (it) {
      return it.tire ? diagnoseTire(it, car, now) : diagnose(it, car, now);
    });
    var order = { late: 0, soon: 1, ok: 2 };
    results.sort(function (a, b) { return order[a.state] - order[b.state]; });

    lastResult = { car: car, results: results, now: now };

    // 차량 요약
    $('#sumTitle').textContent = FUEL_LABEL[car.fuel] + ' · ' + car.year + '년식';
    $('#sumStats').innerHTML =
      '<li><span>총 주행거리</span><b>' + fmt(car.odo) + 'km</b></li>' +
      '<li><span>월 주행거리</span><b>' + (car.monthly ? fmt(car.monthly) + 'km' : '—') + '</b></li>' +
      '<li><span>차량 연식</span><b>' + Math.max(0, now.getFullYear() - car.year) + '년</b></li>';

    var cnt = { late: 0, soon: 0, ok: 0 };
    results.forEach(function (r) { cnt[r.state]++; });
    $('#cntLate').textContent = cnt.late;
    $('#cntSoon').textContent = cnt.soon;
    $('#cntOk').textContent = cnt.ok;

    var grade = $('#gradeHead');
    if (cnt.late > 0) {
      grade.textContent = '지금 바로 점검할 항목이 ' + cnt.late + '개 있습니다';
      grade.className = 'grade-head late';
    } else if (cnt.soon > 0) {
      grade.textContent = '곧 점검할 항목이 ' + cnt.soon + '개 있습니다';
      grade.className = 'grade-head soon';
    } else {
      grade.textContent = '아직 여유가 있습니다. 다음 점검일만 챙기세요';
      grade.className = 'grade-head ok';
    }

    // 정기검사
    var insp = inspection(car, now);
    $('#inspBig').textContent = insp.big;
    $('#inspSub').textContent = insp.sub;

    // 유종 안내
    $('#fuelNote').textContent = car.fuel === 'ev' ? EV_NOTE : ICE_NOTE;

    // 항목 카드
    var badgeLabel = { ok: '● 여유', soon: '▲ 곧 점검', late: '❗ 교체 권장' };
    var list = $('#itemList');
    list.innerHTML = results.map(function (r, idx) {
      return '' +
        '<article class="item" data-state="' + r.state + '">' +
          '<div class="item-head">' +
            '<h3>' + r.name + '</h3>' +
            '<span class="badge ' + r.state + '">' + badgeLabel[r.state] + '</span>' +
          '</div>' +
          '<p class="item-period">권장 ' + r.period + '</p>' +
          '<p class="item-main">' + r.main + '</p>' +
          (r.sub ? '<p class="item-sub"><span><i class="dot ' + (r.subState || 'ok') + '"></i>' + r.sub + '</span></p>' : '') +
          '<div class="meter" aria-hidden="true"><span style="width:' + Math.round(r.ratio * 100) + '%"></span></div>' +
          '<p class="item-note">' + (r.estimated ? '<span class="est">추정</span>' : '') + r.note + '</p>' +
          (r.dueDate ? '<div class="item-foot"><button type="button" class="mini-btn" data-ics="' + idx + '">📅 캘린더에 추가</button></div>' : '') +
        '</article>';
    }).join('');

    // 쿠팡 슬롯
    var slot = $('#coupangSlot');
    if (COUPANG_ITEMS.length) {
      slot.hidden = false;
      slot.innerHTML = COUPANG_ITEMS.map(function (c) {
        return '<a href="' + c.url + '" target="_blank" rel="noopener noreferrer sponsored">' +
          '<span>' + c.name + (c.tag ? '<span class="tag">' + c.tag + '</span>' : '') + '</span>' +
          '<b>' + (c.price || '보기') + '</b></a>';
      }).join('');
    } else {
      slot.hidden = true;
      slot.innerHTML = '';
    }

    $('#results').hidden = false;
  }

  function showResults(scroll) {
    render();
    hasResult = true;
    save();
    if (scroll) {
      var y = $('#results').getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  /* ── 이벤트 연결 ─────────────────────────────────────── */
  function buildSelects() {
    var yearSel = $('#year');
    if (yearSel.options.length) return;
    var nowYear = new Date().getFullYear();
    for (var y = nowYear; y >= 1995; y--) {
      var o = document.createElement('option');
      o.value = String(y); o.textContent = y + '년';
      yearSel.appendChild(o);
    }
    var regSel = $('#regMonth');
    regSel.innerHTML = '<option value="0">모름</option>';
    for (var m = 1; m <= 12; m++) {
      var om = document.createElement('option');
      om.value = String(m); om.textContent = m + '월';
      regSel.appendChild(om);
    }
  }

  function bind() {
    // 숫자 입력 콤마
    ['#odo', '#monthly', '#lastOil', '#lastTire'].forEach(function (sel) {
      var el = $(sel);
      el.addEventListener('input', function () {
        var v = parseNum(el.value);
        el.value = v == null ? '' : fmt(v);
        syncFromInputs(); save();
        if (hasResult) render();
      });
    });

    // 빠른 선택
    $all('.quick button').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = b.closest('.quick').dataset.target;
        $('#' + target).value = fmt(Number(b.dataset.val));
        syncFromInputs(); save();
        if (hasResult) render();
      });
    });

    // 유종
    $all('input[name="fuel"]').forEach(function (r) {
      r.addEventListener('change', function () { syncFromInputs(); syncFuelUI(); save(); if (hasResult) showResults(false); });
    });

    $('#year').addEventListener('change', function () { syncFromInputs(); save(); if (hasResult) render(); });
    $('#regMonth').addEventListener('change', function () { syncFromInputs(); save(); if (hasResult) render(); });

    // 단계 이동
    $('#nextBtn').addEventListener('click', function () {
      syncFromInputs(); save();
      if (state.step === 2 && !state.odo) {
        $('#odoErr').hidden = false; $('#odo').focus(); return;
      }
      $('#odoErr').hidden = true;
      goStep(Math.min(3, state.step + 1));
      window.scrollTo({ top: $('#wizard').getBoundingClientRect().top + window.pageYOffset - 10, behavior: 'smooth' });
    });
    $('#prevBtn').addEventListener('click', function () { goStep(Math.max(1, state.step - 1)); });

    $('#carForm').addEventListener('submit', function (e) {
      e.preventDefault();
      syncFromInputs(); save();
      if (!state.odo) { goStep(2); $('#odoErr').hidden = false; $('#odo').focus(); return; }
      $('#odoErr').hidden = true;
      showResults(true);
    });

    $('#editBtn').addEventListener('click', function () {
      goStep(1);
      window.scrollTo({ top: $('#wizard').getBoundingClientRect().top + window.pageYOffset - 10, behavior: 'smooth' });
    });

    $('#resetBtn').addEventListener('click', function () {
      if (!window.confirm('입력한 차량 정보를 지우고 처음부터 다시 시작할까요?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      state = Object.assign({}, DEFAULTS);
      hasResult = false;
      fillInputs();
      goStep(1);
      $('#results').hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 캘린더 내보내기
    $('#icsInsp').addEventListener('click', function () {
      if (!lastResult) return;
      var insp = inspection(lastResult.car, lastResult.now);
      downloadICS([{
        date: insp.due, uid: 'inspection-' + icsDate(insp.due),
        summary: insp.exact ? '🚗 자동차 정기검사' : '🚗 자동차 정기검사 기한 확인 (' + insp.due.getFullYear() + '년 중)',
        desc: (insp.exact ? '비사업용 승용차 기준입니다. ' : '비사업용 승용차 기준 · 검사 기한이 ' + insp.due.getFullYear() + '년 중입니다. ') + '정확한 기한은 차량등록증의 최초 등록일로 확인하세요.'
      }], '자동차_정기검사');
    });

    $('#icsAll').addEventListener('click', function () {
      if (!lastResult) return;
      var ev = [];
      var insp = inspection(lastResult.car, lastResult.now);
      ev.push({ date: insp.due, uid: 'inspection-' + icsDate(insp.due), summary: insp.exact ? '🚗 자동차 정기검사' : '🚗 자동차 정기검사 기한 확인 (' + insp.due.getFullYear() + '년 중)', desc: '비사업용 승용차 기준 · 정확한 기한은 차량등록증 확인' });
      lastResult.results.forEach(function (r) {
        if (!r.dueDate) return;
        ev.push({
          date: r.dueDate, uid: r.key + '-' + icsDate(r.dueDate),
          summary: '🔧 ' + r.name + ' 점검',
          desc: '권장 ' + r.period + ' · ' + FUEL_LABEL[lastResult.car.fuel] + ' ' + lastResult.car.year + '년식 ' + fmt(lastResult.car.odo) + 'km 기준'
        });
      });
      downloadICS(ev, '차량_점검_일정');
    });

    // 카드별 캘린더 버튼
    $('#itemList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ics]');
      if (!b || !lastResult) return;
      var r = lastResult.results[Number(b.dataset.ics)];
      if (!r || !r.dueDate) return;
      downloadICS([{
        date: r.dueDate, uid: r.key + '-' + icsDate(r.dueDate),
        summary: '🔧 ' + r.name + ' 점검',
        desc: '권장 ' + r.period + ' · ' + FUEL_LABEL[lastResult.car.fuel] + ' ' + lastResult.car.year + '년식 ' + fmt(lastResult.car.odo) + 'km 기준'
      }], r.name.replace(/[\\/:*?"<>|·\s]/g, '_'));
    });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    var savedResult = load();
    buildSelects();
    fillInputs();
    bind();
    goStep(state.step || 1);
    if (savedResult) { showResults(false); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

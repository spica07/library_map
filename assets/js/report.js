/* 지역별 요약 리포트 */
(function () {
  'use strict';

  var LIBRARIES = window.LIBRARIES || [];
  var DATA_META = window.DATA_META || {};

  var KIND_EMOJI = {
    '공공도서관': '📚',
    '작은도서관': '🧸',
    '어린이도서관': '🎈',
    '기타': '📖'
  };
  var KIND_ORDER = ['공공도서관', '작은도서관', '어린이도서관', '기타'];
  var REGION_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var REGION_COLOR = {
    '서울': '#E1466A', '부산': '#4680E1', '대구': '#E18C46', '인천': '#46B1E1',
    '광주': '#9B59D9', '대전': '#46C78F', '울산': '#5A6ACF', '세종': '#C7A446',
    '경기': '#46A0D9', '강원': '#2FA88C', '충북': '#D9679C', '충남': '#B08968',
    '전북': '#8CB446', '전남': '#469FB0', '경북': '#C96F4A', '경남': '#7C6FD9',
    '제주': '#E19846'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function regionColor(r) { return REGION_COLOR[r] || '#3F6B4F'; }

  function count(list, pred) {
    return list.filter(pred).length;
  }

  /* ---------- 핵심 지표 타일 ---------- */
  var pub = count(LIBRARIES, function (f) { return f.kind === '공공도서관'; });
  var small = count(LIBRARIES, function (f) { return f.kind === '작은도서관'; });
  var satOpen = count(LIBRARIES, function (f) { return f.satOpen; });
  var tiles = [
    { num: LIBRARIES.length, lbl: '전체 시설' },
    { num: pub, lbl: '공공도서관' },
    { num: small, lbl: '작은도서관' },
    { num: satOpen, lbl: '토요일 운영' }
  ];
  document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
    return '<div class="stat-tile"><div class="num">' + t.num + '</div><div class="lbl">' + t.lbl + '</div></div>';
  }).join('');

  /* ---------- 종류 분포 ---------- */
  var kindCounts = {};
  LIBRARIES.forEach(function (f) {
    kindCounts[f.kind] = (kindCounts[f.kind] || 0) + 1;
  });
  document.getElementById('kindChips').innerHTML = KIND_ORDER
    .filter(function (k) { return kindCounts[k]; })
    .map(function (k) {
      return '<span class="status-chip"><span class="tag">' + KIND_EMOJI[k] + ' ' + esc(k) + '</span>' +
        '<span class="chip-num">' + kindCounts[k] + '곳</span></span>';
    }).join('');

  /* ---------- 지역별 막대 차트 ---------- */
  var byRegion = {};
  LIBRARIES.forEach(function (f) {
    (byRegion[f.region] = byRegion[f.region] || []).push(f);
  });
  var entries = REGION_ORDER
    .filter(function (r) { return byRegion[r]; })
    .map(function (r) { return [r, byRegion[r].length]; });
  entries.sort(function (a, b) { return b[1] - a[1]; });
  var max = entries.length ? entries[0][1] : 1;
  document.getElementById('regionBars').innerHTML = entries.map(function (e) {
    return (
      '<button class="dbar" data-region="' + esc(e[0]) + '" title="지도에서 ' + esc(e[0]) + ' 보기">' +
        '<span>' + esc(e[0]) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (e[1] / max * 100) + '%; background:' + regionColor(e[0]) + '"></span></span>' +
        '<span class="cnt">' + e[1] + '</span>' +
      '</button>'
    );
  }).join('');

  document.getElementById('regionBars').addEventListener('click', function (e) {
    var dbar = e.target.closest('.dbar');
    if (dbar) {
      location.href = 'index.html?region=' + encodeURIComponent(dbar.getAttribute('data-region'));
    }
  });

  /* ---------- 지역별 상세 표 ---------- */
  var tbody = document.querySelector('#reportTable tbody');
  tbody.innerHTML = entries.map(function (e) {
    var r = e[0], list = byRegion[r];
    return (
      '<tr>' +
        '<td><span class="legend-dot" style="background:' + regionColor(r) + '"></span>' + esc(r) + '</td>' +
        '<td>' + list.length + '</td>' +
        '<td>' + count(list, function (f) { return f.kind === '공공도서관'; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.kind === '작은도서관'; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.satOpen; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.holOpen; }) + '</td>' +
      '</tr>'
    );
  }).join('');

  /* ---------- 헤더 ---------- */
  document.getElementById('totalCount').textContent = LIBRARIES.length;
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();

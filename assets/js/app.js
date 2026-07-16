/* 전국 공공도서관 지도 — 앱 로직 */
(function () {
  'use strict';

  var LIBRARIES = window.LIBRARIES || [];
  var DATA_META = window.DATA_META || {};

  var KIND_COLOR = {
    '공공도서관': '#3F6B4F',
    '작은도서관': '#D9A441',
    '어린이도서관': '#E1466A',
    '기타': '#7C6FD9'
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
  var REGION_FULL = {
    '서울': '서울', '부산': '부산', '대구': '대구', '인천': '인천', '광주': '광주',
    '대전': '대전', '울산': '울산', '세종': '세종', '경기': '경기', '강원': '강원',
    '충북': '충북', '충남': '충남', '전북': '전북', '전남': '전남', '경북': '경북',
    '경남': '경남', '제주': '제주'
  };
  var REGION_VIEW = {
    '': { center: [36.30, 127.80], zoom: 7 },
    '서울': { center: [37.5642, 126.99], zoom: 11 },
    '경기': { center: [37.42, 127.18], zoom: 9 },
    '인천': { center: [37.46, 126.64], zoom: 11 },
    '부산': { center: [35.17, 129.06], zoom: 11 },
    '대구': { center: [35.85, 128.57], zoom: 11 },
    '광주': { center: [35.15, 126.87], zoom: 12 },
    '대전': { center: [36.34, 127.39], zoom: 12 },
    '울산': { center: [35.55, 129.31], zoom: 11 },
    '제주': { center: [33.38, 126.55], zoom: 10 },
    '세종': { center: [36.55, 127.27], zoom: 11 },
    '강원': { center: [37.75, 128.30], zoom: 8 },
    '충북': { center: [36.75, 127.75], zoom: 9 },
    '충남': { center: [36.50, 126.85], zoom: 9 },
    '전북': { center: [35.75, 127.15], zoom: 9 },
    '전남': { center: [34.85, 126.95], zoom: 9 },
    '경북': { center: [36.35, 128.90], zoom: 8 },
    '경남': { center: [35.25, 128.25], zoom: 9 }
  };

  var state = {
    q: '',
    region: '',
    district: '',   // "지역|시군구" 복합 키
    kind: '',
    satOpen: false,
    holOpen: false,
    favOnly: false,
    view: 'list'
  };

  var favorites = loadFavorites();

  function loadFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem('lm_favorites') || '[]'));
    } catch (e) { return new Set(); }
  }
  function saveFavorites() {
    localStorage.setItem('lm_favorites', JSON.stringify(Array.from(favorites)));
  }

  // 마지막으로 사용한 지역·빠른필터 버튼 상태를 이 기기에 기억한다
  function loadLastFilters() {
    try {
      return JSON.parse(localStorage.getItem('lm_lastFilters')) || null;
    } catch (e) { return null; }
  }
  function saveLastFilters() {
    try {
      var toggles = {};
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        toggles[btn.getAttribute('data-toggle')] = !!state[btn.getAttribute('data-toggle')];
      });
      toggles.district = state.district;
      localStorage.setItem('lm_lastFilters', JSON.stringify(toggles));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u == null ? '' : u)) ? String(u) : '';
  }

  function regionColor(r) { return REGION_COLOR[r] || '#3F6B4F'; }
  function kindColor(k) { return KIND_COLOR[k] || '#3F6B4F'; }
  function districtKey(f) { return f.region + '|' + f.district; }

  /* ---------- 필터링 ---------- */
  function matches(f) {
    if (state.region && f.region !== state.region) return false;
    if (state.district && districtKey(f) !== state.district) return false;
    if (state.kind && f.kind !== state.kind) return false;
    if (state.satOpen && !f.satOpen) return false;
    if (state.holOpen && !f.holOpen) return false;
    if (state.favOnly && !favorites.has(f.id)) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [f.name, f.address, f.district, f.region, f.kind].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: true })
    .setView(REGION_VIEW[''].center, REGION_VIEW[''].zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (f) {
      var marker = L.circleMarker([f.lat, f.lng], {
        radius: 8,
        fillColor: kindColor(f.kind),
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      var popupHtml =
        '<div class="popup-name">' + esc(f.name) + '</div>' +
        '<div class="popup-meta">' + esc(f.region) + ' ' + esc(f.district) + ' · ' + esc(f.kind) + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + f.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[f.id] = marker;
    });
  }

  /* ---------- 카드에서 지도 위치로 이동 ---------- */
  function locateOnMap(id) {
    var f = LIBRARIES.find(function (x) { return x.id === id; });
    if (!f) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    map.flyTo([f.lat, f.lng], 15, { duration: 0.8 });
    var marker = markersById[f.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(f) {
    var rc = regionColor(f.region);
    var fav = favorites.has(f.id);
    var tags = [
      '<span class="tag district" style="background:' + rc + '">' + esc(f.region) + (f.district ? ' ' + esc(f.district) : '') + '</span>',
      '<span class="tag type-' + esc(f.kind) + '">' + esc(f.kind) + '</span>'
    ];
    if (f.satOpen) tags.push('<span class="tag free">토요일 운영</span>');
    var info = [];
    if (f.hoursWeek) info.push('<div class="card-info">평일 ' + esc(f.hoursWeek) + '</div>');
    if (f.seats) info.push('<div class="card-info">좌석 ' + f.seats.toLocaleString() + '석</div>');
    info.push('<div class="card-info">' + esc(f.closed ? '휴관: ' + f.closed : '휴관 정보 없음') + '</div>');
    return (
      '<article class="facility-card" data-id="' + f.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + esc(f.name) + '</h3>' +
            '<button class="fav-btn" data-fav="' + f.id + '" aria-label="찜">' + (fav ? '❤️' : '🤍') + '</button>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          info.join('') +
          '<button class="card-locate" data-locate="' + f.id + '">위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    var grid = document.getElementById('cardGrid');
    grid.innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v, isLink) {
    if (!v) return '';
    var val = isLink
      ? (safeUrl(v) ? '<a href="' + esc(safeUrl(v)) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v))
      : esc(v);
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + val + '</span></div>';
  }

  window.openFacilityModal = function (id) {
    var f = LIBRARIES.find(function (x) { return x.id === id; });
    if (!f) return;
    var rc = regionColor(f.region);
    var fav = favorites.has(f.id);
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent((REGION_FULL[f.region] || f.region) + ' ' + f.district + ' ' + f.name);
    var body = document.getElementById('modalBody');
    body.innerHTML =
      '<h2 class="modal-title">' + esc(f.name) + '</h2>' +
      '<div class="modal-tags">' +
        '<span class="tag district" style="background:' + rc + '">' + esc(f.region) + (f.district ? ' ' + esc(f.district) : '') + '</span>' +
        '<span class="tag type-' + esc(f.kind) + '">' + esc(f.kind) + '</span>' +
        (f.satOpen ? '<span class="tag free">토요일 운영</span>' : '') +
        (f.holOpen ? '<span class="tag free">공휴일 운영</span>' : '') +
      '</div>' +
      '<div class="detail-list">' +
        detailRow('주소', f.address) +
        detailRow('평일 이용', f.hoursWeek) +
        detailRow('토요일 이용', f.hoursSat) +
        detailRow('공휴일 이용', f.hoursHol) +
        detailRow('휴관일', f.closed) +
        detailRow('열람좌석', f.seats ? f.seats.toLocaleString() + '석' : '') +
        detailRow('장서 수', f.books ? f.books.toLocaleString() + '권' : '') +
        detailRow('대출가능', f.loanCount ? f.loanCount + '권 · ' + f.loanDays + '일' : '') +
        detailRow('전화', f.phone) +
        detailRow('운영기관', f.operOrg) +
        detailRow('자료 기준일', f.refDate) +
      '</div>' +
      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">네이버 길찾기</a>' +
        (safeUrl(f.homepage) ? '<a class="link-btn web" href="' + esc(safeUrl(f.homepage)) + '" target="_blank" rel="noopener">홈페이지</a>' : '') +
        '<button class="link-btn fav" data-fav="' + f.id + '">' + (fav ? '❤️ 찜 해제' : '🤍 찜하기') + '</button>' +
      '</div>';
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 렌더 파이프라인 ---------- */
  function render() {
    var list = LIBRARIES.filter(matches);
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent =
      '총 ' + list.length + '곳이 있어요' + (list.length < LIBRARIES.length ? ' (전체 ' + LIBRARIES.length + '곳 중)' : '!');
  }

  /* ---------- 초기 UI 구성 ---------- */
  function buildFilterPills() {
    var regionRow = document.getElementById('regionFilters');
    var presentR = {};
    LIBRARIES.forEach(function (f) { presentR[f.region] = true; });
    var rPills = ['<button class="pill active" data-region="">전체</button>'];
    REGION_ORDER.forEach(function (r) {
      if (presentR[r]) rPills.push('<button class="pill" data-region="' + r + '">' + r + '</button>');
    });
    regionRow.insertAdjacentHTML('beforeend', rPills.join(''));

    var kindRow = document.getElementById('kindFilters');
    var presentK = {};
    LIBRARIES.forEach(function (f) { presentK[f.kind] = true; });
    var kPills = ['<button class="pill active" data-kind="">전체</button>'];
    KIND_ORDER.forEach(function (k) {
      if (presentK[k]) kPills.push('<button class="pill" data-kind="' + k + '">' + k + '</button>');
    });
    kindRow.insertAdjacentHTML('beforeend', kPills.join(''));
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var byRegion = {};
    LIBRARIES.forEach(function (f) {
      if (!f.district) return;
      if (!byRegion[f.region]) byRegion[f.region] = {};
      byRegion[f.region][f.district] = (byRegion[f.region][f.district] || 0) + 1;
    });
    REGION_ORDER.forEach(function (r) {
      if (!byRegion[r]) return;
      var group = document.createElement('optgroup');
      group.label = r;
      Object.keys(byRegion[r]).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
        .forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = r + '|' + d;
          opt.textContent = r + ' ' + d + ' (' + byRegion[r][d] + ')';
          group.appendChild(opt);
        });
      sel.appendChild(group);
    });
  }

  function buildLegend() {
    document.getElementById('mapLegend').innerHTML = KIND_ORDER.map(function (k) {
      return '<span><span class="legend-dot" style="background:' + KIND_COLOR[k] + '"></span>' + k + '</span>';
    }).join('');
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = LIBRARIES.filter(function (f) { return f.region === parts[0] && f.district === parts[1]; });
      if (sub.length) {
        var lat = sub.reduce(function (s, f) { return s + f.lat; }, 0) / sub.length;
        var lng = sub.reduce(function (s, f) { return s + f.lng; }, 0) / sub.length;
        map.flyTo([lat, lng], 12, { duration: 0.8 });
      }
    } else {
      var v = REGION_VIEW[state.region] || REGION_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    saveLastFilters();
    render();
  }

  function setRegion(r) {
    state.region = r;
    // 다른 지역의 시군구가 선택돼 있으면 해제
    if (state.district && r && state.district.split('|')[0] !== r) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#regionFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-region') === r);
    });
    if (!state.district) {
      var v = REGION_VIEW[r] || REGION_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    filterToggleBtn.textContent = willOpen ? '▲' : '▼';
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', function (e) {
    var t = e.target;

    var favBtn = t.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      var id = Number(favBtn.getAttribute('data-fav'));
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      saveFavorites();
      render();
      if (!document.getElementById('modalOverlay').hidden) window.openFacilityModal(id);
      return;
    }

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openFacilityModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var regionPill = t.closest('[data-region]');
    if (regionPill) {
      setRegion(regionPill.getAttribute('data-region'));
      return;
    }

    var kindPill = t.closest('[data-kind]');
    if (kindPill) {
      state.kind = kindPill.getAttribute('data-kind');
      document.querySelectorAll('#kindFilters .pill').forEach(function (p) {
        p.classList.toggle('active', p === kindPill);
      });
      render();
      return;
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      togglePill.classList.toggle('active', state[key]);
      saveLastFilters();
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) {
      window.openFacilityModal(Number(card.getAttribute('data-id')));
      return;
    }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.region = ''; state.kind = '';
    state.satOpen = false; state.holOpen = false; state.favOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-bar .pill').forEach(function (p) {
      p.classList.toggle('active',
        p.getAttribute('data-region') === '' ||
        p.getAttribute('data-kind') === '');
    });
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('totalCount').textContent = LIBRARIES.length;
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';
  buildFilterPills();
  buildDistrictSelect();
  buildLegend();
  // 모바일 기본은 목록 뷰
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  // 리포트 등에서 ?district=지역|시군구 또는 ?region=지역 으로 진입한 경우 필터 적용
  var params = new URLSearchParams(location.search);
  var paramDistrict = params.get('district');
  var paramRegion = params.get('region');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramRegion && REGION_VIEW[paramRegion]) {
    setRegion(paramRegion);
  } else {
    var savedFilters = loadLastFilters();
    if (savedFilters) {
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        var key = btn.getAttribute('data-toggle');
        if (savedFilters[key]) {
          state[key] = true;
          btn.classList.add('active');
        }
      });
      if (savedFilters.district && savedFilters.district.indexOf('|') !== -1) {
        setDistrict(savedFilters.district);
      } else {
        render();
      }
    } else {
      render();
    }
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();

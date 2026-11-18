// Interactive Tournament Bracket Manager
// Anti-AI-Slop, High-Performance Mobile-First Esports Web Application

(function () {
  'use strict';

  // State
  let bracketData = null;
  let adminToken = localStorage.getItem('mlbb_admin_token') || null;
  let activeEditingMatch = null;
  let eventSource = null;
  let activeMobileRound = 1;

  // Viewport Pan & Zoom State (Tree Canvas)
  let zoom = 1.0;
  let panX = 30;
  let panY = 20;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  // Touch Gesture State (Pinch & Pan)
  let initialPinchDist = null;
  let initialPinchZoom = 1.0;
  let touchStartX = 0;
  let touchStartY = 0;

  // Drag and Drop State (Desktop Tree)
  let draggedTeamData = null;

  // DOM Elements
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('bracket-canvas');
  const svgLines = document.getElementById('bracket-lines');
  const zoomLevelDisplay = document.getElementById('zoom-level');
  const toast = document.getElementById('toast');

  // Menu Drawer Elements
  const btnOpenMenu = document.getElementById('btn-open-menu');
  const modalNavMenu = document.getElementById('modal-nav-menu');
  const menuBtnLabel = document.getElementById('menu-btn-label');
  const menuOptTree = document.getElementById('menu-opt-tree');
  const menuOptFeed = document.getElementById('menu-opt-feed');
  const menuBtnAuth = document.getElementById('menu-btn-auth');
  const menuAuthTitle = document.getElementById('menu-auth-title');
  const menuAuthDesc = document.getElementById('menu-auth-desc');
  const menuAuthIcon = document.getElementById('menu-auth-icon');
  const menuBtnExport = document.getElementById('menu-btn-export');
  const menuBtnReset = document.getElementById('menu-btn-reset');

  // Mobile Feed Elements
  const mobileRoundBar = document.getElementById('mobile-round-bar');
  const mobileCardsList = document.getElementById('mobile-cards-list');
  const mobileCurrentRoundTitle = document.getElementById('mobile-current-round-title');
  const mobileCurrentRoundDesc = document.getElementById('mobile-current-round-desc');

  // Tree Columns
  const colR1 = document.getElementById('col-r1');
  const colR2 = document.getElementById('col-r2');
  const colSF = document.getElementById('col-sf');
  const colGF = document.getElementById('col-gf');

  // Modals
  const modalLogin = document.getElementById('modal-login');
  const modalMatch = document.getElementById('modal-match');
  const formLogin = document.getElementById('form-login');
  const inputPin = document.getElementById('input-pin');
  const loginError = document.getElementById('login-error');

  // Match Modal Fields
  const modalMatchRound = document.getElementById('modal-match-round');
  const modalMatchTitle = document.getElementById('modal-match-title');
  const modalBestOf = document.getElementById('modal-best-of');
  const modalSeed1 = document.getElementById('modal-seed1');
  const modalName1 = document.getElementById('modal-name1');
  const valScore1 = document.getElementById('val-score1');
  const btnPickWin1 = document.getElementById('btn-pick-win1');
  const cardTeam1 = document.getElementById('card-team1');

  const modalSeed2 = document.getElementById('modal-seed2');
  const modalName2 = document.getElementById('modal-name2');
  const valScore2 = document.getElementById('val-score2');
  const btnPickWin2 = document.getElementById('btn-pick-win2');
  const cardTeam2 = document.getElementById('card-team2');

  const mvpPlayerInput = document.getElementById('mvp-player');
  const mvpTeamSelect = document.getElementById('mvp-team');
  const mvpHeroInput = document.getElementById('mvp-hero');
  const mvpKdaInput = document.getElementById('mvp-kda');
  const mvpNoteInput = document.getElementById('mvp-note');
  const mvpActiveLabel = document.getElementById('mvp-active-label');

  const modalScheduleInput = document.getElementById('modal-schedule');
  const modalScheduleDt = document.getElementById('modal-schedule-dt');
  const modalViewerDetail = document.getElementById('modal-viewer-detail');

  // URL parameters check
  const urlParams = new URLSearchParams(window.location.search);
  const isOverlayMode = urlParams.get('mode') === 'overlay';
  if (isOverlayMode) {
    document.body.classList.add('mode-overlay');
  }

  // Set default view to Bagan (Tree) for both mobile and desktop
  if (window.innerWidth <= 768) {
    zoom = 0.58;
    panX = 16;
    panY = 16;
  }
  switchViewMode('tree');

  // Toast Helper
  function showToast(message, duration = 2800) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // View Switcher (Mobile Feed vs Tree Canvas)
  function switchViewMode(mode) {
    if (mode === 'mobile') {
      document.body.classList.remove('view-mode-tree');
      document.body.classList.add('view-mode-mobile');
      if (menuOptFeed) menuOptFeed.classList.add('active');
      if (menuOptTree) menuOptTree.classList.remove('active');
    } else {
      document.body.classList.remove('view-mode-mobile');
      document.body.classList.add('view-mode-tree');
      if (menuOptFeed) menuOptFeed.classList.remove('active');
      if (menuOptTree) menuOptTree.classList.add('active');
      setTimeout(renderConnectors, 50);
    }
  }

  // Menu Trigger & Navigation Events
  if (btnOpenMenu) {
    btnOpenMenu.addEventListener('click', () => {
      modalNavMenu.classList.add('is-open');
    });
  }

  if (menuOptTree) {
    menuOptTree.addEventListener('click', () => {
      switchViewMode('tree');
      modalNavMenu.classList.remove('is-open');
    });
  }

  if (menuOptFeed) {
    menuOptFeed.addEventListener('click', () => {
      switchViewMode('mobile');
      modalNavMenu.classList.remove('is-open');
    });
  }

  // Direct Round Selectors in Menu
  document.querySelectorAll('.menu-round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.menu-round-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMobileRound = parseInt(btn.dataset.round, 10);
      document.querySelectorAll('.round-nav-pill').forEach(pill => {
        pill.classList.toggle('active', parseInt(pill.dataset.round, 10) === activeMobileRound);
      });
      renderMobileFeed();
      switchViewMode('mobile');
      modalNavMenu.classList.remove('is-open');
    });
  });

  // Mobile Round Nav Pills (under top bar in feed mode)
  document.querySelectorAll('.round-nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.round-nav-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeMobileRound = parseInt(pill.dataset.round, 10);
      document.querySelectorAll('.menu-round-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.round, 10) === activeMobileRound);
      });
      renderMobileFeed();
    });
  });

  // Auth Button inside Unified Menu
  if (menuBtnAuth) {
    menuBtnAuth.addEventListener('click', () => {
      modalNavMenu.classList.remove('is-open');
      if (adminToken) {
        adminToken = null;
        localStorage.removeItem('mlbb_admin_token');
        setModeViewer();
        showToast('Logout admin berhasil');
      } else {
        loginError.textContent = '';
        inputPin.value = '';
        modalLogin.classList.add('is-open');
        setTimeout(() => inputPin.focus(), 100);
      }
    });
  }

  // Export PNG in Menu
  if (menuBtnExport) {
    menuBtnExport.addEventListener('click', () => {
      modalNavMenu.classList.remove('is-open');
      showToast('Menyiapkan gambar bagan...');
      window.print();
    });
  }

  // Reset Tournament in Menu
  if (menuBtnReset) {
    menuBtnReset.addEventListener('click', async () => {
      modalNavMenu.classList.remove('is-open');
      if (!confirm('Apakah Anda yakin ingin mereset seluruh skor dan pemenang turnamen ke awal?')) return;
      try {
        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (data.success) {
          bracketData = data.bracket;
          renderAll();
          showToast('Turnamen berhasil di-reset!');
        }
      } catch {
        showToast('Gagal mereset turnamen');
      }
    });
  }

  // --- Auth Verification ---
  async function checkAuth() {
    if (!adminToken) {
      setModeViewer();
      return;
    }
    try {
      const res = await fetch('/api/auth/check', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.authenticated) {
        setModeAdmin();
      } else {
        adminToken = null;
        localStorage.removeItem('mlbb_admin_token');
        setModeViewer();
      }
    } catch {
      setModeViewer();
    }
  }

  function setModeAdmin() {
    document.body.classList.remove('mode-viewer');
    document.body.classList.add('mode-admin');
    if (menuBtnLabel) menuBtnLabel.textContent = 'Admin';
    if (menuAuthTitle) menuAuthTitle.textContent = 'Logout Mode Admin';
    if (menuAuthDesc) menuAuthDesc.textContent = 'Klik untuk keluar dan kembali ke mode penonton';
    if (menuAuthIcon) menuAuthIcon.textContent = '🔓';
  }

  function setModeViewer() {
    document.body.classList.remove('mode-admin');
    document.body.classList.add('mode-viewer');
    if (menuBtnLabel) menuBtnLabel.textContent = 'Menu';
    if (menuAuthTitle) menuAuthTitle.textContent = 'Login Admin Turnamen';
    if (menuAuthDesc) menuAuthDesc.textContent = 'Masukkan PIN untuk mengedit skor, pemenang & MVP';
    if (menuAuthIcon) menuAuthIcon.textContent = '🔐';
  }

  // --- Fetch Bracket Data ---
  async function loadBracket() {
    try {
      const res = await fetch('/api/bracket');
      bracketData = await res.json();
      renderAll();
    } catch (err) {
      console.error('Gagal memuat bracket:', err);
      showToast('Gagal memuat data turnamen');
    }
  }

  // --- Setup SSE (Real-Time Live Updates) ---
  function setupSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.bracket) {
          bracketData = payload.bracket;
          renderAll();
          if (payload.type === 'bracket_update') {
            showToast('⚡ Data skor diperbarui secara live!');
          }
        }
      } catch (err) {
        console.error('Error parsing SSE:', err);
      }
    };

    eventSource.onerror = () => {
      setTimeout(setupSSE, 3000);
    };
  }

  // --- Render All ---
  function renderAll() {
    if (!bracketData) return;

    // Header Title
    const titleEl = document.getElementById('tournament-title');
    const subEl = document.getElementById('tournament-subtitle');
    if (titleEl && bracketData.title) titleEl.textContent = bracketData.title;
    if (subEl && bracketData.subtitle) subEl.textContent = bracketData.subtitle;

    // Render Mobile Feed
    renderMobileFeed();

    // Render Desktop / Tree Canvas
    renderTreeBracket();
  }

  // =========================================================================
  // RENDER VIEW 1: MOBILE FEED
  // =========================================================================
  function renderMobileFeed() {
    if (!bracketData) return;

    const roundTitles = {
      1: { title: 'ROUND 1 (12 Tim • BO3)', desc: 'Pemenang melaju ke Perempat Final (Round 2)' },
      2: { title: 'ROUND 2 (8 Tim • BO3)', desc: 'Perempat Final • Pemenang melaju ke Semi-Final' },
      3: { title: 'SEMI-FINAL (4 Tim • BO3)', desc: 'Pemenang melaju ke babak Grand Final!' },
      4: { title: 'GRAND FINAL 🏆 (BO5)', desc: 'Perebutan Gelar Juara Turnamen' }
    };

    const cur = roundTitles[activeMobileRound] || roundTitles[1];
    mobileCurrentRoundTitle.textContent = cur.title;
    mobileCurrentRoundDesc.textContent = cur.desc;

    mobileCardsList.innerHTML = '';
    const roundMatches = bracketData.matches.filter(m => m.round === activeMobileRound);

    roundMatches.forEach(match => {
      const card = document.createElement('div');
      card.className = `mobile-card ${match.status === 'LIVE' ? 'is-live' : ''} ${match.status === 'COMPLETED' ? 'is-completed' : ''}`;

      // Card Header
      const header = document.createElement('div');
      header.className = 'm-card-header';
      header.innerHTML = `
        <span>BO${match.bestOf || 3} • ${match.id.toUpperCase()}</span>
        <span class="match-status-tag ${match.status}">
          ${match.status === 'LIVE' ? '🔴 LIVE' : match.status === 'COMPLETED' ? 'SELESAI' : 'MENUNGGU'}
        </span>
      `;
      card.appendChild(header);

      // Schedule Banner (if scheduled)
      if (match.schedule && match.schedule.trim()) {
        const schedBanner = document.createElement('div');
        schedBanner.className = 'm-schedule-banner';
        schedBanner.innerHTML = `📅 <span>${escapeHtml(match.schedule)}</span>`;
        card.appendChild(schedBanner);
      }

      // Team 1 Row
      const t1Row = createMobileTeamRow(match, match.team1, match.score1, match.winnerId === match.team1?.id);
      card.appendChild(t1Row);

      // Team 2 Row
      const t2Row = createMobileTeamRow(match, match.team2, match.score2, match.winnerId === match.team2?.id);
      card.appendChild(t2Row);

      // Multi-Game MVP List (if awarded)
      const mvpListEl = renderMvpListElement(match);
      if (mvpListEl) {
        card.appendChild(mvpListEl);
      }

      // Card Footer with Next Path & Admin Edit Button
      const footer = document.createElement('div');
      footer.className = 'm-card-footer';

      let nextInfo = '';
      if (match.nextMatchId) {
        const nextM = bracketData.matches.find(m => m.id === match.nextMatchId);
        nextInfo = `👉 Lolos ke: ${nextM ? nextM.roundName : 'Babak Selanjutnya'}`;
      } else {
        nextInfo = '🏆 Juara Turnamen';
      }

      footer.innerHTML = `
        <span class="m-next-info">${nextInfo}</span>
        <button class="m-admin-quick-btn" title="Kelola Skor & MVP">⚙️ Atur Laga</button>
      `;

      // Click card or admin button to edit or view detail
      card.addEventListener('click', () => {
        if (document.body.classList.contains('mode-admin')) {
          openMatchEditor(match);
        } else {
          openViewerDetail(match);
        }
      });

      card.appendChild(footer);
      mobileCardsList.appendChild(card);
    });
  }

  function getMatchMvps(match) {
    if (Array.isArray(match.gameMvps) && match.gameMvps.length > 0) {
      const valid = match.gameMvps.filter(g => g && g.name && g.name.trim());
      if (valid.length > 0) {
        return valid.sort((a, b) => (a.game || 1) - (b.game || 1));
      }
    }
    if (match.mvp && match.mvp.name && match.mvp.name.trim()) {
      return [{ game: 1, ...match.mvp }];
    }
    return [];
  }

  function renderMvpListElement(match) {
    const mvps = getMatchMvps(match);
    if (mvps.length === 0) return null;

    const wrap = document.createElement('div');
    wrap.className = 'match-mvp-list';
    wrap.innerHTML = mvps.map(g => `
      <div class="match-mvp-item" title="${escapeHtml(g.note || '')}">
        <span class="mvp-game-pill">G${g.game || 1}</span>
        <svg class="mvp-icon-star" width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        <span class="mvp-item-text"><strong>${escapeHtml(g.name)}</strong>${g.hero ? ` (${escapeHtml(g.hero)})` : ''}${g.kda ? ` • ${escapeHtml(g.kda)}` : ''}</span>
      </div>
    `).join('');
    return wrap;
  }

  function createMobileTeamRow(match, team, score, isWinner) {
    const row = document.createElement('div');
    row.className = `m-team-row ${!team ? 'is-empty' : ''} ${isWinner ? 'is-winner' : ''}`;

    const info = document.createElement('div');
    info.className = 'm-team-info';

    const seedPill = document.createElement('span');
    seedPill.className = `team-seed-pill ${!team ? 'empty' : ''}`;
    seedPill.textContent = team ? `#${team.seed}` : '?';
    info.appendChild(seedPill);

    const nameText = document.createElement('span');
    nameText.className = 'team-name-text';
    nameText.textContent = team ? team.name : 'Menunggu Pemenang';
    info.appendChild(nameText);

    row.appendChild(info);

    const scoreNum = document.createElement('span');
    scoreNum.className = 'm-team-score';
    scoreNum.textContent = team ? (score || 0) : '-';
    row.appendChild(scoreNum);

    return row;
  }

  // =========================================================================
  // RENDER VIEW 2: TREE CANVAS BRACKET
  // =========================================================================
  function renderTreeBracket() {
    colR1.innerHTML = '';
    colR2.innerHTML = '';
    colSF.innerHTML = '';
    colGF.innerHTML = '';

    bracketData.matches.forEach(m => {
      const card = createTreeMatchCard(m);
      if (m.round === 1) colR1.appendChild(card);
      else if (m.round === 2) colR2.appendChild(card);
      else if (m.round === 3) colSF.appendChild(card);
      else if (m.round === 4) colGF.appendChild(card);
    });

    updateTransform();
    // Render connector lines after DOM settles
    requestAnimationFrame(renderConnectors);
  }

  function createTreeMatchCard(match) {
    const card = document.createElement('div');
    card.className = `match-card ${match.status === 'LIVE' ? 'is-live' : ''} ${match.status === 'COMPLETED' ? 'is-completed' : ''}`;
    card.id = `match-${match.id}`;
    card.dataset.matchId = match.id;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.drag-handle')) return;
      if (document.body.classList.contains('mode-admin')) {
        openMatchEditor(match);
      } else {
        openViewerDetail(match);
      }
    });

    const meta = document.createElement('div');
    meta.className = 'match-meta';
    meta.innerHTML = `
      <span>BO${match.bestOf || 3} • ${match.id.toUpperCase()}</span>
      <span class="match-status-tag ${match.status}">
        ${match.status === 'LIVE' ? '🔴 LIVE' : match.status === 'COMPLETED' ? 'SELESAI' : 'MENUNGGU'}
      </span>
    `;
    card.appendChild(meta);

    if (match.schedule && match.schedule.trim()) {
      const schedRow = document.createElement('div');
      schedRow.className = 'match-schedule-row';
      schedRow.innerHTML = `📅 <span>${escapeHtml(match.schedule)}</span>`;
      card.appendChild(schedRow);
    }

    const teamsWrap = document.createElement('div');
    teamsWrap.className = 'match-teams';

    const t1Row = createTreeTeamRow(match, 'team1', match.team1, match.score1, match.winnerId === match.team1?.id);
    teamsWrap.appendChild(t1Row);

    const t2Row = createTreeTeamRow(match, 'team2', match.team2, match.score2, match.winnerId === match.team2?.id);
    teamsWrap.appendChild(t2Row);

    card.appendChild(teamsWrap);

    const mvpListEl = renderMvpListElement(match);
    if (mvpListEl) {
      card.appendChild(mvpListEl);
    }

    return card;
  }

  function createTreeTeamRow(match, slotName, team, score, isWinner) {
    const row = document.createElement('div');
    row.className = `team-row ${!team ? 'is-empty' : ''} ${isWinner ? 'is-winner' : ''}`;
    row.dataset.matchId = match.id;
    row.dataset.slot = slotName;

    if (match.round === 1 && team) {
      row.draggable = true;
      setupDragEvents(row, match.id, slotName, team);
    }

    const info = document.createElement('div');
    info.className = 'team-main-info';

    if (match.round === 1) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.title = 'Tarik untuk menukar slot tim';
      handle.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.8"></circle>
          <circle cx="15" cy="6" r="1.8"></circle>
          <circle cx="9" cy="12" r="1.8"></circle>
          <circle cx="15" cy="12" r="1.8"></circle>
          <circle cx="9" cy="18" r="1.8"></circle>
          <circle cx="15" cy="18" r="1.8"></circle>
        </svg>
      `;
      info.appendChild(handle);
    }

    const seedPill = document.createElement('span');
    seedPill.className = `team-seed-pill ${!team ? 'empty' : ''}`;
    seedPill.textContent = team ? `#${team.seed}` : '?';
    info.appendChild(seedPill);

    const nameEl = document.createElement('span');
    nameEl.className = 'team-name-text';
    nameEl.textContent = team ? team.name : 'Menunggu Pemenang';
    nameEl.title = team ? team.name : '';
    info.appendChild(nameEl);

    row.appendChild(info);

    const scoreEl = document.createElement('span');
    scoreEl.className = 'team-score-num';
    scoreEl.textContent = team ? (score || 0) : '-';
    row.appendChild(scoreEl);

    return row;
  }

  // Drag and Drop (Desktop Round 1)
  function setupDragEvents(rowEl, matchId, slot, team) {
    rowEl.addEventListener('dragstart', (e) => {
      if (!document.body.classList.contains('mode-admin')) return;
      draggedTeamData = { matchId, slot, team };
      rowEl.classList.add('dragging');
      document.body.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(draggedTeamData));
    });

    rowEl.addEventListener('dragover', (e) => {
      if (!draggedTeamData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      rowEl.classList.add('drag-over');
    });

    rowEl.addEventListener('dragleave', () => {
      rowEl.classList.remove('drag-over');
    });

    rowEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      rowEl.classList.remove('drag-over');
      if (!draggedTeamData) return;

      const targetMatchId = rowEl.dataset.matchId;
      const targetSlot = rowEl.dataset.slot;

      if (draggedTeamData.matchId === targetMatchId && draggedTeamData.slot === targetSlot) return;

      try {
        const res = await fetch('/api/match/swap-teams', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            sourceMatchId: draggedTeamData.matchId,
            sourceSlot: draggedTeamData.slot,
            targetMatchId: targetMatchId,
            targetSlot: targetSlot
          })
        });
        const data = await res.json();
        if (data.success) {
          bracketData = data.bracket;
          renderAll();
          showToast('Posisi tim berhasil ditukar!');
        } else {
          showToast(data.error || 'Gagal menukar posisi tim');
        }
      } catch {
        showToast('Koneksi terputus saat menukar tim');
      }
    });

    rowEl.addEventListener('dragend', () => {
      rowEl.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      draggedTeamData = null;
    });
  }

  // =========================================================================
  // BULLETPROOF CONNECTOR LINES (IMMUNE TO ZOOM/PAN JITTER)
  // =========================================================================
  function getRelPos(el, canvasEl) {
    let top = 0;
    let left = 0;
    let cur = el;
    while (cur && cur !== canvasEl) {
      top += cur.offsetTop;
      left += cur.offsetLeft;
      cur = cur.offsetParent;
    }
    return {
      left,
      top,
      width: el.offsetWidth,
      height: el.offsetHeight
    };
  }

  function renderConnectors() {
    svgLines.innerHTML = '';
    if (!bracketData || !canvas) return;

    const canvasW = canvas.offsetWidth || 1200;
    const canvasH = canvas.offsetHeight || 720;
    svgLines.setAttribute('width', canvasW);
    svgLines.setAttribute('height', canvasH);
    svgLines.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);

    bracketData.matches.forEach(sourceMatch => {
      if (!sourceMatch.nextMatchId) return;

      const srcEl = document.getElementById(`match-${sourceMatch.id}`);
      const tgtEl = document.getElementById(`match-${sourceMatch.nextMatchId}`);
      if (!srcEl || !tgtEl) return;

      const srcPos = getRelPos(srcEl, canvas);
      const tgtPos = getRelPos(tgtEl, canvas);

      // Start line at right-center edge of source match
      const x1 = srcPos.left + srcPos.width;
      const y1 = srcPos.top + srcPos.height / 2;

      // End line at the exact team slot row inside the target match
      const tgtRow = tgtEl.querySelector(`.team-row[data-slot="${sourceMatch.nextMatchSlot}"]`);
      let y2;
      if (tgtRow) {
        const rowPos = getRelPos(tgtRow, canvas);
        y2 = rowPos.top + rowPos.height / 2;
      } else {
        const isTop = sourceMatch.nextMatchSlot === 'team1';
        y2 = tgtPos.top + (isTop ? tgtPos.height * 0.35 : tgtPos.height * 0.65);
      }
      const x2 = tgtPos.left;

      const dx = Math.max((x2 - x1) * 0.5, 30);
      const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      const isCompleted = sourceMatch.winnerId !== null;
      path.setAttribute('class', `bracket-path ${isCompleted ? 'active' : ''}`);

      svgLines.appendChild(path);
    });
  }

  // =========================================================================
  // MATCH CONTROL MODAL (ADMIN) & VIEWER DETAIL MODAL
  // =========================================================================
  let tempScore1 = 0;
  let tempScore2 = 0;
  let tempWinnerId = null;
  let tempStatus = 'UPCOMING';
  let activeMvpGameTab = 1;
  let tempGameMvps = {};

  function emptyMvpObj(gameNum) {
    return { game: gameNum, name: '', team: '', hero: '', kda: '', note: '' };
  }

  function populateMvpTeamSelect(match) {
    if (!mvpTeamSelect) return;
    mvpTeamSelect.innerHTML = '<option value="">-- Pilih Tim --</option>';
    if (match.team1 && match.team1.name) {
      const opt1 = document.createElement('option');
      opt1.value = match.team1.name;
      opt1.textContent = `#${match.team1.seed} ${match.team1.name}`;
      mvpTeamSelect.appendChild(opt1);
    }
    if (match.team2 && match.team2.name) {
      const opt2 = document.createElement('option');
      opt2.value = match.team2.name;
      opt2.textContent = `#${match.team2.seed} ${match.team2.name}`;
      mvpTeamSelect.appendChild(opt2);
    }
  }

  function saveCurrentMvpTabInputs() {
    if (!tempGameMvps[activeMvpGameTab]) {
      tempGameMvps[activeMvpGameTab] = emptyMvpObj(activeMvpGameTab);
    }
    tempGameMvps[activeMvpGameTab].name = mvpPlayerInput.value.trim();
    tempGameMvps[activeMvpGameTab].team = mvpTeamSelect ? mvpTeamSelect.value : '';
    tempGameMvps[activeMvpGameTab].hero = mvpHeroInput.value.trim();
    tempGameMvps[activeMvpGameTab].kda = mvpKdaInput.value.trim();
    tempGameMvps[activeMvpGameTab].note = mvpNoteInput.value.trim();
    updateMvpTabDots();
  }

  function loadMvpTabInputs(gameNum) {
    activeMvpGameTab = gameNum;
    const gData = tempGameMvps[gameNum] || emptyMvpObj(gameNum);
    mvpPlayerInput.value = gData.name || '';
    if (mvpTeamSelect) mvpTeamSelect.value = gData.team || '';
    mvpHeroInput.value = gData.hero || '';
    mvpKdaInput.value = gData.kda || '';
    mvpNoteInput.value = gData.note || '';

    if (mvpActiveLabel) {
      mvpActiveLabel.innerHTML = `⭐ Mengisi Data MVP untuk <strong>GAME ${gameNum}</strong>`;
    }

    document.querySelectorAll('.mvp-tab-btn').forEach(btn => {
      const g = parseInt(btn.dataset.game, 10);
      btn.classList.toggle('active', g === gameNum);
    });
    updateMvpTabDots();
  }

  function updateMvpTabDots() {
    const bo = parseInt(modalBestOf.value, 10) || 3;
    document.querySelectorAll('.mvp-tab-btn').forEach(btn => {
      const g = parseInt(btn.dataset.game, 10);
      btn.style.display = g <= bo ? '' : 'none';
      const dot = document.getElementById(`mvp-tab-dot-${g}`);
      if (dot) {
        const hasName = tempGameMvps[g] && tempGameMvps[g].name && tempGameMvps[g].name.trim().length > 0;
        dot.classList.toggle('filled', !!hasName);
      }
    });
  }

  function openMatchEditor(match) {
    activeEditingMatch = match;
    tempScore1 = match.score1 || 0;
    tempScore2 = match.score2 || 0;
    tempWinnerId = match.winnerId || null;
    tempStatus = match.status || 'UPCOMING';

    modalMatchRound.textContent = match.roundName || `ROUND ${match.round}`;
    modalMatchTitle.textContent = `${match.team1 ? match.team1.name : 'TBD'} vs ${match.team2 ? match.team2.name : 'TBD'}`;
    modalBestOf.value = match.bestOf || 3;

    if (modalScheduleInput) modalScheduleInput.value = match.schedule || '';
    if (modalScheduleDt) modalScheduleDt.value = '';

    modalSeed1.textContent = match.team1 ? `#${match.team1.seed}` : '?';
    modalName1.textContent = match.team1 ? match.team1.name : 'Menunggu Pemenang';
    valScore1.textContent = tempScore1;

    modalSeed2.textContent = match.team2 ? `#${match.team2.seed}` : '?';
    modalName2.textContent = match.team2 ? match.team2.name : 'Menunggu Pemenang';
    valScore2.textContent = tempScore2;

    populateMvpTeamSelect(match);

    // Initialize Multi-Game MVPs (Game 1..5)
    tempGameMvps = {
      1: emptyMvpObj(1),
      2: emptyMvpObj(2),
      3: emptyMvpObj(3),
      4: emptyMvpObj(4),
      5: emptyMvpObj(5)
    };

    const existingMvps = getMatchMvps(match);
    existingMvps.forEach(item => {
      const g = item.game || 1;
      if (g >= 1 && g <= 5) {
        tempGameMvps[g] = {
          game: g,
          name: item.name || '',
          team: item.team || '',
          hero: item.hero || '',
          kda: item.kda || '',
          note: item.note || ''
        };
      }
    });

    loadMvpTabInputs(1);
    updateModalUI();
    modalMatch.classList.add('is-open');
  }

  function openViewerDetail(match) {
    if (!modalViewerDetail) return;
    const roundEl = document.getElementById('v-detail-round');
    const titleEl = document.getElementById('v-detail-title');
    const bodyEl = document.getElementById('v-detail-body');

    roundEl.textContent = `${match.roundName || `ROUND ${match.round}`} • BO${match.bestOf || 3}`;
    titleEl.textContent = `Detail Pertandingan (${match.id.toUpperCase()})`;

    const t1Name = match.team1 ? escapeHtml(match.team1.name) : 'Menunggu Pemenang';
    const t2Name = match.team2 ? escapeHtml(match.team2.name) : 'Menunggu Pemenang';
    const t1Seed = match.team1 ? `#${match.team1.seed}` : '?';
    const t2Seed = match.team2 ? `#${match.team2.seed}` : '?';
    const t1Win = match.team1 && match.winnerId === match.team1.id;
    const t2Win = match.team2 && match.winnerId === match.team2.id;

    const mvps = getMatchMvps(match);

    bodyEl.innerHTML = `
      ${match.schedule && match.schedule.trim() ? `
        <div class="v-detail-sched-box">
          <span>📅</span>
          <div>
            <div style="font-size:10px; opacity:0.8; text-transform:uppercase;">Jadwal Pelaksanaan</div>
            <div>${escapeHtml(match.schedule)}</div>
          </div>
        </div>
      ` : ''}

      <div class="v-detail-score-box">
        <div class="v-detail-team ${t1Win ? 'winner' : ''}">
          <div class="v-t-seed">${t1Seed}</div>
          <div class="v-t-name">${t1Name} ${t1Win ? '🏆' : ''}</div>
        </div>
        <div class="v-detail-vs">${match.score1 || 0} - ${match.score2 || 0}</div>
        <div class="v-detail-team ${t2Win ? 'winner' : ''}">
          <div class="v-t-seed">${t2Seed}</div>
          <div class="v-t-name">${t2Name} ${t2Win ? '🏆' : ''}</div>
        </div>
      </div>

      ${mvps.length > 0 ? `
        <div style="margin-bottom:8px; font-size:11px; font-weight:800; color:#fbbf24; text-transform:uppercase; letter-spacing:0.5px;">
          ⭐ Daftar MVP Per Game (${mvps.length} Game)
        </div>
        <div class="v-mvp-cards-wrap">
          ${mvps.map(g => `
            <div class="v-mvp-card">
              <div class="v-mvp-card-head">
                <span>🏆 GAME ${g.game || 1} MVP</span>
                <span>${g.team ? escapeHtml(g.team) : ''}</span>
              </div>
              <div class="v-mvp-card-main">
                ${escapeHtml(g.name)}
                ${g.hero ? `<span style="color:#38bdf8; font-weight:600;"> • ${escapeHtml(g.hero)}</span>` : ''}
                ${g.kda ? `<span style="color:#94a3b8; font-family:var(--font-mono); font-size:11.5px;"> (${escapeHtml(g.kda)})</span>` : ''}
              </div>
              ${g.note ? `<div class="v-mvp-card-note">"${escapeHtml(g.note)}"</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="text-align:center; padding:14px; color:var(--text-dim); font-size:12px; border:1px dashed var(--border-subtle); border-radius:8px;">
          Belum ada catatan MVP untuk pertandingan ini.
        </div>
      `}
    `;

    modalViewerDetail.classList.add('is-open');
  }

  function updateModalUI() {
    valScore1.textContent = tempScore1;
    valScore2.textContent = tempScore2;

    cardTeam1.classList.toggle('winner', activeEditingMatch.team1 && tempWinnerId === activeEditingMatch.team1.id);
    cardTeam2.classList.toggle('winner', activeEditingMatch.team2 && tempWinnerId === activeEditingMatch.team2.id);

    btnPickWin1.querySelector('span').textContent = (activeEditingMatch.team1 && tempWinnerId === activeEditingMatch.team1.id)
      ? '🏆 Pemenang' : 'Pemenang';
    btnPickWin2.querySelector('span').textContent = (activeEditingMatch.team2 && tempWinnerId === activeEditingMatch.team2.id)
      ? '🏆 Pemenang' : 'Pemenang';

    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === tempStatus);
    });
    updateMvpTabDots();
  }

  // Schedule Date-Time Picker & Quick Chips
  if (modalScheduleDt) {
    modalScheduleDt.addEventListener('change', () => {
      if (!modalScheduleDt.value) return;
      const dt = new Date(modalScheduleDt.value);
      if (isNaN(dt.getTime())) return;
      const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dt.getDay()];
      const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][dt.getMonth()];
      const tgl = dt.getDate();
      const thn = dt.getFullYear();
      const jam = String(dt.getHours()).padStart(2, '0');
      const mnt = String(dt.getMinutes()).padStart(2, '0');
      modalScheduleInput.value = `${hari}, ${tgl} ${bulan} ${thn} • ${jam}:${mnt} WITA`;
    });
  }

  document.querySelectorAll('.sched-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const timeStr = chip.dataset.time;
      const curVal = modalScheduleInput.value.trim();
      if (curVal.includes('•')) {
        const datePart = curVal.split('•')[0].trim();
        modalScheduleInput.value = `${datePart} • ${timeStr}`;
      } else if (curVal) {
        modalScheduleInput.value = `${curVal} • ${timeStr}`;
      } else {
        modalScheduleInput.value = timeStr;
      }
    });
  });

  const btnClearSchedule = document.getElementById('btn-clear-schedule');
  if (btnClearSchedule) {
    btnClearSchedule.addEventListener('click', () => {
      if (modalScheduleInput) modalScheduleInput.value = '';
      if (modalScheduleDt) modalScheduleDt.value = '';
    });
  }

  // Multi-Game MVP Tab Switching & Live Input Sync
  document.querySelectorAll('.mvp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveCurrentMvpTabInputs();
      const nextGame = parseInt(btn.dataset.game, 10) || 1;
      loadMvpTabInputs(nextGame);
    });
  });

  [mvpPlayerInput, mvpHeroInput, mvpKdaInput, mvpNoteInput].forEach(inp => {
    if (inp) inp.addEventListener('input', saveCurrentMvpTabInputs);
  });
  if (mvpTeamSelect) {
    mvpTeamSelect.addEventListener('change', saveCurrentMvpTabInputs);
  }

  modalBestOf.addEventListener('change', () => {
    saveCurrentMvpTabInputs();
    const bo = parseInt(modalBestOf.value, 10) || 3;
    if (activeMvpGameTab > bo) {
      loadMvpTabInputs(1);
    } else {
      updateMvpTabDots();
    }
  });

  document.getElementById('btn-t1-dec').addEventListener('click', () => {
    if (tempScore1 > 0) { tempScore1--; updateModalUI(); }
  });
  document.getElementById('btn-t1-inc').addEventListener('click', () => {
    tempScore1++;
    updateModalUI();
  });
  document.getElementById('btn-t2-dec').addEventListener('click', () => {
    if (tempScore2 > 0) { tempScore2--; updateModalUI(); }
  });
  document.getElementById('btn-t2-inc').addEventListener('click', () => {
    tempScore2++;
    updateModalUI();
  });

  btnPickWin1.addEventListener('click', () => {
    if (!activeEditingMatch.team1) return;
    tempWinnerId = (tempWinnerId === activeEditingMatch.team1.id) ? null : activeEditingMatch.team1.id;
    if (tempWinnerId) tempStatus = 'COMPLETED';
    updateModalUI();
  });

  btnPickWin2.addEventListener('click', () => {
    if (!activeEditingMatch.team2) return;
    tempWinnerId = (tempWinnerId === activeEditingMatch.team2.id) ? null : activeEditingMatch.team2.id;
    if (tempWinnerId) tempStatus = 'COMPLETED';
    updateModalUI();
  });

  document.getElementById('btn-clear-winner').addEventListener('click', () => {
    tempWinnerId = null;
    tempStatus = 'UPCOMING';
    tempScore1 = 0;
    tempScore2 = 0;
    updateModalUI();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s1 = parseInt(btn.dataset.s1, 10);
      const s2 = parseInt(btn.dataset.s2, 10);
      tempScore1 = s1;
      tempScore2 = s2;
      tempStatus = 'COMPLETED';
      if (s1 > s2 && activeEditingMatch.team1) {
        tempWinnerId = activeEditingMatch.team1.id;
      } else if (s2 > s1 && activeEditingMatch.team2) {
        tempWinnerId = activeEditingMatch.team2.id;
      }
      updateModalUI();
    });
  });

  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tempStatus = btn.dataset.status;
      updateModalUI();
    });
  });

  document.querySelectorAll('.hero-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      mvpHeroInput.value = chip.textContent;
      saveCurrentMvpTabInputs();
    });
  });

  document.getElementById('btn-clear-mvp').addEventListener('click', () => {
    mvpPlayerInput.value = '';
    if (mvpTeamSelect) mvpTeamSelect.value = '';
    mvpHeroInput.value = '';
    mvpKdaInput.value = '';
    mvpNoteInput.value = '';
    saveCurrentMvpTabInputs();
  });

  document.getElementById('btn-save-match').addEventListener('click', async () => {
    if (!activeEditingMatch) return;

    saveCurrentMvpTabInputs();
    const bo = parseInt(modalBestOf.value, 10) || 3;
    const gameMvpsList = [];
    for (let g = 1; g <= bo; g++) {
      const entry = tempGameMvps[g];
      if (entry && entry.name && entry.name.trim()) {
        gameMvpsList.push({
          game: g,
          name: entry.name.trim(),
          team: entry.team || '',
          hero: entry.hero || '',
          kda: entry.kda || '',
          note: entry.note || ''
        });
      }
    }

    const primaryMvp = gameMvpsList.length > 0 ? gameMvpsList[0] : null;
    const scheduleVal = modalScheduleInput ? modalScheduleInput.value.trim() : '';

    try {
      const res = await fetch('/api/match/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          matchId: activeEditingMatch.id,
          score1: tempScore1,
          score2: tempScore2,
          bestOf: bo,
          status: tempStatus,
          winnerId: tempWinnerId,
          schedule: scheduleVal,
          gameMvps: gameMvpsList,
          mvp: primaryMvp
        })
      });

      const data = await res.json();
      if (data.success) {
        bracketData = data.bracket;
        renderAll();
        modalMatch.classList.remove('is-open');
        showToast('Perubahan laga, jadwal & MVP berhasil disimpan!');
      } else {
        showToast(data.error || 'Gagal menyimpan perubahan');
      }
    } catch {
      showToast('Koneksi terputus saat menyimpan perubahan');
    }
  });

  // Login Form Submission

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const pin = inputPin.value.trim();

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (data.success) {
        adminToken = data.token;
        localStorage.setItem('mlbb_admin_token', adminToken);
        setModeAdmin();
        modalLogin.classList.remove('is-open');
        showToast('Login Admin Berhasil! Mode edit aktif.');
      } else {
        loginError.textContent = data.error || 'PIN salah!';
      }
    } catch {
      loginError.textContent = 'Gagal menghubungi server';
    }
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.close;
      document.getElementById(targetId).classList.remove('is-open');
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('is-open');
    }
  });

  // =========================================================================
  // PAN & ZOOM (MOUSE + TOUCH PINCH GESTURES)
  // =========================================================================
  function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
  }

  // Mouse Pan
  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.match-card') || e.target.closest('button')) return;
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
  });

  // Mouse Wheel Zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.4), 2.2);

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    updateTransform();
  }, { passive: false });

  // Touch Pinch-to-Zoom & Touch Pan for Mobile
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      if (e.target.closest('.match-card') || e.target.closest('button')) return;
      isPanning = true;
      touchStartX = e.touches[0].clientX - panX;
      touchStartY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      initialPinchZoom = zoom;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isPanning) {
      panX = e.touches[0].clientX - touchStartX;
      panY = e.touches[0].clientY - touchStartY;
      updateTransform();
    } else if (e.touches.length === 2 && initialPinchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / initialPinchDist;
      zoom = Math.min(Math.max(initialPinchZoom * factor, 0.4), 2.2);
      updateTransform();
    }
  }, { passive: true });

  viewport.addEventListener('touchend', () => {
    isPanning = false;
    initialPinchDist = null;
  });

  // Zoom Buttons
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    zoom = Math.min(zoom * 1.18, 2.2);
    updateTransform();
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    zoom = Math.max(zoom * 0.82, 0.4);
    updateTransform();
  });

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    zoom = 1.0;
    panX = 30;
    panY = 20;
    updateTransform();
  });

  window.addEventListener('resize', () => {
    renderConnectors();
  });

  // Reset Tournament
  const btnReset = document.getElementById('btn-reset-bracket');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (!confirm('Apakah Anda yakin ingin mereset seluruh skor dan pemenang turnamen ke awal?')) return;
      try {
        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (data.success) {
          bracketData = data.bracket;
          renderAll();
          showToast('Turnamen berhasil di-reset!');
        }
      } catch {
        showToast('Gagal mereset turnamen');
      }
    });
  }

  // Export as PNG / Print
  const btnExport = document.getElementById('btn-export-png');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      showToast('Menyiapkan gambar bagan turnamen...');
      window.print();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[m];
    });
  }

  // Init
  checkAuth();
  loadBracket();
  setupSSE();

})();

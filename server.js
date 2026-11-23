const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bracket.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Active Server-Sent Events (SSE) connections
const sseClients = new Set();

// Active admin sessions (supports both deterministic HMAC token and session tokens)
const adminSessions = new Set();

function getDeterministicToken(pin) {
  return crypto.createHmac('sha256', 'hkn-mlbb-series1-secret-key')
    .update(String(pin || '1412'))
    .digest('hex');
}

function ensureThirdPlaceMatch(state) {
  if (!state || !Array.isArray(state.matches)) return state;
  let changed = false;

  const sf1 = state.matches.find(m => m.id === 'sf_m1');
  if (sf1 && (!sf1.loserNextMatchId || !sf1.loserNextMatchSlot)) {
    sf1.loserNextMatchId = 'tp_m1';
    sf1.loserNextMatchSlot = 'team1';
    changed = true;
  }

  const sf2 = state.matches.find(m => m.id === 'sf_m2');
  if (sf2 && (!sf2.loserNextMatchId || !sf2.loserNextMatchSlot)) {
    sf2.loserNextMatchId = 'tp_m1';
    sf2.loserNextMatchSlot = 'team2';
    changed = true;
  }

  let tp = state.matches.find(m => m.id === 'tp_m1');
  if (!tp) {
    tp = {
      id: 'tp_m1',
      round: 4,
      roundName: 'PEREBUTAN JUARA 3 & 4',
      isThirdPlace: true,
      team1: null,
      team2: null,
      score1: 0,
      score2: 0,
      bestOf: 3,
      status: 'UPCOMING',
      winnerId: null,
      nextMatchId: null,
      nextMatchSlot: null,
      mvp: null,
      gameMvps: []
    };
    state.matches.push(tp);
    changed = true;
  }

  // If sf_m1 or sf_m2 already has a winner, ensure loser is placed in tp_m1
  [
    { sf: sf1, slot: 'team1' },
    { sf: sf2, slot: 'team2' }
  ].forEach(({ sf, slot }) => {
    if (sf && sf.winnerId && sf.team1 && sf.team2 && !tp[slot]) {
      const loser = sf.team1.id === sf.winnerId ? sf.team2 : sf.team1;
      tp[slot] = { ...loser };
      changed = true;
    }
  });

  if (changed) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch { /* ignore read-only fallback */ }
  }
  return state;
}

function loadBracketData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = ensureThirdPlaceMatch(JSON.parse(raw));
    bracketState = parsed;
    return parsed;
  } catch (err) {
    console.error('Error loading bracket data, falling back to memory state:', err);
    return bracketState;
  }
}

function saveBracketData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  bracketState = data;
  broadcastUpdate(data);
}

function broadcastUpdate(data) {
  const payload = `data: ${JSON.stringify({ type: 'bracket_update', bracket: data })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

let bracketState = null;
loadBracketData();

// Helper to cascade winner (and Semi-Final loser into 3rd-place match)
function advanceWinner(state, matchId, winnerId) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;

  const prevWinnerId = match.winnerId;
  match.winnerId = winnerId;

  const winnerTeam = winnerId
    ? (match.team1 && match.team1.id === winnerId ? match.team1 : (match.team2 && match.team2.id === winnerId ? match.team2 : null))
    : null;

  const loserTeam = (winnerId && match.team1 && match.team2)
    ? (match.team1.id === winnerId ? match.team2 : (match.team2.id === winnerId ? match.team1 : null))
    : null;

  // 1. Advance Winner to nextMatchId
  if (match.nextMatchId) {
    const nextMatch = state.matches.find(m => m.id === match.nextMatchId);
    if (nextMatch) {
      const slot = match.nextMatchSlot; // 'team1' or 'team2'
      if (winnerTeam) {
        if (prevWinnerId && prevWinnerId !== winnerId && nextMatch.winnerId === prevWinnerId) {
          advanceWinner(state, nextMatch.id, null);
        }
        nextMatch[slot] = { ...winnerTeam };
      } else {
        if (nextMatch[slot] && (!prevWinnerId || nextMatch[slot].id === prevWinnerId)) {
          const clearedId = nextMatch[slot].id;
          nextMatch[slot] = null;
          if (nextMatch.winnerId && nextMatch.winnerId === clearedId) {
            advanceWinner(state, nextMatch.id, null);
          }
        }
      }
    }
  }

  // 2. Advance Loser to loserNextMatchId (e.g. Semi-Final Losers -> Perebutan Juara 3 & 4)
  if (match.loserNextMatchId) {
    const loserNextMatch = state.matches.find(m => m.id === match.loserNextMatchId);
    if (loserNextMatch) {
      const lSlot = match.loserNextMatchSlot; // 'team1' or 'team2'
      if (loserTeam) {
        const prevInSlot = loserNextMatch[lSlot];
        if (prevInSlot && prevInSlot.id !== loserTeam.id && loserNextMatch.winnerId === prevInSlot.id) {
          advanceWinner(state, loserNextMatch.id, null);
        }
        loserNextMatch[lSlot] = { ...loserTeam };
      } else {
        if (loserNextMatch[lSlot]) {
          const clearedLoserId = loserNextMatch[lSlot].id;
          loserNextMatch[lSlot] = null;
          if (loserNextMatch.winnerId && loserNextMatch.winnerId === clearedLoserId) {
            advanceWinner(state, loserNextMatch.id, null);
          }
        }
      }
    }
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function isAuthenticated(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const current = loadBracketData();
  const expected = getDeterministicToken(current ? current.adminPin : '1412');
  return token === expected || adminSessions.has(token);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // CORS headers for flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: SSE Live Event Stream ---
  if (pathname === '/api/events') {
    const freshState = loadBracketData();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, no-transform, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', bracket: freshState })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --- API: Get Current Bracket ---
  if (pathname === '/api/bracket' && req.method === 'GET') {
    const freshState = loadBracketData();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(freshState));
    return;
  }

  // --- API: Admin Login ---
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const freshState = loadBracketData();
      const { pin } = await parseJsonBody(req);
      if (String(pin).trim() === String(freshState.adminPin).trim()) {
        const token = getDeterministicToken(freshState.adminPin);
        adminSessions.add(token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, token }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PIN Admin salah!' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Format data tidak valid' }));
    }
    return;
  }

  // --- API: Check Auth Status ---
  if (pathname === '/api/auth/check' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({ authenticated: isAuthenticated(req) }));
    return;
  }

  // --- API: Update Match (Admin Only) ---
  if (pathname === '/api/match/update' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Akses ditolak. Silakan login admin kembali.' }));
      return;
    }

    try {
      const currentState = loadBracketData();
      const payload = await parseJsonBody(req);
      const { matchId, score1, score2, status, winnerId, mvp, bestOf, schedule, gameMvps } = payload;
      const match = currentState.matches.find(m => m.id === matchId);
      if (!match) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Match tidak ditemukan' }));
        return;
      }

      if (typeof score1 === 'number') match.score1 = score1;
      if (typeof score2 === 'number') match.score2 = score2;
      if (typeof bestOf === 'number') match.bestOf = bestOf;
      if (status) match.status = status;
      if (schedule !== undefined) match.schedule = schedule;
      if (gameMvps !== undefined) match.gameMvps = gameMvps;
      if (mvp !== undefined) match.mvp = mvp;

      // Auto-resolve winner if not explicitly chosen but score reached winning threshold or status is COMPLETED
      let resolvedWinnerId = winnerId;
      const targetWins = Math.ceil((match.bestOf || 3) / 2);
      if (!resolvedWinnerId) {
        if (match.score1 > match.score2 && (match.score1 >= targetWins || match.status === 'COMPLETED') && match.team1) {
          resolvedWinnerId = match.team1.id;
        } else if (match.score2 > match.score1 && (match.score2 >= targetWins || match.status === 'COMPLETED') && match.team2) {
          resolvedWinnerId = match.team2.id;
        }
      }

      if (resolvedWinnerId !== undefined) {
        advanceWinner(currentState, matchId, resolvedWinnerId);
        if (resolvedWinnerId) {
          match.status = 'COMPLETED';
        }
      }

      saveBracketData(currentState);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({ success: true, bracket: currentState }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- API: Swap Teams Drag & Drop (Admin Only) ---
  if (pathname === '/api/match/swap-teams' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Akses ditolak' }));
      return;
    }

    try {
      const currentState = loadBracketData();
      const { sourceMatchId, sourceSlot, targetMatchId, targetSlot } = await parseJsonBody(req);
      const srcMatch = currentState.matches.find(m => m.id === sourceMatchId);
      const tgtMatch = currentState.matches.find(m => m.id === targetMatchId);

      if (!srcMatch || !tgtMatch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Match tidak ditemukan' }));
        return;
      }

      // Perform swap
      const temp = srcMatch[sourceSlot];
      srcMatch[sourceSlot] = tgtMatch[targetSlot];
      tgtMatch[targetSlot] = temp;

      // Reset winners if affected
      if (srcMatch.winnerId) advanceWinner(currentState, srcMatch.id, null);
      if (tgtMatch.winnerId) advanceWinner(currentState, tgtMatch.id, null);

      saveBracketData(currentState);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({ success: true, bracket: currentState }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- API: Reset Tournament (Admin Only) ---
  if (pathname === '/api/reset' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Akses ditolak' }));
      return;
    }

    try {
      // Re-read pristine initial template or reset scores & winners
      const raw = fs.readFileSync(path.join(__dirname, 'data', 'bracket.json'), 'utf8');
      const pristine = JSON.parse(raw);
      
      // Clear all scores, status, winners, mvps, and downstream qualifiers
      for (const m of pristine.matches) {
        m.score1 = 0;
        m.score2 = 0;
        m.status = 'UPCOMING';
        m.winnerId = null;
        m.mvp = null;
        m.gameMvps = [];
        if (m.round > 1) {
          if (m.id === 'r2_m1') {
            m.team2 = null;
          } else if (m.id === 'r2_m3') {
            m.team2 = null;
          } else {
            m.team1 = null;
            m.team2 = null;
          }
        }
      }

      bracketState = pristine;
      saveBracketData(bracketState);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bracket: bracketState }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- Serve Static Frontend Files ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // If path doesn't have an extension, try index.html (SPA fallback)
  if (!path.extname(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for client routing
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 BRACKET MANAGER MLBB SERVER BERJALAN!`);
  console.log(`📡 URL Lokal (PC):    http://localhost:${PORT}`);
  console.log(`📺 Mode Viewer:       http://localhost:${PORT}?mode=viewer`);
  console.log(`🎥 Mode OBS Overlay:  http://localhost:${PORT}?mode=overlay`);
  console.log(`🔑 PIN Admin Default: ${bracketState.adminPin}`);
  console.log(`====================================================`);
});

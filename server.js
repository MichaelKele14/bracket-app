const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bracket.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Active Server-Sent Events (SSE) connections
const sseClients = new Set();

// Active admin sessions (simple token store)
const adminSessions = new Set();

function loadBracketData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading bracket data, falling back to default:', err);
    return null;
  }
}

function saveBracketData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    broadcastUpdate(data);
  } catch (err) {
    console.error('Error saving bracket data:', err);
  }
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

let bracketState = loadBracketData();

// Helper to cascade winner into next matches
function advanceWinner(state, matchId, winnerId) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;

  const prevWinnerId = match.winnerId;
  match.winnerId = winnerId;

  const winnerTeam = winnerId
    ? (match.team1 && match.team1.id === winnerId ? match.team1 : match.team2)
    : null;

  if (match.nextMatchId) {
    const nextMatch = state.matches.find(m => m.id === match.nextMatchId);
    if (nextMatch) {
      const slot = match.nextMatchSlot; // 'team1' or 'team2'
      if (winnerTeam) {
        nextMatch[slot] = { ...winnerTeam };
      } else {
        // If winner cleared, clear downstream slot and if that match had that team as winner, clear it too recursively
        if (nextMatch[slot] && prevWinnerId && nextMatch[slot].id === prevWinnerId) {
          nextMatch[slot] = null;
          if (nextMatch.winnerId === prevWinnerId) {
            advanceWinner(state, nextMatch.id, null);
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
  return token && adminSessions.has(token);
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
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', bracket: bracketState })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --- API: Get Current Bracket ---
  if (pathname === '/api/bracket' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(bracketState));
    return;
  }

  // --- API: Admin Login ---
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { pin } = await parseJsonBody(req);
      if (pin === bracketState.adminPin) {
        const token = crypto.randomBytes(24).toString('hex');
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: isAuthenticated(req) }));
    return;
  }

  // --- API: Update Match (Admin Only) ---
  if (pathname === '/api/match/update' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Akses ditolak. Silakan login admin.' }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const { matchId, score1, score2, status, winnerId, mvp, bestOf, schedule, gameMvps } = payload;
      const match = bracketState.matches.find(m => m.id === matchId);
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

      if (winnerId !== undefined) {
        advanceWinner(bracketState, matchId, winnerId);
        if (winnerId) {
          match.status = 'COMPLETED';
        }
      }

      saveBracketData(bracketState);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bracket: bracketState }));
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
      const { sourceMatchId, sourceSlot, targetMatchId, targetSlot } = await parseJsonBody(req);
      const srcMatch = bracketState.matches.find(m => m.id === sourceMatchId);
      const tgtMatch = bracketState.matches.find(m => m.id === targetMatchId);

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
      if (srcMatch.winnerId) advanceWinner(bracketState, srcMatch.id, null);
      if (tgtMatch.winnerId) advanceWinner(bracketState, tgtMatch.id, null);

      saveBracketData(bracketState);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bracket: bracketState }));
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
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
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

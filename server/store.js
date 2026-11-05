// Domain logic: events, polls, votes, Q&A. Everything here is synchronous
// (node:sqlite) and knows nothing about HTTP or sockets.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { parseScenario } from './scenario.js';

export class UserError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const POLL_TYPES = ['choice', 'quiz', 'wordcloud', 'open', 'rating', 'ranking', 'scale', 'pin'];
export const IMAGE_MAX_BYTES = 1024 * 1024;
const SCREENS = ['join', 'poll', 'qa', 'leaderboard', 'test', 'scenario'];
const TEST_ROUNDS = ['pre', 'post'];
const CERT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Each correct answer in a row after the first adds this much, up to STREAK_CAP steps.
export const STREAK_BONUS = 100;
const STREAK_CAP = 5;

export const LIMITS = {
  eventName: 120,
  question: 300,
  option: 120,
  options: 20,
  word: 40,
  openText: 500,
  qaText: 300,
  nickname: 40,
  maxEntries: 10,
  reply: 1000,
  issuer: 80,
  rankingOptions: 10,
  statements: 10,
  statement: 200,
  scaleLabel: 40,
  pins: 2000,
};

const DEFAULT_SETTINGS = {
  qaEnabled: true,
  qaModeration: false,
  closed: false,
  screen: 'join',
  testRound: null,
  certEnabled: false,
  certIssuer: '',
  certMinScore: 0,
  scenario: null,
  // Per-event look: client logo (stored separately), accent color, background, product brand.
  brand: { color: '', background: 'neon', hideProduct: false, logo: 0 },
};

export const LOGO_MAX_BYTES = 500 * 1024;

// Only raster formats, recognised by their first bytes. SVG is refused: it can carry script,
// and the logo is served from the app's own origin.
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const now = () => Date.now();
const hash = (s) => createHash('sha256').update(s).digest('hex');

function text(value, max, label, { required = true } = {}) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (required && !s) throw new UserError(`${label} lipsește.`);
  if (s.length > max) throw new UserError(`${label} poate avea cel mult ${max} caractere.`);
  return s;
}

function nickname(value) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return s.slice(0, LIMITS.nickname);
}

function participant(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
    throw new UserError('Identificator de participant invalid.');
  }
  return value;
}

function int(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createStore(db) {
  const q = (sql) => db.prepare(sql);
  const st = {
    eventByCode: q('SELECT * FROM events WHERE code = ?'),
    insertEvent: q('INSERT INTO events (code, name, admin_hash, settings, created_at) VALUES (?, ?, ?, ?, ?)'),
    updateEvent: q('UPDATE events SET name = ?, settings = ? WHERE id = ?'),
    setCode: q('UPDATE events SET code = ? WHERE id = ?'),
    setAdminHash: q('UPDATE events SET admin_hash = ? WHERE id = ?'),
    allEvents: q(`SELECT e.*,
                    (SELECT COUNT(*) FROM polls p WHERE p.event_id = e.id AND p.kind = '') AS polls,
                    (SELECT COUNT(DISTINCT participant_id) FROM (
                       SELECT v.participant_id FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.event_id = e.id
                       UNION SELECT participant_id FROM questions WHERE event_id = e.id)) AS participants
                  FROM events e ORDER BY e.created_at DESC`),
    deleteEvent: q('DELETE FROM events WHERE id = ?'),

    polls: q("SELECT * FROM polls WHERE event_id = ? AND kind = '' ORDER BY position, id"),
    testPolls: q("SELECT * FROM polls WHERE event_id = ? AND kind = 'test' ORDER BY position, id"),
    poll: q('SELECT * FROM polls WHERE id = ? AND event_id = ?'),
    livePoll: q("SELECT * FROM polls WHERE event_id = ? AND kind = '' AND status = 'live' LIMIT 1"),
    maxPos: q('SELECT COALESCE(MAX(position), -1) AS m FROM polls WHERE event_id = ? AND kind = ?'),
    insertPoll: q(`INSERT INTO polls (event_id, type, question, config, show_results, position, created_at, kind)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    updatePoll: q('UPDATE polls SET type = ?, question = ?, config = ?, show_results = ? WHERE id = ?'),
    setStatus: q('UPDATE polls SET status = ?, opened_at = ? WHERE id = ?'),
    closeLive: q("UPDATE polls SET status = 'closed' WHERE event_id = ? AND kind = '' AND status = 'live'"),
    setShow: q('UPDATE polls SET show_results = ? WHERE id = ?'),
    setRevealed: q('UPDATE polls SET revealed = ? WHERE id = ?'),
    setPos: q('UPDATE polls SET position = ? WHERE id = ?'),
    deletePoll: q('DELETE FROM polls WHERE id = ?'),

    votesByPoll: q('SELECT * FROM votes WHERE poll_id = ? ORDER BY id'),
    votesOf: q("SELECT * FROM votes WHERE poll_id = ? AND participant_id = ? AND round = ? ORDER BY id"),
    votesOfInEvent: q(`SELECT v.poll_id, v.value, v.round FROM votes v JOIN polls p ON p.id = v.poll_id
                       WHERE p.event_id = ? AND v.participant_id = ? ORDER BY v.id`),
    insertVote: q('INSERT INTO votes (poll_id, participant_id, name, value, score, created_at, round) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    deleteVotesOf: q("DELETE FROM votes WHERE poll_id = ? AND participant_id = ? AND round = ''"),
    testVotes: q(`SELECT v.poll_id, v.participant_id, v.name, v.score, v.round FROM votes v JOIN polls p ON p.id = v.poll_id
                  WHERE p.event_id = ? AND p.kind = 'test'`),
    testVotesOf: q(`SELECT v.score FROM votes v JOIN polls p ON p.id = v.poll_id
                    WHERE p.event_id = ? AND p.kind = 'test' AND v.participant_id = ? AND v.round = ?`),
    hasActivity: q(`SELECT 1 FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.event_id = ? AND v.participant_id = ?
                    UNION SELECT 1 FROM questions WHERE event_id = ? AND participant_id = ? LIMIT 1`),
    deleteVotes: q('DELETE FROM votes WHERE poll_id = ?'),
    voterCount: q('SELECT COUNT(DISTINCT participant_id) AS n FROM votes WHERE poll_id = ?'),
    revealedQuizzes: q(`SELECT id FROM polls WHERE event_id = ? AND kind = '' AND type = 'quiz' AND revealed = 1
                        ORDER BY COALESCE(opened_at, created_at), id`),
    quizVotes: q(`SELECT v.poll_id, v.participant_id, v.name, v.score, v.created_at FROM votes v JOIN polls p ON p.id = v.poll_id
                  WHERE p.event_id = ? AND p.kind = '' AND p.type = 'quiz' AND p.revealed = 1`),

    questions: q(`SELECT qu.*, (SELECT COUNT(*) FROM upvotes u WHERE u.question_id = qu.id) AS votes
                  FROM questions qu WHERE qu.event_id = ?`),
    question: q('SELECT * FROM questions WHERE id = ? AND event_id = ?'),
    insertQuestion: q(`INSERT INTO questions (event_id, participant_id, author, text, status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)`),
    setQuestion: q('UPDATE questions SET status = ?, highlighted = ? WHERE id = ?'),
    setReply: q('UPDATE questions SET reply = ?, replied_at = ? WHERE id = ?'),
    clearHighlight: q('UPDATE questions SET highlighted = 0 WHERE event_id = ?'),
    deleteQuestion: q('DELETE FROM questions WHERE id = ?'),
    upvote: q('INSERT OR IGNORE INTO upvotes (question_id, participant_id) VALUES (?, ?)'),
    unvote: q('DELETE FROM upvotes WHERE question_id = ? AND participant_id = ?'),
    hasUpvote: q('SELECT 1 FROM upvotes WHERE question_id = ? AND participant_id = ?'),
    upvotesOf: q(`SELECT u.question_id FROM upvotes u JOIN questions qu ON qu.id = u.question_id
                  WHERE qu.event_id = ? AND u.participant_id = ?`),
    recentQuestionsOf: q('SELECT COUNT(*) AS n FROM questions WHERE event_id = ? AND participant_id = ? AND created_at > ?'),

    certOf: q('SELECT * FROM certificates WHERE event_id = ? AND participant_id = ?'),
    cert: q('SELECT c.*, e.name AS event_name, e.code AS event_code, e.settings AS event_settings FROM certificates c JOIN events e ON e.id = c.event_id WHERE c.id = ?'),
    insertCert: q('INSERT INTO certificates (id, event_id, participant_id, name, score, issued_at) VALUES (?, ?, ?, ?, ?, ?)'),
    certCount: q('SELECT COUNT(*) AS n FROM certificates WHERE event_id = ?'),
    certsOfEvent: q('SELECT id, name, score, issued_at FROM certificates WHERE event_id = ? ORDER BY name COLLATE NOCASE'),
    participantsOf: q(`SELECT COUNT(DISTINCT participant_id) AS n FROM (
                         SELECT v.participant_id FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.event_id = ?
                         UNION SELECT participant_id FROM questions WHERE event_id = ?)`),
    responsesOf: q(`SELECT COUNT(*) AS n FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.event_id = ? AND p.kind = ''`),
    upvotesOfEvent: q('SELECT COUNT(*) AS n FROM upvotes u JOIN questions qu ON qu.id = u.question_id WHERE qu.event_id = ?'),

    scenarios: q('SELECT id, title, definition, created_at FROM scenarios WHERE event_id = ? ORDER BY id'),
    scenario: q('SELECT * FROM scenarios WHERE id = ? AND event_id = ?'),
    insertScenario: q('INSERT INTO scenarios (event_id, title, source, definition, created_at) VALUES (?, ?, ?, ?, ?)'),
    deleteScenario: q('DELETE FROM scenarios WHERE id = ?'),
    scenarioVote: q(`INSERT INTO scenario_votes (scenario_id, run, step, participant_id, choice, created_at) VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(scenario_id, run, step, participant_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`),
    scenarioCounts: q('SELECT choice, COUNT(*) AS n FROM scenario_votes WHERE scenario_id = ? AND run = ? AND step = ? GROUP BY choice'),
    scenarioMine: q('SELECT choice FROM scenario_votes WHERE scenario_id = ? AND run = ? AND step = ? AND participant_id = ?'),
    saveRun: q(`INSERT INTO scenario_runs (scenario_id, run, ending, path, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(scenario_id, run) DO UPDATE SET ending = excluded.ending, path = excluded.path, ended_at = excluded.ended_at`),
    deleteRun: q('DELETE FROM scenario_runs WHERE scenario_id = ? AND run = ?'),
    runsOfEvent: q(`SELECT r.*, s.title, s.definition FROM scenario_runs r JOIN scenarios s ON s.id = r.scenario_id
                    WHERE s.event_id = ? ORDER BY r.ended_at DESC`),

    putAsset: q(`INSERT INTO event_assets (event_id, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(event_id, kind) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`),
    getAsset: q('SELECT mime, data, updated_at FROM event_assets WHERE event_id = ? AND kind = ?'),
    deleteAsset: q('DELETE FROM event_assets WHERE event_id = ? AND kind = ?'),

    getSetting: q('SELECT value FROM app_settings WHERE key = ?'),
    putSetting: q('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  };

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- events ----------

  function hydrateEvent(row) {
    if (!row) return null;
    const saved = JSON.parse(row.settings);
    return { ...row, settings: { ...DEFAULT_SETTINGS, ...saved, brand: { ...DEFAULT_SETTINGS.brand, ...(saved.brand || {}) } } };
  }

  function getEvent(code) {
    if (typeof code !== 'string') return null;
    return hydrateEvent(st.eventByCode.get(code.trim().toUpperCase()));
  }

  function requireEvent(code) {
    const ev = getEvent(code);
    if (!ev) throw new UserError('Evenimentul nu există.');
    return ev;
  }

  function createEvent(name) {
    const clean = text(name, LIMITS.eventName, 'Numele evenimentului');
    const adminKey = randomBytes(18).toString('base64url');
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (st.eventByCode.get(code)) continue;
      st.insertEvent.run(code, clean, hash(adminKey), JSON.stringify(DEFAULT_SETTINGS), now());
      return { code, adminKey };
    }
    throw new Error('Nu am putut genera un cod unic.');
  }

  function verifyAdmin(code, key) {
    const ev = getEvent(code);
    if (!ev || typeof key !== 'string' || !key) return null;
    const a = Buffer.from(ev.admin_hash, 'hex');
    const b = Buffer.from(hash(key), 'hex');
    return timingSafeEqual(a, b) ? ev : null;
  }

  function updateEvent(ev, { name, settings = {} }) {
    const next = { ...ev.settings };
    for (const k of ['qaEnabled', 'qaModeration', 'closed', 'certEnabled']) {
      if (k in settings) next[k] = Boolean(settings[k]);
    }
    if ('certIssuer' in settings) next.certIssuer = text(settings.certIssuer, LIMITS.issuer, 'Emitentul', { required: false });
    if ('certMinScore' in settings) next.certMinScore = int(settings.certMinScore, 0, 100, 0);
    if (settings.brand && typeof settings.brand === 'object') {
      const b = { ...ev.settings.brand };
      if ('color' in settings.brand) {
        const c = String(settings.brand.color || '').trim().toLowerCase();
        if (c && !/^#[0-9a-f]{6}$/.test(c)) throw new UserError('Culoarea trebuie să fie de forma #1a2b3c.');
        b.color = c;
      }
      if ('background' in settings.brand) {
        if (!['neon', 'plain'].includes(settings.brand.background)) throw new UserError('Fundal necunoscut.');
        b.background = settings.brand.background;
      }
      if ('hideProduct' in settings.brand) b.hideProduct = Boolean(settings.brand.hideProduct);
      next.brand = b;
    }
    if ('testRound' in settings) {
      if (settings.testRound !== null && !TEST_ROUNDS.includes(settings.testRound)) throw new UserError('Etapă de test necunoscută.');
      if (settings.testRound && !st.testPolls.all(ev.id).length) throw new UserError('Adaugă întâi întrebări în test.');
      next.testRound = settings.testRound;
    }
    if ('screen' in settings) {
      if (!SCREENS.includes(settings.screen)) throw new UserError('Ecran necunoscut.');
      next.screen = settings.screen;
    }
    const cleanName = name === undefined ? ev.name : text(name, LIMITS.eventName, 'Numele evenimentului');
    st.updateEvent.run(cleanName, JSON.stringify(next), ev.id);
    // Turning moderation off publishes everything that was waiting.
    if (ev.settings.qaModeration && !next.qaModeration) {
      db.prepare("UPDATE questions SET status = 'visible' WHERE event_id = ? AND status = 'pending'").run(ev.id);
    }
  }

  function deleteEvent(ev) {
    st.deleteEvent.run(ev.id);
  }

  // Organizers can swap the random code for a memorable one (e.g. NIS2). Short codes are
  // easier to guess, which only matters for who can join: the admin key is separate.
  function changeCode(ev, raw) {
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new UserError('Codul trebuie să aibă 3–20 litere sau cifre, fără spații.');
    if (code === ev.code) return code;
    if (st.eventByCode.get(code)) throw new UserError('Codul este deja folosit de alt eveniment.');
    st.setCode.run(code, ev.id);
    return code;
  }

  function setLogo(ev, buf) {
    const mime = imageType(buf);
    if (!mime) throw new UserError('Logo-ul trebuie să fie o imagine PNG, JPG sau WebP.');
    if (buf.length > LOGO_MAX_BYTES) throw new UserError('Logo-ul poate avea cel mult 500 KB.');
    const t = now();
    st.putAsset.run(ev.id, 'logo', mime, buf, t);
    st.updateEvent.run(ev.name, JSON.stringify({ ...ev.settings, brand: { ...ev.settings.brand, logo: t } }), ev.id);
  }

  function removeLogo(ev) {
    st.deleteAsset.run(ev.id, 'logo');
    st.updateEvent.run(ev.name, JSON.stringify({ ...ev.settings, brand: { ...ev.settings.brand, logo: 0 } }), ev.id);
  }

  function getLogo(code) {
    const ev = getEvent(code);
    return ev ? st.getAsset.get(ev.id, 'logo') || null : null;
  }

  function rotateAdminKey(ev) {
    const adminKey = randomBytes(18).toString('base64url');
    st.setAdminHash.run(hash(adminKey), ev.id);
    return adminKey;
  }

  function listEvents() {
    return st.allEvents.all().map((e) => {
      const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(e.settings) };
      return {
        code: e.code, name: e.name, createdAt: e.created_at, polls: e.polls,
        participants: e.participants, closed: settings.closed, certificates: st.certCount.get(e.id).n,
      };
    });
  }

  function appSetting(key, fallback) {
    const row = st.getSetting.get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  function setAppSetting(key, value) {
    st.putSetting.run(key, JSON.stringify(value));
  }

  // ---------- polls ----------

  function hydratePoll(row) {
    if (!row) return null;
    return { ...row, config: JSON.parse(row.config), show_results: !!row.show_results, revealed: !!row.revealed };
  }

  function requirePoll(ev, pollId) {
    const p = hydratePoll(st.poll.get(Number(pollId), ev.id));
    if (!p) throw new UserError('Sondajul nu există.');
    return p;
  }

  function cleanPoll(data = {}) {
    const type = data.type;
    if (!POLL_TYPES.includes(type)) throw new UserError('Tip de sondaj necunoscut.');
    const question = text(data.question, LIMITS.question, 'Întrebarea');
    const config = {};
    if (type === 'choice' || type === 'quiz') {
      const options = (Array.isArray(data.options) ? data.options : [])
        .map((o) => text(o, LIMITS.option, 'Opțiunea', { required: false }))
        .filter(Boolean);
      if (options.length < 2) throw new UserError('Adaugă cel puțin două opțiuni.');
      if (options.length > LIMITS.options) throw new UserError(`Cel mult ${LIMITS.options} opțiuni.`);
      config.options = options;
    }
    if (type === 'choice') config.multi = Boolean(data.multi);
    if (type === 'quiz') {
      const correct = [...new Set((Array.isArray(data.correct) ? data.correct : []).map(Number))]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < config.options.length);
      if (!correct.length) throw new UserError('Marchează răspunsul corect.');
      config.correct = correct;
      config.timeLimit = int(data.timeLimit, 0, 600, 0);
      if (config.timeLimit > 0 && config.timeLimit < 5) config.timeLimit = 5;
    }
    if (type === 'ranking' || type === 'scale') {
      const what = type === 'scale' ? 'afirmații' : 'opțiuni';
      const max = type === 'scale' ? LIMITS.statements : LIMITS.rankingOptions;
      const items = (Array.isArray(data.options) ? data.options : [])
        .map((o) => text(o, type === 'scale' ? LIMITS.statement : LIMITS.option, type === 'scale' ? 'Afirmația' : 'Opțiunea', { required: false }))
        .filter(Boolean);
      if (items.length < (type === 'scale' ? 1 : 2)) throw new UserError(type === 'scale' ? 'Adaugă cel puțin o afirmație.' : 'Adaugă cel puțin două opțiuni.');
      if (items.length > max) throw new UserError(`Cel mult ${max} ${what}.`);
      config.options = items;
    }
    if (type === 'scale') {
      config.scale = int(data.scale, 3, 7, 5);
      config.labels = (Array.isArray(data.labels) ? data.labels : []).slice(0, 2)
        .map((l) => text(l, LIMITS.scaleLabel, 'Eticheta', { required: false }));
    }
    if (type === 'pin' && data.region) {
      const r = data.region;
      const ok = [r.x, r.y, r.r].every((n) => typeof n === 'number' && Number.isFinite(n));
      if (!ok || r.x < 0 || r.x > 1 || r.y < 0 || r.y > 1 || r.r < 0.01 || r.r > 0.5) throw new UserError('Zona corectă nu este validă.');
      config.region = { x: Math.round(r.x * 1000) / 1000, y: Math.round(r.y * 1000) / 1000, r: Math.round(r.r * 1000) / 1000 };
    }
    if (type === 'rating') config.scale = int(data.scale, 3, 10, 5);
    if (type === 'wordcloud') config.maxEntries = int(data.maxEntries, 1, LIMITS.maxEntries, 3);
    if (type === 'open') config.maxEntries = int(data.maxEntries, 1, LIMITS.maxEntries, 1);
    const showResults = type === 'quiz' ? false : data.showResults !== false;
    return { type, question, config, showResults };
  }

  // Test questions (kind 'test') are always quizzes without a timer; they are answered at the
  // participant's own pace in a "before" and an "after" round.
  function cleanFor(kind, data) {
    if (kind !== 'test') return cleanPoll(data);
    if (data?.type && data.type !== 'quiz') throw new UserError('Testul acceptă doar întrebări cu răspuns corect.');
    return cleanPoll({ ...data, type: 'quiz', timeLimit: 0 });
  }

  function createPoll(ev, data, kind = '') {
    const p = cleanFor(kind, data);
    const pos = st.maxPos.get(ev.id, kind).m + 1;
    const r = st.insertPoll.run(ev.id, p.type, p.question, JSON.stringify(p.config), p.showResults ? 1 : 0, pos, now(), kind);
    return Number(r.lastInsertRowid);
  }

  function createPolls(ev, list, kind = '') {
    if (!Array.isArray(list) || !list.length) throw new UserError('Nu am găsit nicio întrebare de importat.');
    // Validate everything first so a typo in question 12 doesn't leave 11 half-imported.
    list.forEach((data, i) => {
      try { cleanFor(kind, data); } catch (e) { throw new UserError(`Întrebarea ${i + 1}: ${e.message}`); }
    });
    return tx(() => list.map((data) => createPoll(ev, data, kind)));
  }

  function updatePoll(ev, pollId, data) {
    const existing = requirePoll(ev, pollId);
    const p = cleanFor(existing.kind, data);
    const hasVotes = st.voterCount.get(existing.id).n > 0;
    if (hasVotes && (p.type !== existing.type || optionsChanged(existing, p))) {
      throw new UserError('Sondajul are deja răspunsuri. Resetează-l înainte să schimbi tipul sau opțiunile.');
    }
    // The image is uploaded separately; editing the text keeps it.
    if (existing.config.image) p.config.image = existing.config.image;
    st.updatePoll.run(p.type, p.question, JSON.stringify(p.config), p.showResults ? 1 : 0, existing.id);
    if (existing.type === 'quiz' && existing.revealed) rescoreQuiz(requirePoll(ev, pollId));
  }

  function optionsChanged(a, b) {
    return JSON.stringify(a.config.options || []) !== JSON.stringify(b.config.options || [])
      || (a.config.scale || 0) !== (b.config.scale || 0);
  }

  function duplicatePoll(ev, pollId) {
    const p = requirePoll(ev, pollId);
    const id = createPoll(ev, {
      type: p.type, question: p.question, ...p.config, showResults: p.show_results,
    }, p.kind);
    const img = st.getAsset.get(ev.id, `poll-${p.id}`);
    if (img) {
      st.putAsset.run(ev.id, `poll-${id}`, img.mime, img.data, now());
      const copy = requirePoll(ev, id);
      st.updatePoll.run(copy.type, copy.question, JSON.stringify({ ...copy.config, image: now() }), copy.show_results ? 1 : 0, id);
    }
    return id;
  }

  function deletePoll(ev, pollId) {
    const p = requirePoll(ev, pollId);
    st.deleteAsset.run(ev.id, `poll-${p.id}`);
    st.deletePoll.run(p.id);
  }

  // ---------- poll images ----------

  function setPollImage(ev, pollId, buf) {
    const p = requirePoll(ev, pollId);
    if (!imageType(buf)) throw new UserError('Imaginea trebuie să fie PNG, JPG sau WebP.');
    if (buf.length > IMAGE_MAX_BYTES) throw new UserError('Imaginea poate avea cel mult 1 MB.');
    const t = now();
    st.putAsset.run(ev.id, `poll-${p.id}`, imageType(buf), buf, t);
    st.updatePoll.run(p.type, p.question, JSON.stringify({ ...p.config, image: t }), p.show_results ? 1 : 0, p.id);
  }

  function removePollImage(ev, pollId) {
    const p = requirePoll(ev, pollId);
    st.deleteAsset.run(ev.id, `poll-${p.id}`);
    const { image, ...config } = p.config;
    st.updatePoll.run(p.type, p.question, JSON.stringify(config), p.show_results ? 1 : 0, p.id);
  }

  function getPollImage(code, pollId) {
    const ev = getEvent(code);
    return ev ? st.getAsset.get(ev.id, `poll-${Number(pollId)}`) || null : null;
  }

  function movePoll(ev, pollId, direction) {
    const kind = requirePoll(ev, pollId).kind;
    const list = (kind === 'test' ? st.testPolls : st.polls).all(ev.id);
    const i = list.findIndex((p) => p.id === Number(pollId));
    if (i < 0) throw new UserError('Sondajul nu există.');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    tx(() => list.forEach((p, idx) => st.setPos.run(idx, p.id)));
  }

  function setPollStatus(ev, pollId, status) {
    const p = requirePoll(ev, pollId);
    if (!['draft', 'live', 'closed'].includes(status)) throw new UserError('Stare necunoscută.');
    if (p.kind === 'test') throw new UserError('Întrebările de test se deschid împreună, din secțiunea Test.');
    if (status === 'live' && p.type === 'pin' && !p.config.image) throw new UserError('Încarcă întâi imaginea pe care participanții pun pinul.');
    tx(() => {
      if (status === 'live') {
        st.closeLive.run(ev.id);
        st.setStatus.run('live', now(), p.id);
      } else {
        st.setStatus.run(status, p.opened_at, p.id);
      }
    });
    if (status === 'live') updateEvent(getEvent(ev.code), { settings: { screen: 'poll' } });
  }

  function setShowResults(ev, pollId, show) {
    st.setShow.run(show ? 1 : 0, requirePoll(ev, pollId).id);
  }

  function revealQuiz(ev, pollId, revealed = true) {
    const p = requirePoll(ev, pollId);
    const hasAnswer = p.type === 'quiz' || (p.type === 'pin' && p.config.region);
    if (!hasAnswer || p.kind === 'test') throw new UserError('Doar quiz-urile și pinurile cu zonă marcată au răspuns corect.');
    // The quiz stays on screen so everyone sees whether they got it right; vote() refuses revealed quizzes.
    st.setRevealed.run(revealed ? 1 : 0, p.id);
  }

  function rescoreQuiz(p) {
    const upd = db.prepare('UPDATE votes SET score = ? WHERE id = ?');
    tx(() => {
      for (const v of st.votesByPoll.all(p.id)) {
        upd.run(quizScore(p, JSON.parse(v.value), v.created_at), v.id);
      }
    });
  }

  function resetPoll(ev, pollId) {
    const p = requirePoll(ev, pollId);
    tx(() => {
      st.deleteVotes.run(p.id);
      st.setRevealed.run(0, p.id);
      st.setStatus.run(p.status, p.status === 'live' ? now() : null, p.id);
    });
  }

  // ---------- voting ----------

  function quizScore(p, value, at) {
    if (!p.config.correct.includes(value[0])) return 0;
    const elapsed = Math.max(0, (at - (p.opened_at || at)) / 1000);
    const limit = p.config.timeLimit;
    if (limit > 0) return Math.round(500 + 500 * Math.max(0, 1 - elapsed / limit));
    return Math.max(500, Math.round(1000 - elapsed * 10));
  }

  function vote(code, pollId, participantId, name, raw) {
    const ev = requireEvent(code);
    if (ev.settings.closed) throw new UserError('Evenimentul este închis.');
    const pid = participant(participantId);
    const p = requirePoll(ev, pollId);
    const at = now();
    const nick = nickname(name);
    if (p.kind === 'test') {
      const round = ev.settings.testRound;
      if (!round) throw new UserError('Testul nu este deschis acum.');
      if (st.votesOf.all(p.id, pid, round).length) throw new UserError('Ai răspuns deja.');
      const pick = Number(Array.isArray(raw) ? raw[0] : raw);
      if (!Number.isInteger(pick) || pick < 0 || pick >= p.config.options.length) throw new UserError('Alege o opțiune.');
      st.insertVote.run(p.id, pid, nick, JSON.stringify([pick]), p.config.correct.includes(pick) ? 1 : 0, at, round);
      return;
    }
    if (p.status !== 'live') throw new UserError('Sondajul nu mai primește răspunsuri.');
    const existing = st.votesOf.all(p.id, pid, '');

    switch (p.type) {
      case 'choice': {
        const picks = [...new Set((Array.isArray(raw) ? raw : [raw]).map(Number))]
          .filter((i) => Number.isInteger(i) && i >= 0 && i < p.config.options.length);
        if (!picks.length) throw new UserError('Alege o opțiune.');
        if (!p.config.multi && picks.length > 1) throw new UserError('Poți alege o singură opțiune.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify(picks.sort((a, b) => a - b)), 0, at, '');
        });
        break;
      }
      case 'quiz': {
        if (p.revealed) throw new UserError('Răspunsul corect a fost deja dezvăluit.');
        if (existing.length) throw new UserError('Ai răspuns deja.');
        const pick = Number(Array.isArray(raw) ? raw[0] : raw);
        if (!Number.isInteger(pick) || pick < 0 || pick >= p.config.options.length) throw new UserError('Alege o opțiune.');
        if (p.config.timeLimit > 0 && at > p.opened_at + p.config.timeLimit * 1000 + 1500) {
          throw new UserError('Timpul a expirat.');
        }
        st.insertVote.run(p.id, pid, nick, JSON.stringify([pick]), quizScore(p, [pick], at), at, '');
        break;
      }
      case 'rating': {
        const n = Number(Array.isArray(raw) ? raw[0] : raw);
        if (!Number.isInteger(n) || n < 1 || n > p.config.scale) throw new UserError('Notă invalidă.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify([n]), 0, at, '');
        });
        break;
      }
      case 'ranking': {
        const n = p.config.options.length;
        const order = (Array.isArray(raw) ? raw : []).map(Number);
        const valid = order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
        if (!valid) throw new UserError('Ordonează toate opțiunile.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify(order), 0, at, '');
        });
        break;
      }
      case 'scale': {
        const marks = (Array.isArray(raw) ? raw : []).map(Number);
        if (marks.length !== p.config.options.length || !marks.every((m) => Number.isInteger(m) && m >= 1 && m <= p.config.scale)) {
          throw new UserError('Dă o notă fiecărei afirmații.');
        }
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify(marks), 0, at, '');
        });
        break;
      }
      case 'pin': {
        if (p.revealed) throw new UserError('Zona corectă a fost deja dezvăluită.');
        const [x, y] = (Array.isArray(raw) ? raw : []).map(Number);
        if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) throw new UserError('Atinge imaginea ca să pui pinul.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]), 0, at, '');
        });
        break;
      }
      case 'wordcloud':
      case 'open': {
        const max = p.type === 'wordcloud' ? LIMITS.word : LIMITS.openText;
        const s = text(Array.isArray(raw) ? raw[0] : raw, max, 'Răspunsul');
        if (existing.length >= p.config.maxEntries) {
          throw new UserError(p.config.maxEntries === 1 ? 'Ai răspuns deja.' : `Poți trimite cel mult ${p.config.maxEntries} răspunsuri.`);
        }
        st.insertVote.run(p.id, pid, nick, JSON.stringify([s]), 0, at, '');
        break;
      }
    }
  }

  function results(p) {
    const votes = st.votesByPoll.all(p.id);
    const voters = new Set(votes.map((v) => v.participant_id)).size;
    const out = { voters, responses: votes.length };
    switch (p.type) {
      case 'choice':
      case 'quiz': {
        out.counts = p.config.options.map(() => 0);
        for (const v of votes) for (const i of JSON.parse(v.value)) if (i < out.counts.length) out.counts[i]++;
        break;
      }
      case 'rating': {
        out.counts = Array.from({ length: p.config.scale }, () => 0);
        let sum = 0;
        for (const v of votes) {
          const n = JSON.parse(v.value)[0];
          out.counts[n - 1]++;
          sum += n;
        }
        out.average = votes.length ? Math.round((sum / votes.length) * 100) / 100 : null;
        break;
      }
      case 'wordcloud': {
        const words = new Map();
        for (const v of votes) {
          const raw = JSON.parse(v.value)[0];
          const key = raw.toLocaleLowerCase('ro');
          const w = words.get(key) || { word: raw, count: 0 };
          w.count++;
          words.set(key, w);
        }
        out.words = [...words.values()].sort((a, b) => b.count - a.count).slice(0, 150);
        break;
      }
      case 'open': {
        out.answers = votes.slice(-300).reverse().map((v) => ({ text: JSON.parse(v.value)[0], name: v.name, at: v.created_at }));
        break;
      }
      case 'ranking': {
        // Borda count: first place earns n-1 points, last place 0.
        const n = p.config.options.length;
        const points = Array(n).fill(0); const sumPos = Array(n).fill(0); const firsts = Array(n).fill(0);
        for (const v of votes) {
          JSON.parse(v.value).forEach((opt, pos) => { points[opt] += n - 1 - pos; sumPos[opt] += pos + 1; if (pos === 0) firsts[opt]++; });
        }
        out.ranking = p.config.options.map((_, i) => ({
          option: i, points: points[i], firsts: firsts[i], average: votes.length ? Math.round((sumPos[i] / votes.length) * 10) / 10 : null,
        })).sort((a, b) => (b.points - a.points) || (a.option - b.option));
        out.maxPoints = votes.length * (n - 1);
        break;
      }
      case 'scale': {
        out.statements = p.config.options.map(() => ({ counts: Array(p.config.scale).fill(0), average: null }));
        const sums = p.config.options.map(() => 0);
        for (const v of votes) JSON.parse(v.value).forEach((m, i) => { if (out.statements[i]) { out.statements[i].counts[m - 1]++; sums[i] += m; } });
        out.statements.forEach((s, i) => { s.average = votes.length ? Math.round((sums[i] / votes.length) * 100) / 100 : null; });
        break;
      }
      case 'pin': {
        const pins = votes.map((v) => JSON.parse(v.value));
        out.pins = pins.slice(-LIMITS.pins);
        const r = p.config.region;
        if (r) out.inside = pins.filter(([x, y]) => (x - r.x) ** 2 + (y - r.y) ** 2 <= r.r ** 2).length;
        break;
      }
    }
    return out;
  }

  // Points per revealed quiz, in the order the quizzes were run, plus a bonus for each correct
  // answer in a row. Skipping a quiz or answering wrong resets the streak.
  function leaderboard(ev, limit = 50) {
    const order = st.revealedQuizzes.all(ev.id).map((r) => r.id);
    const players = new Map();
    for (const v of st.quizVotes.all(ev.id)) {
      const pl = players.get(v.participant_id) || { id: v.participant_id, name: '', answers: new Map(), first: Infinity };
      if (v.name) pl.name = v.name;
      pl.answers.set(v.poll_id, v.score);
      pl.first = Math.min(pl.first, v.created_at);
      players.set(v.participant_id, pl);
    }
    const rows = [...players.values()].map((pl) => {
      let score = 0; let correct = 0; let streak = 0; let best = 0; let bonus = 0;
      for (const id of order) {
        const s = pl.answers.get(id);
        if (s > 0) {
          streak++;
          correct++;
          const b = Math.min(streak - 1, STREAK_CAP) * STREAK_BONUS;
          bonus += b;
          score += s + b;
          best = Math.max(best, streak);
        } else {
          streak = 0;
        }
      }
      return { id: pl.id, name: pl.name, score, correct, streak, best, bonus, first: pl.first };
    });
    rows.sort((a, b) => (b.score - a.score) || (a.first - b.first));
    return rows.slice(0, limit).map(({ first, ...r }, i) => ({ rank: i + 1, ...r }));
  }

  // ---------- knowledge test (before / after) ----------

  function testReport(ev) {
    const qs = st.testPolls.all(ev.id).map(hydratePoll);
    const total = qs.length;
    const rounds = { pre: new Map(), post: new Map() };
    const perQuestion = new Map(qs.map((p) => [p.id, { pre: [0, 0], post: [0, 0] }]));
    for (const v of st.testVotes.all(ev.id)) {
      if (!rounds[v.round] || !perQuestion.has(v.poll_id)) continue;
      const pq = perQuestion.get(v.poll_id)[v.round];
      pq[1]++;
      if (v.score > 0) pq[0]++;
      const r = rounds[v.round].get(v.participant_id) || { correct: 0, answered: 0, name: '' };
      r.answered++;
      if (v.score > 0) r.correct++;
      if (v.name) r.name = v.name;
      rounds[v.round].set(v.participant_id, r);
    }
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    const avg = (m) => (m.size ? Math.round([...m.values()].reduce((s, r) => s + (r.correct / total) * 100, 0) / m.size) : null);
    let improved = 0; let same = 0; let worse = 0; let gainSum = 0; let both = 0;
    for (const [pid, post] of rounds.post) {
      const pre = rounds.pre.get(pid);
      if (!pre) continue;
      both++;
      const gain = ((post.correct - pre.correct) / total) * 100;
      gainSum += gain;
      if (gain > 0) improved++; else if (gain < 0) worse++; else same++;
    }
    return {
      total,
      round: ev.settings.testRound,
      questions: qs.map((p) => {
        const r = perQuestion.get(p.id);
        return { id: p.id, question: p.question, pre: pct(...r.pre), post: pct(...r.post), answersPre: r.pre[1], answersPost: r.post[1] };
      }),
      participants: { pre: rounds.pre.size, post: rounds.post.size, both },
      average: { pre: avg(rounds.pre), post: avg(rounds.post) },
      matched: { improved, same, worse, gain: both ? Math.round(gainSum / both) : null },
    };
  }

  function testScoreOf(ev, pid, round) {
    const total = st.testPolls.all(ev.id).length;
    let correct = 0; let answered = 0;
    for (const v of st.testVotesOf.all(ev.id, pid, round)) { answered++; if (v.score > 0) correct++; }
    return answered ? { correct, total, percent: total ? Math.round((correct / total) * 100) : 0 } : null;
  }

  // ---------- certificates ----------

  function issueCertificate(code, participantId, name) {
    const ev = requireEvent(code);
    const pid = participant(participantId);
    if (!ev.settings.certEnabled) throw new UserError('Certificatele nu sunt activate pentru acest eveniment.');
    const existing = st.certOf.get(ev.id, pid);
    if (existing) return certificateView(existing.id);
    const clean = nickname(name);
    if (clean.length < 3) throw new UserError('Scrie-ți numele complet pentru certificat.');
    if (!st.hasActivity.get(ev.id, pid, ev.id, pid)) throw new UserError('Răspunde întâi la cel puțin o activitate din eveniment.');
    const hasTest = st.testPolls.all(ev.id).length > 0;
    const post = hasTest ? testScoreOf(ev, pid, 'post') : null;
    if (ev.settings.certMinScore > 0 && hasTest && (!post || post.percent < ev.settings.certMinScore)) {
      throw new UserError(`Certificatul cere cel puțin ${ev.settings.certMinScore}% la testul final.`);
    }
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 10; i++) id += CERT_ALPHABET[randomInt(CERT_ALPHABET.length)];
    } while (st.cert.get(id));
    st.insertCert.run(id, ev.id, pid, clean, post ? post.percent : null, now());
    return certificateView(id);
  }

  function certificateView(id) {
    const row = typeof id === 'string' ? st.cert.get(id.trim().toUpperCase()) : null;
    if (!row) return null;
    const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.event_settings) };
    const brand = { ...DEFAULT_SETTINGS.brand, ...(settings.brand || {}) };
    return {
      id: row.id, name: row.name, event: row.event_name, score: row.score, issuedAt: row.issued_at, issuer: settings.certIssuer,
      logo: brand.logo ? `/brand/${encodeURIComponent(row.event_code)}/logo?v=${brand.logo}` : null,
      hideProduct: Boolean(brand.hideProduct),
      color: brand.color || '',
    };
  }

  // ---------- tabletop scenarios ----------

  function patchSettings(ev, patch) {
    st.updateEvent.run(ev.name, JSON.stringify({ ...ev.settings, ...patch }), ev.id);
  }

  function loadScenario(ev, id) {
    const row = st.scenario.get(Number(id), ev.id);
    if (!row) throw new UserError('Scenariul nu există.');
    const def = JSON.parse(row.definition);
    def.byKey = Object.fromEntries(def.steps.map((s) => [s.key, s]));
    return { row, def };
  }

  function createScenario(ev, source) {
    const def = parseScenario(source);
    const r = st.insertScenario.run(ev.id, def.title, String(source), JSON.stringify(def), now());
    return Number(r.lastInsertRowid);
  }

  function deleteScenario(ev, id) {
    const { row } = loadScenario(ev, id);
    if (ev.settings.scenario?.id === row.id) patchSettings(ev, { scenario: null });
    st.deleteScenario.run(row.id);
  }

  function activeScenario(ev) {
    const run = ev.settings.scenario;
    if (!run) return null;
    const row = st.scenario.get(run.id, ev.id);
    if (!row) return null;
    const def = JSON.parse(row.definition);
    def.byKey = Object.fromEntries(def.steps.map((s) => [s.key, s]));
    return { run, def, step: def.byKey[run.step] };
  }

  function requireActive(ev) {
    const a = activeScenario(ev);
    if (!a) throw new UserError('Niciun scenariu nu rulează acum.');
    return a;
  }

  function stepCounts(a) {
    const counts = a.step.options.map(() => 0);
    for (const r of st.scenarioCounts.all(a.run.id, a.run.run, a.run.step)) if (r.choice < counts.length) counts[r.choice] = r.n;
    return counts;
  }

  function startScenario(ev, id) {
    const { row, def } = loadScenario(ev, id);
    const t = now();
    patchSettings(ev, { scenario: { id: row.id, run: t, step: def.start, phase: 'vote', path: [], startedAt: t }, screen: 'scenario' });
  }

  function scenarioVote(code, participantId, choice) {
    const ev = requireEvent(code);
    if (ev.settings.closed) throw new UserError('Evenimentul este închis.');
    const pid = participant(participantId);
    const a = requireActive(ev);
    if (a.run.phase !== 'vote') throw new UserError('Votul pentru acest pas s-a încheiat.');
    const c = Number(choice);
    if (!Number.isInteger(c) || c < 0 || c >= a.step.options.length) throw new UserError('Alege o opțiune.');
    st.scenarioVote.run(a.run.id, a.run.run, a.run.step, pid, c, now());
  }

  function revealScenario(ev) {
    const a = requireActive(ev);
    if (a.run.phase !== 'vote') return;
    patchSettings(ev, { scenario: { ...a.run, phase: 'reveal' } });
  }

  function saveRun(ev, a, run, ending) {
    st.saveRun.run(a.run.id, run.run, ending, JSON.stringify(run.path), run.startedAt, now());
  }

  // Moves to the branch the room voted for (most votes; a tie goes to the recommended option,
  // then the first one), or to the branch the facilitator picks.
  function advanceScenario(ev, choice) {
    const a = requireActive(ev);
    if (a.run.phase === 'end') throw new UserError('Scenariul s-a încheiat.');
    const counts = stepCounts(a);
    const voters = counts.reduce((s, n) => s + n, 0);
    let pick = choice === undefined || choice === null ? null : Number(choice);
    if (pick !== null && (!Number.isInteger(pick) || pick < 0 || pick >= a.step.options.length)) throw new UserError('Alege o opțiune.');
    if (pick === null) {
      if (!voters) throw new UserError('Nimeni n-a votat încă. Alege tu ramura sau așteaptă voturile.');
      const max = Math.max(...counts);
      const tied = counts.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
      pick = tied.find((i) => a.step.options[i].good) ?? tied[0];
    }
    const option = a.step.options[pick];
    const path = [...a.run.path, { step: a.run.step, choice: pick, counts, voters, good: option.good, chosenBy: choice === undefined || choice === null ? 'room' : 'facilitator' }];
    const next = a.def.byKey[option.next];
    const run = { ...a.run, step: next.key, phase: next.options.length ? 'vote' : 'end', path };
    patchSettings(ev, { scenario: run });
    if (run.phase === 'end') saveRun(ev, a, run, next.key);
  }

  function backScenario(ev) {
    const a = requireActive(ev);
    if (!a.run.path.length) throw new UserError('Ești deja la primul pas.');
    const path = [...a.run.path];
    const last = path.pop();
    if (a.run.phase === 'end') st.deleteRun.run(a.run.id, a.run.run);
    patchSettings(ev, { scenario: { ...a.run, step: last.step, phase: 'reveal', path } });
  }

  function stopScenario(ev) {
    const a = activeScenario(ev);
    if (a && a.run.phase !== 'end' && a.run.path.length) saveRun(ev, a, a.run, null);
    patchSettings(ev, { scenario: null });
  }

  // What each audience sees. Counts and explanations stay hidden while the room is voting.
  function scenarioView(ev, { admin = false, presenter = false } = {}) {
    const a = activeScenario(ev);
    if (!a) return null;
    const { run, def, step } = a;
    const open = run.phase !== 'vote';
    const counts = stepCounts(a);
    const voters = counts.reduce((s, n) => s + n, 0);
    return {
      id: run.id, run: run.run, title: def.title, phase: run.phase, voters,
      step: {
        key: step.key, title: step.title, text: step.text, outcome: step.outcome || null,
        options: step.options.map((o, i) => ({
          label: o.label,
          ...(open || admin ? { count: counts[i] } : {}),
          ...(open ? { good: o.good, feedback: o.feedback } : {}),
          ...(admin ? { good: o.good, feedback: o.feedback, next: o.next, nextTitle: def.byKey[o.next].title } : {}),
        })),
      },
      path: run.path.map((p) => {
        const s = def.byKey[p.step];
        return { title: s.title, choice: s.options[p.choice].label, good: p.good, voters: p.voters, share: p.voters ? Math.round((p.counts[p.choice] / p.voters) * 100) : 0, chosenBy: p.chosenBy };
      }),
      ...(admin || presenter ? { steps: def.steps.length } : {}),
    };
  }

  function scenarioRuns(ev) {
    return st.runsOfEvent.all(ev.id).map((r) => {
      const def = JSON.parse(r.definition);
      const byKey = Object.fromEntries(def.steps.map((s) => [s.key, s]));
      const path = JSON.parse(r.path);
      const end = r.ending ? byKey[r.ending] : null;
      return {
        title: r.title, startedAt: r.started_at, endedAt: r.ended_at,
        ending: end ? { title: end.title, outcome: end.outcome || null } : null,
        good: path.filter((p) => p.good).length,
        decisions: path.map((p) => {
          const s = byKey[p.step];
          return { step: s.title, choice: s.options[p.choice].label, good: p.good, voters: p.voters, share: p.voters ? Math.round((p.counts[p.choice] / p.voters) * 100) : 0, chosenBy: p.chosenBy };
        }),
      };
    });
  }

  function listScenarios(ev) {
    return st.scenarios.all(ev.id).map((r) => {
      const def = JSON.parse(r.definition);
      return { id: r.id, title: r.title, steps: def.steps.length, endings: def.steps.filter((s) => !s.options.length).length };
    });
  }

  // ---------- Q&A ----------

  function ask(code, participantId, author, body) {
    const ev = requireEvent(code);
    if (ev.settings.closed) throw new UserError('Evenimentul este închis.');
    if (!ev.settings.qaEnabled) throw new UserError('Întrebările sunt dezactivate.');
    const pid = participant(participantId);
    const s = text(body, LIMITS.qaText, 'Întrebarea');
    if (st.recentQuestionsOf.get(ev.id, pid, now() - 60_000).n >= 5) {
      throw new UserError('Prea multe întrebări într-un minut. Încearcă puțin mai târziu.');
    }
    const status = ev.settings.qaModeration ? 'pending' : 'visible';
    const r = st.insertQuestion.run(ev.id, pid, nickname(author), s, status, now());
    return { id: Number(r.lastInsertRowid), status };
  }

  function toggleUpvote(code, participantId, questionId) {
    const ev = requireEvent(code);
    if (ev.settings.closed) throw new UserError('Evenimentul este închis.');
    const pid = participant(participantId);
    const qu = st.question.get(Number(questionId), ev.id);
    if (!qu || qu.status !== 'visible') throw new UserError('Întrebarea nu mai este disponibilă.');
    if (st.hasUpvote.get(qu.id, pid)) {
      st.unvote.run(qu.id, pid);
      return false;
    }
    st.upvote.run(qu.id, pid);
    return true;
  }

  function moderate(ev, questionId, action) {
    const qu = st.question.get(Number(questionId), ev.id);
    if (!qu) throw new UserError('Întrebarea nu există.');
    switch (action) {
      case 'approve': return st.setQuestion.run('visible', qu.highlighted, qu.id);
      case 'answer': return st.setQuestion.run('answered', 0, qu.id);
      case 'archive': return st.setQuestion.run('archived', 0, qu.id);
      case 'restore': return st.setQuestion.run('visible', 0, qu.id);
      case 'highlight':
        return tx(() => {
          st.clearHighlight.run(ev.id);
          if (!qu.highlighted) st.setQuestion.run('visible', 1, qu.id);
          updateEvent(getEvent(ev.code), { settings: { screen: 'qa' } });
        });
      case 'delete': return st.deleteQuestion.run(qu.id);
      default: throw new UserError('Acțiune necunoscută.');
    }
  }

  function replyToQuestion(ev, questionId, body) {
    const qu = st.question.get(Number(questionId), ev.id);
    if (!qu) throw new UserError('Întrebarea nu există.');
    const s = typeof body === 'string' ? body.trim() : '';
    if (s.length > LIMITS.reply) throw new UserError(`Răspunsul poate avea cel mult ${LIMITS.reply} caractere.`);
    st.setReply.run(s, s ? now() : null, qu.id);
  }

  function questions(ev) {
    return st.questions.all(ev.id).map((qu) => ({
      id: qu.id, text: qu.text, author: qu.author, status: qu.status,
      highlighted: !!qu.highlighted, votes: qu.votes, at: qu.created_at, reply: qu.reply || '',
    }));
  }

  // ---------- state snapshots ----------

  function publicPoll(p, { withResults }) {
    const out = {
      id: p.id, type: p.type, question: p.question, status: p.status,
      options: p.config.options, multi: !!p.config.multi, scale: p.config.scale,
      maxEntries: p.config.maxEntries, timeLimit: p.config.timeLimit || 0,
      openedAt: p.opened_at, revealed: p.revealed, showResults: p.show_results,
      image: p.config.image || 0, labels: p.config.labels, hasRegion: Boolean(p.config.region),
    };
    if (p.type === 'quiz' && p.revealed) out.correct = p.config.correct;
    if (p.type === 'pin' && p.revealed && p.config.region) out.region = p.config.region;
    if (withResults) out.results = results(p);
    return out;
  }

  const sortQuestions = (list) => list.sort((a, b) => (b.highlighted - a.highlighted) || (b.votes - a.votes) || (b.at - a.at));

  function audienceState(ev) {
    const live = hydratePoll(st.livePoll.get(ev.id));
    const visible = sortQuestions(questions(ev).filter((x) => x.status === 'visible' || x.status === 'answered')).slice(0, 500);
    const round = ev.settings.testRound;
    return {
      event: { code: ev.code, name: ev.name, settings: ev.settings },
      poll: live ? publicPoll(live, { withResults: live.show_results || live.revealed }) : null,
      questions: visible,
      leaderboard: ev.settings.screen === 'leaderboard' ? leaderboard(ev, 10).map(({ id, ...r }) => r) : null,
      scenario: scenarioView(ev),
      // Test questions go out without the correct answers.
      test: round ? { round, questions: st.testPolls.all(ev.id).map(hydratePoll).map((p) => ({ id: p.id, question: p.question, options: p.config.options })) } : null,
    };
  }

  // Anyone with the event code can open the projector page, so an unrevealed quiz must not
  // tell them which answer the room is choosing.
  function presenterPoll(p) {
    const out = publicPoll(p, { withResults: true });
    if (p.type === 'quiz' && !p.revealed) out.results = { voters: out.results.voters, responses: out.results.responses };
    if (p.type === 'pin' && !p.revealed && out.results) delete out.results.inside;
    return out;
  }

  function presenterState(ev) {
    const live = hydratePoll(st.livePoll.get(ev.id));
    // The projected screen keeps showing the last poll after it closes.
    let shown = live;
    if (!shown) {
      const all = st.polls.all(ev.id).map(hydratePoll).filter((p) => p.opened_at);
      shown = all.sort((a, b) => b.opened_at - a.opened_at)[0] || null;
    }
    const visible = sortQuestions(questions(ev).filter((x) => x.status === 'visible')).slice(0, 30);
    return {
      event: { code: ev.code, name: ev.name, settings: ev.settings },
      poll: shown ? presenterPoll(shown) : null,
      questions: visible,
      leaderboard: leaderboard(ev, 10).map(({ id, ...r }) => r),
      test: ev.settings.screen === 'test' || ev.settings.testRound ? testReport(ev) : null,
      scenario: scenarioView(ev, { presenter: true }),
    };
  }

  function adminState(ev) {
    return {
      event: { code: ev.code, name: ev.name, settings: ev.settings, createdAt: ev.created_at },
      polls: st.polls.all(ev.id).map(hydratePoll).map((p) => ({
        ...publicPoll(p, { withResults: true }),
        correct: p.config.correct,
        region: p.config.region || null,
      })),
      questions: sortQuestions(questions(ev)),
      leaderboard: leaderboard(ev, 50).map(({ id, ...r }) => r),
      testQuestions: st.testPolls.all(ev.id).map(hydratePoll).map((p) => ({
        id: p.id, question: p.question, options: p.config.options, correct: p.config.correct,
      })),
      test: testReport(ev),
      certificates: st.certCount.get(ev.id).n,
      scenarios: listScenarios(ev),
      scenario: scenarioView(ev, { admin: true }),
      scenarioRuns: scenarioRuns(ev).slice(0, 10),
    };
  }

  function personalState(code, participantId) {
    const ev = requireEvent(code);
    const pid = participant(participantId);
    const votes = {};
    const test = { pre: {}, post: {} };
    for (const v of st.votesOfInEvent.all(ev.id, pid)) {
      if (v.round) test[v.round][v.poll_id] = JSON.parse(v.value)[0];
      else (votes[v.poll_id] ||= []).push(...JSON.parse(v.value));
    }
    const board = leaderboard(ev, Infinity);
    const mine = board.find((r) => r.id === pid);
    // A round's score is shown once that round is closed, so it can't be used to fix answers.
    const open = ev.settings.testRound;
    const cert = st.certOf.get(ev.id, pid);
    const sc = ev.settings.scenario;
    const myChoice = sc ? st.scenarioMine.get(sc.id, sc.run, sc.step, pid) : null;
    return {
      scenarioChoice: myChoice ? myChoice.choice : null,
      votes,
      upvotes: st.upvotesOf.all(ev.id, pid).map((r) => r.question_id),
      score: mine ? { rank: mine.rank, score: mine.score, correct: mine.correct, of: board.length, streak: mine.streak, best: mine.best } : null,
      test,
      testScore: {
        pre: open === 'pre' ? null : testScoreOf(ev, pid, 'pre'),
        post: open === 'post' ? null : testScoreOf(ev, pid, 'post'),
      },
      certificate: cert ? cert.id : null,
    };
  }

  // Everything the post-event report shows, in one snapshot.
  function reportData(ev) {
    const admin = adminState(ev);
    const ran = admin.polls.filter((p) => p.openedAt || p.results.responses > 0);
    const qs = admin.questions.filter((x) => x.status !== 'pending');
    return {
      event: { ...admin.event, issuer: ev.settings.certIssuer },
      generatedAt: now(),
      stats: {
        participants: st.participantsOf.get(ev.id, ev.id).n,
        polls: ran.length,
        responses: st.responsesOf.get(ev.id).n,
        questions: qs.length,
        upvotes: st.upvotesOfEvent.get(ev.id).n,
        certificates: admin.certificates,
      },
      polls: ran,
      questions: qs,
      leaderboard: admin.leaderboard.slice(0, 10),
      test: admin.test,
      testQuestions: admin.testQuestions,
      certificates: st.certsOfEvent.all(ev.id).map((c) => ({ id: c.id, name: c.name, score: c.score, issuedAt: c.issued_at })),
      scenarioRuns: scenarioRuns(ev),
    };
  }

  function exportRows(ev, lang = 'ro') {
    const en = lang === 'en';
    const rows = [en
      ? ['type', 'question', 'participant', 'name', 'answer', 'score', 'time']
      : ['tip', 'întrebare', 'participant', 'nume', 'răspuns', 'punctaj', 'moment']];
    for (const p of [...st.polls.all(ev.id), ...st.testPolls.all(ev.id)].map(hydratePoll)) {
      for (const v of st.votesByPoll.all(p.id)) {
        const value = JSON.parse(v.value);
        const answer = (p.type === 'choice' || p.type === 'quiz') ? value.map((i) => p.config.options[i]).join(' | ')
          : p.type === 'ranking' ? value.map((i) => p.config.options[i]).join(' > ')
            : p.type === 'scale' ? value.map((m, i) => `${p.config.options[i]}: ${m}`).join(' | ')
              : p.type === 'pin' ? `x=${value[0]} y=${value[1]}` : value.join(' | ');
        const type = p.kind === 'test' ? `test-${v.round}` : p.type;
        rows.push([type, p.question, v.participant_id.slice(0, 8), v.name, answer, p.type === 'quiz' ? v.score : '', new Date(v.created_at).toISOString()]);
      }
    }
    for (const qu of questions(ev)) {
      rows.push(['q&a', qu.text, '', qu.author, `${qu.votes} ${en ? 'votes' : 'voturi'} · ${qu.status}`, '', new Date(qu.at).toISOString()]);
    }
    return rows;
  }

  return {
    createEvent, getEvent, requireEvent, verifyAdmin, updateEvent, deleteEvent, changeCode, rotateAdminKey, listEvents, setLogo, removeLogo, getLogo,
    appSetting, setAppSetting, testReport, issueCertificate, certificateView, replyToQuestion, reportData,
    setPollImage, removePollImage, getPollImage,
    createScenario, deleteScenario, startScenario, scenarioVote, revealScenario, advanceScenario, backScenario, stopScenario, scenarioView, scenarioRuns,
    createPoll, createPolls, updatePoll, duplicatePoll, deletePoll, movePoll, setPollStatus, setShowResults, revealQuiz, resetPoll,
    vote, results, leaderboard,
    ask, toggleUpvote, moderate,
    audienceState, presenterState, adminState, personalState, exportRows,
  };
}

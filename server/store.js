// Domain logic: events, polls, votes, Q&A. Everything here is synchronous
// (node:sqlite) and knows nothing about HTTP or sockets.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export class UserError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const POLL_TYPES = ['choice', 'quiz', 'wordcloud', 'open', 'rating'];
const SCREENS = ['join', 'poll', 'qa', 'leaderboard'];

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
};

const DEFAULT_SETTINGS = {
  qaEnabled: true,
  qaModeration: false,
  closed: false,
  screen: 'join',
};

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
    deleteEvent: q('DELETE FROM events WHERE id = ?'),

    polls: q('SELECT * FROM polls WHERE event_id = ? ORDER BY position, id'),
    poll: q('SELECT * FROM polls WHERE id = ? AND event_id = ?'),
    livePoll: q("SELECT * FROM polls WHERE event_id = ? AND status = 'live' LIMIT 1"),
    maxPos: q('SELECT COALESCE(MAX(position), -1) AS m FROM polls WHERE event_id = ?'),
    insertPoll: q(`INSERT INTO polls (event_id, type, question, config, show_results, position, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`),
    updatePoll: q('UPDATE polls SET type = ?, question = ?, config = ?, show_results = ? WHERE id = ?'),
    setStatus: q('UPDATE polls SET status = ?, opened_at = ? WHERE id = ?'),
    closeLive: q("UPDATE polls SET status = 'closed' WHERE event_id = ? AND status = 'live'"),
    setShow: q('UPDATE polls SET show_results = ? WHERE id = ?'),
    setRevealed: q('UPDATE polls SET revealed = ? WHERE id = ?'),
    setPos: q('UPDATE polls SET position = ? WHERE id = ?'),
    deletePoll: q('DELETE FROM polls WHERE id = ?'),

    votesByPoll: q('SELECT * FROM votes WHERE poll_id = ? ORDER BY id'),
    votesOf: q('SELECT * FROM votes WHERE poll_id = ? AND participant_id = ? ORDER BY id'),
    votesOfInEvent: q(`SELECT v.poll_id, v.value FROM votes v JOIN polls p ON p.id = v.poll_id
                       WHERE p.event_id = ? AND v.participant_id = ? ORDER BY v.id`),
    insertVote: q('INSERT INTO votes (poll_id, participant_id, name, value, score, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    deleteVotesOf: q('DELETE FROM votes WHERE poll_id = ? AND participant_id = ?'),
    deleteVotes: q('DELETE FROM votes WHERE poll_id = ?'),
    voterCount: q('SELECT COUNT(DISTINCT participant_id) AS n FROM votes WHERE poll_id = ?'),
    leaderboard: q(`SELECT v.participant_id, MAX(v.name) AS name, SUM(v.score) AS score,
                           SUM(CASE WHEN v.score > 0 THEN 1 ELSE 0 END) AS correct
                    FROM votes v JOIN polls p ON p.id = v.poll_id
                    WHERE p.event_id = ? AND p.type = 'quiz' AND p.revealed = 1
                    GROUP BY v.participant_id
                    ORDER BY score DESC, MIN(v.created_at) ASC`),

    questions: q(`SELECT qu.*, (SELECT COUNT(*) FROM upvotes u WHERE u.question_id = qu.id) AS votes
                  FROM questions qu WHERE qu.event_id = ?`),
    question: q('SELECT * FROM questions WHERE id = ? AND event_id = ?'),
    insertQuestion: q(`INSERT INTO questions (event_id, participant_id, author, text, status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)`),
    setQuestion: q('UPDATE questions SET status = ?, highlighted = ? WHERE id = ?'),
    clearHighlight: q('UPDATE questions SET highlighted = 0 WHERE event_id = ?'),
    deleteQuestion: q('DELETE FROM questions WHERE id = ?'),
    upvote: q('INSERT OR IGNORE INTO upvotes (question_id, participant_id) VALUES (?, ?)'),
    unvote: q('DELETE FROM upvotes WHERE question_id = ? AND participant_id = ?'),
    hasUpvote: q('SELECT 1 FROM upvotes WHERE question_id = ? AND participant_id = ?'),
    upvotesOf: q(`SELECT u.question_id FROM upvotes u JOIN questions qu ON qu.id = u.question_id
                  WHERE qu.event_id = ? AND u.participant_id = ?`),
    recentQuestionsOf: q('SELECT COUNT(*) AS n FROM questions WHERE event_id = ? AND participant_id = ? AND created_at > ?'),
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
    return { ...row, settings: { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings) } };
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
    for (const k of ['qaEnabled', 'qaModeration', 'closed']) {
      if (k in settings) next[k] = Boolean(settings[k]);
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
    if (type === 'rating') config.scale = int(data.scale, 3, 10, 5);
    if (type === 'wordcloud') config.maxEntries = int(data.maxEntries, 1, LIMITS.maxEntries, 3);
    if (type === 'open') config.maxEntries = int(data.maxEntries, 1, LIMITS.maxEntries, 1);
    const showResults = type === 'quiz' ? false : data.showResults !== false;
    return { type, question, config, showResults };
  }

  function createPoll(ev, data) {
    const p = cleanPoll(data);
    const pos = st.maxPos.get(ev.id).m + 1;
    const r = st.insertPoll.run(ev.id, p.type, p.question, JSON.stringify(p.config), p.showResults ? 1 : 0, pos, now());
    return Number(r.lastInsertRowid);
  }

  function createPolls(ev, list) {
    if (!Array.isArray(list) || !list.length) throw new UserError('Nu am găsit nicio întrebare de importat.');
    // Validate everything first so a typo in question 12 doesn't leave 11 half-imported.
    list.forEach((data, i) => {
      try { cleanPoll(data); } catch (e) { throw new UserError(`Întrebarea ${i + 1}: ${e.message}`); }
    });
    return tx(() => list.map((data) => createPoll(ev, data)));
  }

  function updatePoll(ev, pollId, data) {
    const existing = requirePoll(ev, pollId);
    const p = cleanPoll(data);
    const hasVotes = st.voterCount.get(existing.id).n > 0;
    if (hasVotes && (p.type !== existing.type || optionsChanged(existing, p))) {
      throw new UserError('Sondajul are deja răspunsuri. Resetează-l înainte să schimbi tipul sau opțiunile.');
    }
    st.updatePoll.run(p.type, p.question, JSON.stringify(p.config), p.showResults ? 1 : 0, existing.id);
    if (existing.type === 'quiz' && existing.revealed) rescoreQuiz(requirePoll(ev, pollId));
  }

  function optionsChanged(a, b) {
    return JSON.stringify(a.config.options || []) !== JSON.stringify(b.config.options || [])
      || (a.config.scale || 0) !== (b.config.scale || 0);
  }

  function duplicatePoll(ev, pollId) {
    const p = requirePoll(ev, pollId);
    return createPoll(ev, {
      type: p.type, question: p.question, ...p.config, showResults: p.show_results,
    });
  }

  function deletePoll(ev, pollId) {
    st.deletePoll.run(requirePoll(ev, pollId).id);
  }

  function movePoll(ev, pollId, direction) {
    const list = st.polls.all(ev.id);
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
    if (p.type !== 'quiz') throw new UserError('Doar quiz-urile au răspuns corect.');
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
    if (p.status !== 'live') throw new UserError('Sondajul nu mai primește răspunsuri.');
    const at = now();
    const nick = nickname(name);
    const existing = st.votesOf.all(p.id, pid);

    switch (p.type) {
      case 'choice': {
        const picks = [...new Set((Array.isArray(raw) ? raw : [raw]).map(Number))]
          .filter((i) => Number.isInteger(i) && i >= 0 && i < p.config.options.length);
        if (!picks.length) throw new UserError('Alege o opțiune.');
        if (!p.config.multi && picks.length > 1) throw new UserError('Poți alege o singură opțiune.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify(picks.sort((a, b) => a - b)), 0, at);
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
        st.insertVote.run(p.id, pid, nick, JSON.stringify([pick]), quizScore(p, [pick], at), at);
        break;
      }
      case 'rating': {
        const n = Number(Array.isArray(raw) ? raw[0] : raw);
        if (!Number.isInteger(n) || n < 1 || n > p.config.scale) throw new UserError('Notă invalidă.');
        tx(() => {
          st.deleteVotesOf.run(p.id, pid);
          st.insertVote.run(p.id, pid, nick, JSON.stringify([n]), 0, at);
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
        st.insertVote.run(p.id, pid, nick, JSON.stringify([s]), 0, at);
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
    }
    return out;
  }

  function leaderboard(ev, limit = 50) {
    return st.leaderboard.all(ev.id).slice(0, limit).map((r, i) => ({
      rank: i + 1, name: r.name || 'Anonim', score: r.score, correct: r.correct, id: r.participant_id,
    }));
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

  function questions(ev) {
    return st.questions.all(ev.id).map((qu) => ({
      id: qu.id, text: qu.text, author: qu.author, status: qu.status,
      highlighted: !!qu.highlighted, votes: qu.votes, at: qu.created_at,
    }));
  }

  // ---------- state snapshots ----------

  function publicPoll(p, { withResults }) {
    const out = {
      id: p.id, type: p.type, question: p.question, status: p.status,
      options: p.config.options, multi: !!p.config.multi, scale: p.config.scale,
      maxEntries: p.config.maxEntries, timeLimit: p.config.timeLimit || 0,
      openedAt: p.opened_at, revealed: p.revealed, showResults: p.show_results,
    };
    if (p.type === 'quiz' && p.revealed) out.correct = p.config.correct;
    if (withResults) out.results = results(p);
    return out;
  }

  const sortQuestions = (list) => list.sort((a, b) => (b.highlighted - a.highlighted) || (b.votes - a.votes) || (b.at - a.at));

  function audienceState(ev) {
    const live = hydratePoll(st.livePoll.get(ev.id));
    const visible = sortQuestions(questions(ev).filter((x) => x.status === 'visible' || x.status === 'answered')).slice(0, 500);
    return {
      event: { code: ev.code, name: ev.name, settings: ev.settings },
      poll: live ? publicPoll(live, { withResults: live.show_results || live.revealed }) : null,
      questions: visible,
      leaderboard: ev.settings.screen === 'leaderboard' ? leaderboard(ev, 10).map(({ id, ...r }) => r) : null,
    };
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
      poll: shown ? publicPoll(shown, { withResults: true }) : null,
      questions: visible,
      leaderboard: leaderboard(ev, 10).map(({ id, ...r }) => r),
    };
  }

  function adminState(ev) {
    return {
      event: { code: ev.code, name: ev.name, settings: ev.settings, createdAt: ev.created_at },
      polls: st.polls.all(ev.id).map(hydratePoll).map((p) => ({
        ...publicPoll(p, { withResults: true }),
        correct: p.config.correct,
      })),
      questions: sortQuestions(questions(ev)),
      leaderboard: leaderboard(ev, 50).map(({ id, ...r }) => r),
    };
  }

  function personalState(code, participantId) {
    const ev = requireEvent(code);
    const pid = participant(participantId);
    const votes = {};
    for (const v of st.votesOfInEvent.all(ev.id, pid)) {
      (votes[v.poll_id] ||= []).push(...JSON.parse(v.value));
    }
    const board = leaderboard(ev, Infinity);
    const mine = board.find((r) => r.id === pid);
    return {
      votes,
      upvotes: st.upvotesOf.all(ev.id, pid).map((r) => r.question_id),
      score: mine ? { rank: mine.rank, score: mine.score, correct: mine.correct, of: board.length } : null,
    };
  }

  function exportRows(ev) {
    const rows = [['tip', 'întrebare', 'participant', 'nume', 'răspuns', 'punctaj', 'moment']];
    for (const p of st.polls.all(ev.id).map(hydratePoll)) {
      for (const v of st.votesByPoll.all(p.id)) {
        const value = JSON.parse(v.value);
        const answer = (p.type === 'choice' || p.type === 'quiz') ? value.map((i) => p.config.options[i]).join(' | ') : value.join(' | ');
        rows.push([p.type, p.question, v.participant_id.slice(0, 8), v.name, answer, p.type === 'quiz' ? v.score : '', new Date(v.created_at).toISOString()]);
      }
    }
    for (const qu of questions(ev)) {
      rows.push(['q&a', qu.text, '', qu.author, `${qu.votes} voturi · ${qu.status}`, '', new Date(qu.at).toISOString()]);
    }
    return rows;
  }

  return {
    createEvent, getEvent, requireEvent, verifyAdmin, updateEvent, deleteEvent,
    createPoll, createPolls, updatePoll, duplicatePoll, deletePoll, movePoll, setPollStatus, setShowResults, revealQuiz, resetPoll,
    vote, results, leaderboard,
    ask, toggleUpvote, moderate,
    audienceState, presenterState, adminState, personalState, exportRows,
  };
}

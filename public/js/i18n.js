// Romanian / English. The Romanian text is the key, so the source stays readable and a
// missing English entry falls back to Romanian instead of showing a code.

const EN = {
  // shared
  'Sondaj': 'Poll',
  'Întrebări': 'Questions',
  'Live': 'Live',
  'Închis': 'Closed',
  'Ciornă': 'Draft',
  'Trimite': 'Send',
  'Anonim': 'Anonymous',
  'Rezultate': 'Results',
  'Copiat.': 'Copied.',
  'Copiază': 'Copy',
  'Nu am putut copia.': 'Could not copy.',
  'Salvat.': 'Saved.',
  'Pagina principală': 'Home page',
  'Înapoi la pagina principală': 'Back to the home page',
  'Evenimentul a fost șters.': 'The event has been deleted.',
  'Conexiunea nu răspunde. Încearcă din nou.': 'The connection is not responding. Try again.',
  'Conexiune pierdută — reîncerc…': 'Connection lost, reconnecting…',
  'Alegere multiplă': 'Multiple choice',
  'Quiz': 'Quiz',
  'Word cloud': 'Word cloud',
  'Text liber': 'Open text',
  'Evaluare': 'Rating',
  'Rezultatele sunt ascunse.': 'Results are hidden.',
  'din {scale}': 'out of {scale}',
  'Încă nu există cuvinte.': 'No words yet.',
  'Încă nu există răspunsuri.': 'No answers yet.',
  '🏆 Clasament': '🏆 Leaderboard',
  'Întrebări din public': 'Audience questions',

  // landing
  'Interacțiune live cu publicul': 'Live interaction with your audience',
  'Sondaje, quiz-uri, word cloud și întrebări din sală. Gratuit, fără cont, fără limită de întrebări sau participanți.':
    'Polls, quizzes, word clouds and audience questions. Free, no account, no limit on questions or participants.',
  'Participi la un eveniment?': 'Joining an event?',
  'Intră': 'Join',
  'Codul evenimentului': 'Event code',
  'COD': 'CODE',
  'Organizezi un eveniment?': 'Running an event?',
  'Numele evenimentului': 'Event name',
  'ex. Conferința anuală 2026': 'e.g. Annual Conference 2026',
  'Creează evenimentul': 'Create event',
  'Evenimentele tale pe acest dispozitiv': 'Your events on this device',
  'Administrează': 'Manage',
  'Sondaje': 'Polls',
  'Alegere simplă sau multiplă, evaluări cu stele, word cloud și răspunsuri libere.': 'Single or multiple choice, star ratings, word clouds and open answers.',
  'Răspuns corect, cronometru, punctaj după viteză și clasament.': 'Correct answer, timer, speed-based scoring and a leaderboard.',
  'Q&A': 'Q&A',
  'Întrebări din public, voturi, moderare, evidențiere pe ecran.': 'Audience questions, upvotes, moderation, spotlight on screen.',
  'Ecran de proiecție': 'Projector screen',
  'Cod QR, rezultate live și clasament pentru proiector.': 'QR code, live results and leaderboard for the projector.',
  'Nu există niciun eveniment cu acest cod.': 'There is no event with this code.',
  'Nu am putut crea evenimentul.': 'Could not create the event.',

  // participant
  'Adaugă numele ✎': 'Add your name ✎',
  'Trimiți ca {name}': 'Sending as {name}',
  'Trimiți anonim': 'Sending anonymously',
  'Numele tău (opțional, apare la quiz și la întrebări):': 'Your name (optional, shown on the quiz and with your questions):',
  'Evenimentul s-a încheiat': 'The event has ended',
  'Niciun sondaj activ acum': 'No active poll right now',
  'Mulțumim pentru participare!': 'Thank you for taking part!',
  'Pagina se actualizează singură când începe următorul.': 'This page updates by itself when the next one starts.',
  'Răspuns trimis. Rezultatele apar pe ecran.': 'Answer sent. Results appear on the screen.',
  'Schimbă răspunsul': 'Change answer',
  'Atinge o opțiune pentru a vota. Poți schimba răspunsul cât timp sondajul e deschis.': 'Tap an option to vote. You can change your answer while the poll is open.',
  'Alege cel puțin o opțiune.': 'Choose at least one option.',
  'Poți alege mai multe opțiuni.': 'You can choose several options.',
  'Nu ai răspuns la această întrebare.': 'You did not answer this question.',
  'Corect! 🎉': 'Correct! 🎉',
  'Greșit.': 'Wrong.',
  'Locul {rank} din {of} · {score} puncte': 'Place {rank} of {of} · {score} points',
  'Răspuns înregistrat. Așteaptă dezvăluirea răspunsului corect.': 'Answer recorded. Wait for the correct answer to be revealed.',
  'Timpul a expirat.': 'Time is up.',
  'Ai un singur răspuns. Cu cât răspunzi mai repede, cu atât primești mai multe puncte.': 'You get one answer. The faster you answer, the more points you get.',
  'Nota {n}': 'Score {n}',
  '1 = cel mai puțin, {scale} = cel mai mult': '1 = least, {scale} = most',
  'Mulțumim! Ai trimis toate cuvintele.': 'Thanks! You have sent all your words.',
  'Mulțumim pentru răspuns!': 'Thanks for your answer!',
  'Un cuvânt sau o expresie scurtă': 'A word or a short phrase',
  'Răspunsul tău…': 'Your answer…',
  'Mai poți trimite {n}': 'You can send {n} more',
  'Încă nu există punctaje.': 'No scores yet.',
  'Tu: locul {rank} din {of} · {score} puncte': 'You: place {rank} of {of} · {score} points',
  'Întrebarea a fost trimisă moderatorului.': 'Your question was sent to the moderator.',
  'Întrebarea a fost publicată.': 'Your question has been published.',
  'Încă nu există întrebări. Fii primul!': 'No questions yet. Be the first!',
  'Votează întrebarea': 'Upvote this question',
  ' · pe ecran acum': ' · on screen now',
  ' · răspuns': ' · answered',
  'Pune o întrebare': 'Ask a question',
  'Scrie întrebarea ta…': 'Type your question…',
  'Populare': 'Popular',
  'Recente': 'Recent',

  // presenter
  'Intră pe': 'Go to',
  'online': 'online',
  'Cod QR pentru {url}': 'QR code for {url}',
  'Intră pe {url} sau scanează codul': 'Go to {url} or scan the code',
  'Intră pe {url}': 'Go to {url}',
  'apasă F pentru ecran complet': 'press F for full screen',
  'Niciun sondaj încă': 'No poll yet',
  '{n} au răspuns': '{n} answered',
  'Trimite întrebările tale de pe telefon.': 'Send your questions from your phone.',
  'Clasamentul apare după primul quiz.': 'The leaderboard appears after the first quiz.',

  // admin
  'Lipsește cheia de administrare. Deschide linkul de administrare primit la crearea evenimentului.': 'The admin key is missing. Open the admin link you got when you created the event.',
  'Codul de intrare': 'Join code',
  'Sondajul': 'The poll',
  'Întrebările': 'The questions',
  'Clasamentul': 'The leaderboard',
  'Participanți': 'Participants',
  'Administrare (secret!)': 'Admin (secret!)',
  'Cine are linkul de administrare controlează evenimentul. Nu-l proiecta și nu-l trimite participanților.': 'Whoever has the admin link controls the event. Do not project it or send it to participants.',
  'Niciun sondaj încă.': 'No polls yet.',
  'Creează primul sondaj sau quiz cu butonul de mai sus.': 'Create your first poll or quiz with the button above.',
  '■ Oprește': '■ Stop',
  '▶ Redeschide': '▶ Reopen',
  '▶ Pornește': '▶ Start',
  'Ascunde răspunsul': 'Hide answer',
  'Dezvăluie răspunsul': 'Reveal answer',
  'Ascunde rezultatele de public': 'Hide results from audience',
  'Arată rezultatele publicului': 'Show results to audience',
  'Editează': 'Edit',
  'Duplică': 'Duplicate',
  'Resetează': 'Reset',
  'Șterge': 'Delete',
  'Mută sus': 'Move up',
  'Mută jos': 'Move down',
  'Ștergi toate răspunsurile acestui sondaj?': 'Delete all answers to this poll?',
  'Ștergi sondajul și răspunsurile lui?': 'Delete this poll and its answers?',
  'Rezultate · {voters}': 'Results · {voters}',
  '{n} în așteptare': '{n} pending',
  'În așteptare': 'Pending',
  'Publicate': 'Published',
  'Răspunse': 'Answered',
  'Arhivate': 'Archived',
  'Nimic aici.': 'Nothing here.',
  'Publică': 'Publish',
  'Arhivează': 'Archive',
  'Scoate de pe ecran': 'Remove from screen',
  'Pe ecran': 'On screen',
  'Marcat ca răspuns': 'Mark as answered',
  'Readu în listă': 'Restore',
  'Ștergi întrebarea?': 'Delete this question?',
  '{rank}. {name}': '{rank}. {name}',
  '{score} · {correct} corecte': '{score} · {correct} correct',
  'Clasamentul apare după ce dezvălui răspunsul unui quiz.': 'The leaderboard appears after you reveal a quiz answer.',
  'Scrie codul evenimentului ({code}) ca să confirmi ștergerea definitivă:': 'Type the event code ({code}) to confirm permanent deletion:',
  'Exportul a eșuat.': 'Export failed.',
  'Editează sondajul': 'Edit poll',
  'Sondaj nou': 'New poll',
  'Tip': 'Type',
  'Întrebarea': 'Question',
  'Opțiuni (bifează răspunsul corect)': 'Options (tick the correct answer)',
  'Opțiuni': 'Options',
  'Opțiunea {n} e corectă': 'Option {n} is correct',
  'Opțiunea {n}': 'Option {n}',
  'Elimină opțiunea': 'Remove option',
  '+ Opțiune': '+ Option',
  'Se pot alege mai multe opțiuni': 'Allow several options',
  'Timp de răspuns (secunde, 0 = fără limită)': 'Time to answer (seconds, 0 = no limit)',
  'Scală': 'Scale',
  'Răspunsuri permise per participant': 'Answers allowed per participant',
  'Publicul vede rezultatele după ce răspunde': 'Audience sees results after answering',
  'Salvează': 'Save',
  'Creează': 'Create',
  'Creează și pornește': 'Create and start',
  'Import în bloc': 'Bulk import',
  'Cum scriu întrebările?': 'How do I write the questions?',
  'Un rând liber între întrebări.': 'One blank line between questions.',
  'Opțiunile încep cu „-”. Opțiunea corectă cu „*” → devine quiz. „[30s]” la finalul întrebării = cronometru.': 'Options start with "-". Mark the correct option with "*" to make it a quiz. "[30s]" at the end of the question adds a timer.',
  '„[multiplu]” = se pot alege mai multe opțiuni.': '"[multi]" = several options can be chosen.',
  '„[nor]” = word cloud, „[nota 5]” sau „[nota 10]” = evaluare.': '"[cloud]" = word cloud, "[rating 5]" or "[rating 10]" = rating.',
  'Întrebare fără opțiuni = răspuns liber.': 'A question without options = open answer.',
  'Pune exemplul': 'Insert example',
  'Lipește întrebările mai sus.': 'Paste your questions above.',
  'Importă': 'Import',
  '(fără text)': '(no text)',
  ' · {n} opțiuni': ' · {n} options',
  'Am importat {n} întrebări.': 'Imported {n} questions.',
  'Am importat o întrebare.': 'Imported one question.',
  'Sondaje și quiz-uri': 'Polls and quizzes',
  '+ Sondaj nou': '+ New poll',
  'Ecranul proiectat arată': 'The projector shows',
  'Linkuri': 'Links',
  'Q&A activat': 'Q&A on',
  'Moderare înainte de publicare': 'Moderate before publishing',
  '🏆 Clasament quiz': '🏆 Quiz leaderboard',
  'Eveniment': 'Event',
  'Redenumește': 'Rename',
  'Eveniment închis (nu mai primește răspunsuri)': 'Event closed (no more answers)',
  'Șterge evenimentul definitiv': 'Delete event permanently',
  'Ecran de proiecție ↗': 'Projector screen ↗',
  'Export CSV': 'Export CSV',
  'Participanți conectați acum': 'Participants connected now',
  '● {n} online': '● {n} online',
};

const PLURALS = {
  ro: { participant: ['participant', 'participanți'], answer: ['răspuns', 'răspunsuri'] },
  en: { participant: ['participant', 'participants'], answer: ['answer', 'answers'] },
};

function detect() {
  try {
    const saved = localStorage.getItem('quizy:lang');
    if (saved === 'ro' || saved === 'en') return saved;
  } catch { /* private mode */ }
  return (navigator.language || '').toLowerCase().startsWith('ro') ? 'ro' : 'en';
}

export const lang = detect();
document.documentElement.lang = lang;

export function t(text, vars = {}) {
  const template = lang === 'en' ? (EN[text] ?? text) : text;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function plural(n, word) {
  const [one, many] = PLURALS[lang][word];
  return `${n} ${n === 1 ? one : many}`;
}

// Static HTML: <x data-i18n>Romanian text</x>, plus data-i18n-placeholder / -aria / -title.
export function translatePage(root = document) {
  document.body.dataset.offline = t('Conexiune pierdută — reîncerc…');
  if (lang === 'ro') return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim());
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr === 'aria-label' ? 'aria' : attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(attr)));
    }
  }
}

export function langSwitch() {
  const other = lang === 'ro' ? 'en' : 'ro';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sm lang-switch';
  btn.textContent = other.toUpperCase();
  btn.title = other === 'en' ? 'English' : 'Română';
  btn.setAttribute('aria-label', other === 'en' ? 'Switch to English' : 'Schimbă în română');
  btn.addEventListener('click', () => {
    try { localStorage.setItem('quizy:lang', other); } catch { /* private mode */ }
    location.reload();
  });
  return btn;
}

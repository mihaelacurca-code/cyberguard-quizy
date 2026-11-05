// English versions of the messages the server sends back. Errors are raised in Romanian
// (the store and its tests speak Romanian); this table translates them on the way out.

const LABELS = {
  'Numele evenimentului': 'The event name',
  'Întrebarea': 'The question',
  'Opțiunea': 'The option',
  'Răspunsul': 'The answer',
};

const label = (ro) => LABELS[ro] || ro;

const RULES = [
  [/^Întrebarea (\d+): (.+)$/s, (m) => `Question ${m[1]}: ${toEnglish(m[2])}`],
  [/^(.+) lipsește\.$/, (m) => `${label(m[1])} is missing.`],
  [/^(.+) poate avea cel mult (\d+) caractere\.$/, (m) => `${label(m[1])} can be at most ${m[2]} characters.`],
  [/^Cel mult (\d+) opțiuni\.$/, (m) => `At most ${m[1]} options.`],
  [/^Poți trimite cel mult (\d+) răspunsuri\.$/, (m) => `You can send at most ${m[1]} answers.`],
];

const EXACT = {
  'Intră mai întâi în eveniment.': 'Join the event first.',
  'Deja conectat.': 'Already connected.',
  'Rol necunoscut.': 'Unknown role.',
  'Prea multe încercări greșite. Încearcă peste câteva minute.': 'Too many wrong attempts. Try again in a few minutes.',
  'Cheie de administrare invalidă.': 'Invalid admin key.',
  'Evenimentul nu există.': 'This event does not exist.',
  'Prea multe conectări din această rețea. Încearcă puțin mai târziu.': 'Too many connections from this network. Try again a little later.',
  'Prea multe întrebări din această rețea. Încearcă peste un minut.': 'Too many questions from this network. Try again in a minute.',
  'Acces interzis.': 'Access denied.',
  'Acțiune necunoscută.': 'Unknown action.',
  'Prea multe acțiuni. Încetinește puțin.': 'Too many actions. Slow down a little.',
  'Eroare internă.': 'Internal error.',
  'Identificator de participant invalid.': 'Invalid participant ID.',
  'Ecran necunoscut.': 'Unknown screen.',
  'Sondajul nu există.': 'This poll does not exist.',
  'Tip de sondaj necunoscut.': 'Unknown poll type.',
  'Adaugă cel puțin două opțiuni.': 'Add at least two options.',
  'Marchează răspunsul corect.': 'Mark the correct answer.',
  'Nu am găsit nicio întrebare de importat.': 'No questions found to import.',
  'Sondajul are deja răspunsuri. Resetează-l înainte să schimbi tipul sau opțiunile.': 'This poll already has answers. Reset it before changing its type or options.',
  'Stare necunoscută.': 'Unknown status.',
  'Doar quiz-urile au răspuns corect.': 'Only quizzes have a correct answer.',
  'Evenimentul este închis.': 'The event is closed.',
  'Sondajul nu mai primește răspunsuri.': 'This poll is no longer accepting answers.',
  'Alege o opțiune.': 'Choose an option.',
  'Poți alege o singură opțiune.': 'You can choose only one option.',
  'Răspunsul corect a fost deja dezvăluit.': 'The correct answer has already been revealed.',
  'Ai răspuns deja.': 'You have already answered.',
  'Timpul a expirat.': 'Time is up.',
  'Notă invalidă.': 'Invalid score.',
  'Întrebările sunt dezactivate.': 'Questions are turned off.',
  'Prea multe întrebări într-un minut. Încearcă puțin mai târziu.': 'Too many questions in one minute. Try again a little later.',
  'Întrebarea nu mai este disponibilă.': 'This question is no longer available.',
  'Întrebarea nu există.': 'This question does not exist.',
  'Prea multe evenimente create într-o oră.': 'Too many events created in one hour.',
  'Prea multe coduri greșite. Încearcă peste câteva minute.': 'Too many wrong codes. Try again in a few minutes.',
  'Prea multe încercări.': 'Too many attempts.',
  'Nu există niciun eveniment cu acest cod.': 'There is no event with this code.',
  'Nu există.': 'Not found.',
};

export function toEnglish(message) {
  if (EXACT[message]) return EXACT[message];
  for (const [re, fn] of RULES) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}

export const pickLang = (value) => (String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ro');

export const localize = (message, lang) => (lang === 'en' ? toEnglish(message) : message);

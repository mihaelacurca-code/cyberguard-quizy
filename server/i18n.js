// English versions of the messages the server sends back. Errors are raised in Romanian
// (the store and its tests speak Romanian); this table translates them on the way out.

const LABELS = {
  'Numele evenimentului': 'The event name',
  'Întrebarea': 'The question',
  'Opțiunea': 'The option',
  'Răspunsul': 'The answer',
  'Emitentul': 'The issuer',
};

const label = (ro) => LABELS[ro] || ro;

const RULES = [
  [/^Întrebarea (\d+): (.+)$/s, (m) => `Question ${m[1]}: ${toEnglish(m[2])}`],
  // scenario text errors: "Rândul 12: …" plus the part after it
  [/^Rândul (\d+): (.+)$/s, (m) => `Line ${m[1]}: ${toEnglish(m[2])}`],
  [/^numele pasului „(.+)” poate conține doar litere, cifre, „-” și „_”\.$/, (m) => `the step name "${m[1]}" may only contain letters, digits, "-" and "_".`],
  [/^pasul „(.+)” există deja\.$/, (m) => `step "${m[1]}" already exists.`],
  [/^opțiunea trebuie să spună spre ce pas duce, de exemplu „- Izolăm rețeaua -> izolare”\.$/, () => 'the option must say which step it leads to, for example "- Isolate the network -> isolate".'],
  [/^scenariul trebuie să înceapă cu un pas \(„## start: Titlu”\)\.$/, () => 'the scenario must start with a step ("## start: Title").'],
  [/^titlul pasului e prea lung \(cel mult (\d+) de caractere\)\.$/, (m) => `the step title is too long (at most ${m[1]} characters).`],
  [/^opțiunea nu are text\.$/, () => 'the option has no text.'],
  [/^textul opțiunii e prea lung\.$/, () => 'the option text is too long.'],
  [/^pasul „(.+)” nu există în scenariu\.$/, (m) => `step "${m[1]}" does not exist in the scenario.`],
  [/^Pasul „(.+)”: descrierea e prea lungă \(cel mult (\d+) de caractere\)\.$/, (m) => `Step "${m[1]}": the description is too long (at most ${m[2]} characters).`],
  [/^Pasul „(.+)” are o singură opțiune\. Adaugă încă una, sau niciuna dacă e un final\.$/, (m) => `Step "${m[1]}" has only one option. Add another, or none if it is an ending.`],
  [/^Pasul „(.+)” are prea multe opțiuni \(cel mult (\d+)\)\.$/, (m) => `Step "${m[1]}" has too many options (at most ${m[2]}).`],
  [/^Un scenariu poate avea cel mult (\d+) de pași\.$/, (m) => `A scenario can have at most ${m[1]} steps.`],
  [/^(.+) lipsește\.$/, (m) => `${label(m[1])} is missing.`],
  [/^(.+) poate avea cel mult (\d+) caractere\.$/, (m) => `${label(m[1])} can be at most ${m[2]} characters.`],
  [/^Cel mult (\d+) opțiuni\.$/, (m) => `At most ${m[1]} options.`],
  [/^Poți trimite cel mult (\d+) răspunsuri\.$/, (m) => `You can send at most ${m[1]} answers.`],
  [/^Certificatul cere cel puțin (\d+)% la testul final\.$/, (m) => `The certificate requires at least ${m[1]}% on the final test.`],
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
  'Etapă de test necunoscută.': 'Unknown test round.',
  'Adaugă întâi întrebări în test.': 'Add questions to the test first.',
  'Codul trebuie să aibă 3–20 litere sau cifre, fără spații.': 'The code must have 3–20 letters or digits, without spaces.',
  'Codul este deja folosit de alt eveniment.': 'This code is already used by another event.',
  'Testul acceptă doar întrebări cu răspuns corect.': 'The test accepts only questions with a correct answer.',
  'Întrebările de test se deschid împreună, din secțiunea Test.': 'Test questions open together, from the Test section.',
  'Testul nu este deschis acum.': 'The test is not open right now.',
  'Certificatele nu sunt activate pentru acest eveniment.': 'Certificates are not enabled for this event.',
  'Scrie-ți numele complet pentru certificat.': 'Enter your full name for the certificate.',
  'Răspunde întâi la cel puțin o activitate din eveniment.': 'Take part in at least one activity of the event first.',
  'Autentifică-te în panoul de administrare.': 'Sign in to the admin panel.',
  'Crearea de evenimente este rezervată administratorilor.': 'Only administrators can create events on this server.',
  'Certificatul nu există.': 'This certificate does not exist.',
  'Panoul de administrare nu este configurat pe acest server.': 'The admin panel is not set up on this server.',
  'Parolă greșită.': 'Wrong password.',
  'Scenariul nu are niciun pas („## start: Titlu”).': 'The scenario has no steps ("## start: Title").',
  'Primul pas trebuie să aibă opțiuni de vot.': 'The first step must have options to vote on.',
  'Scenariul nu are niciun final (un pas fără opțiuni).': 'The scenario has no ending (a step without options).',
  'Scenariul nu există.': 'This scenario does not exist.',
  'Niciun scenariu nu rulează acum.': 'No scenario is running right now.',
  'Votul pentru acest pas s-a încheiat.': 'Voting on this step has closed.',
  'Nimeni n-a votat încă. Alege tu ramura sau așteaptă voturile.': 'Nobody has voted yet. Choose the branch yourself or wait for votes.',
  'Scenariul s-a încheiat.': 'The scenario has ended.',
  'Ești deja la primul pas.': 'You are already at the first step.',
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

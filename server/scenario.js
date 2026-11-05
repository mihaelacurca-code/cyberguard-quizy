// Tabletop scenarios written as plain text and parsed into a graph of steps.
//
//   # Ransomware la clinică                     ← scenario title (optional)
//
//   ## start: Luni, 08:10                       ← step "start" (the first step is where it begins)
//   Recepția anunță că ecranele afișează un mesaj de răscumpărare.
//   * Izolăm rețeaua -> izolare | Oprește răspândirea.      ← "*" marks the recommended decision
//   - Plătim imediat -> plata | Plata nu garantează nimic.   ← "| …" is the explanation shown on reveal
//
//   ## plata: [-] Datele nu s-au mai întors      ← no options = an ending; [+] good, [-] bad
//   Text of the ending.
import { UserError } from './store.js';

export const SCENARIO_LIMITS = { steps: 60, options: 6, title: 160, text: 2000, label: 200, feedback: 600 };

const KEY = /^[\p{L}\p{N}_-]{1,40}$/u;

export function parseScenario(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const steps = [];
  let cur = null;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const at = `Rândul ${i + 1}`;
    if (!line) { if (cur) cur.text.push(''); return; }
    if (/^#(?!#)/.test(line)) { title = line.replace(/^#\s*/, ''); return; }
    if (line.startsWith('##')) {
      const body = line.replace(/^##\s*/, '');
      const m = body.match(/^([^:]{1,40}):\s*(.*)$/);
      let key = m ? m[1].trim().toLowerCase() : `pas${steps.length + 1}`;
      let stepTitle = (m ? m[2] : body).trim();
      if (!KEY.test(key)) throw new UserError(`${at}: numele pasului „${key}” poate conține doar litere, cifre, „-” și „_”.`);
      let outcome = null;
      const o = stepTitle.match(/^\[([+-])\]\s*/);
      if (o) { outcome = o[1] === '+' ? 'good' : 'bad'; stepTitle = stepTitle.slice(o[0].length); }
      if (!stepTitle) stepTitle = key;
      if (steps.some((s) => s.key === key)) throw new UserError(`${at}: pasul „${key}” există deja.`);
      cur = { key, title: stepTitle, text: [], options: [], outcome, line: i + 1 };
      steps.push(cur);
      return;
    }
    const opt = line.match(/^([-*•])\s*(.+)$/);
    if (opt && cur) {
      const [main, ...fb] = opt[2].split('|');
      const arrow = main.match(/^(.*?)\s*(?:->|→)\s*([^\s]+)\s*$/);
      if (!arrow) throw new UserError(`${at}: opțiunea trebuie să spună spre ce pas duce, de exemplu „- Izolăm rețeaua -> izolare”.`);
      cur.options.push({
        label: arrow[1].trim(),
        next: arrow[2].trim().toLowerCase(),
        good: opt[1] === '*',
        feedback: fb.join('|').trim(),
        line: i + 1,
      });
      return;
    }
    if (!cur) throw new UserError(`${at}: scenariul trebuie să înceapă cu un pas („## start: Titlu”).`);
    cur.text.push(line);
  });

  if (!steps.length) throw new UserError('Scenariul nu are niciun pas („## start: Titlu”).');
  if (steps.length > SCENARIO_LIMITS.steps) throw new UserError(`Un scenariu poate avea cel mult ${SCENARIO_LIMITS.steps} de pași.`);
  const keys = new Set(steps.map((s) => s.key));
  for (const s of steps) {
    s.text = s.text.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (s.title.length > SCENARIO_LIMITS.title) throw new UserError(`Rândul ${s.line}: titlul pasului e prea lung (cel mult ${SCENARIO_LIMITS.title} de caractere).`);
    if (s.text.length > SCENARIO_LIMITS.text) throw new UserError(`Pasul „${s.key}”: descrierea e prea lungă (cel mult ${SCENARIO_LIMITS.text} de caractere).`);
    if (s.options.length === 1) throw new UserError(`Pasul „${s.key}” are o singură opțiune. Adaugă încă una, sau niciuna dacă e un final.`);
    if (s.options.length > SCENARIO_LIMITS.options) throw new UserError(`Pasul „${s.key}” are prea multe opțiuni (cel mult ${SCENARIO_LIMITS.options}).`);
    for (const o of s.options) {
      if (!o.label) throw new UserError(`Rândul ${o.line}: opțiunea nu are text.`);
      if (o.label.length > SCENARIO_LIMITS.label || o.feedback.length > SCENARIO_LIMITS.feedback) throw new UserError(`Rândul ${o.line}: textul opțiunii e prea lung.`);
      if (!keys.has(o.next)) throw new UserError(`Rândul ${o.line}: pasul „${o.next}” nu există în scenariu.`);
      delete o.line;
    }
    if (s.options.length) s.outcome = null;
    delete s.line;
  }
  if (!steps[0].options.length) throw new UserError('Primul pas trebuie să aibă opțiuni de vot.');
  if (!steps.some((s) => !s.options.length)) throw new UserError('Scenariul nu are niciun final (un pas fără opțiuni).');
  const name = (title || steps[0].title).trim().slice(0, SCENARIO_LIMITS.title);
  return { title: name, start: steps[0].key, steps };
}

export const SCENARIO_EXAMPLE = {
  ro: `# Ransomware la o clinică privată

## start: Luni, 08:10
Recepția sună: pe trei calculatoare apare un mesaj care cere 2 BTC pentru „cheia de decriptare”. Programările nu se mai deschid. Ce faceți primul lucru?
* Deconectăm calculatoarele afectate de la rețea -> izolare | Izolarea oprește răspândirea și păstrează dovezile.
- Repornim calculatoarele, poate trece -> repornire | Repornirea poate șterge urme utile investigației și nu oprește criptarea.
- Plătim, pacienții așteaptă -> plata | Plata nu garantează recuperarea datelor și finanțează atacatorii.

## izolare: 08:25 — Atacul e izolat
Trei stații sunt deconectate, serverul de programări pare neatins. Clinica intră sub NIS2 (sectorul sănătate). Ce urmează?
* Anunțăm conducerea și pregătim avertizarea timpurie către CSIRT (în România, DNSC), în 24 de ore -> raportare | NIS2 cere avertizare timpurie în 24 de ore pentru incidentele semnificative.
- Rezolvăm intern și nu spunem nimănui -> tacere | Ascunderea unui incident semnificativ încalcă obligațiile de raportare.

## repornire: 08:40 — Criptarea s-a extins
După repornire, încă cinci stații și serverul de fișiere sunt criptate.
* Izolăm acum tot ce e afectat -> izolare | Mai târziu decât ideal, dar corect.
- Mai așteptăm o oră -> tacere | Fiecare minut extinde paguba.

## plata: [-] Plată fără garanție
Atacatorii au primit banii, dar cheia decriptează doar o parte din fișiere. Datele pacienților apar la vânzare o săptămână mai târziu.

## tacere: [-] Incident nedeclarat
Incidentul iese la iveală din presă. Lipsa raportării aduce sancțiuni și pierderea încrederii pacienților.

## raportare: [+] Incident gestionat
Avertizarea timpurie a fost trimisă în 24 de ore, serviciile au fost restaurate din backup în aceeași zi, iar analiza ulterioară a arătat de unde a pornit atacul: un e-mail de phishing.`,
  en: `# Ransomware at a private clinic

## start: Monday, 08:10
Reception calls: three computers show a message demanding 2 BTC for the "decryption key". Appointments no longer open. What do you do first?
* Disconnect the affected computers from the network -> isolate | Isolation stops the spread and preserves evidence.
- Restart the computers, maybe it goes away -> restart | Restarting can wipe useful traces and does not stop the encryption.
- Pay, patients are waiting -> pay | Paying does not guarantee recovery and funds the attackers.

## isolate: 08:25 — The attack is contained
Three workstations are offline; the appointments server looks untouched. The clinic is covered by NIS2 (health sector). What next?
* Inform management and prepare the early warning to the national CSIRT within 24 hours -> report | NIS2 requires an early warning within 24 hours for significant incidents.
- Fix it internally and tell no one -> silence | Hiding a significant incident breaks the reporting obligations.

## restart: 08:40 — The encryption has spread
After the restart, five more workstations and the file server are encrypted.
* Isolate everything affected now -> isolate | Later than ideal, but right.
- Wait another hour -> silence | Every minute widens the damage.

## pay: [-] Payment without a guarantee
The attackers took the money, but the key only decrypts some files. Patient data is up for sale a week later.

## silence: [-] Undeclared incident
The incident comes out in the press. Not reporting it brings penalties and lost patient trust.

## report: [+] Incident handled
The early warning went out within 24 hours, services were restored from backup the same day, and the follow-up analysis found where the attack began: a phishing e-mail.`,
};

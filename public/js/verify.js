import { $, h, codeFromPath, fill } from './common.js';
import { t, lang, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

const id = codeFromPath();
const box = $('#result');

const res = await fetch(`/api/certificates/${encodeURIComponent(id)}`, { headers: { 'X-Lang': lang } });
if (!res.ok) {
  const { error } = await res.json().catch(() => ({}));
  fill(box, 
    h('div', { class: 'verify-badge bad' }, '✕'),
    h('h1', {}, t('Certificat negăsit')),
    h('p', { class: 'muted' }, error || t('Nu există niciun certificat cu acest cod.')),
    h('p', { class: 'small muted' }, t('Cod verificat: {id}', { id })));
} else {
  const c = await res.json();
  const date = new Date(c.issuedAt).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const row = (label, value) => h('div', { class: 'verify-row' }, h('span', { class: 'muted' }, label), h('strong', {}, value));
  fill(box, 
    h('div', { class: 'verify-badge ok' }, '✓'),
    h('h1', {}, t('Certificat valid')),
    h('p', { class: 'muted' }, t('Acest certificat a fost emis de CYBERGUARD Quizy și datele de mai jos sunt cele înregistrate pe server.')),
    row(t('Nume'), c.name),
    row(t('Eveniment'), c.event),
    row(t('Data emiterii'), date),
    c.score !== null ? row(t('Scor la testul final'), `${c.score}%`) : null,
    c.issuer ? row(t('Emis de'), c.issuer) : null,
    row(t('Cod certificat'), c.id));
}

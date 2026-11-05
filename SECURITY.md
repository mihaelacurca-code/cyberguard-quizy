# Securitate

Acest document descrie modelul de securitate al Quizy, rezultatul auditului din noiembrie 2026 și riscurile rămase, asumate conștient.

## Modelul de acces

| Cine | Cum intră | Ce poate face |
|---|---|---|
| Participant | Codul de 6 caractere al evenimentului | Votează, trimite cuvinte și răspunsuri, pune întrebări, votează întrebări |
| Ecran de proiecție | Același cod (`/present/COD`) | Vede rezultatele live, întrebările publicate și clasamentul |
| Organizator | Linkul secret de administrare (cheie aleatorie de 144 de biți) | Tot: sondaje, moderare, export, ștergerea evenimentului |
| Administratorul serverului | Parola panoului (`ADMIN_PASSWORD`), la `/panel` | Toate evenimentele, link nou de administrare, ștergere, dreptul de a crea evenimente |
| Oricine | Codul unui certificat (`/v/COD`) | Vede numele, evenimentul, data și scorul de pe acel certificat |

**Panoul de administrare.** Parola stă doar pe server (`/etc/quizy/env`, citibil doar de root). La autentificare se emite un cookie `HttpOnly`, `SameSite=Strict` și `Secure` (sub HTTPS), valabil 12 ore, păstrat doar în memorie: o repornire a serverului delogează pe toată lumea. Parolele greșite intră în aceeași limită ca și codurile greșite (60 în 10 minute pe IP).

**Certificatele** au coduri aleatorii de 10 caractere (aprox. 50 de biți). Pagina de verificare arată doar ce e tipărit pe certificat, iar codurile greșite intră în aceeași limită anti-ghicire. Numele de pe certificat îl scrie participantul și nu se mai poate schimba după emitere.

**Codul personalizat** al unui eveniment (de ex. `NIS2`) e mai ușor de ghicit decât unul aleator. Asta schimbă doar cine poate intra ca participant; administrarea rămâne protejată de cheia secretă.

Nu există conturi. Codul evenimentului nu e secret: oricine îl are poate participa, la fel ca la Slido. Cheia de administrare e singurul secret; serverul păstrează doar hash-ul ei SHA-256 și o compară în timp constant.

## Audit: noiembrie 2026

Am verificat: autentificarea organizatorului, izolarea între evenimente, validarea datelor primite, XSS, injecția în CSV, scurgerile de date între roluri, limitarea abuzurilor, antetele HTTP, configurarea serverului și a proxy-ului, dependențele (`npm audit`: 0 vulnerabilități).

### Probleme găsite și corectate

| # | Severitate | Problemă | Corectură |
|---|---|---|---|
| 1 | Medie | Ecranul de proiecție primea numărul de voturi pentru fiecare variantă a unui quiz încă nedezvăluit. Pagina nu le afișa, dar oricine cu codul evenimentului le putea citi din trafic și afla ce răspunde sala înainte să răspundă el. | Pentru quiz-urile nedezvăluite, ecranul de proiecție primește doar numărul de participanți care au răspuns. |
| 2 | Medie | Cu `TRUST_PROXY=1`, serverul accepta orice adresă IP trimisă de client în antetul `X-Forwarded-For`, așa că limitele per IP puteau fi ocolite. | Se ia în considerare un singur proxy (cel din fața aplicației), deci adresa e cea pe care o adaugă proxy-ul, nu clientul. |
| 3 | Medie | Codurile de eveniment puteau fi ghicite fără nicio limită (aprox. 1 miliard de combinații). | După 60 de coduri greșite sau chei de administrare greșite în 10 minute, adresa IP e blocată temporar. |
| 4 | Medie | Cheia de administrare apărea în clar în bara de adrese și în secțiunea „Linkuri”, adică exact ce se vede când organizatorul își proiectează ecranul. | Cheia e scoasă din bara de adrese după încărcare și afișată mascată; butonul „Copiază” copiază linkul complet. Pagina avertizează să nu fie proiectată. |
| 5 | Mică | Fără limită per IP pentru conectări și întrebări, un script putea simula mii de participanți sau inunda Q&A-ul. | Limite per IP, generoase ca să nu blocheze o sală întreagă din spatele aceluiași Wi-Fi: 1500 de conectări la 10 minute, 120 de întrebări pe minut. |
| 6 | Mică | Lista de adrese pentru limita de creare a evenimentelor nu se golea niciodată (creștere nelimitată a memoriei). | Intrările vechi se șterg la fiecare minut. |
| 7 | Mică | Codul QR putea fi generat cu adresa din antetul `Host` și păstrat o zi într-un cache comun. | Fără `PUBLIC_URL`, codul QR nu mai e păstrat în cache-uri comune. Scriptul de instalare setează `PUBLIC_URL`. |
| 8 | Mică | Voturile la întrebări erau acceptate și după închiderea evenimentului. | Refuzate, ca restul acțiunilor. |
| 9 | Mică | Politica CSP permitea conexiuni WebSocket către orice server; lipseau HSTS și alte antete. | `connect-src` limitat la serverul propriu; adăugate `object-src 'none'`, `base-uri 'none'`, `Permissions-Policy`, HSTS (în Caddy) și `Cache-Control: no-store` pentru export. |
| 10 | Mică | Ghidul de instalare punea tokenul GitHub într-o comandă `export`, care rămâne în istoricul terminalului. | Tokenul se citește cu `read -s`: nu apare pe ecran și nu rămâne în istoric. |

Fiecare corectură are un test automat în `test/security.test.js`.

### Ce era deja în regulă

- **XSS:** tot textul venit de la utilizatori ajunge în pagină prin `textContent`, niciodată ca HTML; politica CSP interzice scripturile inline și din alte surse.
- **Injecție în CSV:** valorile care încep cu `=`, `+`, `-`, `@` sunt neutralizate.
- **Izolare:** fiecare acțiune verifică evenimentul conexiunii; întrebările în așteptare sau arhivate și identificatorii participanților nu ajung la public.
- **Date primite:** lungimi maxime, tipuri și intervale verificate pe server; mesajele sunt limitate la 64 KB.
- **Server:** aplicația ascultă doar local, în spatele Caddy; serviciul rulează ca utilizator fără privilegii, cu sistemul de fișiere protejat (`ProtectSystem=strict`); backup zilnic accesibil doar pentru root.
- **SQL:** toate interogările sunt parametrizate.

## Riscuri asumate

| Risc | De ce rămâne | Ce poți face |
|---|---|---|
| Un participant poate vota de mai multe ori dacă își golește browserul sau folosește alt dispozitiv | Fără conturi nu există altă identitate; e la fel la Slido. Limitele per IP încetinesc doar scripturile. | Nu folosi Quizy pentru voturi cu miză (alegeri, decizii obligatorii). |
| Cine are linkul de administrare controlează evenimentul | E singurul mecanism de autentificare, ales ca să nu existe conturi. | Păstrează linkul privat; dacă s-a scurs, creează un eveniment nou. |
| Numele afișate în clasament le aleg participanții | Nu există moderare pentru nume. | Pentru evenimente publice, nu afișa clasamentul fără să-l verifici. |
| Evenimentele nu expiră | Organizatorul decide când le șterge. | Șterge evenimentele după export, mai ales dacă participanții și-au scris numele (GDPR: păstrare minimă). |
| Instalarea prin `curl … \| sudo bash` | Scriptul vine din acest repo; dacă repo-ul e compromis, e compromis și serverul. | Protejează contul GitHub cu 2FA; poți citi scriptul înainte să-l rulezi. |
| `TRUST_PROXY=1` fără un proxy în față | Atunci adresa IP ar putea fi falsificată. | Setează `TRUST_PROXY=1` doar în spatele unui proxy (scriptul de instalare o face corect). |

## Raportarea unei probleme

Dacă găsești o problemă de securitate, nu o publica într-un issue. Scrie-i direct proprietarului repo-ului.

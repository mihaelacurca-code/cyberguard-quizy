# CYBERGUARD Quizy

<img src="public/img/cyberguard-logo.svg" alt="CYBERGUARD" width="360">

Sondaje live, quiz-uri și întrebări din public pentru evenimente — o alternativă open-source la Slido pe care o găzduiești singur. **Fără abonament, fără limită de sondaje, de întrebări sau de participanți.**

## Demo

[`demo/index.html`](demo/index.html) e o pagină de sine stătătoare, fără server, în română și engleză (butonul RO / EN de lângă logo): cele trei ecrane (organizator, telefonul unui participant, proiector) legate între ele, cu sondaje, quiz, word cloud și Q&A. Descarc-o și deschide-o în browser ca să vezi cum funcționează Quizy înainte să-l instalezi. Voturile rămân în pagină; nu e o versiune multi-utilizator.

## Ce face

| Funcție | Detalii |
|---|---|
| **Alegere multiplă** | O singură opțiune sau mai multe; participantul își poate schimba votul cât timp sondajul e deschis |
| **Quiz** | Răspuns corect marcat, cronometru opțional, punctaj după viteză (500–1000 puncte), dezvăluire la comanda organizatorului, clasament |
| **Word cloud** | 1–10 cuvinte per participant, cuvintele identice se cumulează indiferent de majuscule |
| **Text liber** | Răspunsuri deschise, 1–10 per participant |
| **Clasament de opțiuni** | Participanții ordonează opțiunile cu ↑ ↓; rezultatul e ordinea sălii (metoda Borda), cu poziția medie a fiecărei opțiuni |
| **Scală cu afirmații** | Mai multe afirmații notate 1–3, 1–5 sau 1–7, cu etichete la capete („Deloc de acord” … „Total de acord”); media și distribuția pe fiecare afirmație |
| **Pin pe imagine** | Participanții ating un punct pe o imagine (de ex. un e-mail de phishing). Opțional, o zonă corectă, arătată la dezvăluire, cu procentul celor care au nimerit-o |
| **Imagini în întrebări** | Orice întrebare poate avea o imagine (PNG, JPG sau WebP, până la 1 MB), pe telefoane, pe proiector și în raport |
| **Evaluare** | Scală 1–3, 1–5, 1–7 sau 1–10, cu medie și distribuție |
| **Q&A** | Întrebări din public (cu nume sau anonim), voturi, sortare populare/recente, moderare înainte de publicare, „pe ecran”, marcat ca răspuns, arhivare |
| **Ecran de proiecție** | Cod de intrare + QR, rezultate live, întrebarea evidențiată, clasament; organizatorul alege ce se vede |
| **Administrare** | Creare/editare/duplicare/reordonare sondaje, pornire/oprire, resetare, ascundere rezultate, închiderea evenimentului, export CSV |
| **Test înainte / după** | Aceleași întrebări la începutul și la finalul training-ului, la care participanții răspund în ritmul lor. Raportul arată media înainte și după, progresul pe fiecare întrebare și câți participanți au progresat; se poate proiecta („Ce am învățat”) |
| **Certificate de participare** | PDF cu numele participantului, evenimentul, data, scorul la testul final și emitentul. Opțional, un scor minim la testul final. Fiecare certificat are un cod și un QR de verificare (`/v/COD`) |
| **Răspunsul organizatorului în Q&A** | Organizatorul scrie un răspuns care apare sub întrebare, pe telefoane și pe ecran |
| **Cod personalizat** | Codul aleator poate fi înlocuit cu unul ușor de reținut (de ex. `NIS2`); cei conectați sunt mutați automat |
| **Podium și serii** | Clasamentul pe ecran apare ca podium animat; fiecare răspuns corect la rând aduce +100 de puncte bonus (până la +500) |
| **Scenarii decizionale (tabletop)** | Un incident pas cu pas: proiectorul arată situația, sala votează pe telefon, facilitatorul dezvăluie voturile cu decizia recomandată și explicația, apoi scenariul continuă pe ramura votată (sau pe cea aleasă de facilitator; se poate reveni un pas). La final: deznodământul și drumul parcurs. Scenariul se scrie ca text (vezi mai jos); exemplul inclus e un atac ransomware la o clinică, cu raportarea NIS2 |
| **Aspect pentru client** | Pe fiecare eveniment: logo-ul clientului (PNG, JPG sau WebP), culoarea lui principală, fundal CYBERGUARD (bleumarin și auriu) sau simplu și, opțional, fără marca CYBERGUARD Quizy. Se aplică pe telefoane, pe proiector, pe certificate și în raportul PDF. Culorile închise sunt deschise automat cât să rămână lizibile (contrast de cel puțin 4,5:1) |
| **Raport PDF după eveniment** | Butonul „Raport PDF” din administrare (sau „Raport” din panou) deschide un raport A4: cifrele principale, testul înainte/după, fiecare sondaj cu grafice, clasamentul, întrebările din public cu răspunsuri și certificatele emise. „Salvează ca PDF” îl descarcă din browser, cu text care se poate căuta |
| **Panou de administrare** | La `/panel`, cu o parolă pe server: toate evenimentele, acces la oricare fără linkul de administrare, link nou de administrare, ștergere, și opțiunea ca doar administratorii să poată crea evenimente |

Participanții nu își fac cont: intră cu un cod de 6 caractere sau scanează QR-ul. Organizatorul nu își face cont: primește un link secret de administrare.

## Limbă: română și engleză

Toate paginile (participant, organizator, ecran de proiecție) există în română și în engleză. Limba se alege automat după limba browserului (română pentru browserele în română, engleză pentru restul), iar butonul **RO / EN** din colțul paginii o schimbă; alegerea rămâne ținută minte pe acel dispozitiv. Fiecare participant își vede pagina în limba lui, chiar dacă sala e mixtă. Mesajele de la server (de ex. „Ai răspuns deja”), exportul CSV și etichetele de la „Import în bloc” (`[cloud]`, `[rating 5]`, `[multi]`, `[open]`) merg în ambele limbi.

Întrebările și opțiunile rămân în limba în care le scrie organizatorul.

## Cum se folosește

1. Pe pagina principală scrii numele evenimentului și apeși **Creează evenimentul**.
2. Ajungi în pagina de administrare. **Salvează linkul de administrare** (secțiunea „Linkuri”) — e singura cheie a evenimentului. Este ținut minte și în browserul în care l-ai creat.
3. Deschide **Ecran de proiecție** pe calculatorul conectat la proiector (tasta `F` = ecran complet).
4. Adaugă întrebările (vezi mai jos) dinainte sau pe loc și apasă **Pornește**. Un singur sondaj e live la un moment dat; pornirea altuia îl închide pe cel curent.
5. La quiz, apasă **Dezvăluie răspunsul** după ce a votat sala; apoi alege „Clasamentul” la „Ecranul proiectat arată”.
6. La final: **Export CSV** pentru toate răspunsurile și întrebările.

## Cum adaugi întrebările

Două variante, ambele din pagina de administrare:

**Una câte una — butonul „+ Sondaj nou”.** Alegi tipul (alegere multiplă, quiz, word cloud, text liber, evaluare), scrii întrebarea și opțiunile, apoi **Creează** (rămâne ciornă) sau **Creează și pornește** (devine live imediat). La quiz bifezi opțiunea corectă și poți pune un cronometru. Orice sondaj se poate edita, duplica sau reordona.

**Toate deodată — butonul „Import în bloc”.** Lipești textul tuturor întrebărilor, vezi o previzualizare și apeși **Importă**. Util ca să muți sondajele dintr-un document sau din Slido:

```
Who are you?
- Public authority · CSIRT/SOC
- Essential or important entity
- Vendor/MSSP

Ce înseamnă NIS2? [30s]
* Directivă UE privind securitatea cibernetică
- Un standard ISO

[multiplu] Ce teme vă interesează?
- AI
- Cloud

[nor] Un cuvânt despre eveniment
[nota 5] Cât de utilă a fost sesiunea?

Ce ai învățat azi?
```

| Scrii | Rezultă |
|---|---|
| întrebare + rânduri cu `-` | alegere multiplă (o opțiune) |
| `[multiplu]` în fața întrebării | se pot alege mai multe opțiuni |
| o opțiune marcată cu `*` | quiz; `*` = răspunsul corect; `[30s]` la final = cronometru |
| `[nor]` | word cloud |
| `[clasament]` + rânduri cu `-` | clasament de opțiuni |
| `[likert]` sau `[likert 7]` + rânduri cu `-` | scală cu afirmații (fiecare rând e o afirmație) |
| `[pin]` | pin pe imagine (imaginea o adaugi apoi din „Editează”) |
| `[nota 5]`, `[nota 10]` | evaluare pe scala respectivă |
| întrebare fără opțiuni | răspuns liber |

Întrebările se separă printr-un rând liber. Dacă o întrebare are o greșeală (de ex. o singură opțiune), nu se importă nimic și primești numărul întrebării cu problema.

Întrebările **din public** (Q&A) le trimit participanții din tab-ul „Întrebări” de pe telefon; organizatorul le moderează în panoul „Întrebări din public”.

## Cum scrii un scenariu decizional

```
# Ransomware la o clinică privată

## start: Luni, 08:10
Recepția sună: pe trei calculatoare apare un mesaj de răscumpărare. Ce faceți primul lucru?
* Deconectăm calculatoarele afectate de la rețea -> izolare | Izolarea oprește răspândirea.
- Plătim, pacienții așteaptă -> plata | Plata nu garantează recuperarea datelor.

## izolare: [+] Atacul e izolat
Text de final.

## plata: [-] Plată fără garanție
Text de final.
```

| Scrii | Înseamnă |
|---|---|
| `# Titlu` | numele scenariului (opțional) |
| `## nume: Titlu` | un pas; primul pas e începutul. `nume` e scurt, fără spații |
| rândurile de sub pas | descrierea situației |
| `- opțiune -> pas` | o variantă de vot și pasul spre care duce |
| `* opțiune -> pas` | varianta recomandată |
| `\| explicație` | textul arătat când dezvălui voturile |
| pas fără opțiuni | un final; `[+]` final bun, `[-]` final rău |

Dacă ceva nu se potrivește (un pas care nu există, o opțiune fără `->`), primești mesajul cu numărul rândului. În administrare, „Pune exemplul” încarcă scenariul complet, în română sau engleză.

## Pornire locală

Necesită Node.js 22.13 sau mai nou (folosește SQLite-ul inclus în Node, fără dependențe native).

```bash
npm install
npm start
```

Aplicația pornește pe http://localhost:3000. Datele sunt în `data/quizy.db`.

Teste:

```bash
npm test
```

### Configurare

| Variabilă | Implicit | Rol |
|---|---|---|
| `PORT` | `3000` | Portul HTTP |
| `DATABASE_FILE` | `data/quizy.db` | Fișierul SQLite |
| `PUBLIC_URL` | adresa din cerere | Adresa publică folosită în codul QR (ex. `https://cyberguardquizy.com`) |
| `HOST` | `0.0.0.0` | Interfața pe care ascultă (`127.0.0.1` în spatele unui reverse proxy) |
| `TRUST_PROXY` | — | `1` când rulează în spatele unui reverse proxy (Nginx, Render, Fly) |
| `ADMIN_PASSWORD` | — | Parola panoului de administrare (`/panel`). Fără ea, panoul e dezactivat. Scriptul de instalare o generează în `/etc/quizy/env` |

## Găzduire

„Gratuit” înseamnă că aplicația nu are licență, abonament sau limite. Serverul pe care rulează îl alegi tu:

- **Oracle Cloud „Always Free”** — cost zero, permanent, accesibil de oriunde, cu HTTPS. Ghid pas cu pas în [`deploy/ORACLE.md`](deploy/ORACLE.md); instalarea pe server e o singură comandă (`deploy/oracle-setup.sh`), care merge pe orice server Ubuntu.
- **Laptopul tău, în rețeaua sălii** — cost zero. `npm start`, apoi participanții (pe același Wi-Fi) intră pe `http://IP-ul-laptopului:3000`. Setează `PUBLIC_URL` cu acea adresă ca QR-ul să fie corect.
- **Docker pe orice VPS** (de la câțiva euro pe lună):
  ```bash
  docker build -t quizy .
  docker run -d -p 3000:3000 -v quizy-data:/data --name quizy quizy
  ```
  Pune în față un reverse proxy cu HTTPS (Caddy sau Nginx) și setează `TRUST_PROXY=1`.
- **Render** — fișierul `render.yaml` e inclus. Planul gratuit Render nu are disc persistent, deci datele se pierd la repornire; pentru evenimente reale folosește un plan cu disc.

### Câți participanți suportă?

Aplicația nu impune nicio limită; capacitatea depinde de server. Actualizările către participanți sunt grupate (cel mult 5 pe secundă per eveniment). Într-un test de încărcare, 1000 de participanți simultani s-au conectat în sub o secundă și au votat toți în aproximativ jumătate de secundă, fără erori, pe un singur proces. Pentru evenimente de mii de persoane folosește un server cu resurse pe măsură.

## Securitate și limite asumate

Auditul complet, problemele corectate și riscurile rămase sunt în [`SECURITY.md`](SECURITY.md).

- Linkul de administrare conține o cheie secretă aleatorie; serverul păstrează doar hash-ul ei. Cine are linkul controlează evenimentul. Dacă linkul se pierde, din panoul de administrare se generează unul nou.
- Participanții sunt anonimi și identificați printr-un ID aleator ținut în browser. Ca la orice sondaj fără cont, cineva care își golește browserul poate vota din nou.
- Protecții anti-abuz, nu limite de utilizare: lungimea textelor, cel mult 5 întrebări Q&A pe minut per participant, limitarea ritmului acțiunilor per conexiune, limite generoase per IP (evenimente noi, conectări, întrebări) și blocare temporară după 60 de coduri sau chei greșite în 10 minute.
- Exportul CSV neutralizează valorile care ar putea fi interpretate drept formule în Excel.

## Structură

```
server/
  index.js   pornire și configurare din variabile de mediu
  app.js     HTTP (Express) și timp real (Socket.IO)
  store.js   logica: evenimente, sondaje, voturi, punctaj, Q&A
  db.js      schema SQLite
public/
  index.html   pagina principală (intrare cu cod, creare eveniment)
  event.html   participant (telefon)
  admin.html   organizator
  present.html ecran de proiecție
  js/import.js  interpretarea textului de la „Import în bloc”
test/          teste pentru logică și pentru fluxul în timp real
```

# Quizy

Sondaje live, quiz-uri și întrebări din public pentru evenimente — o alternativă open-source la Slido pe care o găzduiești singur. **Fără abonament, fără limită de sondaje, de întrebări sau de participanți.**

## Demo

[`demo/index.html`](demo/index.html) e o pagină de sine stătătoare, fără server: cele trei ecrane (organizator, telefonul unui participant, proiector) legate între ele, cu sondaje, quiz, word cloud și Q&A. Descarc-o și deschide-o în browser ca să vezi cum funcționează Quizy înainte să-l instalezi. Voturile rămân în pagină; nu e o versiune multi-utilizator.

## Ce face

| Funcție | Detalii |
|---|---|
| **Alegere multiplă** | O singură opțiune sau mai multe; participantul își poate schimba votul cât timp sondajul e deschis |
| **Quiz** | Răspuns corect marcat, cronometru opțional, punctaj după viteză (500–1000 puncte), dezvăluire la comanda organizatorului, clasament |
| **Word cloud** | 1–10 cuvinte per participant, cuvintele identice se cumulează indiferent de majuscule |
| **Text liber** | Răspunsuri deschise, 1–10 per participant |
| **Evaluare** | Scală 1–3, 1–5, 1–7 sau 1–10, cu medie și distribuție |
| **Q&A** | Întrebări din public (cu nume sau anonim), voturi, sortare populare/recente, moderare înainte de publicare, „pe ecran”, marcat ca răspuns, arhivare |
| **Ecran de proiecție** | Cod de intrare + QR, rezultate live, întrebarea evidențiată, clasament; organizatorul alege ce se vede |
| **Administrare** | Creare/editare/duplicare/reordonare sondaje, pornire/oprire, resetare, ascundere rezultate, închiderea evenimentului, export CSV |

Participanții nu își fac cont: intră cu un cod de 6 caractere sau scanează QR-ul. Organizatorul nu își face cont: primește un link secret de administrare.

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
| `[nota 5]`, `[nota 10]` | evaluare pe scala respectivă |
| întrebare fără opțiuni | răspuns liber |

Întrebările se separă printr-un rând liber. Dacă o întrebare are o greșeală (de ex. o singură opțiune), nu se importă nimic și primești numărul întrebării cu problema.

Întrebările **din public** (Q&A) le trimit participanții din tab-ul „Întrebări” de pe telefon; organizatorul le moderează în panoul „Întrebări din public”.

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
| `PUBLIC_URL` | adresa din cerere | Adresa publică folosită în codul QR (ex. `https://quizy.exemplu.ro`) |
| `HOST` | `0.0.0.0` | Interfața pe care ascultă (`127.0.0.1` în spatele unui reverse proxy) |
| `TRUST_PROXY` | — | `1` când rulează în spatele unui reverse proxy (Nginx, Render, Fly) |

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

- Linkul de administrare conține o cheie secretă aleatorie; serverul păstrează doar hash-ul ei. Cine are linkul controlează evenimentul.
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

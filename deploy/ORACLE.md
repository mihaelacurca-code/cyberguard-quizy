# Quizy pe Oracle Cloud „Always Free”

Rezultatul: Quizy rulează permanent, gratuit, la o adresă HTTPS de forma `https://141-147-12-34.sslip.io`, accesibilă de oriunde (Wi-Fi, date mobile). Durează în jur de 30 de minute, o singură dată.

Ce primești gratuit de la Oracle, fără limită de timp: o mașină virtuală Linux. Oracle cere un card la înregistrare pentru verificare; resursele „Always Free” nu se taxează.

> Interfața Oracle se mai schimbă. Dacă un buton are alt nume, caută termenul în bara de căutare din consolă.

## 1. Contul

1. Intră pe https://signup.cloud.oracle.com și creează contul.
2. La **Home Region** alege o regiune apropiată (de ex. *Germany Central (Frankfurt)*). **Nu se mai poate schimba**, iar resursele gratuite există doar în ea.
3. Așteaptă e-mailul de confirmare că contul e activ (de obicei câteva minute).

## 2. Mașina virtuală

1. În consolă: **☰ → Compute → Instances → Create instance**.
2. **Name**: `quizy`.
3. **Image and shape → Edit**:
   - **Image**: *Canonical Ubuntu* 24.04 (sau 22.04).
   - **Shape**: *Ampere* → `VM.Standard.A1.Flex`, 1 OCPU și 6 GB RAM. Are eticheta *Always Free-eligible*.
   - Dacă primești eroarea *Out of capacity*, alege *AMD* → `VM.Standard.E2.1.Micro` (tot gratuit, mai mic, dar suficient).
4. **Networking**: lasă cum e (se creează o rețea nouă) și verifică să fie bifat **Assign a public IPv4 address**.
5. **Add SSH keys**: alege **Generate a key pair for me** și apasă **Save private key**. Păstrează fișierul `.key` descărcat: e cheia de acces la server.
6. **Create**. După un minut starea devine **Running**. Notează **Public IP address** din pagina instanței.

## 3. Deschide porturile 80 și 443

Fără pasul ăsta, serverul nu se vede din internet.

1. În pagina instanței, la **Primary VNIC**, apasă pe numele **Subnet**.
2. **Security** (sau **Security Lists**) → lista implicită (*Default Security List for …*).
3. **Security rules → Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: TCP
   - **Destination Port Range**: `80,443`
4. **Add Ingress Rules**.

## 4. Conectează-te la server

Cel mai simplu, direct din browser, fără să instalezi nimic:

1. În consolă, sus-dreapta, apasă iconița **Cloud Shell** (`>_`). Se deschide un terminal jos.
2. În meniul Cloud Shell (⚙ sau ☰) alege **Upload** și încarcă fișierul `.key` de la pasul 2.
3. Rulează (înlocuiește numele fișierului și IP-ul):

```bash
chmod 600 ssh-key-*.key
```

```bash
ssh -i ssh-key-*.key ubuntu@IP_PUBLIC
```

La întrebarea *Are you sure you want to continue connecting* scrie `yes`. Acum ești pe server.

## 5. Instalează Quizy

**Dacă repo-ul e public**, rulează pe server:

```bash
curl -fsSL https://raw.githubusercontent.com/mihaelacurca-code/cyberguard-quizy/main/deploy/oracle-setup.sh | sudo bash
```

**Dacă repo-ul e privat**, ai nevoie de un token GitHub doar pentru citire:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → `cyberguard-quizy`. **Permissions → Contents**: *Read-only*. Expirarea poate fi scurtă (7 zile).
3. Copiază tokenul și rulează pe server comanda de mai jos. Lipește tokenul când ți-l cere (nu se vede pe ecran și nu rămâne în istoricul comenzilor), apoi Enter:

```bash
read -rsp "Token GitHub: " GITHUB_TOKEN; echo
```

```bash
curl -fsSL -H "Authorization: token $GITHUB_TOKEN" https://raw.githubusercontent.com/mihaelacurca-code/cyberguard-quizy/main/deploy/oracle-setup.sh | sudo GITHUB_TOKEN="$GITHUB_TOKEN" bash
```

Scriptul durează 2–5 minute și instalează Node.js, Quizy ca serviciu care pornește singur la restart, Caddy pentru HTTPS automat, deschide porturile în firewall-ul serverului și face backup zilnic al bazei de date (ultimele 14 zile, în `/var/backups/quizy`).

La final afișează adresa, de exemplu:

```
Gata! Quizy rulează la: https://141-147-12-34.sslip.io
```

Deschide adresa în browser, creează evenimentul și salvează linkul de administrare.

## Actualizare

Când apare o versiune nouă în GitHub, rulezi din nou aceeași comandă de la pasul 5. Datele rămân neatinse.

## Domeniul tău: cyberguardquizy.com

Ca Quizy să ruleze la **https://cyberguardquizy.com** în loc de adresa `…sslip.io`:

1. La firma de la care ai cumpărat domeniul, deschide setările DNS ale lui `cyberguardquizy.com` și adaugă două înregistrări de tip **A**:

   | Tip | Nume (Host) | Valoare | TTL |
   |---|---|---|---|
   | A | `@` | IP-ul public al serverului | implicit |
   | A | `www` | același IP | implicit |

   Dacă există deja înregistrări A sau AAAA pentru `@` sau `www` (de obicei o pagină „parcată” a firmei), șterge-le, altfel certificatul HTTPS nu se poate emite.

2. Așteaptă să se propage (de la câteva minute la câteva ore). Verifici pe https://dnschecker.org cu `cyberguardquizy.com`: trebuie să apară IP-ul serverului.

3. Rulează pe server:

```bash
curl -fsSL https://raw.githubusercontent.com/mihaelacurca-code/cyberguard-quizy/main/deploy/oracle-setup.sh | sudo bash -s cyberguardquizy.com
```

(Pentru repo privat, citește întâi tokenul ca la pasul 5, adaugă `-H "Authorization: token $GITHUB_TOKEN"` după `curl -fsSL` și pune `GITHUB_TOKEN="$GITHUB_TOKEN"` după `sudo`.)

Scriptul obține certificatul HTTPS, iar `www.cyberguardquizy.com` trimite automat vizitatorii la `cyberguardquizy.com`. Codurile QR de pe ecranul de proiecție vor duce la `https://cyberguardquizy.com/e/COD`. Domeniul rămâne ținut minte: la actualizări rulezi comanda fără el.

## Când ceva nu merge

| Simptom | Ce faci |
|---|---|
| Scriptul spune că adresa nu răspunde | Verifică pasul 3 (porturile 80 și 443). Apoi reîncarcă adresa în browser; nu trebuie rulat nimic din nou |
| Vrei să vezi ce face aplicația | `sudo journalctl -u quizy -n 50` |
| Probleme cu HTTPS | `sudo journalctl -u caddy -n 50` |
| Repornire manuală | `sudo systemctl restart quizy` |
| Restaurare din backup | `sudo systemctl stop quizy`, apoi `sudo cp /var/backups/quizy/quizy-DATA.db /var/lib/quizy/quizy.db`, apoi `sudo systemctl start quizy` |

Oracle poate recupera instanțele gratuite care stau aproape complet nefolosite timp de 7 zile. Un server Quizy folosit ocazional poate intra în această categorie; dacă se întâmplă, instanța e oprită, nu ștearsă, și o pornești din consolă cu **Start**.

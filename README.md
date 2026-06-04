# Netikro skubumo aptikimo plėtinys (Fake Urgency Detector)

„Chrome“ naršyklės plėtinys, kuris automatiškai aptinka ir pažymi **netikro skubumo šablonus** el. prekybos ir kitose svetainėse — įskaitant atgalinio skaičiavimo laikmačius ir riboto kiekio indikatorius, kurie gali būti manipuliaciniai ar klaidinantys.

---

## Ką daro plėtinys

Daugelis svetainių naudoja psichologinio spaudimo taktikas, skatinančias greitus sprendimus. Plėtinys aptinka dvi pagrindines kategorijas:

**Atgalinio skaičiavimo laikmačiai** — elementai, kurie skaičiuoja atgal, siekdami sukurti laiko spaudimo jausmą (pvz. „Pasiūlymas baigiasi po 00:14:32“). Plėtinys stebi DOM struktūrą ieškodamas skaitmeninių elementų, kurie laikui bėgant mažėja, ir automatiškai patikrina, ar laikmatis yra tikras, ar netikras.

**Riboto kiekio indikatoriai** — tekstas, teigiamas apie deficitą (pvz. „Liko tik 3!“, „12 žmonių šiuo metu žiūri“). Plėtinys ieško tokių frazių tiek anglų, tiek lietuvių kalbomis.

Aptikus elementą:
- Jis **pažymimas puslapyje** spalvotu punktyriniu rėmeliu (raudonas — laikmaičiams, oranžinis — kiekio indikatoriams)
- **Įrašomas į plėtinio saugyklą**, kad būtų galima peržiūrėti iššokančiame lange
- **Automatiškai testuojamas** fone, siekiant nustatyti, ar jis tikras, įtartinas ar netikras

### Kaip veikia aptikimas

**Laikmačių aptikimas** naudoja `MutationObserver`, kuris stebi DOM mazgus su trumpomis skaitmeninėmis reikšmėmis (1–2 skaitmenys) ir fiksuoja jų pokyčius laikui bėgant. Elementas pažymimas tik po 3 sekundžių stebėjimo lango, kuris patvirtina, kad skaičiai iš tiesų mažėja. Išskaidyti laikmačiai (kai valandos, minutės ir sekundės yra atskiri DOM mazgai) tvarkomi kopiant DOM medžiu aukštyn ieškant bendro tėvinio elemento.

**Kiekio aptikimas** naudoja reguliariųjų reiškinių atitikimą anglų ir lietuvių kalbomis pagal kuruotą deficito ir socialinio spaudimo frazių sąrašą.

### Kaip veikia testavimas

Po aptikimo fono paslaugų darbininkas (service worker) kiekvienam laikmaičiui vykdo iki penkių automatinių testų:

| Testas | Ką tikrina |
|---|---|
| **Persistence** (išlikimas) | Ar laikmatis išlieka perkrovus puslapį? |
| **Expiration** (pasibaigimas) | Ar laikmatis pasiekė nulį ir sustojo, ar iš naujo persikrautų? |
| **Cross-session** (skirtingi seansai) | Ar laikmatis rodo kitą reikšmę inkognito lange? |
| **Backend link** (ryšys su serveriu) | Ar puslapis siunčia XHR/fetch užklausas, susijusias su laiku ar kainodara? |
| **Reappearance** (pakartotinis pasirodymas) | Ar laikmatis vėl pasirodo ar atsinaujina po tariamo pabaigos? |

Testai vykdomi paslėptuose fono skirtukuose (su `?fake_urgency_test=1` užklausos parametru, kurį turinio scenarijus ignoruoja, siekiant išvengti begalinių ciklų). Vienu metu vykdomi ne daugiau nei 2 lygiagrečiai testai. Kiekvienas testas yra įvertinamas ir sveriamas, gaunant galutinį **0–100 balų** ir vieną iš trijų verdiktų: **Tikras**, **Įtartinas** arba **Netikras (klaidinantis)**.

---

## Failų struktūra

| Failas | Paskirtis |
|---|---|
| `manifest.json` | Plėtinio manifestas (MV3). Deklaruoja leidimus, registruoja turinio scenarijų ir paslaugų darbininką. |
| `content.js` | Įterpiamas į kiekvieną puslapį. Stebi DOM atgalinio skaičiavimo laikmačių ir kiekio indikatorių, pažymi juos vizualiai ir siunčia aptikimus į foną. |
| `background.js` | Paslaugų darbininkas. Gauna aptikimus, išsaugo juos į `chrome.storage.local` ir vykdo automatinius autentiškumo testus fono skirtukuose. |
| `popup.html` | Iššokančio lango HTML apvalkalas. |
| `popup.js` | Iššokančio lango logika. Nuskaito išsaugotus aptikimus iš saugyklos ir atvaizduoja juos sugrupuotus pagal svetainę, su kiekvieno laikmačio testų rezultatais ir klasifikacijos balais. |
| `style.css` | Įterpiamas stilių lapas. Prideda punktyrinius raudonus/oranžinius kontūrus pažymėtiems puslapio elementams. |

---

## Diegimas

Plėtinys įkeliamas kaip **nesupakuotas plėtinys** tiesiogiai iš šaltinio — nereikalingas joks kompiliavimo žingsnis ar paketų tvarkytuvė.

### Reikalavimai

- „Google Chrome“ (arba bet kokia „Chromium“ pagrindu veikianti naršyklė, pvz. „Edge“ ar „Brave“)
- Node.js ar kiti įrankiai nereikalingi

### Diegimo žingsniai

1. **Atsisiųskite arba klonuokite šią saugyklą** į aplanką savo kompiuteryje.

2. **Atidarykite „Chrome“** ir eikite į `chrome://extensions`.

3. **Įjunkite kūrėjo režimą** naudodami perjungiklį viršutiniame dešiniajame puslapio kampe.

4. Spustelėkite **„Load unpacked“** („Įkelti nesupakuotą“).

5. **Pasirinkite aplanką** su plėtinio failais (tą, kuriame yra `manifest.json`).

6. Plėtinys atsiras jūsų sąraše kaip **„Fake Urgency Detector“**, o jo piktograma — „Chrome“ įrankių juostoje.

> Jei pakeitėte bet kurį šaltinio failą, grįžkite į `chrome://extensions` ir spustelėkite **atnaujinimo piktogramą** ant plėtinio kortelės, kad jį perkrautumėte.

---

## Naudojimas

1. Naršykite bet kurią svetainę įprastai. Plėtinys veikia automatiškai fone.

> Naršyklėje gali trumpam atsidaryti papildomų skirtukų — tai normalu. Šie nauji skirtukai naudojami laikmačių autentiškumo testavimui ir bus uždaryti automatiškai.

2. Jei aptinkamas atgalinio skaičiavimo laikmatis arba riboto kiekio indikatorius, jis bus **vizualiai pažymėtas puslapyje**:
   - Raudonas punktyrinis rėmelis → atgalinio skaičiavimo laikmatis
   - Oranžinis punktyrinis rėmelis → kiekio / deficito indikatorius

3. Spustelėkite **plėtinio piktogramą** įrankių juostoje, kad atidarytumėte iššokantį langą. Jame rodoma:
   - Visi aptikimai **dabartiniame puslapyje** su laiko žymomis ir galiojimo info
   - Aptikimai iš **kitų anksčiau aplankytų svetainių**, sugrupuoti pagal prieglobos vardą
   - **Testų būsena ir verdiktas** (Tikras / Įtartinas / Netikras) kiekvienam aptikimui su balų juosta ir atskirų testų rezultatais

4. Naudokite mygtuką **„Highlight on Page“** iššokančiame lange, kad pažymėtumėte ir surastumėte konkretų aptiktą elementą.

5. Spustelėkite **„Clear All Saved“**, kad išvalytumėte išsaugotą aptikimų istoriją.

---

## Naudojami leidimai

| Leidimas | Kodėl reikalingas |
|---|---|
| `activeTab` | Elementų pažymėjimui dabartiniame skirtuke |
| `scripting` | Pažymėjimo scenarijaus įterpimui ir testų vykdymui fono skirtukuose |
| `tabs` | Paslėptų fono skirtukų atidarymui automatiniam testavimui |
| `storage` | Aptiktų laikmačių išsaugojimui tarp iššokančio lango atidarymo |
| `host_permissions: <all_urls>` | Turinio scenarijaus vykdymui visose svetainėse |

---

## Pastabos

- Plėtinys **nesiunčia jokių duomenų** išoriškai. Visas aptikimas, testavimas ir saugojimas vyksta lokaliai jūsų naršyklėje.
- Skirtingų seansų testas reikalauja, kad „Chrome“ leistų plėtiniui veikti inkognito režime. Tai galima įjungti plėtinio detalių puslapyje adresu `chrome://extensions`.
- Testai, susiję su laikmačio pasibaigimo laukimu (pakartotinio pasirodymo testas), gali užtrukti iki ~20 sekundžių po aptikimo.
- Plėtinys palaiko frazių atpažinimą tiek **anglų**, tiek **lietuvių** kalba.

---
---

# Fake Urgency Detector

A Chrome browser extension that automatically detects and marks **fake urgency dark patterns** on e-commerce and other websites — including countdown timers and limited-quantity indicators that may be manipulative or deceptive.

---

## What It Does

Many websites use psychological pressure tactics to push users into quick decisions. This extension detects two main categories:

**Countdown timers** — elements that visually count down to create a sense of time pressure (e.g. “Offer ends in 00:14:32“). The extension watches the DOM for numeric elements that actively decrease over time, then automatically tests whether the timer is genuine or fake.

**Limited quantity indicators** — text claiming scarcity (e.g. “Only 3 left in stock!“, “12 people are viewing this“). The extension scans for these phrases in both English and Lithuanian and flags suspicious ones.

Once detected, each element is:
- **Highlighted on the page** with a colored dashed border (red for timers, orange for quantity indicators)
- **Saved to extension storage** so it can be reviewed in the popup
- **Automatically tested** in the background to determine if it's real, fake, or suspicious

### How Detection Works

**Timer detection** uses a MutationObserver to watch for DOM nodes that contain short numeric values (1–2 digits) and update over time. A candidate element is only flagged after a 3-second observation window confirms the numbers are actually decreasing. Split timers (where hours, minutes, and seconds are separate DOM nodes) are handled by climbing the DOM tree to find a shared parent.

**Quantity detection** uses regex pattern matching in both English and Lithuanian against a curated list of scarcity and social pressure phrases.

### How Testing Works

After detection, the background service worker runs up to five automated tests for each timer:

| Test | What it checks |
|---|---|
| **Persistence** | Does the timer still exist if the page is reloaded? |
| **Expiration** | Did the timer actually reach zero and stop, or did it reset? |
| **Cross-session** | Does the timer show a different (non-personalized) value in an Incognito window? |
| **Backend link** | Does the page make XHR/fetch network requests related to timing or pricing? |
| **Reappearance** | After the timer supposedly expires, does it reappear or reset? |

Tests run in hidden background tabs (with a `?fake_urgency_test=1` query parameter, which the content script ignores to avoid infinite loops). Up to 2 tests run in parallel. Each test is scored and weighted to produce a final **0–100 score** and one of three verdicts: **Real**, **Suspicious**, or **Fake (Deceptive)**.

---

## Files in This Repository

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3). Declares permissions, registers the content script and service worker. |
| `content.js` | Injected into every page. Watches the DOM for countdown timers and quantity indicators, marks them visually, and sends detections to the background. |
| `background.js` | Service worker. Receives detections, saves them to `chrome.storage.local`, and runs the automated authenticity tests in background tabs. |
| `popup.html` | HTML shell for the extension popup. |
| `popup.js` | Popup logic. Reads saved detections from storage and renders them grouped by site, with per-timer test results and classification scores. |
| `style.css` | Injected stylesheet. Adds dashed red/orange outlines to flagged elements on the page. |

---

## Installation

This extension is loaded as an **unpacked extension** directly from source — no build step or bundler is required.

### Prerequisites

- Google Chrome (or any Chromium-based browser such as Edge or Brave)
- No Node.js or other tooling needed

### Steps

1. **Download or clone this repository** to a folder on your computer.

2. **Open Chrome** and navigate to `chrome://extensions`.

3. **Enable Developer Mode** using the toggle in the top-right corner of the page.

4. Click **“Load unpacked“**.

5. **Select the folder** containing the extension files (the one with `manifest.json` in it).

6. The extension will appear in your list as **“Fake Urgency Detector“** and its icon will appear in the Chrome toolbar.

> If you make changes to any source file, go back to `chrome://extensions` and click the **refresh icon** on the extension card to reload it.

---

## Usage

1. Browse any website normally. The extension runs automatically in the background.

> Additional tabs in the browser may be opened for a moment, this is normal. These new tabs are used by the extension for timer legitimacy testing and will be closed automatically.

2. If a countdown timer or limited-quantity indicator is detected, it will be **visually highlighted on the page**:
   - Red dashed border → countdown timer
   - Orange dashed border → quantity/scarcity indicator

3. Click the **extension icon** in the toolbar to open the popup. It shows:
   - All detections on the **current page**, with timestamps and expiry info
   - Detections from **other previously visited sites**, grouped by hostname
   - The **test status and verdict** (Real / Suspicious / Fake) for each detection, with a score bar and the individual test results

4. Use the **“Highlight on Page“** button in the popup to scroll to and flash a specific detected element.

5. Click **“Clear All Saved“** to wipe the stored detection history.

---

## Permissions Used

| Permission | Why it's needed |
|---|---|
| `activeTab` | To highlight elements on the currently open tab |
| `scripting` | To inject the highlight script and run tests in background tabs |
| `tabs` | To open hidden background tabs for automated testing |
| `storage` | To persist detected timers across popup opens |
| `host_permissions: <all_urls>` | To run the content script on all websites |

---

## Notes

- The extension does **not** send any data externally. All detection, testing, and storage is local to your browser.
- The cross-session test requires that Chrome allows the extension in Incognito mode. You can enable this on the extension's detail page at `chrome://extensions`.
- Tests involving timer expiration (the reappearance test) may take up to ~20 seconds to complete after a detection.
- The extension includes pattern matching for both **English** and **Lithuanian** language sites.

# Tartu E-Bike 300 🚲⚡

Elektriratta simulaator **päris Tartus**: iga maja, tänav, pood, park ja Emajõgi tulevad OpenStreetMapist.
Linnast välja viivad maanteed (Tallinna, Riia, Võru, Narva mnt jne), nii et saab sõita **300 km/h**.
Ratast juhitakse **veebikaameraga**, ja gaasi, piduri ning rooli **AI-d saad ise treenida**.

## GitHubis käivitamine (GitHub Pages)

1. Loo GitHubis uus repo, nt `tartu-ebike` (Public).
2. Vajuta **Add file → Upload files** ja lohista sinna **kogu selle kausta sisu** (`index.html`, `style.css`, `js/`, `data/`, `.nojekyll`). Vajuta **Commit changes**.
3. Ava **Settings → Pages**. Vali **Source: Deploy from a branch**, **Branch: main**, kaust **/ (root)** ja vajuta **Save**.
4. Umbes minuti pärast on mäng aadressil `https://SINU-NIMI.github.io/tartu-ebike/`.

Kaamera töötab ainult **https** lehel (GitHub Pages on https), kohalikult avatud failina või `localhost`-is.

## Esimene käivitus: kaart

Esimesel korral laeb mäng Tartu andmed OpenStreetMapist. See võtab **1–3 minutit** ja umbes 20–40 MB.
Pärast seda on kaart brauseri vahemälus ja avaneb kiiresti.

**Soovitus:** menüüs **„Kaart ja failid“ → „💾 Salvesta kaardifail“** ja laadi saadud `tartu-osm.json` reposse kausta `data/`.
Siis laeb mäng kaardi otse sinu GitHubist (kiire, töötab ka siis, kui OpenStreetMap on aeglane).

## Juhtimine

| Mis | Klaviatuur / pult | Kaamera |
|---|---|---|
| Gaas | `W` / `↑` / pult R2 | käiguvahetaja |
| Pidur | `S` / `↓` / tühik / pult L2 | pidurihoob |
| Rool | `A` `D` / `←` `→` / pult kang | pea kallutamine |
| Teleport (Raekoja plats, Tallinna mnt, Ihaste, Lõunakeskus, Annelinn, ERM, Riia/Võru/Narva mnt) | `T` | |
| Tagasi Raekoja platsile + aku täis | `R` | |
| Kaamera ja AI seaded | `C` | |
| Minikaardi suum | `M` | |

## AI treenimine (gaas, pidur, rool)

1. Vajuta **„🎥 Kaamera + AI juhtimine“** ja luba kaamera.
2. Joonista pildile kolm kasti: 🔴 **Pidur** pidurihoova peale, 🟢 **Gaas** käiguvahetaja peale, 🟡 **Pea** oma pea ümber.
3. Igal juhtimisel on nupud iga olukorra jaoks:
   - PIDUR: `lahti`, `vajutatud`
   - GAAS: `lahti`, `pool`, `täis`
   - ROOL: `vasak`, `otse`, `parem`
   Kliki nupule, siis on **3 sekundit** aega käed rattale panna, ja **4 sekundit** salvestatakse näiteid.
   Salvesta iga olukorda 2–3 korda, natuke erinevalt (veidi teise nurga või valgusega). Mida rohkem, seda parem.
4. Vajuta **„🧠 Treeni AI“**. Graafik näitab, kui täpne AI on (eesmärk 90%+).
5. Proovi: kasti juures näed AI ennustust protsentides. Kui miski läheb valesti, salvesta sellest olukorrast juurde näiteid ja treeni uuesti.
6. **„⬇ Ekspordi AI“** salvestab mudeli ja näited faili. Kui paned selle reposse nimega `data/ai-model.json`, laeb mäng selle automaatselt igas arvutis.

AI on väike närvivõrk (MLP), mis jookseb täielikult sinu brauseris. Pilte kuhugi ei saadeta.

## Failid

- `index.html`, `style.css`: leht ja välimus
- `js/osm.js`: kaardi laadimine (OpenStreetMap / vahemälu / `data/tartu-osm.json`)
- `js/world.js`: 3D maailm: majad (päris kuju ja kõrgus), teed, jõgi, pargid, puud, poodide sildid
- `js/traffic.js`: autod päris tänavavõrgus
- `js/ai.js`: närvivõrk ja treenimine
- `js/vision.js`: kaamera, kastid, kalibreerimine
- `js/game.js`: mäng, füüsika, minikaart, menüüd
- `js/fallback.js`: lihtsustatud varukaart, kui internetti pole
- `js/three.min.js`: Three.js r149 (MIT)

Kaardiandmed © OpenStreetMapi kaastöötajad (ODbL).

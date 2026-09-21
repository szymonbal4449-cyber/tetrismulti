# TETRA ARENA — Tetris multiplayer online

Tetris dla **2–4 graczy** przez internet, bez rejestracji. Host tworzy pokój, dostaje
**5-znakowy kod** i wysyła go znajomym — oni wpisują kod na stronie i grają.

## Tryby

- **WALKA** — każdy na własnej planszy. Wybijane linie wysyłają śmieci do wszystkich
  przeciwników (z kombem bardziej). Ostatni, którego nie zakopie, wygrywa.
- **WSPÓŁPRACA** — jedna wspólna plansza dla całej drużyny. Każdy rzuca własną kawałką,
  a co jakiś czas z góry schodzi ściana-śmieci, która wpiera się w stertę. Pobicie rekordu
  linii, zanim wieża urośnie nad planszę.

W obu trybach: 7-bag, rotacje SRS z wall-kicks, ghost, hold (walka), soft/hard drop,
poziomy rosnące z liczbą linii, dźwięki WebAudio, sterowanie klawiaturą i dotykiem.

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| ← → (A D) | ruch |
| ↓ (S) | miękki drop |
| ↑ / W / X | obrót w prawo |
| Z | obrót w lewo |
| Spacja | twardy drop |
| C | hold (tylko walka) |

## Jak uruchomić

Wymagania: **Node.js 18+** i **PostgreSQL**.

```bash
npm install

# ustaw w .env adres bazy, np.:
# DATABASE_URL=postgresql://user:pass@localhost:5432/app_db

npx drizzle-kit push     # utworzy tabele w bazie
npm run build
npm start                # np. na porcie 3000: PORT=8080 npm start
```

Aby grać z drugiego komputera, udostępnij port (np. `ssh -L` / reverse proxy / tunel)
i podaj znajomym adres strony.

## Wymagania hostingowe (WAŻNE)

Multiplayer działa przez **stan w pamięci procesu Node + polling HTTP** — więc aplikację
trzeba hostować na **serwerze z trwałym procesem Node**:

- VPS (Hetzner, OVH, DigitalOcean...) + `pm2` / `systemd`,
- Render / Fly.io / Railway (web service, nie background worker),
- domyślny Docker: `node server.js` po `npm run build`.

**Nie hostuj na serverless bez trwałego procesu** (np. Vercel hobby / AWS Lambda) —
pokoje giną po zamarznięciu funkcji. Baza PostgreSQL przechowuje metadane pokoi,
ale aktywna gra żyje w pamięci serwera.

## Architektura

- `src/game/core.ts` — siatka, figury, SRS/kicks, linie, garb
- `src/game/engine.ts` — silnik lokalny trybu walki (snappy sterowanie na kliencie)
- `src/game/coop.ts` — silnik trybu współpracy (autorytatywny serwer, tick 100 ms)
- `src/server/rooms.ts` — rejestr pokoi, kodowanie, eliminacje, persystencja do Postgresa
- `src/app/api/rooms/*` — REST: tworzenie pokoju, join, start, locki, inputy, polling
- `src/components/BattleView.tsx` / `CoopView.tsx` — canvas 60 fps, cząsteczki, screen shake

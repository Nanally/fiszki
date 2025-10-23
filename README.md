## Chińskie Fiszki HSK1

Next.js + Supabase aplikacja do nauki słówek z listy HSK1. Pozwala przeglądać fiszki, odsłuchiwać wymowę, oznaczać opanowane słówka oraz dodawać nowe pozycje na bazie istniejącej listy HSK lub ręcznie.

### ✅ Stos
- Next.js (app router) + TypeScript + Tailwind
- Supabase (Postgres + Storage na audio)
- Script do importu listy HSK1 z pliku CSV

---

## 1. Wymagania
- Node.js 18.15+ (zalecane 18.18 lub 20 LTS)
- Konto Supabase (darmowy tier wystarczy)

Zainstaluj zależności:
```bash
npm install
```

---

## 2. Konfiguracja Supabase
1. W projekcie Supabase utwórz bazę danych i w zakładce **SQL Editor** uruchom skrypt `supabase/schema.sql`:
   ```sql
   -- supabase/schema.sql
   ```
   Doda tabele:
   - `hsk_reference` – słownik bazowy HSK (hanzi, pinyin, tłumaczenia, link do audio)
   - `flashcards` – Twoje fiszki wraz z flagą `is_mastered`

2. W zakładce **Authentication → Policies** zdecyduj o zabezpieczeniach. Przy prywatnej aplikacji najprościej na starcie **wyłączyć RLS** dla obu tabel (lub dodać politykę `allow all` dla roli `anon`).

3. W ustawieniach projektu skopiuj:
   - `Project URL`
   - `anon public API key`
   - `service_role key` (potrzebny tylko do importu CSV)

4. Utwórz plik `.env.local` (na bazie `.env.example`):
   ```bash
   cp .env.example .env.local
   ```
   Uzupełnij klucze:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=... # import + endpoint /api/tts, nie commitujemy
   ELEVENLABS_API_KEY=...         # klucz API z ElevenLabs
   ELEVENLABS_VOICE_ID=...        # np. voice dla chińskiego
   TTS_AUDIO_BUCKET=audio         # opcjonalnie, domyślnie 'audio'
   ```

5. W **Storage → Buckets** utwórz publiczny koszyk (np. `audio`), który będzie przechowywał wygenerowane pliki MP3. Jeśli używasz innej nazwy, wpisz ją w `TTS_AUDIO_BUCKET`.

---

## 3. Import listy HSK1
1. Przygotuj plik CSV z kolumnami:
   ```
   hanzi,pinyin,meaning_en,meaning_pl,audio_url,level
   ```
   W katalogu `data/` znajdziesz przykładowy plik `hsk1-sample.csv` (5 rekordów).

2. Uruchom import (używa `SUPABASE_SERVICE_ROLE_KEY`, więc najlepiej zrobić to lokalnie i usunąć zmienną po skończeniu):
   ```bash
   node scripts/import-hsk1.mjs data/hsk1-sample.csv
   ```
   albo z własnym plikiem:
   ```bash
   node scripts/import-hsk1.mjs /ścieżka/do/hsk1.csv
   ```

3. Po imporcie możesz od razu korzystać z wbudowanego generatora audio (przycisk „Generuj audio”). Nowe nagrania są tworzone w ElevenLabs i automatycznie trafiają do wskazanego koszyka Supabase.

---

## 4. Generowanie audio (ElevenLabs)
1. Dodaj w ElevenLabs voice wspierający język chiński i skopiuj jego `voice_id` (np. z dashboardu → Voices → „Voice ID”).
2. Ustaw w `.env.local` klucze:
   ```env
   ELEVENLABS_API_KEY=sk_...
   ELEVENLABS_VOICE_ID=...
   ```
3. Upewnij się, że bucket Supabase (domyślnie `audio`) ma włączony publiczny dostęp odczytu oraz uprawnienia zapisu dla roli `service_role`.
4. W formularzu dodawania fiszek użyj przycisku „Generuj audio (ElevenLabs)”. Po wygenerowaniu link do MP3 zostanie automatycznie zapisany w polu `audio_url` i trafi do nowej fiszki.

---

## 5. Uruchomienie aplikacji
```bash
npm run dev
```

Strona będzie dostępna pod adresem [http://localhost:3000](http://localhost:3000).

### Widoki
- **Przegląd fiszek**: mobile-first, przewijanie lewo/prawo, przycisk audio, komentarz pod ikoną notatki.
- **Dodawanie słówek**:
  - Pole na polskie tłumaczenie.
  - Wyszukiwarka w bazie HSK (po polsku/angielsku/pinyin/hanzi).
  - Tryb ręczny (gdy słówka brak w bazie).
  - Opcjonalny komentarz.

---

## 6. Kolejne kroki
1. Dodać prawdziwy zestaw HSK1 (np. `hskhsk.com`, Anki deck) – po imporcie aplikacja od razu zadziała.
2. Uporządkować polityki RLS i dodać prostą autoryzację (NextAuth/Supabase Auth) jeżeli appka ma trafić do innych użytkowników.
3. Dodać tryb quizu, statystyki lub grupowanie fiszek według tematów.

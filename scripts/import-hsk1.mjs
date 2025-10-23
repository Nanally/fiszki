import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const projectRoot = process.cwd();
const envLocalPath = path.resolve(projectRoot, '.env.local');
const envPath = path.resolve(projectRoot, '.env');

loadEnv({ path: envLocalPath, override: true });
loadEnv({ path: envPath });

const FILE_ARGUMENT = process.argv[2];
const dataPath = FILE_ARGUMENT
  ? path.resolve(projectRoot, FILE_ARGUMENT)
  : path.resolve(projectRoot, 'data/hsk1.csv');

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error(
      'Brak zmiennych SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL oraz SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }

  const csvRaw = await readFile(dataPath, 'utf8');
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
  });

  if (!rows.length) {
    console.error('Plik CSV nie zawiera żadnych rekordów.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    `Importuję ${rows.length} rekordów z pliku ${path.basename(dataPath)}...`
  );

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      hanzi: row.hanzi,
      pinyin: row.pinyin,
      meaning_en: row.meaning_en,
      meaning_pl: row.meaning_pl || null,
      audio_url: row.audio_url || null,
      level: row.level || 'HSK1',
    }));

    const { error } = await supabase.from('hsk_reference').upsert(chunk, {
      onConflict: 'hanzi,pinyin',
      ignoreDuplicates: false,
    });

    if (error) {
      console.error('Błąd importu:', error.message);
      process.exit(1);
    }

    console.log(`Zaimportowano ${Math.min(i + chunkSize, rows.length)} rekordów`);
  }

  console.log('Import zakończony powodzeniem.');
}

main().catch((error) => {
  console.error('Nieoczekiwany błąd:', error);
  process.exit(1);
});

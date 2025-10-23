export type Flashcard = {
  id: string;
  polish: string;
  hanzi: string;
  pinyin: string;
  audio_url: string | null;
  comment: string | null;
  is_mastered: boolean;
  created_at: string;
  hsk_reference_id: string | null;
};

export type HskReference = {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning_en: string;
  meaning_pl: string | null;
  audio_url: string | null;
  level: string;
};

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Flashcard } from './types';

type OfflineStatusDetail = {
  cardId: string;
  cached: boolean;
  audioStored: boolean;
};

type OfflineStatusListener = (detail: OfflineStatusDetail) => void;

interface FlashcardOfflineSchema extends DBSchema {
  cards: {
    key: string;
    value: {
      card: Flashcard;
      cachedAt: number;
      audioStored: boolean;
    };
  };
  audio: {
    key: string;
    value: {
      cardId: string;
      blob: Blob;
      cachedAt: number;
      type: string | undefined;
    };
  };
}

type CacheResult = OfflineStatusDetail;

const DB_NAME = 'flashcards-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FlashcardOfflineSchema>> | null = null;
const listeners = new Set<OfflineStatusListener>();
const audioObjectUrls = new Map<string, string>();

const isBrowser = typeof window !== 'undefined';

async function getDb(): Promise<IDBPDatabase<FlashcardOfflineSchema>> {
  if (!isBrowser) {
    throw new Error('Offline cache is only available in the browser runtime.');
  }

  if (!dbPromise) {
    dbPromise = openDB<FlashcardOfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('cards')) {
          database.createObjectStore('cards');
        }
        if (!database.objectStoreNames.contains('audio')) {
          database.createObjectStore('audio');
        }
      },
    });
  }

  return dbPromise;
}

function emit(detail: OfflineStatusDetail) {
  listeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.error('Offline status listener crashed', error);
    }
  });
}

function revokeAudioObjectUrl(cardId: string) {
  const existingUrl = audioObjectUrls.get(cardId);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    audioObjectUrls.delete(cardId);
  }
}

export function subscribeOfflineStatus(listener: OfflineStatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getOfflineStatusSnapshot(): Promise<Record<string, { audioStored: boolean }>> {
  if (!isBrowser) {
    return {};
  }
  const db = await getDb();
  const entries = await db.getAll('cards');
  return entries.reduce<Record<string, { audioStored: boolean }>>((acc, item) => {
    acc[item.card.id] = { audioStored: item.audioStored };
    return acc;
  }, {});
}

export async function isCardCached(cardId: string): Promise<boolean> {
  if (!isBrowser) {
    return false;
  }
  const db = await getDb();
  const record = await db.get('cards', cardId);
  return Boolean(record);
}

export async function cacheCardOffline(card: Flashcard): Promise<CacheResult> {
  if (!isBrowser) {
    throw new Error('Caching offline is only available in the browser.');
  }

  const db = await getDb();
  const cachedAt = Date.now();

  let audioStored = false;
  if (card.audio_url) {
    try {
      const response = await fetch(card.audio_url);
      if (!response.ok) {
        throw new Error(`Audio request failed with status ${response.status}`);
      }
      const blob = await response.blob();
      await db.put(
        'audio',
        {
          cardId: card.id,
          blob,
          cachedAt,
          type: blob.type || undefined,
        },
        card.id
      );
      audioStored = true;
    } catch (error) {
      console.error('Failed to cache flashcard audio', error);
    }
  } else {
    await db.delete('audio', card.id);
  }

  await db.put(
    'cards',
    {
      card,
      cachedAt,
      audioStored,
    },
    card.id
  );

  revokeAudioObjectUrl(card.id);
  const result: CacheResult = {
    cardId: card.id,
    cached: true,
    audioStored,
  };
  emit(result);

  return result;
}

export async function removeCardFromOffline(cardId: string): Promise<void> {
  if (!isBrowser) {
    return;
  }
  const db = await getDb();
  await Promise.all([db.delete('cards', cardId), db.delete('audio', cardId)]);
  revokeAudioObjectUrl(cardId);
  emit({ cardId, cached: false, audioStored: false });
}

export async function getOfflineCard(cardId: string): Promise<Flashcard | null> {
  if (!isBrowser) {
    return null;
  }
  const db = await getDb();
  const record = await db.get('cards', cardId);
  return record?.card ?? null;
}

export async function getAllOfflineCards(): Promise<Flashcard[]> {
  if (!isBrowser) {
    return [];
  }
  const db = await getDb();
  const records = await db.getAll('cards');
  return records.map((item) => item.card);
}

export async function getPlayableAudioUrl(cardId: string, fallbackRemoteUrl?: string | null): Promise<string | null> {
  if (!isBrowser) {
    return fallbackRemoteUrl ?? null;
  }

  if (audioObjectUrls.has(cardId)) {
    return audioObjectUrls.get(cardId) ?? null;
  }

  const db = await getDb();
  const audioRecord = await db.get('audio', cardId);
  if (audioRecord?.blob) {
    const objectUrl = URL.createObjectURL(audioRecord.blob);
    audioObjectUrls.set(cardId, objectUrl);
    return objectUrl;
  }

  return fallbackRemoteUrl ?? null;
}

export async function clearOfflineCache(): Promise<void> {
  if (!isBrowser) {
    return;
  }
  const db = await getDb();
  await Promise.all([db.clear('cards'), db.clear('audio')]);
  Array.from(audioObjectUrls.keys()).forEach((cardId) => revokeAudioObjectUrl(cardId));
}

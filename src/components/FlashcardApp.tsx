'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  cacheCardOffline,
  getAllOfflineCards,
  getOfflineCardCollections,
  getOfflineCollections,
  getOfflineStatusSnapshot,
  getPlayableAudioUrl,
  removeCardFromOffline,
  subscribeOfflineStatus,
  updateCachedCardCollections,
  upsertCollectionsOffline,
} from '@/lib/offlineCache';
import type { Collection, Flashcard, HskReference } from '@/lib/types';

type Filter = 'all' | 'new' | 'mastered';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'ALL',
  new: 'LEARN',
  mastered: 'GOT IT',
};

const emptyStateCopy = {
  all: 'Brak fiszek. Dodaj pierwsze słówko, aby zacząć naukę.',
  new: 'Wszystkie słówka oznaczone jako opanowane – czas dodać nowe.',
  mastered: 'Jeszcze żadnego słówka nie oznaczono jako opanowane.',
};

const offlineEmptyStateCopy = {
  all: 'Brak zapisanych offline fiszek. Zapisz wybrane słówka, gdy jesteś online.',
  new: 'Brak zapisanych offline fiszek do nauki.',
  mastered: 'Brak zapisanych offline fiszek oznaczonych jako opanowane.',
};

const FALLBACK_MESSAGE = 'Tryb offline: wyświetlam zapisane fiszki.';
const FALLBACK_EMPTY_MESSAGE = 'Brak zapisanych offline fiszek. Zapisz je, gdy masz połączenie.';

const sortByCreatedAt = <T extends { created_at: string }>(items: T[]) =>
  [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = hex.replace('#', '');
  const normalized =
    cleaned.length === 3 ? cleaned.split('').map((char) => `${char}${char}`).join('') : cleaned;
  if (normalized.length !== 6) {
    return null;
  }
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return null;
  }
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const gradientFromHex = (hex?: string | null) => {
  if (!hex) {
    return null;
  }
  const start = hexToRgba(hex, 0.85);
  const end = hexToRgba(hex, 0.55);
  if (!start || !end) {
    return null;
  }
  return `linear-gradient(135deg, ${start}, ${end})`;
};

export function FlashcardApp() {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [cardCollectionsMap, setCardCollectionsMap] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCollectionsPanelOpen, setCollectionsPanelOpen] = useState(false);

  const [polishInput, setPolishInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualHanzi, setManualHanzi] = useState('');
  const [manualPinyin, setManualPinyin] = useState('');
  const [manualAudio, setManualAudio] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);

  const [lookupResults, setLookupResults] = useState<HskReference[]>([]);
  const [selectedReference, setSelectedReference] = useState<HskReference | null>(null);
  const [searchingReference, setSearchingReference] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [offlineStatusMap, setOfflineStatusMap] = useState<Record<string, { audioStored: boolean }>>({});
  const [offlineBusyMap, setOfflineBusyMap] = useState<Record<string, boolean>>({});
  const [offlineFallbackActive, setOfflineFallbackActive] = useState(false);

  const [collectionActionBusyMap, setCollectionActionBusyMap] = useState<Record<string, boolean>>({});
  const [collectionFormBusy, setCollectionFormBusy] = useState(false);
  const [collectionFormError, setCollectionFormError] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionColor, setNewCollectionColor] = useState('#0ea5e9');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState('');

  const cards = useMemo(() => {
    let next = allCards;
    if (filter === 'new') {
      next = next.filter((item) => !item.is_mastered);
    } else if (filter === 'mastered') {
      next = next.filter((item) => item.is_mastered);
    }
    if (activeCollectionId) {
      next = next.filter((item) => (cardCollectionsMap[item.id] ?? []).includes(activeCollectionId));
    }
    return next;
  }, [allCards, cardCollectionsMap, filter, activeCollectionId]);

  const masteredCount = useMemo(() => cards.filter((card) => card.is_mastered).length, [cards]);

  const collectionUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(cardCollectionsMap).forEach((collectionIds) => {
      collectionIds.forEach((collectionId) => {
        counts[collectionId] = (counts[collectionId] ?? 0) + 1;
      });
    });
    return counts;
  }, [cardCollectionsMap]);

  const activeCollection = useMemo(
    () =>
      activeCollectionId ? collections.find((collection) => collection.id === activeCollectionId) ?? null : null,
    [activeCollectionId, collections]
  );

  const activeCard = cards[activeIndex] ?? null;
  const activeCardCollectionIds = activeCard ? cardCollectionsMap[activeCard.id] ?? [] : [];
  const primaryCollectionColor =
    (activeCollection && activeCardCollectionIds.includes(activeCollection.id) && activeCollection.color) ||
    collections.find((collection) => activeCardCollectionIds.includes(collection.id))?.color ||
    null;
  const cardBackGradient = gradientFromHex(primaryCollectionColor);

  const swipeStartX = useRef<number | null>(null);
  const swipeDetected = useRef(false);

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, a, input, textarea, select'));
  };

  useEffect(() => {
    if (!cards.length) {
      setActiveIndex(0);
      setShowTranslation(false);
      return;
    }
    setActiveIndex((previous) => Math.min(previous, cards.length - 1));
  }, [cards.length]);

  useEffect(() => {
    setShowTranslation(false);
  }, [filter, activeCollectionId]);

  useEffect(() => {
    let cancelled = false;

    const loadFromOffline = async () => {
      try {
        const offlineCards = await getAllOfflineCards();
        const offlineMembership = await getOfflineCardCollections();
        if (cancelled) return;

        setAllCards(sortByCreatedAt(offlineCards));
        setCardCollectionsMap(offlineMembership);
        setStatusMessage(offlineCards.length ? FALLBACK_MESSAGE : FALLBACK_EMPTY_MESSAGE);
        setOfflineFallbackActive(offlineCards.length > 0);
        setError(null);
      } catch (fallbackError) {
        console.error('Nie udało się wczytać danych offline', fallbackError);
        if (!cancelled) {
          setError('Nie udało się pobrać fiszek ani wczytać danych offline.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCards(false);
        }
      }
    };

    const load = async () => {
      setLoadingCards(true);
      setError(null);
      setStatusMessage(null);
      setOfflineFallbackActive(false);

      if (!supabase) {
        await loadFromOffline();
        return;
      }

      try {
        const { data, error: loadError } = await supabase
          .from('flashcards')
          .select('*, flashcard_collections(collection_id)')
          .order('created_at', { ascending: true });

        if (loadError) {
          console.warn('Nie udało się pobrać fiszek z Supabase', loadError);
          await loadFromOffline();
          return;
        }

        const rows = (data ?? []) as (Flashcard & { flashcard_collections?: { collection_id: string }[] })[];
        const membership: Record<string, string[]> = {};
        const cardsOnly = rows.map((row) => {
          const collectionIds = row.flashcard_collections?.map((item) => item.collection_id) ?? [];
          membership[row.id] = collectionIds;
          const { flashcard_collections, ...card } = row;
          return card;
        });

        if (cancelled) return;

        setAllCards(sortByCreatedAt(cardsOnly));
        setCardCollectionsMap(membership);
        setLoadingCards(false);
      } catch (requestError) {
        console.error('Błąd podczas pobierania fiszek', requestError);
        await loadFromOffline();
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCollections = async () => {
      if (!supabase) {
        const offlineCollections = sortByCreatedAt(await getOfflineCollections());
        if (!cancelled) {
          setCollections(offlineCollections);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('collections')
          .select()
          .order('created_at', { ascending: true });

        if (error) {
          throw error;
        }

        const list = sortByCreatedAt((data ?? []) as Collection[]);
        if (!cancelled) {
          setCollections(list);
          void upsertCollectionsOffline(list);
        }
      } catch (collectionError) {
        console.error('Nie udało się pobrać zbiorów', collectionError);
        const offlineCollections = sortByCreatedAt(await getOfflineCollections());
        if (!cancelled) {
          setCollections(offlineCollections);
        }
      }
    };

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (!lookupQuery || lookupQuery.trim().length < 2) {
      setLookupResults([]);
      return;
    }

    let cancelled = false;
    const performLookup = async () => {
      setSearchingReference(true);
      const { data, error: lookupError } = await supabase!
        .from('hsk_reference')
        .select()
        .ilike('meaning_pl', `%${lookupQuery.trim()}%`)
        .limit(15);

      if (!cancelled) {
        if (lookupError) {
          setFormMessage(`Błąd wyszukiwania: ${lookupError.message}`);
        } else {
          setLookupResults(data ?? []);
        }
        setSearchingReference(false);
      }
    };

    void performLookup();

    return () => {
      cancelled = true;
    };
  }, [lookupQuery]);

  useEffect(() => {
    setGeneratedAudioUrl(null);
  }, [selectedReference?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadOfflineSnapshot = async () => {
      try {
        const snapshot = await getOfflineStatusSnapshot();
        if (!cancelled) {
          setOfflineStatusMap(snapshot);
        }
      } catch (error) {
        console.error('Nie udało się odczytać pamięci offline', error);
      }
    };

    void loadOfflineSnapshot();

    const unsubscribe = subscribeOfflineStatus((detail) => {
      setOfflineStatusMap((prev) => {
        const next = { ...prev };
        if (detail.cached) {
          next[detail.cardId] = { audioStored: detail.audioStored };
        } else {
          delete next[detail.cardId];
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setOfflineBusyMap((prev) => {
      const next = { ...prev };
      const currentIds = new Set(allCards.map((card) => card.id));
      Object.keys(next).forEach((cardId) => {
        if (!currentIds.has(cardId)) {
          delete next[cardId];
        }
      });
      return next;
    });
  }, [allCards]);

  const updateOfflineBusy = (cardId: string, value: boolean) => {
    setOfflineBusyMap((prev) => {
      const next = { ...prev };
      if (value) {
        next[cardId] = true;
      } else {
        delete next[cardId];
      }
      return next;
    });
  };

  const updateCollectionBusy = (collectionId: string, value: boolean) => {
    setCollectionActionBusyMap((prev) => {
      const next = { ...prev };
      if (value) {
        next[collectionId] = true;
      } else {
        delete next[collectionId];
      }
      return next;
    });
  };

  const handleCreateCollection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setCollectionFormError('Brak połączenia z Supabase. Spróbuj ponownie, gdy będziesz online.');
      return;
    }

    const trimmedName = newCollectionName.trim();
    if (!trimmedName) {
      setCollectionFormError('Podaj nazwę zbioru.');
      return;
    }

    setCollectionFormBusy(true);
    setCollectionFormError(null);

    try {
      const payload = { name: trimmedName, color: newCollectionColor };
      const { data, error } = await supabase
        .from('collections')
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const created = data as Collection;
      setCollections((prev) => {
        const next = sortByCreatedAt([...prev, created]);
        void upsertCollectionsOffline(next);
        return next;
      });
      setNewCollectionName('');
    } catch (createError) {
      console.error('Nie udało się utworzyć zbioru', createError);
      setCollectionFormError('Nie udało się utworzyć zbioru.');
    } finally {
      setCollectionFormBusy(false);
    }
  };

  const handleRenameCollection = async (
    event: React.FormEvent<HTMLFormElement>,
    collectionId: string
  ) => {
    event.preventDefault();
    if (!supabase) {
      setCollectionFormError('Brak połączenia z Supabase. Spróbuj ponownie, gdy będziesz online.');
      return;
    }

    const trimmedName = editingCollectionName.trim();
    if (!trimmedName) {
      setCollectionFormError('Podaj nazwę zbioru.');
      return;
    }

    updateCollectionBusy(collectionId, true);
    setCollectionFormError(null);

    try {
      const { error } = await supabase
        .from('collections')
        .update({ name: trimmedName })
        .eq('id', collectionId);

      if (error) {
        throw error;
      }

      setCollections((prev) => {
        const updated = prev.map((collection) =>
          collection.id === collectionId ? { ...collection, name: trimmedName } : collection
        );
        const sorted = sortByCreatedAt(updated);
        void upsertCollectionsOffline(sorted);
        return sorted;
      });
      setEditingCollectionId(null);
      setEditingCollectionName('');
    } catch (renameError) {
      console.error('Nie udało się zmienić nazwy zbioru', renameError);
      setCollectionFormError('Nie udało się zmienić nazwy zbioru.');
    } finally {
      updateCollectionBusy(collectionId, false);
    }
  };

  const handleCollectionColorChange = async (collectionId: string, color: string) => {
    if (!supabase) {
      setCollectionFormError('Brak połączenia z Supabase. Spróbuj ponownie, gdy będziesz online.');
      return;
    }

    updateCollectionBusy(collectionId, true);
    setCollectionFormError(null);

    try {
      const { error } = await supabase
        .from('collections')
        .update({ color })
        .eq('id', collectionId);

      if (error) {
        throw error;
      }

      setCollections((prev) => {
        const next = prev.map((collection) =>
          collection.id === collectionId ? { ...collection, color } : collection
        );
        void upsertCollectionsOffline(next);
        return next;
      });
    } catch (colorError) {
      console.error('Nie udało się zaktualizować koloru zbioru', colorError);
      setCollectionFormError('Nie udało się zaktualizować koloru zbioru.');
    } finally {
      updateCollectionBusy(collectionId, false);
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!supabase) {
      setCollectionFormError('Brak połączenia z Supabase. Spróbuj ponownie, gdy będziesz online.');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Usunąć wybrany zbiór?');
      if (!confirmed) {
        return;
      }
    }

    updateCollectionBusy(collectionId, true);
    setCollectionFormError(null);

    try {
      const { error } = await supabase.from('collections').delete().eq('id', collectionId);
      if (error) {
        throw error;
      }

      setCollections((prev) => {
        const next = prev.filter((collection) => collection.id !== collectionId);
        void upsertCollectionsOffline(next);
        return next;
      });

      if (activeCollectionId === collectionId) {
        setActiveCollectionId(null);
      }

      const changed: Array<[string, string[]]> = [];
      setCardCollectionsMap((prev) => {
        const next: Record<string, string[]> = {};
        Object.entries(prev).forEach(([cardId, collectionIds]) => {
          const filtered = collectionIds.filter((id) => id !== collectionId);
          if (filtered.length !== collectionIds.length) {
            changed.push([cardId, filtered]);
          }
          next[cardId] = filtered;
        });
        return next;
      });

      changed.forEach(([cardId, collectionIds]) => {
        void updateCachedCardCollections(cardId, collectionIds);
      });
    } catch (deleteError) {
      console.error('Nie udało się usunąć zbioru', deleteError);
      setCollectionFormError('Nie udało się usunąć zbioru.');
    } finally {
      updateCollectionBusy(collectionId, false);
    }
  };

  const handleToggleCardCollectionMembership = async (collectionId: string) => {
    const card = cards[activeIndex];
    if (!card) {
      return;
    }

    if (!supabase) {
      setFormMessage('Zarządzanie zbiorami wymaga połączenia z Supabase.');
      return;
    }

    const cardId = card.id;
    const currentCollections = cardCollectionsMap[cardId] ?? [];
    const willAssign = !currentCollections.includes(collectionId);

    updateCollectionBusy(collectionId, true);
    setFormMessage(null);

    try {
      if (willAssign) {
        const { error } = await supabase
          .from('flashcard_collections')
          .insert({ collection_id: collectionId, flashcard_id: cardId });
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('flashcard_collections')
          .delete()
          .eq('collection_id', collectionId)
          .eq('flashcard_id', cardId);
        if (error) {
          throw error;
        }
      }

      const updatedCollections = willAssign
        ? [...currentCollections, collectionId]
        : currentCollections.filter((id) => id !== collectionId);

      setCardCollectionsMap((prev) => ({
        ...prev,
        [cardId]: updatedCollections,
      }));
      void updateCachedCardCollections(cardId, updatedCollections);
    } catch (membershipError) {
      console.error('Nie udało się zaktualizować przypisania do zbioru', membershipError);
      setFormMessage('Nie udało się zaktualizować przypisania do zbioru.');
    } finally {
      updateCollectionBusy(collectionId, false);
    }
  };

  const handleNextCard = () => {
    setShowTranslation(false);
    setActiveIndex((prev) => (prev + 1) % Math.max(cards.length, 1));
  };

  const handlePrevCard = () => {
    setShowTranslation(false);
    setActiveIndex((prev) => (prev - 1 + Math.max(cards.length, 1)) % Math.max(cards.length, 1));
  };

  const handleToggleMastered = async (card: Flashcard) => {
    if (!supabase) return;
    const nextValue = !card.is_mastered;
    setAllCards((current) =>
      current.map((item) => (item.id === card.id ? { ...item, is_mastered: nextValue } : item))
    );

    const { error: updateError } = await supabase!
      .from('flashcards')
      .update({ is_mastered: nextValue })
      .eq('id', card.id);

    if (updateError) {
      setFormMessage(`Nie udało się zaktualizować fiszki: ${updateError.message}`);
      setAllCards((current) =>
        current.map((item) => (item.id === card.id ? { ...item, is_mastered: card.is_mastered } : item))
      );
    }
  };

  const handleToggleOffline = async (card: Flashcard) => {
    const cardId = card.id;
    updateOfflineBusy(cardId, true);

    try {
      if (offlineStatusMap[cardId]) {
        await removeCardFromOffline(cardId);
        setFormMessage('Fiszka została usunięta z pamięci offline.');
      } else {
        const collectionIds = cardCollectionsMap[cardId] ?? [];
        const result = await cacheCardOffline(card, { collectionIds });
        if (result.audioStored) {
          setFormMessage('Fiszka oraz nagranie są dostępne offline.');
        } else if (card.audio_url) {
          setFormMessage('Fiszka dostępna offline. Nagrania nie udało się zapisać.');
        } else {
          setFormMessage('Fiszka dostępna offline.');
        }
      }
    } catch (error) {
      console.error('Nie udało się zaktualizować pamięci offline', error);
      setFormMessage('Nie udało się zaktualizować pamięci offline.');
    } finally {
      updateOfflineBusy(cardId, false);
    }
  };

  const handlePlayAudio = async (card: Flashcard) => {
    if (typeof Audio === 'undefined') return;
    try {
      const audioUrl = await getPlayableAudioUrl(card.id, card.audio_url);
      if (!audioUrl) return;
      const audio = new Audio(audioUrl);
      void audio.play();
    } catch (error) {
      console.error('Nie udało się odtworzyć audio', error);
    }
  };

  const handleGenerateAudio = async () => {
    const hanziSource = manualMode ? manualHanzi.trim() : selectedReference?.hanzi?.trim() ?? '';
    if (!hanziSource) {
      setFormMessage('Nie ma znaku do wygenerowania audio.');
      return;
    }

    setGeneratingAudio(true);
    setFormMessage(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: hanziSource }),
      });

      if (!response.ok) {
        let errorMessage = 'Nie udało się wygenerować audio.';
        let details: unknown;
        try {
          const errorBody = await response.json();
          if (errorBody?.error) {
            errorMessage = errorBody.error;
          }
          if (errorBody?.details) {
            details = errorBody.details;
          }
        } catch {
          // ignore parse error, fallback message already set
        }
        if (details) {
          console.error('Szczegóły błędu ElevenLabs:', details);
        }
        setFormMessage(errorMessage);
        return;
      }

      const { audioUrl } = (await response.json()) as { audioUrl?: string };
      if (!audioUrl) {
        setFormMessage('Serwer nie zwrócił linku do nagrania.');
        return;
      }

      if (manualMode) {
        setManualAudio(audioUrl);
      } else {
        setGeneratedAudioUrl(audioUrl);
      }
      setFormMessage('Wygenerowano audio w ElevenLabs i zapisano w Supabase.');
    } catch (error) {
      setFormMessage('Nie udało się połączyć z usługą TTS.');
      console.error('Błąd generowania audio:', error);
    } finally {
      setGeneratingAudio(false);
    }
  };

  const toggleTranslation = () => {
    const currentCard = cards[activeIndex];
    if (!currentCard) return;
    const hasAudio = Boolean(currentCard.audio_url) || Boolean(offlineStatusMap[currentCard.id]?.audioStored);

    setShowTranslation((prev) => {
      const next = !prev;
      if (next && hasAudio) {
        void handlePlayAudio(currentCard);
      }
      return next;
    });
  };

  const registerSwipeStart = (clientX: number | null) => {
    swipeStartX.current = clientX;
    swipeDetected.current = false;
  };

  const finalizeSwipe = (clientX: number | null) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null || clientX === null) return;
    const deltaX = clientX - startX;
    if (Math.abs(deltaX) < 40) return;
    swipeDetected.current = true;
    if (deltaX < 0) {
      handleNextCard();
    } else {
      handlePrevCard();
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || isInteractiveTarget(event.target)) return;
    registerSwipeStart(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    finalizeSwipe(event.clientX);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    registerSwipeStart(event.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    finalizeSwipe(event.changedTouches[0]?.clientX ?? null);
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    if (swipeDetected.current) {
      swipeDetected.current = false;
      return;
    }
    toggleTranslation();
  };

  const handleDeleteCard = async (card: Flashcard) => {
    if (!supabase) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Usunąć fiszkę "${card.polish}"?`);
      if (!confirmed) {
        return;
      }
    }

    setFormMessage(null);

    const { error: deleteError } = await supabase!.from('flashcards').delete().eq('id', card.id);

    if (deleteError) {
      setFormMessage(`Nie udało się usunąć fiszki: ${deleteError.message}`);
      return;
    }

    setAllCards((current) => current.filter((item) => item.id !== card.id));
    setCardCollectionsMap((current) => {
      const next = { ...current };
      delete next[card.id];
      return next;
    });
    setShowTranslation(false);

    void removeCardFromOffline(card.id);

    setFormMessage('Fiszka została usunięta.');
  };

  const handleSelectReference = (reference: HskReference) => {
    setSelectedReference(reference);
    setGeneratedAudioUrl(null);

    const preferredMeaning =
      reference.meaning_pl?.trim() || reference.meaning_en?.trim() || '';

    if (!preferredMeaning) {
      return;
    }

    const currentValue = polishInput.trim();
    const previousMeaning =
      selectedReference?.meaning_pl?.trim() ||
      selectedReference?.meaning_en?.trim() ||
      '';

    if (!currentValue || currentValue === previousMeaning) {
      setPolishInput(preferredMeaning);
    }
  };

  const resetForm = () => {
    setPolishInput('');
    setCommentInput('');
    setLookupQuery('');
    setLookupResults([]);
    setSelectedReference(null);
    setManualHanzi('');
    setManualPinyin('');
    setManualAudio('');
    setManualMode(false);
    setGeneratedAudioUrl(null);
    setGeneratingAudio(false);
  };

  const handleAddWord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setFormMessage(null);

    const trimmedPolish = polishInput.trim();
    if (!trimmedPolish) {
      setFormMessage('Podaj polskie tłumaczenie.');
      return;
    }

    if (!manualMode && !selectedReference) {
      setFormMessage('Wybierz słówko z listy HSK lub przełącz się na tryb ręczny.');
      return;
    }

    setFormBusy(true);

    const payload = manualMode
      ? {
          polish: trimmedPolish,
          hanzi: manualHanzi.trim(),
          pinyin: manualPinyin.trim(),
          audio_url: manualAudio.trim() || null,
          comment: commentInput.trim() || null,
          hsk_reference_id: null,
        }
      : {
          polish: trimmedPolish,
          hanzi: selectedReference?.hanzi ?? '',
          pinyin: selectedReference?.pinyin ?? '',
          audio_url: generatedAudioUrl ?? selectedReference?.audio_url ?? null,
          comment: commentInput.trim() || null,
          hsk_reference_id: selectedReference?.id ?? null,
        };

    const { data, error: insertError } = await supabase!
      .from('flashcards')
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      setFormMessage(`Nie udało się zapisać fiszki: ${insertError.message}`);
    } else if (data) {
      setAllCards((current) => sortByCreatedAt([...current, data]));
      setCardCollectionsMap((current) => ({ ...current, [data.id]: [] }));
      setFormMessage('Dodano słówko do fiszek.');
      resetForm();
    }

    setFormBusy(false);
  };

  const renderCard = () => {
    if (loadingCards) {
      return <div className="rounded-xl bg-neutral-100 p-10 text-center text-neutral-500">Ładowanie fiszek…</div>;
    }

    if (error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      );
    }

    if (!cards.length) {
      const message = offlineFallbackActive ? offlineEmptyStateCopy[filter] : emptyStateCopy[filter];
      return (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
          {message}
        </div>
      );
    }

    const currentCard = activeCard;
    if (!currentCard) {
      return null;
    }

    const offlineStatus = offlineStatusMap[currentCard.id];
    const offlineAvailable = Boolean(offlineStatus);
    const offlineBusy = Boolean(offlineBusyMap[currentCard.id]);
    const canPlayAudio = Boolean(currentCard.audio_url) || Boolean(offlineStatus?.audioStored);
    const fallbackGradient = 'bg-gradient-to-br from-sky-500/80 via-indigo-500/80 to-fuchsia-500/70';
    const frontCardStyle: CSSProperties = {
      backfaceVisibility: 'hidden',
      borderColor: primaryCollectionColor ? `${primaryCollectionColor}55` : undefined,
    };
    const backCardClassName = `absolute inset-0 flex items-center justify-center rounded-3xl border border-white/50 ${
      cardBackGradient ? '' : fallbackGradient
    } p-6 text-center text-white shadow-2xl shadow-indigo-200/50 backdrop-blur`;
    const backCardStyle: CSSProperties = cardBackGradient
      ? {
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          backgroundImage: cardBackGradient,
        }
      : {
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
        };

    return (
      <div className="flex flex-col items-center gap-6">
        {statusMessage && (
          <div className="w-full max-w-sm rounded-xl border border-sky-200/70 bg-sky-50/80 px-4 py-3 text-sm text-sky-800 shadow-sm">
            {statusMessage}
          </div>
        )}
        <div className="relative w-full max-w-sm" style={{ perspective: '1600px' }}>
          <button
            type="button"
            onClick={handlePrevCard}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/60 px-2 py-1 text-lg text-sky-500 shadow-sm shadow-sky-100 transition hover:bg-white hover:text-sky-600"
            aria-label="Poprzednia fiszka"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleNextCard}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/60 px-2 py-1 text-lg text-sky-500 shadow-sm shadow-sky-100 transition hover:bg-white hover:text-sky-600"
            aria-label="Następna fiszka"
          >
            ›
          </button>

          <div
            className="relative min-h-[360px] cursor-pointer sm:cursor-grab"
            onClick={handleCardClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{
              transformStyle: 'preserve-3d',
              transform: showTranslation ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: 'transform 0.6s ease',
            }}
          >
            <div
              className="absolute inset-0 flex flex-col rounded-3xl border border-white/50 bg-white/70 p-6 shadow-2xl shadow-indigo-100/50 backdrop-blur"
              style={frontCardStyle}
            >
              <div className="mb-6 flex items-center justify-between text-sm text-neutral-500">
                <span>
                  Fiszka {activeIndex + 1}/{cards.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleMastered(currentCard)}
                    className={`rounded-full border px-3 py-1 text-xs transition backdrop-blur ${
                      currentCard.is_mastered
                        ? 'border-emerald-200/70 bg-emerald-100/80 text-emerald-700'
                        : 'border-white/70 bg-white/40 text-neutral-600 hover:bg-white/70 hover:text-sky-700'
                    }`}
                  >
                    {currentCard.is_mastered ? 'Opanowane' : 'Do nauki'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleOffline(currentCard)}
                    disabled={offlineBusy}
                    className={`rounded-full border px-3 py-1 text-xs transition backdrop-blur ${
                      offlineAvailable
                        ? 'border-emerald-200/70 bg-emerald-100/80 text-emerald-700'
                        : 'border-white/70 bg-white/40 text-neutral-600 hover:bg-white/70 hover:text-sky-700'
                    } ${offlineBusy ? 'opacity-60' : ''}`}
                    aria-label={offlineAvailable ? 'Usuń fiszkę z pamięci offline' : 'Zapisz fiszkę offline'}
                    title={
                      offlineAvailable
                        ? offlineStatus?.audioStored
                        ? 'Fiszka (wraz z nagraniem) zapisana offline'
                        : 'Fiszka zapisana offline (brak nagrania)'
                        : 'Zapisz fiszkę offline'
                    }
                  >
                    {offlineBusy ? '⌛' : offlineAvailable ? '📥' : '☁️'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCard(currentCard)}
                    className="rounded-full border border-white/70 bg-white/40 px-3 py-1 text-xs text-neutral-600 transition hover:bg-red-100/60 hover:text-red-600"
                    aria-label="Usuń fiszkę"
                    title="Usuń fiszkę"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="flex grow flex-col items-center justify-center gap-5 text-center">
                <p className="text-6xl font-semibold sm:text-7xl">{currentCard.hanzi}</p>
                <p className="text-lg text-neutral-500">{currentCard.pinyin}</p>

                {canPlayAudio && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePlayAudio(currentCard);
                    }}
                    className="rounded-full border border-white/70 bg-white/40 px-4 py-1 text-sm text-neutral-700 shadow-sm transition hover:bg-sky-100/70 hover:text-sky-800"
                  >
                    ▶️ Wymowa
                  </button>
                )}
              </div>

              {currentCard.comment && (
                <div className="mt-4 rounded-xl border border-white/60 bg-white/50 p-3 text-sm text-neutral-600 shadow-inner shadow-white/40">
                  📝 {currentCard.comment}
                </div>
              )}
            </div>

            <div className={backCardClassName} style={backCardStyle}>
              <p className="text-3xl font-semibold sm:text-4xl">{currentCard.polish}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={handlePrevCard}
            className="rounded-full border border-white/70 bg-white/40 px-6 py-2 text-sm text-neutral-700 shadow-sm transition hover:bg-white/70 hover:text-sky-700"
          >
            ← Poprzednia
          </button>
          <button
            type="button"
            onClick={handleNextCard}
            className="rounded-full border border-white/70 bg-white/40 px-6 py-2 text-sm text-neutral-700 shadow-sm transition hover:bg-white/70 hover:text-sky-700"
          >
            Następna →
          </button>
        </div>
      </div>
    );
  };

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Chińskie fiszki</h1>
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Skonfiguruj połączenie z Supabase (pliki `.env.local`) przed korzystaniem z aplikacji.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 rounded-3xl border border-white/40 bg-white/60 p-6 pb-16 shadow-2xl shadow-indigo-100/40 backdrop-blur-xl sm:p-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full border px-4 py-2 text-xs tracking-wide transition backdrop-blur ${
                filter === option
                  ? 'border-sky-400/60 bg-sky-500/90 text-white shadow shadow-sky-200/60'
                  : 'border-white/70 bg-white/40 text-neutral-600 hover:bg-white/70 hover:text-sky-700'
              }`}
            >
              {FILTER_LABELS[option]}
            </button>
          ))}
          <div className="flex flex-1 items-center justify-end gap-2">
            <a
              href="#hsk1-categories"
              className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/40 px-4 py-2 text-xs font-medium text-sky-700 shadow-sm transition hover:bg-white/70 hover:text-sky-900 sm:inline-flex"
            >
              📚 Lista HSK1
            </a>
            <button
              type="button"
              onClick={() => {
                setCollectionsPanelOpen(true);
                setCollectionFormError(null);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/40 text-lg text-neutral-600 shadow-sm transition hover:bg-white/70 hover:text-sky-700"
              aria-label="Zarządzaj zbiorami"
              title="Zarządzaj zbiorami"
            >
              ☰
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="rounded-2xl border border-white/50 bg-white/70 px-5 py-4 shadow-lg shadow-sky-100/40 backdrop-blur">
            <div className="flex items-baseline gap-3 text-sky-600">
              <span className="text-xs uppercase tracking-wide">Postęp:</span>
              <span className="text-sm font-semibold text-neutral-700">
                {masteredCount}/{cards.length}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/50 bg-white/70 px-5 py-4 text-sm font-medium text-fuchsia-600 shadow-lg shadow-sky-100/40 backdrop-blur">
            {activeCollection ? activeCollection.name : 'Brak – wszystkie fiszki'}
          </div>
        </div>
        <a
          href="#hsk1-categories"
          className="inline-flex items-center gap-2 text-xs font-medium text-sky-700 underline-offset-4 hover:underline sm:hidden"
        >
          📚 Zobacz listę HSK1
        </a>
      </header>

      <section>
        {renderCard()}
      </section>

      <section
        id="add-card"
        className="rounded-3xl border border-white/50 bg-white/70 p-6 shadow-xl shadow-indigo-100/40 backdrop-blur"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Dodaj słówko</h2>
          <button
            type="button"
            onClick={() => {
              const next = !manualMode;
              setManualMode(next);
              setFormMessage(null);
              setGeneratedAudioUrl(null);
              if (next) {
                setSelectedReference(null);
                setLookupQuery('');
                setLookupResults([]);
              } else {
                setManualHanzi('');
                setManualPinyin('');
                setManualAudio('');
              }
            }}
            className="text-sm text-sky-600 hover:underline"
          >
            {manualMode ? 'Użyj bazy HSK' : 'Wpisz ręcznie'}
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={(event) => void handleAddWord(event)}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-600" htmlFor="polish">
              Tłumaczenie po polsku
            </label>
            <input
              id="polish"
              value={polishInput}
              onChange={(event) => setPolishInput(event.target.value)}
              className="rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="np. dzień dobry"
            />
          </div>

          {!manualMode && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-600" htmlFor="lookup">
                  Znajdź w bazie HSK1
                </label>
                <input
                  id="lookup"
                  value={lookupQuery}
                  onChange={(event) => setLookupQuery(event.target.value)}
                  className="rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Wpisz polskie lub angielskie tłumaczenie, pinyin albo hanzi"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-white/50 bg-white/60 backdrop-blur">
                {searchingReference && (
                  <div className="px-4 py-3 text-sm text-neutral-500">Wyszukiwanie…</div>
                )}
                {!searchingReference && !lookupResults.length && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    Zacznij wpisywać, aby zobaczyć propozycje z listy HSK.
                  </div>
                )}
                {lookupResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectReference(item)}
                    className={`block w-full border-b border-white/40 px-4 py-3 text-left text-sm transition last:border-b-0 ${
                      selectedReference?.id === item.id
                        ? 'bg-sky-100/70 text-sky-900'
                        : 'hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-medium text-neutral-800">{item.hanzi}</span>
                      <span className="text-xs uppercase text-neutral-500">{item.level}</span>
                    </div>
                    <p className="text-sm text-neutral-600">{item.pinyin}</p>
                    <p className="text-xs text-neutral-500">
                      {item.meaning_pl || item.meaning_en}
                    </p>
                  </button>
                ))}
              </div>
              {selectedReference && (
                <div className="rounded-xl border border-sky-200/70 bg-sky-50 px-4 py-3 text-sm text-sky-800 shadow-sm">
                  Wybrano: {selectedReference.hanzi} ({selectedReference.pinyin}) –{' '}
                  {selectedReference.meaning_pl || selectedReference.meaning_en}
                </div>
              )}
            </>
          )}

          {manualMode && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-600" htmlFor="hanzi">
                  Hanzi
                </label>
                <input
                  id="hanzi"
                  value={manualHanzi}
                  onChange={(event) => setManualHanzi(event.target.value)}
                  className="rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="你好"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-600" htmlFor="pinyin">
                  Pinyin
                </label>
                <input
                  id="pinyin"
                  value={manualPinyin}
                  onChange={(event) => setManualPinyin(event.target.value)}
                  className="rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="nǐ hǎo"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-600" htmlFor="audio">
                  Link do audio (opcjonalnie)
                </label>
                <input
                  id="audio"
                  value={manualAudio}
                  onChange={(event) => setManualAudio(event.target.value)}
                  className="rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="https://..."
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleGenerateAudio()}
              disabled={
                generatingAudio ||
                (!manualMode && !selectedReference) ||
                (manualMode && !manualHanzi.trim())
              }
              className={`rounded-full border px-4 py-2 text-sm transition ${
                generatingAudio
                  ? 'border-neutral-200 text-neutral-400'
                  : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              } disabled:cursor-not-allowed`}
            >
              {generatingAudio ? 'Generuję audio…' : 'Generuj audio (ElevenLabs)'}
            </button>
            {(manualMode ? manualAudio : generatedAudioUrl ?? selectedReference?.audio_url) && (
              <span className="text-xs text-neutral-500">
                Audio gotowe do zapisania w fiszce.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-600" htmlFor="comment">
              Notatka (opcjonalna)
            </label>
            <textarea
              id="comment"
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
              className="min-h-[80px] rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm shadow-inner shadow-white/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Np. zdanie, skojarzenie, wskazówka."
            />
          </div>

          {formMessage && (
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 backdrop-blur">
              {formMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={formBusy}
            className="self-start rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-6 py-2 text-sm font-medium text-white shadow-lg shadow-sky-200/60 transition hover:from-sky-500 hover:via-sky-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {formBusy ? 'Zapisywanie…' : 'Dodaj fiszkę'}
          </button>
        </form>
      </section>
    </div>

      {isCollectionsPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-sm flex-col gap-5 overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-800">Zbiory fiszek</h2>
              <button
                type="button"
                onClick={() => {
                  setCollectionsPanelOpen(false);
                  setEditingCollectionId(null);
                  setEditingCollectionName('');
                  setCollectionFormError(null);
                }}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600 shadow-sm transition hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Zamknij panel zbiorów"
              >
                ✕
              </button>
            </div>

            {collectionFormError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {collectionFormError}
              </div>
            )}

            {activeCard ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-neutral-700 shadow-inner">
                <p className="text-xs uppercase tracking-wide text-sky-600">Aktualna fiszka</p>
                <p className="mt-1 font-medium text-neutral-800">
                  {activeCard.hanzi} — {activeCard.polish}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {collections.length ? (
                    collections.map((collection) => {
                      const isMember = activeCardCollectionIds.includes(collection.id);
                      const busy = Boolean(collectionActionBusyMap[collection.id]);
                      return (
                        <label
                          key={collection.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm shadow-sm"
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isMember}
                              onChange={() => void handleToggleCardCollectionMembership(collection.id)}
                              disabled={busy}
                            />
                            <span className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full border border-neutral-200"
                                style={{ backgroundColor: collection.color ?? '#0ea5e9' }}
                              />
                              {collection.name}
                            </span>
                          </span>
                          {busy && <span className="text-xs text-neutral-400">…</span>}
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-xs text-neutral-500">Brak zbiorów. Utwórz pierwszy niżej.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
                Brak aktywnej fiszki do przypisania.
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-800"
              >
                Pokaż wszystkie
              </button>
              {activeCollection && (
                <span className="text-xs text-neutral-500">
                  Aktywny zbiór: <span className="font-medium text-neutral-700">{activeCollection.name}</span>
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {collections.length ? (
                collections.map((collection) => {
                  const isActive = activeCollectionId === collection.id;
                  const busy = Boolean(collectionActionBusyMap[collection.id]);
                  const usage = collectionUsageCounts[collection.id] ?? 0;

                  return (
                    <div
                      key={collection.id}
                      className={`rounded-2xl border px-4 py-3 shadow-sm transition ${
                        isActive ? 'border-sky-300 bg-sky-50' : 'border-neutral-200 bg-white'
                      }`}
                    >
                      {editingCollectionId === collection.id ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(event) => void handleRenameCollection(event, collection.id)}
                        >
                          <input
                            value={editingCollectionName}
                            onChange={(event) => setEditingCollectionName(event.target.value)}
                            className="flex-1 rounded-lg border border-neutral-300 px-3 py-1 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            autoFocus
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCollectionId(null);
                              setEditingCollectionName('');
                            }}
                            className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveCollectionId(collection.id)}
                            className={`flex flex-1 items-center gap-2 text-left text-sm ${
                              isActive ? 'text-sky-700' : 'text-neutral-700 hover:text-sky-700'
                            }`}
                          >
                            <span
                              className="h-3 w-3 rounded-full border border-neutral-200"
                              style={{ backgroundColor: collection.color ?? '#0ea5e9' }}
                            />
                            {collection.name}
                          </button>
                          <span className="text-xs text-neutral-400">{usage}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCollectionId(collection.id);
                              setEditingCollectionName(collection.name);
                            }}
                            className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100"
                            aria-label="Zmień nazwę zbioru"
                          >
                            ✏️
                          </button>
                          <input
                            type="color"
                            value={collection.color ?? '#0ea5e9'}
                            onChange={(event) => void handleCollectionColorChange(collection.id, event.target.value)}
                            disabled={busy}
                            className="h-8 w-8 cursor-pointer rounded border border-neutral-200 bg-white p-1"
                          />
                          <button
                            type="button"
                            onClick={() => void handleDeleteCollection(collection.id)}
                            disabled={busy}
                            className="rounded-full border border-red-200 bg-red-100 px-2 py-1 text-xs text-red-600 transition hover:bg-red-200 disabled:opacity-60"
                            aria-label="Usuń zbiór"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-neutral-500">Brak zdefiniowanych zbiorów.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCollectionsPanelOpen(false);
                setEditingCollectionId(null);
                setEditingCollectionName('');
                setCollectionFormError(null);
                if (typeof document !== 'undefined') {
                  const target = document.getElementById('add-card');
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                  }
                }
              }}
              className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-100"
            >
              Dodaj nową fiszkę
            </button>

            <form
              onSubmit={(event) => void handleCreateCollection(event)}
              className="mt-auto rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 shadow-inner"
            >
              <p className="text-sm font-medium text-neutral-700">Nowy zbiór</p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="np. Podróże"
                />
                <input
                  type="color"
                  value={newCollectionColor}
                  onChange={(event) => setNewCollectionColor(event.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-1"
                />
              </div>
              <button
                type="submit"
                disabled={collectionFormBusy}
                className="mt-3 w-full rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {collectionFormBusy ? 'Tworzę…' : 'Dodaj zbiór'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

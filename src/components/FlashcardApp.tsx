'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Flashcard, HskReference } from '@/lib/types';

type Filter = 'all' | 'new' | 'mastered';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Wszystkie',
  new: 'Do nauki',
  mastered: 'Opanowane',
};

const emptyStateCopy = {
  all: 'Brak fiszek. Dodaj pierwsze słówko, aby zacząć naukę.',
  new: 'Wszystkie słówka oznaczone jako opanowane – czas dodać nowe.',
  mastered: 'Jeszcze żadnego słówka nie oznaczono jako opanowane.',
};

export function FlashcardApp() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const masteredCount = useMemo(() => cards.filter((card) => card.is_mastered).length, [cards]);
  const swipeStartX = useRef<number | null>(null);
  const swipeDetected = useRef(false);

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, a, input, textarea, select'));
  };

  useEffect(() => {
    if (!supabase) {
      setError('Brak konfiguracji Supabase. Uzupełnij zmienne środowiskowe i uruchom ponownie.');
      setLoadingCards(false);
      return;
    }

    const load = async () => {
      setLoadingCards(true);
      setError(null);
      let query = supabase!.from('flashcards').select().order('created_at', { ascending: true });

      if (filter === 'new') {
        query = query.eq('is_mastered', false);
      } else if (filter === 'mastered') {
        query = query.eq('is_mastered', true);
      }

      const { data, error: loadError } = await query;
      if (loadError) {
        setError(loadError.message);
      } else {
        setCards(data ?? []);
        setActiveIndex(0);
        setShowTranslation(false);
      }

      setLoadingCards(false);
    };

    void load();
  }, [filter]);

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
    setCards((current) =>
      current.map((item) => (item.id === card.id ? { ...item, is_mastered: nextValue } : item))
    );

    const { error: updateError } = await supabase!
      .from('flashcards')
      .update({ is_mastered: nextValue })
      .eq('id', card.id);

    if (updateError) {
      setFormMessage(`Nie udało się zaktualizować fiszki: ${updateError.message}`);
      setCards((current) =>
        current.map((item) => (item.id === card.id ? { ...item, is_mastered: card.is_mastered } : item))
      );
    }
  };

  const handlePlayAudio = (card: Flashcard) => {
    if (!card.audio_url || typeof Audio === 'undefined') return;
    const audio = new Audio(card.audio_url);
    void audio.play();
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

    setShowTranslation((prev) => {
      const next = !prev;
      if (next && currentCard.audio_url) {
        handlePlayAudio(currentCard);
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

    setCards((current) => {
      const next = current.filter((item) => item.id !== card.id);
      const nextIndex = next.length ? Math.min(activeIndex, next.length - 1) : 0;
      setActiveIndex(nextIndex);
      setShowTranslation(false);
      return next;
    });

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
      setCards((current) => [...current, data]);
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
      return (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
          {emptyStateCopy[filter]}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-6">
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
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="mb-6 flex items-center justify-between text-sm text-neutral-500">
                <span>
                  Fiszka {activeIndex + 1}/{cards.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleMastered(cards[activeIndex])}
                    className={`rounded-full border px-3 py-1 text-xs transition backdrop-blur ${
                      cards[activeIndex].is_mastered
                        ? 'border-emerald-200/70 bg-emerald-100/80 text-emerald-700'
                        : 'border-white/70 bg-white/40 text-neutral-600 hover:bg-white/70 hover:text-sky-700'
                    }`}
                  >
                    {cards[activeIndex].is_mastered ? 'Opanowane' : 'Do nauki'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCard(cards[activeIndex])}
                    className="rounded-full border border-white/70 bg-white/40 px-3 py-1 text-xs text-neutral-600 transition hover:bg-red-100/60 hover:text-red-600"
                    aria-label="Usuń fiszkę"
                    title="Usuń fiszkę"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="flex grow flex-col items-center justify-center gap-5 text-center">
                <p className="text-6xl font-semibold sm:text-7xl">{cards[activeIndex].hanzi}</p>
                <p className="text-lg text-neutral-500">{cards[activeIndex].pinyin}</p>

                {cards[activeIndex].audio_url && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handlePlayAudio(cards[activeIndex]);
                    }}
                    className="rounded-full border border-white/70 bg-white/40 px-4 py-1 text-sm text-neutral-700 shadow-sm transition hover:bg-sky-100/70 hover:text-sky-800"
                  >
                    ▶️ Wymowa
                  </button>
                )}
              </div>

              {cards[activeIndex].comment && (
                <div className="mt-4 rounded-xl border border-white/60 bg-white/50 p-3 text-sm text-neutral-600 shadow-inner shadow-white/40">
                  📝 {cards[activeIndex].comment}
                </div>
              )}
            </div>

            <div
              className="absolute inset-0 flex items-center justify-center rounded-3xl border border-white/50 bg-gradient-to-br from-sky-500/80 via-indigo-500/80 to-fuchsia-500/70 p-6 text-center text-white shadow-2xl shadow-indigo-200/50 backdrop-blur"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <p className="text-3xl font-semibold sm:text-4xl">{cards[activeIndex].polish}</p>
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 rounded-3xl border border-white/40 bg-white/60 p-6 pb-16 shadow-2xl shadow-indigo-100/40 backdrop-blur-xl sm:p-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full border px-4 py-2 text-sm transition backdrop-blur ${
                filter === option
                  ? 'border-sky-400/60 bg-sky-500/90 text-white shadow shadow-sky-200/60'
                  : 'border-white/70 bg-white/40 text-neutral-600 hover:bg-white/70 hover:text-sky-700'
              }`}
            >
              {FILTER_LABELS[option]}
            </button>
          ))}
          <a
            href="#add-card"
            className="rounded-full border border-white/70 bg-white/40 px-4 py-2 text-sm text-neutral-700 transition hover:bg-white/70 hover:text-sky-700"
          >
            Dodaj
          </a>
        </div>
        <div className="rounded-2xl border border-white/50 bg-white/70 px-5 py-4 text-sm text-neutral-600 shadow-lg shadow-sky-100/40 backdrop-blur">
          <p className="text-xs uppercase tracking-wide text-sky-600">Postęp</p>
          <p>
            {masteredCount}/{cards.length} opanowanych
          </p>
        </div>
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
  );
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = process.env.TTS_AUDIO_BUCKET || 'audio';

export async function POST(request: Request) {
  const { text, voiceId } = await request.json().catch(() => ({}));

  if (!text || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Brak tekstu do przeczytania.' }, { status: 400 });
  }

  const trimmedText = text.trim();
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const configuredVoiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!elevenLabsKey) {
    return NextResponse.json({ error: 'Brak konfiguracji ElevenLabs.' }, { status: 500 });
  }

  const voice = typeof voiceId === 'string' && voiceId.trim().length > 0 ? voiceId.trim() : configuredVoiceId;

  if (!voice) {
    return NextResponse.json({ error: 'Nie podano identyfikatora głosu ElevenLabs.' }, { status: 400 });
  }

  const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;

  const elevenResponse = await fetch(elevenUrl, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: trimmedText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.7,
      },
    }),
  });

  if (!elevenResponse.ok) {
    const details = await elevenResponse.text();
    console.error('ElevenLabs TTS error:', details);
    return NextResponse.json(
      {
        error: 'Generowanie audio w ElevenLabs nie powiodło się.',
        details,
      },
      { status: elevenResponse.status }
    );
  }

  const audioBuffer = Buffer.from(await elevenResponse.arrayBuffer());

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Brak kredencjałów Supabase do zapisania pliku audio.' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const fileName = `tts/${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase upload error:', uploadError);
    return NextResponse.json(
      { error: 'Nie udało się zapisać pliku audio w Supabase.', details: uploadError.message },
      { status: 500 }
    );
  }

  const { data: publicData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(fileName);

  return NextResponse.json({ audioUrl: publicData.publicUrl }, { status: 201 });
}

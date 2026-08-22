import { supabase } from '@/lib/supabase';

export type VoiceExtraction = {
  name: string;
  contextTags: string[];
};

const EMPTY_EXTRACTION: VoiceExtraction = { name: '', contextTags: [] };

function isValidExtraction(value: unknown): value is VoiceExtraction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.contextTags) &&
    candidate.contextTags.every((tag) => typeof tag === 'string')
  );
}

export async function extractContact(transcript: string): Promise<VoiceExtraction> {
  if (!transcript.trim() || !supabase) return EMPTY_EXTRACTION;

  try {
    const { data, error } = await supabase.functions.invoke('extract-contact', {
      body: { transcript },
    });
    if (error || !isValidExtraction(data)) return EMPTY_EXTRACTION;
    return data;
  } catch {
    return EMPTY_EXTRACTION;
  }
}

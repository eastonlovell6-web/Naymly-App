import { useCallback, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

import { extractContact, type VoiceExtraction } from '@/lib/extract-contact';

export type VoiceCaptureStatus = 'idle' | 'listening' | 'processing' | 'permission-denied';

export type VoiceCaptureOutcome = {
  transcript: string;
  extraction: VoiceExtraction;
};

export function useVoiceCapture(onFinished: (outcome: VoiceCaptureOutcome) => void) {
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const statusRef = useRef<VoiceCaptureStatus>('idle');
  const transcriptRef = useRef('');

  const setStatusBoth = useCallback((next: VoiceCaptureStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    transcriptRef.current = transcript;
    setPartialTranscript(transcript);
  });

  const finish = useCallback(() => {
    setStatusBoth('processing');
    const transcript = transcriptRef.current.trim();
    void extractContact(transcript).then((extraction) => {
      onFinished({ transcript, extraction });
      transcriptRef.current = '';
      setPartialTranscript('');
      setStatusBoth('idle');
    });
  }, [onFinished, setStatusBoth]);

  useSpeechRecognitionEvent('end', () => {
    if (statusRef.current !== 'listening') return;
    finish();
  });

  useSpeechRecognitionEvent('error', () => {
    if (statusRef.current !== 'listening') return;
    finish();
  });

  const start = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatusBoth('permission-denied');
      return;
    }
    transcriptRef.current = '';
    setPartialTranscript('');
    setStatusBoth('listening');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
  }, [setStatusBoth]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { status, partialTranscript, start, stop };
}

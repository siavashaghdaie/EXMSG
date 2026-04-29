/**
 * Linda Voice Service — Speech-to-Text (Whisper) and Text-to-Speech (OpenAI TTS)
 *
 * Uses OpenAI API directly via native fetch (no SDK needed).
 * - STT: Transcribes voice notes so Linda can understand them
 * - TTS: Generates voice replies from Linda's text responses
 */

import * as fs from 'fs';
import * as path from 'path';
import { env } from '../../config/env';

const OPENAI_API_URL = 'https://api.openai.com/v1';

function getOpenAIKey(): string | null {
  return (env as any).OPENAI_API_KEY || process.env.OPENAI_API_KEY || null;
}

// ─── Speech-to-Text (Whisper) ──────────────────────────────────────────────

/**
 * Transcribe an audio file using OpenAI Whisper API.
 * Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac
 * @returns The transcribed text, or null if transcription fails
 */
export async function transcribeAudio(filePath: string, fileName: string): Promise<string | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    console.warn('[VoiceService] OPENAI_API_KEY not set — cannot transcribe audio');
    return null;
  }

  try {
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);

    // Determine the proper filename with extension for Whisper
    let ext = path.extname(fileName).toLowerCase();
    if (!ext || ext === '.') ext = '.mp4'; // default to mp4
    const whisperFileName = `audio${ext}`;

    // Build multipart form data manually
    const boundary = '----WhisperBoundary' + Date.now();
    const formParts: Buffer[] = [];

    // Add the file part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${whisperFileName}"\r\n` +
      `Content-Type: audio/${ext.slice(1)}\r\n\r\n`
    ));
    formParts.push(fileBuffer);
    formParts.push(Buffer.from('\r\n'));

    // Add model part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    ));

    // Add language hint (optional — auto-detect if omitted)
    // formParts.push(Buffer.from(
    //   `--${boundary}\r\n` +
    //   `Content-Disposition: form-data; name="language"\r\n\r\n` +
    //   `en\r\n`
    // ));

    // Close boundary
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    console.log(`[VoiceService] Transcribing ${whisperFileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);

    const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VoiceService] Whisper API error ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json() as { text: string };
    const transcript = result.text?.trim();

    if (transcript) {
      console.log(`[VoiceService] Transcription successful: "${transcript.slice(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
    }

    return transcript || null;
  } catch (err: any) {
    console.error('[VoiceService] Transcription error:', err?.message);
    return null;
  }
}

// ─── Text-to-Speech (OpenAI TTS) ──────────────────────────────────────────

/**
 * Generate a voice message from text using OpenAI TTS API.
 * @param text The text to convert to speech
 * @param outputDir Directory to save the audio file
 * @param voice The voice to use (alloy, echo, fable, onyx, nova, shimmer)
 * @returns Object with filePath, fileName, fileSize, mimeType — or null on failure
 */
export async function generateVoiceReply(
  text: string,
  outputDir: string,
  voice: string = 'nova', // nova is a warm female voice, good for Linda
): Promise<{ filePath: string; fileName: string; fileSize: number; mimeType: string } | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    console.warn('[VoiceService] OPENAI_API_KEY not set — cannot generate voice');
    return null;
  }

  try {
    // Truncate very long texts (TTS has a 4096 char limit)
    const truncatedText = text.slice(0, 4000);

    console.log(`[VoiceService] Generating TTS (${voice}): "${truncatedText.slice(0, 80)}..."`);

    const response = await fetch(`${OPENAI_API_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: truncatedText,
        voice,
        response_format: 'mp4', // mp4 (AAC) for universal compatibility
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VoiceService] TTS API error ${response.status}: ${errorText}`);
      return null;
    }

    // Save the audio file
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const fileName = `linda-voice-${Date.now()}.mp4`;
    const filePath = path.join(outputDir, fileName);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(filePath, audioBuffer);

    console.log(`[VoiceService] TTS generated: ${fileName} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);

    return {
      filePath,
      fileName,
      fileSize: audioBuffer.length,
      mimeType: 'audio/mp4',
    };
  } catch (err: any) {
    console.error('[VoiceService] TTS generation error:', err?.message);
    return null;
  }
}

/**
 * Check if the user's message is requesting a voice reply from Linda.
 * Looks for phrases like "reply with voice", "send voice note", "voice message", etc.
 */
export function isVoiceReplyRequested(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  const voicePhrases = [
    'reply with voice', 'respond with voice', 'answer with voice',
    'send voice', 'voice note', 'voice message', 'voice reply',
    'speak to me', 'talk to me', 'say it', 'tell me in voice',
    'audio reply', 'audio message', 'audio response',
    'با صدا', 'صوتی', 'پیام صوتی', 'با صدا جواب',  // Persian
    'voice بفرست', 'voice بده',
  ];
  return voicePhrases.some(phrase => lower.includes(phrase));
}

/**
 * Check if voice services are available (API key configured).
 */
export function isVoiceServiceAvailable(): boolean {
  return !!getOpenAIKey();
}

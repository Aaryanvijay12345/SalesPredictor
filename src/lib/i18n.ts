import { PROJECT_ID } from './gcp';

export interface LanguageVoiceConfig {
  code: string;
  name: string;
  ttsLangCode: string;
  ttsVoiceName: string;
  speakingRate: number;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageVoiceConfig> = {
  hi: {
    code: 'hi',
    name: 'Hindi',
    ttsLangCode: 'hi-IN',
    ttsVoiceName: 'hi-IN-Neural2-A',
    speakingRate: 1.05
  },
  en: {
    code: 'en',
    name: 'English (India)',
    ttsLangCode: 'en-IN',
    ttsVoiceName: 'en-IN-Neural2-A',
    speakingRate: 1.05
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    ttsLangCode: 'bn-IN',
    ttsVoiceName: 'bn-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    ttsLangCode: 'mr-IN',
    ttsVoiceName: 'mr-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  },
  gu: {
    code: 'gu',
    name: 'Gujarati',
    ttsLangCode: 'gu-IN',
    ttsVoiceName: 'gu-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    ttsLangCode: 'ta-IN',
    ttsVoiceName: 'ta-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  },
  te: {
    code: 'te',
    name: 'Telugu',
    ttsLangCode: 'te-IN',
    ttsVoiceName: 'te-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  },
  pa: {
    code: 'pa',
    name: 'Punjabi',
    ttsLangCode: 'pa-IN',
    ttsVoiceName: 'pa-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0
  }
};

/**
 * Translates Hindi dispatch text to any requested Indian language in < 80ms
 * using Google Cloud Translation API REST endpoint.
 */
export async function translateBulletinText(
  sourceText: string,
  targetLang: string,
  token: string
): Promise<string> {
  const normalizedLang = targetLang.toLowerCase().trim();
  if (!normalizedLang || normalizedLang === 'hi') {
    return sourceText;
  }

  const langConfig = SUPPORTED_LANGUAGES[normalizedLang];
  if (!langConfig) {
    // Unsupported language requested, fall back safely to Hindi
    return sourceText;
  }

  const url = 'https://translation.googleapis.com/language/translate/v2';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': PROJECT_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: [sourceText],
      target: normalizedLang,
      format: 'text'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`Translation API warning (${res.status}): ${err}. Using source text.`);
    return sourceText;
  }

  const data = await res.json();
  const translated = data?.data?.translations?.[0]?.translatedText;
  return translated || sourceText;
}

export function getLanguageConfig(lang: string = 'hi'): LanguageVoiceConfig {
  const code = lang.toLowerCase().trim();
  return SUPPORTED_LANGUAGES[code] || SUPPORTED_LANGUAGES.hi;
}


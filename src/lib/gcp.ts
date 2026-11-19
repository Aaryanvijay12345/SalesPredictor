import { execSync } from 'child_process';

export const PROJECT_ID = 'bustling-wharf-485615-s9';
export const DATASET_ID = 'sales_predictor';
export const GCS_AUDIO_BUCKET = 'salespredicter-audio-bulletins';

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Retrieves a valid GCP OAuth2 Access Token.
 * 1. Checks in-memory cache.
 * 2. Checks GCP Compute Metadata Server (for Cloud Run production).
 * 3. Falls back to local gcloud CLI (`gcloud auth print-access-token`).
 */
export async function getGcpAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  // 1. Try Environment Variable override
  if (process.env.GCP_ACCESS_TOKEN) {
    return process.env.GCP_ACCESS_TOKEN;
  }

  // 2. Try GCP Metadata Server (Cloud Run / App Engine)
  try {
    const metaRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(1000)
      }
    );
    if (metaRes.ok) {
      const data = await metaRes.json();
      cachedToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in - 120) * 1000
      };
      return cachedToken.token;
    }
  } catch {
    // Ignore metadata failure when running locally
  }

  // 3. Fallback to local gcloud binary
  try {
    const token = execSync(
      'export PATH="$HOME/.local/bin:$PATH" && gcloud auth print-access-token',
      { encoding: 'utf-8' }
    ).trim();

    cachedToken = {
      token,
      expiresAt: now + 50 * 60 * 1000 // Cache for 50 minutes
    };
    return token;
  } catch (err) {
    throw new Error(`Failed to retrieve GCP access token: ${String(err)}`);
  }
}

/**
 * Pure REST query execution against BigQuery.
 * Zero gRPC, zero bulky SDKs.
 */
export async function queryBigQuery<T = any>(sql: string): Promise<T[]> {
  const token = await getGcpAccessToken();
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/queries`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`BigQuery REST error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.schema || !data.rows) {
    return [];
  }

  const fields = data.schema.fields.map((f: any) => f.name);
  return data.rows.map((r: any) => {
    const obj: any = {};
    r.f.forEach((val: any, idx: number) => {
      obj[fields[idx]] = val.v;
    });
    return obj as T;
  });
}

/**
 * Streaming insert into BigQuery table (`tabledata.insertAll`).
 */
export async function streamInsertBigQuery(tableId: string, rows: any[]): Promise<boolean> {
  const token = await getGcpAccessToken();
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/datasets/${DATASET_ID}/tables/${tableId}/insertAll`;

  const payload = {
    rows: rows.map((r) => ({
      insertId: r.entry_id || `${Date.now()}_${Math.random()}`,
      json: r
    }))
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`BigQuery insertAll error (${res.status}): ${errText}`);
  }

  const result = await res.json();
  if (result.insertErrors && result.insertErrors.length > 0) {
    throw new Error(`BigQuery insert errors: ${JSON.stringify(result.insertErrors)}`);
  }
  return true;
}

/**
 * Fetches real-time weather and hourly precipitation probability for Jaipur.
 * Powered by Open-Meteo (100% free, zero api-key, <80ms).
 */
export async function getJaipurWeather() {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=26.9124&longitude=75.7873&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=Asia%2FKolkata';

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error('Weather API failed');
    const data = await res.json();

    const tempC = data.current?.temperature_2m ?? 26.0;
    const precipMm = data.current?.precipitation ?? 0.0;
    const probs: number[] = data.hourly?.precipitation_probability || [];
    // Max probability in next 6 hours
    const maxProb = Math.max(...probs.slice(0, 6), 0);

    let rainAlert: string | null = null;
    if (maxProb >= 40) {
      rainAlert = `Agli 4 ghante mein ${maxProb}% baarish expected hai. Online delivery orders +25% badhenge.`;
    }

    return {
      tempC,
      precipitationMm: precipMm,
      rainProbabilityUpcoming: maxProb,
      rainAlert
    };
  } catch {
    return {
      tempC: 25.0,
      precipitationMm: 0,
      rainProbabilityUpcoming: 0,
      rainAlert: null
    };
  }
}

/**
 * Synthesizes a crisp, 15-20 second spoken Hindi script via Gemini 3.5 Flash.
 * ZERO corporate fluff, strictly operational walkie-talkie style.
 */
export async function generateChefScript(
  outlet: { kitchen_name: string; outlet_name: string; chef_name: string },
  forecastItems: Array<{ item_name: string; predicted_qty: string | number; unit: string; lower_bound_qty: string | number; upper_bound_qty: string | number }>,
  dynamicReason: string | null,
  mealSlot: string
): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-3.5-flash:generateContent`;

  const itemsSummary = forecastItems
    .map((i) => `${i.item_name}: ${i.predicted_qty} ${i.unit}`)
    .join(', ');

  const slotHindi = mealSlot === 'breakfast' ? 'ब्रेकफास्ट' : mealSlot === 'lunch' ? 'लंच' : 'डिनर';

  const prompt = `
You are a kitchen dispatch voice synthesizer.
Output strictly formatted Hindi text for the ${slotHindi} shift.

DATA:
- Shift: ${slotHindi}
- Items: ${itemsSummary}
- Dynamic Reason: ${dynamicReason ? dynamicReason : 'NONE'}

STRICT RULES:
1. ZERO SALUTATIONS. ZERO GREETINGS. NO 'Namaste', NO 'Hello', NO Chef Name, NO 'Shuru karte hain', NO 'Thank you', NO corporate filler.
2. Start directly with the shift name followed by a colon: '${slotHindi}: '
3. List the items and quantities cleanly in Hindi.
4. If Dynamic Reason is 'NONE', DO NOT mention weather, normal conditions, or any reasons at all. STOP immediately after the item quantities.
5. If Dynamic Reason is provided, append ONLY that single reason sentence at the end.
6. Keep under 20 words. Return ONLY the spoken Hindi text without quotes or markdown.
`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini 3.5 Flash error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error('Gemini did not return text candidate');
  }
  return text;
}

/**
 * Calls Google Cloud Text-to-Speech API via direct REST.
 * Supports dynamic Indian language Neural2 & Chirp3 HD voices.
 * Returns MP3 audio Buffer.
 */
export async function synthesizeSpeech(
  speechText: string,
  voiceName: string = 'hi-IN-Neural2-A',
  langCode: string = 'hi-IN',
  speakingRate: number = 1.05
): Promise<Buffer> {
  const token = await getGcpAccessToken();
  const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': PROJECT_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: { text: speechText },
      voice: {
        languageCode: langCode,
        name: voiceName
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speakingRate
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloud TTS error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return Buffer.from(data.audioContent, 'base64');
}

/**
 * Direct REST upload to Google Cloud Storage (GCS) private bucket.
 * Returns local streaming proxy path.
 */
export async function uploadAudioToGcs(audioBuffer: Buffer, gcsPath: string): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_AUDIO_BUCKET}/o?uploadType=media&name=${encodeURIComponent(
    gcsPath
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/mpeg'
    },
    body: new Uint8Array(audioBuffer)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GCS upload error (${res.status}): ${err}`);
  }

  return `/api/audio?path=${encodeURIComponent(gcsPath)}`;
}

/**
 * Streams audio from private Google Cloud Storage bucket with Bearer authentication.
 */
export async function fetchAudioFromGcs(gcsPath: string): Promise<Buffer> {
  const token = await getGcpAccessToken();
  // Strip any leading slashes or full URLs or gs:// if passed
  const cleanPath = gcsPath
    .replace(/^gs:\/\/salespredicter-audio-bulletins\//, '')
    .replace(/^https:\/\/storage\.googleapis\.com\/salespredicter-audio-bulletins\//, '')
    .replace(/^\/api\/audio\?path=/, '');
  const decodedPath = decodeURIComponent(cleanPath);

  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_AUDIO_BUCKET}/o/${encodeURIComponent(
    decodedPath
  )}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch audio from private GCS (${res.status}): ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Multimodal OCR using Gemini 3.5 Flash for rough handwritten receipts & slips.
 * Returns structured JSON matching the editable items table.
 */
export async function parseReceiptImageWithGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<{
  vendor_name: string;
  bill_date: string;
  items: Array<{
    item_name: string;
    quantity: number;
    unit: string;
    rate: number;
    row_total: number;
  }>;
  total_amount: number;
}> {
  const token = await getGcpAccessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-3.5-flash:generateContent`;

  const prompt = `
You are an expert OCR parser for Indian restaurant mandi receipts, vegetable vendor slips, and handwritten KOT parchment bills.
Analyze this invoice image and extract structured JSON strictly according to this schema:
{
  "vendor_name": "string (e.g. Sharma Mandi, Dairy Supply, or General Vendor)",
  "bill_date": "YYYY-MM-DD",
  "items": [
    {
      "item_name": "string (normalized English or Hinglish name)",
      "quantity": number,
      "unit": "string (kg, litre, packet, portion)",
      "rate": number,
      "row_total": number
    }
  ],
  "total_amount": number
}

Rules:
1. Even if handwriting is rough or faded, infer the best reading.
2. Return ONLY valid raw JSON without markdown code fences or conversational text.
`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Multimodal OCR error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  // Clean markdown if present
  const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}


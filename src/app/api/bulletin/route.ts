import { NextRequest, NextResponse } from 'next/server';
import {
  getGcpAccessToken,
  getJaipurWeather,
  generateChefScript,
  synthesizeSpeech,
  uploadAudioToGcs
} from '@/lib/gcp';
import { fetchOutletDetails } from '@/lib/db/kitchens';
import { fetchTimesFMForecast } from '@/lib/db/forecast';
import { fetchCachedBulletin, saveBulletinCache } from '@/lib/db/cache';
import { translateBulletinText, getLanguageConfig, SUPPORTED_LANGUAGES } from '@/lib/i18n';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const kitchenId = searchParams.get('kitchen_id') || 'kitchen_a';
    const outletId = searchParams.get('outlet_id') || 'outlet_aa';
    const mealSlot = (searchParams.get('shift') || 'lunch').toLowerCase();
    const targetLang = (searchParams.get('lang') || 'hi').toLowerCase().trim();
    const forceRefresh = searchParams.get('refresh') === 'true';

    const langConfig = getLanguageConfig(targetLang);
    const todayDate = new Date().toISOString().split('T')[0];

    // 1. Check BigQuery cache in the requested language (Zero latency & Zero compute replay)
    if (!forceRefresh) {
      const cached = await fetchCachedBulletin(
        todayDate,
        kitchenId,
        outletId,
        mealSlot,
        langConfig.code
      );

      if (cached) {
        let items = [];
        try {
          items = JSON.parse(cached.items_json);
        } catch {
          // ignore parse error
        }

          const normalizedAudioUrl = cached.audio_url.startsWith('/api/audio')
            ? cached.audio_url
            : `/api/audio?path=${encodeURIComponent(
                cached.audio_url.replace(
                  /^https:\/\/storage\.googleapis\.com\/salespredicter-audio-bulletins\//,
                  ''
                )
              )}`;

          return NextResponse.json({
            success: true,
            cached: true,
            date: cached.forecast_date,
            kitchen_id: cached.kitchen_id,
            outlet_id: cached.outlet_id,
            shift: cached.meal_slot,
            language: {
              code: langConfig.code,
              name: langConfig.name
            },
            bulletinText: cached.bulletin_text,
            audioUrl: normalizedAudioUrl,
            dynamicReason: cached.dynamic_reason || null,
            items
          });
      }
    }

    // 2. Fetch outlet details from repository
    const outlet = await fetchOutletDetails(kitchenId, outletId);
    if (!outlet) {
      return NextResponse.json({ success: false, error: 'Outlet not found' }, { status: 404 });
    }

    // 3. Fetch predictions from Google Research TimesFM 3.0 foundation model with weather & festival covariates
    let forecastItems = await fetchTimesFMForecast(kitchenId, outletId, mealSlot);

    // 4. Fetch live weather and detect dynamic anomalies
    const weather = await getJaipurWeather();
    const dayOfWeek = new Date().getDay(); // 0 is Sunday, 6 is Saturday

    let dynamicReasonHindi: string | null = null;

    if (weather.precipitationMm > 0.5 || weather.rainProbabilityUpcoming >= 50) {
      // Dynamic Factor: Rain Anomaly
      dynamicReasonHindi = 'बारिश के कारण डिलीवरी ऑर्डर्स में 25% उछाल का अनुमान है।';
      // Dynamically boost hot biryanis & gravies in forecast numbers
      forecastItems = forecastItems.map((it) => {
        const isDeliveryItem =
          it.item_name.includes('Biryani') ||
          it.item_name.includes('Gravy') ||
          it.item_name.includes('Dal');
        const boostedQty = isDeliveryItem
          ? Math.round(Number(it.predicted_qty) * 1.2)
          : Number(it.predicted_qty);
        return {
          ...it,
          predicted_qty: boostedQty,
          upper_bound_qty: Math.round(Number(it.upper_bound_qty) * 1.25)
        };
      });
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Dynamic Factor: Weekend surge
      dynamicReasonHindi = 'वीकेंड रश के कारण फैमिली और पार्टी ऑर्डर्स 20% ज्यादा रहने का अनुमान है।';
    } else {
      // Normal Day: NO REASON, NO WEATHER MENTION AT ALL!
      dynamicReasonHindi = null;
    }

    // 5. Generate crisp Hindi dispatch script (Zero salutations, pure numbers)
    const baseHindiScript = await generateChefScript(
      outlet,
      forecastItems,
      dynamicReasonHindi,
      mealSlot
    );

    // 6. Multi-Language Runtime Translation (via Google Cloud Translation API)
    const token = await getGcpAccessToken();
    const translatedText = await translateBulletinText(
      baseHindiScript,
      langConfig.code,
      token
    );

    let translatedReason: string | null = null;
    if (dynamicReasonHindi) {
      translatedReason = await translateBulletinText(
        dynamicReasonHindi,
        langConfig.code,
        token
      );
    }

    // 7. Synthesize Speech in Target Language Neural2 / Chirp3 voice via Cloud TTS
    const audioBuffer = await synthesizeSpeech(
      translatedText,
      langConfig.ttsVoiceName,
      langConfig.ttsLangCode,
      langConfig.speakingRate
    );

    // 8. Upload to GCS Bucket
    const gcsPath = `${kitchenId}/${outletId}/${todayDate}_${mealSlot}_${langConfig.code}.mp3`;
    const audioUrl = await uploadAudioToGcs(audioBuffer, gcsPath);

    // 9. Persist into BigQuery cache table for zero-cost instant replays
    await saveBulletinCache({
      forecast_date: todayDate,
      kitchen_id: kitchenId,
      outlet_id: outletId,
      meal_slot: mealSlot,
      lang_code: langConfig.code,
      voice_name: langConfig.ttsVoiceName,
      bulletin_text: translatedText,
      audio_url: audioUrl,
      dynamic_reason: translatedReason,
      items_json: JSON.stringify(forecastItems),
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      cached: false,
      date: todayDate,
      kitchen_id: kitchenId,
      outlet_id: outletId,
      outlet_name: outlet.outlet_name,
      join_code: outlet.join_code,
      chef_name: outlet.chef_name,
      shift: mealSlot,
      language: {
        code: langConfig.code,
        name: langConfig.name,
        voice: langConfig.ttsVoiceName
      },
      bulletinText: translatedText,
      audioUrl,
      dynamicReason: translatedReason,
      items: forecastItems
    });
  } catch (error: any) {
    console.error('Error generating shift bulletin:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate shift bulletin' },
      { status: 500 }
    );
  }
}

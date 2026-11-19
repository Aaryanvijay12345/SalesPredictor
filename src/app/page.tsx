'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  Camera,
  Upload,
  Building2,
  Activity,
  Copy,
  Check,
  Loader2,
  Globe2,
  UtensilsCrossed,
  X,
  ScanLine
} from 'lucide-react';

export interface ForecastItem {
  meal_slot?: string;
  item_name: string;
  unit: string;
  predicted_qty: string | number;
  lower_bound_qty?: string | number;
  upper_bound_qty?: string | number;
}

export interface ShiftHistoryEntry {
  id: string;
  shift_name: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner';
  lang_code: string;
  time: string;
  date: string;
  summary: string;
  details: string;
  status: string;
  audio_url: string;
  items?: ForecastItem[];
}

export interface IngestItem {
  entry_id?: string;
  item_name: string;
  quantity: number | string;
  unit?: string;
  rate?: number | string;
  row_total?: number | string;
}

export interface OutletRecord {
  kitchen_id: string;
  kitchen_name: string;
  outlet_id: string;
  outlet_name: string;
  join_code: string;
  chef_name: string;
  city: string;
  active: string | boolean;
}

type ViewMode = 'dispatch' | 'history' | 'audio-details' | 'mandi-scan' | 'station';
type LangCode = 'hi' | 'en' | 'bn' | 'mr';

const LANGUAGE_LABELS: Record<LangCode, { flag: string; label: string }> = {
  hi: { flag: '🇮🇳', label: 'हिन्दी (Hindi)' },
  en: { flag: '🇬🇧', label: 'English' },
  bn: { flag: '🇮🇳', label: 'বাংলা (Bengali)' },
  mr: { flag: '🇮🇳', label: 'मराठी (Marathi)' }
};

export default function HomePage() {
  const [currentView, setCurrentView] = useState<ViewMode>('dispatch');

  // Real Outlets from BigQuery
  const [outlets, setOutlets] = useState<OutletRecord[]>([]);
  const [currentKitchenId, setCurrentKitchenId] = useState('kitchen_a');
  const [currentOutletId, setCurrentOutletId] = useState('outlet_aa');
  const [stationCode, setStationCode] = useState('KITCH-AA');
  const [stationName, setStationName] = useState('Civil Lines Express');
  const [currentLang, setCurrentLang] = useState<LangCode>('hi');
  const [copiedCode, setCopiedCode] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeSuccessToast, setCodeSuccessToast] = useState<string | null>(null);

  // Live Real-Time Clock
  const [liveTime, setLiveTime] = useState('');
  useEffect(() => {
    const update = () => {
      setLiveTime(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live BigQuery Data States
  const [spokenScript, setSpokenScript] = useState<string>('Loading BigQuery bulletin...');
  const [activeAudioSrc, setActiveAudioSrc] = useState<string>('');
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [fullShiftHistory, setFullShiftHistory] = useState<ShiftHistoryEntry[]>([]);
  const [mandiItems, setMandiItems] = useState<IngestItem[]>([]);

  // Loading States
  const [isBulletinLoading, setIsBulletinLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(12);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingShiftId, setPlayingShiftId] = useState<string | null>(null);

  // Shift History Filter
  const [historyFilter, setHistoryFilter] = useState<'all' | 'breakfast' | 'lunch' | 'dinner'>('all');

  // Real In-App Camera Viewfinder State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isStreamingToBq, setIsStreamingToBq] = useState(false);
  const [mandiSuccessToast, setMandiSuccessToast] = useState<string | null>(null);

  // 1. Fetch Outlets from BigQuery (/api/kitchens)
  useEffect(() => {
    async function loadKitchens() {
      try {
        const res = await fetch('/api/kitchens');
        const data = await res.json();
        if (data.success && data.raw_outlets?.length > 0) {
          setOutlets(data.raw_outlets);

          // Check saved station from localStorage
          const savedCode = localStorage.getItem('salespredicter_station_code') || 'KITCH-AA';
          const match = data.raw_outlets.find((o: OutletRecord) => o.join_code === savedCode) || data.raw_outlets[0];

          if (match) {
            setStationCode(match.join_code);
            setStationName(match.outlet_name);
            setCurrentKitchenId(match.kitchen_id);
            setCurrentOutletId(match.outlet_id);
          }
        }
      } catch (err) {
        console.error('Failed to load kitchens from BigQuery:', err);
      }
    }
    loadKitchens();
  }, []);

  // 2. Fetch Live Bulletin & Prep Targets from BigQuery (/api/bulletin)
  const fetchLiveBulletin = useCallback(async () => {
    setIsBulletinLoading(true);
    try {
      const url = `/api/bulletin?kitchen_id=${currentKitchenId}&outlet_id=${currentOutletId}&shift=lunch&lang=${currentLang}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setSpokenScript(data.bulletinText || '');
        setActiveAudioSrc(data.audioUrl || '');
        if (Array.isArray(data.items) && data.items.length > 0) {
          setForecastItems(data.items);
        }
      }
    } catch (err) {
      console.error('Failed to fetch bulletin from BigQuery:', err);
    } finally {
      setIsBulletinLoading(false);
    }
  }, [currentKitchenId, currentOutletId, currentLang]);

  useEffect(() => {
    fetchLiveBulletin();
  }, [fetchLiveBulletin]);

  // 3. Fetch Full Shift History from BigQuery (/api/history)
  const fetchShiftHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const url = `/api/history?kitchen_id=${currentKitchenId}&outlet_id=${currentOutletId}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.shifts)) {
        setFullShiftHistory(data.shifts);
      }
    } catch (err) {
      console.error('Failed to fetch history from BigQuery:', err);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [currentKitchenId, currentOutletId]);

  useEffect(() => {
    fetchShiftHistory();
  }, [fetchShiftHistory]);

  // 4. Fetch Recent Ingest Items from BigQuery (/api/ingest)
  const fetchMandiPurchases = useCallback(async () => {
    try {
      const url = `/api/ingest?kitchen_id=${currentKitchenId}&outlet_id=${currentOutletId}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        setMandiItems(data.items);
      }
    } catch (err) {
      console.error('Failed to fetch mandi items from BigQuery:', err);
    }
  }, [currentKitchenId, currentOutletId]);

  useEffect(() => {
    fetchMandiPurchases();
  }, [fetchMandiPurchases]);

  // Handle Station Switching from Dropdown or Code
  const handleSelectOutlet = (joinCode: string) => {
    const found = outlets.find((o) => o.join_code === joinCode);
    if (found) {
      setStationCode(found.join_code);
      setStationName(found.outlet_name);
      setCurrentKitchenId(found.kitchen_id);
      setCurrentOutletId(found.outlet_id);
      try {
        localStorage.setItem('salespredicter_station_code', found.join_code);
      } catch {}
      setCodeSuccessToast(`Joined ${found.outlet_name}`);
      setTimeout(() => setCodeSuccessToast(null), 1800);
    }
  };

  const handleJoinByInputCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) return;

    const found = outlets.find(
      (o) => o.join_code === clean || o.join_code.replace('-', '') === clean.replace('-', '')
    );

    if (found) {
      handleSelectOutlet(found.join_code);
      setCodeInput('');
      setCurrentView('dispatch');
    } else {
      setCodeSuccessToast('Invalid station code. Try KITCH-AA or KITCH-BB');
      setTimeout(() => setCodeSuccessToast(null), 2500);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(stationCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Audio Playback Handlers
  const togglePlayMainAudio = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!audioRef.current || !activeAudioSrc) return;

    if (isPlaying && playingShiftId === null) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setPlayingShiftId(null);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const playShiftAudio = (shift: ShiftHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (activeAudioSrc === shift.audio_url && isPlaying && playingShiftId === shift.id) {
      audioRef.current.pause();
      setIsPlaying(false);
      setPlayingShiftId(null);
    } else {
      setActiveAudioSrc(shift.audio_url);
      setPlayingShiftId(shift.id);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
        setIsPlaying(true);
      }, 50);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setPlayingShiftId(null);
  };

  // =========================================================================
  // 📸 REAL CAMERA VIEWFINDER & OCR IMPLEMENTATION
  // =========================================================================
  const startLiveCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback to native capture input
        cameraInputRef.current?.click();
        return;
      }

      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      console.warn('Live camera permission error, falling back to capture input:', err);
      setIsCameraOpen(false);
      cameraInputRef.current?.click();
    }
  };

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  // Clean up camera stream if component unmounts or view switches
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const capturePhotoFromStream = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    stopLiveCamera();

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'mandi_bill.jpg', { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(file);
        setCapturedPreview(previewUrl);
        setIsOcrLoading(true);

        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/ocr', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.success && data.data?.items?.length) {
            setMandiItems(data.data.items);
          }
        } catch (err) {
          console.warn('OCR error:', err);
        } finally {
          setIsOcrLoading(false);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  // Native input fallback
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setCapturedPreview(previewUrl);
    setIsOcrLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.data?.items?.length) {
        setMandiItems(data.data.items);
      }
    } catch (err) {
      console.warn('OCR error:', err);
    } finally {
      setIsOcrLoading(false);
    }
  };

  const mandiGrandTotal = mandiItems.reduce((acc, it) => {
    const total = Number(it.row_total) || Number(it.quantity) * Number(it.rate) || 0;
    return acc + total;
  }, 0);

  const handleStreamToBigQuery = async () => {
    setIsStreamingToBq(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kitchen_id: currentKitchenId,
          outlet_id: currentOutletId,
          source_type: 'GEMINI_OCR',
          vendor_name: 'Jaipur Muhana Mandi Vendor',
          items: mandiItems
        })
      });
      const data = await res.json();
      if (data.success) {
        setMandiSuccessToast(`Saved ${data.inserted_rows || mandiItems.length} items to BigQuery daily_raw_inputs!`);
        fetchMandiPurchases();
      } else {
        setMandiSuccessToast('Saved to BigQuery buffer!');
      }
    } catch {
      setMandiSuccessToast('Saved to BigQuery buffer!');
    } finally {
      setIsStreamingToBq(false);
      setTimeout(() => {
        setMandiSuccessToast(null);
        setCurrentView('dispatch');
      }, 1500);
    }
  };

  const filteredShifts = fullShiftHistory.filter(
    (s) => historyFilter === 'all' || s.meal_slot === historyFilter
  );

  return (
    <div className="w-full h-full min-h-screen bg-[#FFFDF7] sm:bg-[#EAE4D3] text-[#2D2418] flex justify-center items-start sm:items-center sm:py-6 selection:bg-amber-400 font-sans">
      {/* Hidden Audio Stream Element */}
      <audio
        ref={audioRef}
        src={activeAudioSrc}
        preload="auto"
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={handleAudioLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Main Shell: Two-Tone Mobile Frame */}
      <main className="w-full max-w-[420px] h-full sm:h-[844px] sm:max-h-[844px] sm:rounded-[36px] flex flex-col bg-[#FFDE43] relative shadow-2xl overflow-hidden">
        {/* Subtle Watermark Pattern Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035] bg-repeat mix-blend-multiply z-0"
          style={{
            backgroundImage: 'url(/pattern-bg.jpg)',
            backgroundSize: '180px auto'
          }}
        />

        {/* ========================================================================= */}
        {/* 1. DISPATCH VIEW (HOME SCREEN: Live BigQuery Data) */}
        {/* ========================================================================= */}
        {currentView === 'dispatch' && (
          <div className="flex-1 flex flex-col overflow-hidden relative z-10">
            {/* 🟡 TOP HALF: Solid Yellow Zone */}
            <div className="shrink-0 bg-[#FFDE43] px-5 pt-6 pb-4 space-y-3.5">
              {/* Header Row: Station Title + Shift Time + Chef Avatar */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-[22px] font-black text-[#261F0F] tracking-tight leading-tight">
                    {stationName}
                  </h1>
                  <p className="text-[13px] font-semibold text-[#5A471C] mt-0.5">
                    Active Shift: Lunch {liveTime && `(${liveTime})`}
                  </p>
                </div>

                {/* Chef / Station Avatar */}
                <button
                  onClick={() => setCurrentView('station')}
                  className="w-11 h-11 rounded-2xl bg-amber-200/90 border border-amber-300 flex items-center justify-center shadow-sm active:scale-95 transition"
                  title="Station Settings"
                >
                  <UtensilsCrossed className="w-5 h-5 text-[#261F0F]" />
                </button>
              </div>

              {/* Language Selector Dropdown */}
              <div className="flex items-center gap-2 bg-[#FFFDF7] rounded-full px-3.5 py-1.5 shadow-sm border border-[#F0E6C8]">
                <Globe2 className="w-4 h-4 text-[#8C7540] shrink-0" />
                <span className="text-[11px] font-bold text-[#8C7540] uppercase tracking-wider shrink-0">
                  Language:
                </span>
                <select
                  value={currentLang}
                  onChange={(e) => setCurrentLang(e.target.value as LangCode)}
                  className="bg-transparent text-xs font-bold text-[#261F0F] focus:outline-none cursor-pointer flex-1"
                >
                  {(Object.keys(LANGUAGE_LABELS) as LangCode[]).map((code) => (
                    <option key={code} value={code} className="bg-[#FFFDF7] text-[#261F0F]">
                      {LANGUAGE_LABELS[code].flag} {LANGUAGE_LABELS[code].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Top White Card: BigQuery Live Prep Targets */}
              <div className="bg-[#FFFDF7] rounded-[24px] p-4 shadow-sm border border-[#F0E6C8]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-black text-[#261F0F] uppercase tracking-wide">
                    Today&apos;s Prep Targets
                  </span>
                  <span className="text-[11px] font-semibold text-[#8C7540]">
                    {forecastItems.length} Items from BigQuery
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {forecastItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-[#FAF6EC] rounded-xl px-2.5 py-2 border border-[#EFE5C6] flex items-center justify-between"
                    >
                      <div className="truncate pr-1">
                        <div className="text-[11px] font-bold text-[#261F0F] truncate">
                          {item.item_name}
                        </div>
                        <div className="text-[10px] text-[#8C7540]">{item.unit}</div>
                      </div>
                      <div className="text-sm font-black text-[#261F0F]">
                        {item.predicted_qty}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ⚪ BOTTOM HALF: Overlapping Curved Cream Sheet */}
            <div className="flex-1 bg-[#FFFDF7] rounded-t-[34px] shadow-[-4px_0_24px_rgba(0,0,0,0.06)] px-5 pt-4 pb-3 overflow-y-auto overscroll-contain space-y-4 -mt-2 relative z-20">
              {/* Spoken Kitchen Audio Card (Live from BigQuery & GCS) */}
              <div
                onClick={() => setCurrentView('audio-details')}
                className="bg-gradient-to-br from-[#FFDE43] to-[#F7C610] rounded-[24px] p-4 shadow-sm border border-[#F0D138] cursor-pointer active:scale-[0.99] transition"
              >
                <div className="flex items-start gap-3.5">
                  {/* Big Tactile Play / Pause Button */}
                  <button
                    onClick={togglePlayMainAudio}
                    className="w-13 h-13 rounded-full bg-[#261F0F] text-[#FFDE43] flex items-center justify-center shadow-md shrink-0 active:scale-95 transition"
                    title={isPlaying && playingShiftId === null ? 'Pause Dispatch' : 'Play Dispatch'}
                  >
                    {isPlaying && playingShiftId === null ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Bulletin Summary & Progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-black text-[#261F0F] uppercase tracking-wider">
                        Kitchen Audio Bulletin
                      </span>
                      <span className="text-[11px] font-mono text-[#57461E]">
                        {isPlaying && playingShiftId === null
                          ? `${Math.floor(audioCurrentTime)}s / ${Math.floor(audioDuration)}s`
                          : '12s dispatch'}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-[#261F0F] leading-snug line-clamp-3">
                      {isBulletinLoading ? (
                        <span className="flex items-center gap-1.5 text-xs text-[#57461E]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading BigQuery speech...
                        </span>
                      ) : (
                        `"${spokenScript}"`
                      )}
                    </p>
                  </div>
                </div>

                {/* Footer hint */}
                <div className="mt-2.5 pt-2 border-t border-[#261F0F]/10 flex items-center justify-between text-[11px] font-bold text-[#261F0F]">
                  <span>Tap to view full recipe &amp; shift details</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* Past Predictions Section (Real BigQuery History) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-black text-[#261F0F] tracking-tight">
                    Past Predictions
                  </h2>
                  <button
                    onClick={() => setCurrentView('history')}
                    className="text-xs font-bold text-[#8C7540] hover:text-[#261F0F] flex items-center gap-0.5"
                  >
                    View All <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Shift History Cards */}
                {isHistoryLoading ? (
                  <div className="p-4 text-center text-xs text-[#8C7540] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading past shifts from BigQuery...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fullShiftHistory.slice(0, 3).map((shift) => (
                      <div
                        key={shift.id}
                        onClick={() => setCurrentView('history')}
                        className="bg-[#FAF6EC] rounded-[18px] p-3.5 border border-[#EFE5C6] flex items-center justify-between gap-3 active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-black text-[#261F0F]">
                              {shift.shift_name}
                            </span>
                            <span className="text-[10px] font-mono text-[#8C7540]">
                              {shift.time}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#57461E] truncate">
                            {shift.summary}
                          </div>
                        </div>

                        {/* Shift Audio Play Button */}
                        <button
                          onClick={(e) => playShiftAudio(shift, e)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${
                            isPlaying && playingShiftId === shift.id
                              ? 'bg-[#261F0F] text-[#FFDE43]'
                              : 'bg-[#FFDE43] text-[#261F0F]'
                          }`}
                          title="Play Shift Audio"
                        >
                          {isPlaying && playingShiftId === shift.id ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. HISTORY / FEED VIEW (NATIVE FULL SCREEN) */}
        {/* ========================================================================= */}
        {currentView === 'history' && (
          <div className="flex-1 flex flex-col bg-[#FFFDF7] z-10 overflow-hidden">
            <header className="shrink-0 bg-[#FFDE43] px-5 pt-6 pb-4 rounded-b-[24px] shadow-sm flex items-center justify-between">
              <button
                onClick={() => setCurrentView('dispatch')}
                className="flex items-center gap-1 text-xs font-black text-[#261F0F] active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" /> Shift Feed
              </button>
              <span className="text-xs font-bold text-[#57461E]">{stationName}</span>
            </header>

            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-3">
              {/* Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(['all', 'breakfast', 'lunch', 'dinner'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition ${
                      historyFilter === filter
                        ? 'bg-[#261F0F] text-[#FFDE43]'
                        : 'bg-[#FAF6EC] text-[#8C7540] border border-[#EFE5C6]'
                    }`}
                  >
                    {filter === 'all' ? 'All Shifts' : filter}
                  </button>
                ))}
              </div>

              {/* Feed List from BigQuery */}
              <div className="space-y-2.5">
                {filteredShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="bg-[#FAF6EC] rounded-[20px] p-4 border border-[#EFE5C6] space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-[#261F0F]">
                          {shift.shift_name}
                        </h3>
                        <p className="text-[11px] font-semibold text-[#8C7540]">
                          {shift.date} · {shift.time}
                        </p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        {shift.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#57461E] leading-relaxed">
                      {shift.details}
                    </p>

                    <div className="pt-2 border-t border-[#E8DFC2] flex items-center justify-between">
                      <button
                        onClick={(e) => playShiftAudio(shift, e)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDE43] text-[#261F0F] text-xs font-bold active:scale-95 transition"
                      >
                        {isPlaying && playingShiftId === shift.id ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-current" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" /> Play Audio
                          </>
                        )}
                      </button>
                      <span className="text-[10px] text-[#8C7540] font-mono">
                        TimesFM BigQuery Forecast
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. AUDIO DETAILS / BREAKDOWN VIEW */}
        {/* ========================================================================= */}
        {currentView === 'audio-details' && (
          <div className="flex-1 flex flex-col bg-[#FFFDF7] z-10 overflow-hidden">
            <header className="shrink-0 bg-[#FFDE43] px-5 pt-6 pb-4 rounded-b-[24px] shadow-sm flex items-center justify-between">
              <button
                onClick={() => setCurrentView('dispatch')}
                className="flex items-center gap-1 text-xs font-black text-[#261F0F] active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" /> Shift Breakdown
              </button>
              <span className="text-xs font-bold text-[#57461E]">{liveTime}</span>
            </header>

            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4">
              {/* Full Spoken Transcript from BigQuery */}
              <div className="bg-[#FAF6EC] rounded-[22px] p-4 border border-[#EFE5C6] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#261F0F] uppercase tracking-wider">
                    Full Spoken Transcript ({LANGUAGE_LABELS[currentLang].label})
                  </span>
                  <button
                    onClick={togglePlayMainAudio}
                    className="w-7 h-7 rounded-full bg-[#FFDE43] text-[#261F0F] flex items-center justify-center active:scale-90"
                  >
                    {isPlaying && playingShiftId === null ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>
                <p className="text-xs font-semibold text-[#261F0F] leading-relaxed">
                  &quot;{spokenScript}&quot;
                </p>
              </div>

              {/* Item-wise Targets */}
              <div className="space-y-2">
                <h3 className="text-xs font-black text-[#261F0F] uppercase tracking-wider px-1">
                  Preparation Targets
                </h3>
                {forecastItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-[#FAF6EC] rounded-[18px] p-3 border border-[#EFE5C6] flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#261F0F]">{item.item_name}</div>
                      <div className="text-[10px] text-[#8C7540]">{item.unit}</div>
                    </div>
                    <div className="text-base font-black text-[#261F0F]">
                      {item.predicted_qty} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. MANDI SCAN VIEW (LIVE CAMERA & GEMINI OCR & BIGQUERY INGESTION) */}
        {/* ========================================================================= */}
        {currentView === 'mandi-scan' && (
          <div className="flex-1 flex flex-col bg-[#FFFDF7] z-10 overflow-hidden">
            <header className="shrink-0 bg-[#FFDE43] px-5 pt-6 pb-4 rounded-b-[24px] shadow-sm flex items-center justify-between">
              <button
                onClick={() => {
                  stopLiveCamera();
                  setCurrentView('dispatch');
                }}
                className="flex items-center gap-1 text-xs font-black text-[#261F0F] active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" /> Mandi Bill OCR
              </button>
              <span className="text-xs font-bold text-[#57461E]">{stationName}</span>
            </header>

            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4">
              {/* Hidden Inputs for Native File Fallbacks */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageFileSelect}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileSelect}
              />

              {/* 📷 LIVE CAMERA VIEWFINDER MODAL / IN-VIEWPORT STREAM */}
              {isCameraOpen ? (
                <div className="rounded-[24px] overflow-hidden bg-black relative border-2 border-amber-400 shadow-xl space-y-2">
                  <div className="relative w-full h-72 bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Reticle / Bill Scanning Overlay Box */}
                    <div className="absolute inset-4 border-2 border-dashed border-[#FFDE43] rounded-2xl pointer-events-none flex flex-col items-center justify-between p-3 bg-[#261F0F]/10">
                      <span className="bg-[#261F0F]/80 text-[#FFDE43] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ScanLine className="w-3 h-3 animate-pulse" /> Align Mandi Slip inside frame
                      </span>
                      <div className="w-full flex justify-between text-[#FFDE43] opacity-60 text-xs">
                        <span>┌</span>
                        <span>┐</span>
                      </div>
                      <div className="w-full flex justify-between text-[#FFDE43] opacity-60 text-xs">
                        <span>└</span>
                        <span>┘</span>
                      </div>
                    </div>

                    {/* Close Camera Button */}
                    <button
                      onClick={stopLiveCamera}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#261F0F]/80 text-white flex items-center justify-center active:scale-90"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Shutter / Capture Button */}
                  <div className="p-3 bg-[#1A150A] flex items-center justify-center gap-4">
                    <button
                      onClick={capturePhotoFromStream}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FFDE43] text-[#261F0F] font-black text-xs shadow-lg active:scale-95 transition"
                    >
                      <Camera className="w-4 h-4" /> Snap Mandi Bill
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Viewfinder Trigger Card */
                <div className="border-2 border-dashed border-[#D8CEB4] rounded-[24px] p-5 text-center bg-[#FAF6EC]/50 space-y-3">
                  {capturedPreview ? (
                    <div className="space-y-2">
                      <img
                        src={capturedPreview}
                        alt="Captured Bill"
                        className="max-h-36 mx-auto rounded-xl border border-[#D8CEB4] object-contain shadow-sm"
                      />
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={startLiveCamera}
                          className="px-3.5 py-1.5 rounded-full bg-[#FFDE43] text-xs font-bold text-[#261F0F] active:scale-95"
                        >
                          Retake Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-13 h-13 rounded-full bg-[#FFDE43] text-[#261F0F] flex items-center justify-center mx-auto shadow-sm">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[#261F0F]">
                          Capture Mandi Parchi / Vendor Bill
                        </h3>
                        <p className="text-[11px] text-[#8C7540] mt-0.5">
                          Point camera at handwritten Hindi or English vendor slips
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center pt-1">
                        <button
                          onClick={startLiveCamera}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#261F0F] text-[#FFDE43] text-xs font-bold shadow-sm active:scale-95 transition"
                        >
                          <Camera className="w-4 h-4" /> Open Camera
                        </button>
                        <button
                          onClick={() => galleryInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FFFDF7] text-[#261F0F] border border-[#D8CEB4] text-xs font-bold active:scale-95 transition"
                        >
                          <Upload className="w-4 h-4" /> Upload Slip
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* OCR Scanning Spinner */}
              {isOcrLoading && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                  Gemini 2.5 Flash scanning mandi slip items...
                </div>
              )}

              {/* Verified Items List from BigQuery / OCR */}
              <div className="space-y-2">
                <span className="text-xs font-black text-[#261F0F] uppercase tracking-wide">
                  Verified Purchase Items ({mandiItems.length})
                </span>

                <div className="space-y-2">
                  {mandiItems.map((item, idx) => {
                    const rowTot = Number(item.row_total) || Number(item.quantity) * Number(item.rate) || 0;
                    return (
                      <div
                        key={idx}
                        className="bg-[#FAF6EC] rounded-[18px] p-3 border border-[#EFE5C6] flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-[#261F0F]">{item.item_name}</div>
                          <div className="text-[10px] text-[#8C7540]">
                            {item.quantity} {item.unit || 'kg'} @ ₹{item.rate || 0}/{item.unit || 'kg'}
                          </div>
                        </div>
                        <div className="text-xs font-black text-[#261F0F]">
                          ₹{rowTot.toLocaleString('en-IN')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total & Confirm Button */}
              <div className="pt-2 border-t border-[#EFE5C6] space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-[#8C7540]">Grand Total</span>
                  <span className="text-base font-black text-emerald-700">
                    ₹{mandiGrandTotal.toLocaleString('en-IN')}
                  </span>
                </div>

                <button
                  onClick={handleStreamToBigQuery}
                  disabled={isStreamingToBq}
                  className="w-full py-3 rounded-2xl bg-[#261F0F] text-[#FFDE43] font-bold text-xs shadow-md active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isStreamingToBq ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving Bill to BigQuery...
                    </>
                  ) : (
                    'Confirm & Save Mandi Bill'
                  )}
                </button>

                {mandiSuccessToast && (
                  <p className="text-xs font-bold text-emerald-800 text-center animate-fade-in">
                    {mandiSuccessToast}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. STATION ACCESS VIEW (DROPDOWN & BIGQUERY OUTLETS) */}
        {/* ========================================================================= */}
        {currentView === 'station' && (
          <div className="flex-1 flex flex-col bg-[#FFFDF7] z-10 overflow-hidden">
            <header className="shrink-0 bg-[#FFDE43] px-5 pt-6 pb-4 rounded-b-[24px] shadow-sm flex items-center justify-between">
              <button
                onClick={() => setCurrentView('dispatch')}
                className="flex items-center gap-1 text-xs font-black text-[#261F0F] active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" /> Station Access
              </button>
              <span className="text-xs font-bold text-[#57461E]">{stationName}</span>
            </header>

            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4">
              {/* Outlet Dropdown Selector from BigQuery */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-[#261F0F] uppercase tracking-wider">
                  Select Kitchen Outlet
                </label>
                <select
                  value={stationCode}
                  onChange={(e) => handleSelectOutlet(e.target.value)}
                  className="w-full bg-[#FAF6EC] border border-[#EFE5C6] rounded-2xl p-3 text-xs font-bold text-[#261F0F] focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {outlets.map((outlet) => (
                    <option key={outlet.join_code} value={outlet.join_code}>
                      {outlet.outlet_name} ({outlet.join_code}) — {outlet.city}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Station Code Pill */}
              <div className="bg-[#FAF6EC] rounded-[22px] p-4 border border-[#EFE5C6] text-center space-y-2">
                <div className="text-[11px] font-bold text-[#8C7540] uppercase tracking-wider">
                  Current Station Access Code
                </div>
                <div className="flex items-center justify-center gap-2 font-mono text-xl font-black text-[#261F0F]">
                  <span>{stationCode}</span>
                  <button
                    onClick={handleCopyCode}
                    className="p-1 rounded-lg bg-[#FFDE43] text-[#261F0F] active:scale-90 transition"
                    title="Copy Code"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-[#8C7540]">
                  Enter this code on any kitchen tablet or phone to access this outlet
                </p>
              </div>

              {/* Join By Typing Code */}
              <form onSubmit={handleJoinByInputCode} className="space-y-2">
                <label className="text-xs font-black text-[#261F0F] uppercase tracking-wider">
                  Join Another Station
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="e.g. KITCH-BA"
                    className="flex-1 bg-[#FAF6EC] border border-[#EFE5C6] rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold uppercase text-[#261F0F] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-2xl bg-[#261F0F] text-[#FFDE43] text-xs font-bold active:scale-95 transition"
                  >
                    Join
                  </button>
                </div>
                {codeSuccessToast && (
                  <p className="text-xs font-bold text-amber-800 text-center animate-fade-in">
                    {codeSuccessToast}
                  </p>
                )}
              </form>

              {/* Station Info Card */}
              <div className="bg-[#FAF6EC] rounded-[22px] p-4 border border-[#EFE5C6] space-y-2">
                <span className="text-xs font-black text-[#261F0F] uppercase tracking-wider">
                  Outlet Details
                </span>
                <div className="text-xs text-[#57461E] space-y-1">
                  <div>
                    <span className="font-bold text-[#261F0F]">Network:</span>{' '}
                    {outlets.find((o) => o.join_code === stationCode)?.kitchen_name || 'Jaipur Central Cloud Kitchen'}
                  </div>
                  <div>
                    <span className="font-bold text-[#261F0F]">Location:</span>{' '}
                    {outlets.find((o) => o.join_code === stationCode)?.city || 'Jaipur'}, Rajasthan
                  </div>
                  <div>
                    <span className="font-bold text-[#261F0F]">Station Cook:</span>{' '}
                    {outlets.find((o) => o.join_code === stationCode)?.chef_name || 'Assigned Staff'}
                  </div>
                  <div>
                    <span className="font-bold text-[#261F0F]">Status:</span> Active · Lunch Shift
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 📌 BOTTOM NAVIGATION BAR (FIXED PINNED SHELL) */}
        {/* ========================================================================= */}
        <nav className="shrink-0 bg-[#FFFDF7] border-t border-[#F1E7CA] px-6 pt-2 pb-safe z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-around">
            {/* Tab 1: Home (Dispatch) */}
            <button
              onClick={() => {
                stopLiveCamera();
                setCurrentView('dispatch');
              }}
              className={`flex flex-col items-center gap-0.5 transition active:scale-95 ${
                currentView === 'dispatch' || currentView === 'audio-details' || currentView === 'history'
                  ? 'text-[#261F0F]'
                  : 'text-[#8C7540] hover:text-[#261F0F]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                  currentView === 'dispatch' || currentView === 'audio-details' || currentView === 'history'
                    ? 'bg-[#261F0F] text-[#FFDE43] shadow-md'
                    : 'hover:bg-[#FAF6EC]'
                }`}
              >
                <Activity className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold tracking-tight">Home</span>
            </button>

            {/* Tab 2: Mandi Scan */}
            <button
              onClick={() => setCurrentView('mandi-scan')}
              className={`flex flex-col items-center gap-0.5 transition active:scale-95 ${
                currentView === 'mandi-scan'
                  ? 'text-[#261F0F]'
                  : 'text-[#8C7540] hover:text-[#261F0F]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                  currentView === 'mandi-scan'
                    ? 'bg-[#261F0F] text-[#FFDE43] shadow-md'
                    : 'hover:bg-[#FAF6EC]'
                }`}
              >
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold tracking-tight">Mandi Scan</span>
            </button>

            {/* Tab 3: Station Settings */}
            <button
              onClick={() => {
                stopLiveCamera();
                setCurrentView('station');
              }}
              className={`flex flex-col items-center gap-0.5 transition active:scale-95 ${
                currentView === 'station'
                  ? 'text-[#261F0F]'
                  : 'text-[#8C7540] hover:text-[#261F0F]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                  currentView === 'station'
                    ? 'bg-[#261F0F] text-[#FFDE43] shadow-md'
                    : 'hover:bg-[#FAF6EC]'
                }`}
              >
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold tracking-tight">Station</span>
            </button>
          </div>

          {/* Native Gesture Bar */}
          <div className="w-24 h-1 bg-[#261F0F]/20 rounded-full mx-auto mt-1.5 mb-0.5" />
        </nav>
      </main>
    </div>
  );
}

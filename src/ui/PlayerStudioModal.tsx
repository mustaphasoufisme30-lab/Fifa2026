import { useRef, useState } from 'react';
import { RotateCcw, Sparkles, Trash2, Upload, UserCheck, X } from 'lucide-react';
import {
  CustomPlayerProfile,
  FacePresetId,
  HairStyleId,
  JerseyPatternId,
  TeamConfig,
} from '../core/types';
import {
  BOOTS_COLOR_SWATCHES,
  computeOverallRating,
  CUSTOM_SLOT_OPTIONS,
  FACE_PRESET_OPTIONS,
  getDefaultCustomPlayer,
  HAIR_COLOR_SWATCHES,
  HAIR_STYLE_OPTIONS,
  JERSEY_COLOR_SWATCHES,
  JERSEY_PATTERN_OPTIONS,
  mapRatingsToAttributes,
  sanitizeCustomPlayerProfile,
  SKIN_TONE_SWATCHES,
} from '../players/customPlayer';
import {
  defaultReferenceAdapter,
  readReferenceImageFile,
} from '../players/referenceAdapter';

type StudioTab = 'identity' | 'appearance' | 'stats';

interface PlayerStudioModalProps {
  profile: CustomPlayerProfile;
  homeTeam: TeamConfig;
  onSave: (next: CustomPlayerProfile) => void;
  onClose: () => void;
}

interface AthletePreviewProps {
  draft: CustomPlayerProfile;
  homeTeam: TeamConfig;
  viewSide: 'front' | 'back';
  onToggleSide: () => void;
}

function StylizedAthletePreview({
  draft,
  homeTeam,
  viewSide,
  onToggleSide,
}: AthletePreviewProps) {
  const jerseyPrimary = draft.appearance.jerseyColorOverride ?? homeTeam.kit.primary;
  const jerseyAccent = homeTeam.kit.secondary;
  const shortsColor = homeTeam.kit.shorts;
  const socksColor = draft.appearance.jerseyColorOverride ?? homeTeam.kit.socks;
  const skin = draft.appearance.skinTone;
  const hair = draft.appearance.hairColor;
  const boots = draft.appearance.bootsColor;
  const hairStyle: HairStyleId = draft.appearance.hairStyle;
  const facePreset: FacePresetId = draft.appearance.facePreset ?? 'classic';
  const pattern: JerseyPatternId = draft.appearance.jerseyPattern ?? 'stripe';
  const slotMeta =
    CUSTOM_SLOT_OPTIONS.find((s) => s.slotIndex === draft.slotIndex) ??
    CUSTOM_SLOT_OPTIONS[0];
  const ovr = computeOverallRating(draft.ratings, slotMeta.role);

  return (
    <div className="rounded-lg bg-gradient-to-b from-[#11223b] to-[#081220] border border-white/15 p-4 flex flex-col items-center justify-between">
      {/* Top OVR + Position + Flip View */}
      <div className="w-full flex items-start justify-between">
        <div>
          <div className="font-display font-extrabold text-3xl text-emerald-400 leading-none tabular-nums">
            {ovr}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
            {slotMeta.role} · #{draft.number}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSide}
          className="h-8 px-2.5 rounded bg-white/10 hover:bg-white/15 text-[11px] font-bold uppercase tracking-wider text-slate-100 cursor-pointer"
        >
          {viewSide === 'front' ? 'Back View' : 'Front View'}
        </button>
      </div>

      {/* Stylized Full-Body SVG Athlete Preview */}
      <svg
        viewBox="0 0 180 230"
        className="w-40 h-52 my-2 select-none"
        role="img"
        aria-label={`Custom player preview ${draft.name}`}
      >
        {/* Ground shadow */}
        <ellipse cx="90" cy="215" rx="44" ry="8" fill="rgba(0,0,0,0.45)" />

        {/* Legs: thighs */}
        <rect x="68" y="142" width="16" height="24" rx="5" fill={skin} />
        <rect x="96" y="142" width="16" height="24" rx="5" fill={skin} />
        {/* Socks */}
        <rect x="69" y="164" width="14" height="32" rx="4" fill={socksColor} />
        <rect x="97" y="164" width="14" height="32" rx="4" fill={socksColor} />
        <rect x="69" y="168" width="14" height="4" fill={jerseyAccent} opacity="0.8" />
        <rect x="97" y="168" width="14" height="4" fill={jerseyAccent} opacity="0.8" />
        {/* Boots */}
        <rect x="65" y="194" width="21" height="12" rx="5" fill={boots} />
        <rect x="94" y="194" width="21" height="12" rx="5" fill={boots} />
        <rect x="67" y="203" width="17" height="3" rx="1.5" fill="#0f172a" />
        <rect x="96" y="203" width="17" height="3" rx="1.5" fill="#0f172a" />

        {/* Shorts */}
        <rect x="63" y="118" width="54" height="28" rx="6" fill={shortsColor} />
        <line x1="90" y1="126" x2="90" y2="146" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />

        {/* Arms */}
        <rect x="44" y="68" width="14" height="48" rx="7" fill={skin} />
        <rect x="122" y="68" width="14" height="48" rx="7" fill={skin} />
        {/* Sleeves */}
        <rect x="43" y="65" width="17" height="24" rx="6" fill={jerseyPrimary} />
        <rect x="120" y="65" width="17" height="24" rx="6" fill={jerseyPrimary} />

        {/* Torso / Jersey with clipPath for pattern */}
        <defs>
          <clipPath id="clubxi-jersey-clip">
            <rect x="58" y="64" width="64" height="58" rx="9" />
          </clipPath>
        </defs>
        <g clipPath="url(#clubxi-jersey-clip)">
          <rect x="58" y="64" width="64" height="58" fill={jerseyPrimary} />
          {pattern === 'stripe' && (
            <rect x="78" y="64" width="24" height="58" fill={jerseyAccent} opacity="0.28" />
          )}
          {pattern === 'hoops' && (
            <>
              <rect x="58" y="73" width="64" height="10" fill={jerseyAccent} opacity="0.3" />
              <rect x="58" y="92" width="64" height="10" fill={jerseyAccent} opacity="0.3" />
              <rect x="58" y="110" width="64" height="10" fill={jerseyAccent} opacity="0.3" />
            </>
          )}
          {pattern === 'sash' && (
            <polygon
              points="58,64 76,64 122,110 122,122 104,122 58,76"
              fill={jerseyAccent}
              opacity="0.34"
            />
          )}
        </g>

        {/* Collar */}
        <path d="M78 64 Q90 73 102 64" fill="none" stroke={jerseyAccent} strokeWidth="3" />

        {/* Front crest vs Back squad number */}
        {viewSide === 'front' ? (
          <g>
            <path
              d="M104 76 L112 79 V86 C112 90 108 93 108 93 C108 93 104 90 104 86 Z"
              fill={jerseyAccent}
            />
            <text
              x="74"
              y="88"
              fill={jerseyAccent}
              fontSize="11"
              fontWeight="800"
              fontFamily="sans-serif"
              opacity="0.9"
            >
              {draft.number}
            </text>
          </g>
        ) : (
          <g>
            <text
              x="90"
              y="79"
              textAnchor="middle"
              fill={jerseyAccent}
              fontSize="7.5"
              fontWeight="700"
              fontFamily="sans-serif"
              letterSpacing="0.8"
            >
              {draft.name.toUpperCase().slice(0, 14)}
            </text>
            <text
              x="90"
              y="107"
              textAnchor="middle"
              fill={jerseyAccent}
              fontSize="28"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              {draft.number}
            </text>
          </g>
        )}

        {/* Neck */}
        <rect x="83" y="54" width="14" height="12" rx="4" fill={skin} />

        {/* Long hair back layer */}
        {hairStyle === 'long' && (
          <rect x="69" y="28" width="42" height="34" rx="10" fill={hair} />
        )}

        {/* Head */}
        <circle cx="90" cy="39" r="19" fill={skin} />

        {/* Face features (Front view only) */}
        {viewSide === 'front' && (
          <g>
            {/* Brows */}
            <rect
              x="78"
              y="32"
              width="7"
              height={facePreset === 'sculpted' ? 2.6 : 1.8}
              rx="1"
              fill={hair}
            />
            <rect
              x="95"
              y="32"
              width="7"
              height={facePreset === 'sculpted' ? 2.6 : 1.8}
              rx="1"
              fill={hair}
            />
            {/* Eyes */}
            <circle cx="82" cy="38" r="2.2" fill="#141820" />
            <circle cx="98" cy="38" r="2.2" fill="#141820" />
            {/* Stubble / Beard */}
            {facePreset === 'athletic' && (
              <path
                d="M74 44 Q90 58 106 44 L104 51 Q90 60 76 51 Z"
                fill={hair}
                opacity="0.26"
              />
            )}
            {facePreset === 'beard' && (
              <path
                d="M73 42 Q90 54 107 42 L105 52 Q90 64 75 52 Z"
                fill={hair}
                opacity="0.88"
              />
            )}
            {/* Mouth */}
            <line
              x1="85"
              y1="47"
              x2="95"
              y2="47"
              stroke="rgba(70,28,24,0.6)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Hair crown per style */}
        {hairStyle === 'short' && (
          <path d="M71 34 C71 19 109 19 109 34 C101 27 79 27 71 34 Z" fill={hair} />
        )}
        {hairStyle === 'buzz' && (
          <path d="M72 34 C73 21 107 21 108 34 C100 30 80 30 72 34 Z" fill={hair} opacity="0.9" />
        )}
        {hairStyle === 'fade' && (
          <rect x="75" y="16" width="30" height="14" rx="5" fill={hair} />
        )}
        {hairStyle === 'curly' && (
          <g fill={hair}>
            <circle cx="77" cy="24" r="8" />
            <circle cx="90" cy="20" r="9" />
            <circle cx="103" cy="24" r="8" />
            <circle cx="83" cy="27" r="6" />
            <circle cx="97" cy="27" r="6" />
          </g>
        )}
        {hairStyle === 'mohawk' && (
          <rect x="85" y="11" width="10" height="20" rx="4" fill={hair} />
        )}
        {hairStyle === 'long' && (
          <path d="M70 35 C70 18 110 18 110 35 C101 27 79 27 70 35 Z" fill={hair} />
        )}
      </svg>

      {/* Player Nameplate & Status */}
      <div className="w-full text-center border-t border-white/10 pt-2.5">
        <div className="font-display font-bold text-xl text-white truncate">
          {draft.name || 'Unnamed Player'}
        </div>
        <div className="text-xs text-slate-400">
          {homeTeam.name} · {draft.enabled ? 'Active in Match' : 'Club Default Roster'}
        </div>
      </div>
    </div>
  );
}

export function PlayerStudioModal({
  profile,
  homeTeam,
  onSave,
  onClose,
}: PlayerStudioModalProps) {
  const [draft, setDraft] = useState<CustomPlayerProfile>(() =>
    sanitizeCustomPlayerProfile(profile),
  );
  const [tab, setTab] = useState<StudioTab>('identity');
  const [viewSide, setViewSide] = useState<'front' | 'back'>('front');
  const [refStatus, setRefStatus] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [isAnalyzingRef, setIsAnalyzingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patchDraft = (
    updater: (prev: CustomPlayerProfile) => CustomPlayerProfile,
    autoEnable = true,
  ) => {
    setDraft((prev) => {
      const next = updater(prev);
      return autoEnable ? { ...next, enabled: true } : next;
    });
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefError(null);
    setRefStatus(null);
    setIsAnalyzingRef(true);
    try {
      const dataUrl = await readReferenceImageFile(file);
      const extracted = await defaultReferenceAdapter.analyzeImage(dataUrl);
      patchDraft((prev) => ({
        ...prev,
        appearance: {
          ...prev.appearance,
          skinTone: extracted.skinTone,
          hairColor: extracted.hairColor,
          bootsColor: extracted.bootsColor,
          hairStyle: extracted.suggestedHairStyle,
          facePreset: extracted.suggestedFacePreset,
          referenceImageDataUrl: dataUrl,
        },
      }));
      setRefStatus(extracted.summary);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Unable to analyze reference image.');
    } finally {
      setIsAnalyzingRef(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearReference = () => {
    setRefStatus(null);
    setRefError(null);
    patchDraft(
      (prev) => ({
        ...prev,
        appearance: {
          ...prev.appearance,
          referenceImageDataUrl: null,
        },
      }),
      false,
    );
  };

  const handleReset = () => {
    setRefStatus(null);
    setRefError(null);
    setDraft({ ...getDefaultCustomPlayer(), enabled: draft.enabled });
  };

  const handleCommit = () => {
    onSave(sanitizeCustomPlayerProfile(draft));
    onClose();
  };

  const derived = mapRatingsToAttributes(draft.ratings);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#040912]/82 p-3 sm:p-4">
      <div
        role="dialog"
        aria-label="Custom Player Studio"
        className="w-full max-w-3xl rounded-lg bg-[#0d192a] border border-white/15 p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-2xl text-white uppercase tracking-wide">
              Custom Player Studio
            </h2>
            <p className="text-xs text-slate-400">
              Create an original athlete for your Home XI
            </p>
          </div>
          <button
            type="button"
            aria-label="Close player studio"
            onClick={onClose}
            className="w-9 h-9 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Studio Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-start">
          {/* Left Column: Live Stylized Preview + Active Toggle */}
          <div className="space-y-3">
            <StylizedAthletePreview
              draft={draft}
              homeTeam={homeTeam}
              viewSide={viewSide}
              onToggleSide={() => setViewSide((v) => (v === 'front' ? 'back' : 'front'))}
            />

            <button
              type="button"
              onClick={() =>
                patchDraft((prev) => ({ ...prev, enabled: !prev.enabled }), false)
              }
              className={`w-full h-10 px-3 rounded-md border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                draft.enabled
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-[#09121e] border-white/15 text-slate-300 hover:border-white/30'
              }`}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>{draft.enabled ? 'Active in Home XI' : 'Enable in Home XI'}</span>
            </button>
          </div>

          {/* Right Column: Tabbed Controls */}
          <div className="min-w-0">
            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Customization sections"
              className="grid grid-cols-3 gap-1.5 bg-[#08101c] p-1 rounded-md border border-white/10"
            >
              {(
                [
                  { id: 'identity', label: 'Identity & Ref' },
                  { id: 'appearance', label: 'Appearance' },
                  { id: 'stats', label: 'Attributes' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`h-9 px-1 rounded text-[11px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                    tab === t.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB 1: IDENTITY & REFERENCE IMAGE ADAPTER */}
            {tab === 'identity' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
                  <div>
                    <label
                      htmlFor="custom-player-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                    >
                      Player Name
                    </label>
                    <input
                      id="custom-player-name"
                      type="text"
                      maxLength={20}
                      value={draft.name}
                      onChange={(e) =>
                        patchDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g. A. Moreau"
                      className="w-full h-10 px-3 rounded-md bg-[#08101c] border border-white/15 text-sm text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-player-number"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                    >
                      Number (1–99)
                    </label>
                    <input
                      id="custom-player-number"
                      type="number"
                      min={1}
                      max={99}
                      value={draft.number}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        patchDraft((prev) => ({
                          ...prev,
                          number: Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1,
                        }));
                      }}
                      className="w-full h-10 px-3 rounded-md bg-[#08101c] border border-white/15 text-sm text-white tabular-nums focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>

                {/* Squad Position Slot */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Pitch Role Slot
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CUSTOM_SLOT_OPTIONS.map((slot) => (
                      <button
                        key={slot.slotIndex}
                        type="button"
                        onClick={() =>
                          patchDraft((prev) => ({ ...prev, slotIndex: slot.slotIndex }))
                        }
                        className={`h-9 px-2.5 rounded-md border text-xs font-semibold cursor-pointer ${
                          draft.slotIndex === slot.slotIndex
                            ? 'bg-[#172b47] border-emerald-400 text-white'
                            : 'bg-[#09121e] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference Image Import Architecture Card */}
                <div className="rounded-md bg-[#08101c] border border-white/15 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Reference Image Adapter</span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">
                      Local On-Device
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Import your own reference image to generate an original stylized tone
                    palette (skin, hair, boots). Real player or celebrity likenesses are
                    never copied.
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      ref={fileInputRef}
                      id="reference-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleReferenceUpload}
                      className="sr-only"
                    />
                    <label
                      htmlFor="reference-image-upload"
                      className="h-9 px-3.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isAnalyzingRef ? 'Analyzing...' : 'Import Reference Image'}</span>
                    </label>

                    {draft.appearance.referenceImageDataUrl && (
                      <>
                        <img
                          src={draft.appearance.referenceImageDataUrl}
                          alt="Uploaded reference thumbnail"
                          className="w-9 h-9 rounded object-cover border border-white/20"
                        />
                        <button
                          type="button"
                          onClick={handleClearReference}
                          aria-label="Clear reference image"
                          className="h-9 px-2.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear</span>
                        </button>
                      </>
                    )}
                  </div>

                  {refStatus && (
                    <div className="text-xs text-emerald-400 font-medium">{refStatus}</div>
                  )}
                  {refError && (
                    <div className="text-xs text-rose-400 font-medium">{refError}</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: APPEARANCE (FACE, HAIR, JERSEY, BOOTS) */}
            {tab === 'appearance' && (
              <div className="mt-4 space-y-4">
                {/* Skin Tone & Face Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Skin Tone
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SKIN_TONE_SWATCHES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          aria-label={`Skin tone ${s.label}`}
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              appearance: { ...prev.appearance, skinTone: s.hex },
                            }))
                          }
                          className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                            draft.appearance.skinTone === s.hex
                              ? 'border-emerald-400 scale-110'
                              : 'border-white/25'
                          }`}
                          style={{ backgroundColor: s.hex }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Face Style
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FACE_PRESET_OPTIONS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              appearance: { ...prev.appearance, facePreset: f.id },
                            }))
                          }
                          className={`h-8 rounded border text-xs font-semibold cursor-pointer ${
                            (draft.appearance.facePreset ?? 'classic') === f.id
                              ? 'bg-sky-500 text-slate-950 border-sky-400'
                              : 'bg-[#09121e] text-slate-200 border-white/15'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Hairstyle & Hair Color */}
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Hairstyle
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {HAIR_STYLE_OPTIONS.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              appearance: { ...prev.appearance, hairStyle: h.id },
                            }))
                          }
                          className={`h-8 rounded border text-xs font-semibold cursor-pointer ${
                            draft.appearance.hairStyle === h.id
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-[#09121e] text-slate-200 border-white/15'
                          }`}
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Hair Color
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {HAIR_COLOR_SWATCHES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={`Hair color ${c.label}`}
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              appearance: { ...prev.appearance, hairColor: c.hex },
                            }))
                          }
                          className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                            draft.appearance.hairColor === c.hex
                              ? 'border-emerald-400 scale-110'
                              : 'border-white/25'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Jersey Pattern, Custom Kit Color & Boots */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-white/10">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Jersey Pattern
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {JERSEY_PATTERN_OPTIONS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              appearance: { ...prev.appearance, jerseyPattern: p.id },
                            }))
                          }
                          className={`h-8 rounded border text-xs font-semibold cursor-pointer ${
                            (draft.appearance.jerseyPattern ?? 'stripe') === p.id
                              ? 'bg-sky-500 text-slate-950 border-sky-400'
                              : 'bg-[#09121e] text-slate-200 border-white/15'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Jersey Color
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {JERSEY_COLOR_SWATCHES.map((j) => {
                        const isSelected =
                          (draft.appearance.jerseyColorOverride ?? null) === j.hex;
                        return (
                          <button
                            key={j.id}
                            type="button"
                            aria-label={`Jersey color ${j.label}`}
                            onClick={() =>
                              patchDraft((prev) => ({
                                ...prev,
                                appearance: {
                                  ...prev.appearance,
                                  jerseyColorOverride: j.hex,
                                },
                              }))
                            }
                            className={`${
                              j.hex === null ? 'h-7 px-2.5 rounded-full' : 'w-7 h-7 rounded-full'
                            } border-2 text-[10px] font-bold uppercase cursor-pointer transition-transform ${
                              isSelected
                                ? 'border-emerald-400 scale-110'
                                : 'border-white/25'
                            }`}
                            style={{
                              backgroundColor: j.hex ?? homeTeam.kit.primary,
                              color: '#ffffff',
                            }}
                          >
                            {j.hex === null ? 'Club' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Boots Color
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BOOTS_COLOR_SWATCHES.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        aria-label={`Boots color ${b.label}`}
                        onClick={() =>
                          patchDraft((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, bootsColor: b.hex },
                          }))
                        }
                        className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                          draft.appearance.bootsColor === b.hex
                            ? 'border-emerald-400 scale-110'
                            : 'border-white/25'
                        }`}
                        style={{ backgroundColor: b.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: ATTRIBUTES & RATINGS */}
            {tab === 'stats' && (
              <div className="mt-4 space-y-3.5">
                {(
                  [
                    { key: 'pace', label: 'Pace & Acceleration', min: 60, max: 96 },
                    { key: 'shooting', label: 'Shooting Power', min: 60, max: 96 },
                    { key: 'passing', label: 'Passing Accuracy', min: 60, max: 96 },
                    { key: 'dribbling', label: 'Ball Control & Dribbling', min: 60, max: 96 },
                    { key: 'stamina', label: 'Stamina & Endurance', min: 65, max: 99 },
                  ] as const
                ).map((stat) => {
                  const val = draft.ratings[stat.key];
                  return (
                    <div key={stat.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <label
                          htmlFor={`stat-${stat.key}`}
                          className="font-semibold text-slate-200 uppercase tracking-wider"
                        >
                          {stat.label}
                        </label>
                        <span className="font-display font-bold text-base text-emerald-400 tabular-nums">
                          {val}
                        </span>
                      </div>
                      <input
                        id={`stat-${stat.key}`}
                        type="range"
                        min={stat.min}
                        max={stat.max}
                        value={val}
                        onChange={(e) => {
                          const nextVal = parseInt(e.target.value, 10);
                          patchDraft((prev) => ({
                            ...prev,
                            ratings: { ...prev.ratings, [stat.key]: nextVal },
                          }));
                        }}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  );
                })}

                {/* Derived Engine Metrics */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                  <div className="rounded bg-[#08101c] border border-white/10 py-2 px-2">
                    <div className="text-[10px] uppercase text-slate-400">Top Speed</div>
                    <div className="font-display font-bold text-base text-white tabular-nums">
                      {derived.speed} m/s
                    </div>
                  </div>
                  <div className="rounded bg-[#08101c] border border-white/10 py-2 px-2">
                    <div className="text-[10px] uppercase text-slate-400">Shot Impulse</div>
                    <div className="font-display font-bold text-base text-white tabular-nums">
                      {derived.shotPower} m/s
                    </div>
                  </div>
                  <div className="rounded bg-[#08101c] border border-white/10 py-2 px-2">
                    <div className="text-[10px] uppercase text-slate-400">Accel</div>
                    <div className="font-display font-bold text-base text-white tabular-nums">
                      {derived.acceleration} m/s²
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="h-10 px-3.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-md bg-[#162740] hover:bg-[#1f3557] text-slate-200 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommit}
              className="h-10 px-5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-base uppercase tracking-wider cursor-pointer"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

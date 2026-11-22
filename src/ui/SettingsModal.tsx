import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Gamepad2, Play, X } from 'lucide-react';
import {
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CAMERA_TYPE_OPTIONS,
  CONTROL_MODE_OPTIONS,
  cycleValue,
  MATCH_LEVEL_OPTIONS,
  MATCH_TIME_OPTIONS,
  QUALITY_OPTIONS,
  RIVAL_COLOR_PALETTE,
  SelectOption,
  USER_COLOR_PALETTE,
  VIEW_MODE_OPTIONS,
  WEATHER_OPTIONS,
} from '../core/settingsConfig';
import { CameraMode, GameSettings } from '../core/types';

type SettingsTab = 'gameplay' | 'graphics' | 'controls';

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (nextSettings: GameSettings) => void;
  onCancel: () => void;
}

const BAR_CLASS =
  'relative flex items-center justify-between gap-2 px-2.5 sm:px-3.5 h-[36px] sm:h-[40px] lg:h-[46px] [@media(max-height:460px)]:h-[34px] rounded-[10px] ' +
  'bg-gradient-to-b from-[#d8dce0] via-[#c7ccd2] to-[#aeb5bd] ' +
  'border border-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_2px_6px_rgba(0,0,0,0.45)] ' +
  'text-[#22272e] select-none';

interface CycleRowProps<T> {
  label: string;
  options: SelectOption<T>[];
  value: T;
  indicatorStyle: 'dash' | 'dot';
  compact?: boolean;
  testId?: string;
  onChange: (next: T) => void;
}

function CycleRow<T>({
  label,
  options,
  value,
  indicatorStyle,
  compact = false,
  testId,
  onChange,
}: CycleRowProps<T>) {
  const values = options.map((o) => o.value);
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const activeOption = options[activeIdx] ?? options[0];

  return (
    <div
      data-testid={testId}
      className={`${BAR_CLASS} ${compact ? '!px-2 sm:!px-2.5 !gap-1' : ''}`}
    >
      <span
        className={`font-semibold tracking-tight text-[#252a32] whitespace-nowrap ${
          compact ? 'text-[11px] sm:text-xs lg:text-[13px]' : 'text-xs sm:text-[13px] lg:text-[15px]'
        }`}
      >
        {label}
      </span>

      <div className={`flex items-center min-w-0 ${compact ? 'gap-0.5' : 'gap-1 sm:gap-2'}`}>
        <button
          type="button"
          aria-label={`Previous ${label}`}
          onClick={() => onChange(cycleValue(values, value, -1))}
          className={`${
            compact ? 'w-5 h-6' : 'w-6 h-6 sm:w-7 sm:h-7'
          } flex items-center justify-center rounded hover:bg-black/10 active:scale-95 text-[#5b626c] hover:text-[#181c22] transition-colors cursor-pointer shrink-0`}
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
        </button>

        <div
          className={`flex flex-col items-center justify-center leading-none ${
            compact ? 'min-w-[30px] sm:min-w-[36px]' : 'min-w-[84px] sm:min-w-[106px] lg:min-w-[126px]'
          }`}
        >
          <span
            data-testid={testId ? `${testId}-value` : undefined}
            className={`italic font-semibold text-[#1f242b] whitespace-nowrap ${
              compact ? 'text-xs sm:text-sm' : 'text-xs sm:text-[13px] lg:text-[15px]'
            }`}
          >
            {activeOption.label}
          </span>

          <div className="flex items-center justify-center gap-1 mt-1">
            {options.map((opt, idx) => {
              const active = idx === activeIdx;
              if (indicatorStyle === 'dot') {
                return (
                  <span
                    key={String(opt.value)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      active ? 'bg-white shadow-[0_0_2px_rgba(0,0,0,0.45)]' : 'bg-[#646b75]'
                    }`}
                  />
                );
              }
              return (
                <span
                  key={String(opt.value)}
                  className={`h-[3px] rounded-full transition-colors ${
                    compact ? 'w-2.5' : 'w-3 sm:w-3.5'
                  } ${active ? 'bg-white shadow-[0_0_2px_rgba(0,0,0,0.45)]' : 'bg-[#646b75]'}`}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label={`Next ${label}`}
          onClick={() => onChange(cycleValue(values, value, 1))}
          className={`${
            compact ? 'w-5 h-6' : 'w-6 h-6 sm:w-7 sm:h-7'
          } flex items-center justify-center rounded hover:bg-black/10 active:scale-95 text-[#5b626c] hover:text-[#181c22] transition-colors cursor-pointer shrink-0`}
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
        </button>
      </div>
    </div>
  );
}

interface ColorRowProps {
  label: string;
  palette: string[];
  value: string;
  testId?: string;
  onChange: (next: string) => void;
}

function ColorRow({ label, palette, value, testId, onChange }: ColorRowProps) {
  const activeIdx = Math.max(0, palette.indexOf(value));

  return (
    <div data-testid={testId} className={BAR_CLASS}>
      <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px] whitespace-nowrap">
        {label}
      </span>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          aria-label={`Previous ${label}`}
          onClick={() => onChange(cycleValue(palette, value, -1))}
          className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded hover:bg-black/10 active:scale-95 text-[#5b626c] hover:text-[#181c22] transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
        </button>

        <div className="flex flex-col items-center justify-center min-w-[92px] sm:min-w-[110px] lg:min-w-[126px]">
          {/* Colored downward player indicator triangle matching reference */}
          <svg
            width="16"
            height="13"
            viewBox="0 0 18 15"
            aria-label={`${label}: ${value}`}
            className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
          >
            <polygon
              points="2,2 16,2 9,13"
              fill={value}
              stroke="#1f242b"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>

          <div className="flex items-center justify-center gap-1 mt-1">
            {palette.map((hex, idx) => {
              const active = idx === activeIdx;
              return (
                <span
                  key={hex}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    active ? 'bg-white shadow-[0_0_2px_rgba(0,0,0,0.45)]' : 'bg-[#646b75]'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label={`Next ${label}`}
          onClick={() => onChange(cycleValue(palette, value, 1))}
          className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded hover:bg-black/10 active:scale-95 text-[#5b626c] hover:text-[#181c22] transition-colors cursor-pointer shrink-0"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
        </button>
      </div>
    </div>
  );
}

interface SliderControlProps {
  ariaLabel: string;
  min: number;
  max: number;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}

function SliderControl({
  ariaLabel,
  min,
  max,
  value,
  disabled = false,
  onChange,
}: SliderControlProps) {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

  return (
    <div
      className={`relative flex-1 h-5 flex items-center ${disabled ? 'opacity-45' : 'opacity-100'}`}
    >
      {/* Recessed metallic groove */}
      <div className="w-full h-2.5 sm:h-3 rounded-[3px] bg-[#787f89] border border-[#565c66]/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-b from-[#ffffff] to-[#e4e8ee]"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Crisp circular white thumb */}
      <div
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-b from-white to-[#dfe4ea] border border-[#6c737d] shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
        style={{ left: `${pct}%` }}
      />

      {/* Native accessible range input layered seamlessly on top */}
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
}

interface CheckboxSquareProps {
  checked: boolean;
  ariaLabel: string;
  testId?: string;
  onToggle: () => void;
}

function CheckboxSquare({ checked, ariaLabel, testId, onToggle }: CheckboxSquareProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={onToggle}
      className="w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-[4px] bg-gradient-to-b from-white to-[#e6eaef] border border-[#7c838e] shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center shrink-0 cursor-pointer hover:brightness-105 active:scale-95"
    >
      {checked && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#232830] stroke-[3]" />}
    </button>
  );
}

export function SettingsModal({ settings, onSave, onCancel }: SettingsModalProps) {
  const [draft, setDraft] = useState<GameSettings>(() => ({ ...settings }));
  const [activeTab, setActiveTab] = useState<SettingsTab>('gameplay');

  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const patchDraft = (patch: Partial<GameSettings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const effectiveCameraMode: Exclude<CameraMode, 'replay'> =
    draft.cameraMode === 'replay' ? 'tv' : draft.cameraMode;

  return (
    <div
      data-testid="settings-modal-backdrop"
      className="fixed inset-0 z-40 flex flex-col justify-between bg-[#070b10]/55 backdrop-blur-[2px]"
    >
      {/* Centered Framed Charcoal Settings Window */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2.5 sm:px-6 lg:px-10 py-2 sm:py-4 [@media(max-height:460px)]:py-1.5">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          data-testid="settings-modal"
          className="w-full max-w-[920px] max-h-full flex flex-col rounded-xl bg-[#1d2025]/92 border border-white/25 shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden"
        >
          {/* Tab Header Strip inside Window */}
          {activeTab === 'gameplay' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 px-3.5 sm:px-6 pt-2 sm:pt-3 pb-1.5 [@media(max-height:460px)]:pt-1.5 [@media(max-height:460px)]:pb-1 bg-[#262a31]/92 shrink-0">
              <div className="border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Gameplay
                </h2>
              </div>
              <div className="hidden sm:block border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Sound &amp; View
                </h2>
              </div>
            </div>
          )}

          {activeTab === 'graphics' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 px-3.5 sm:px-6 pt-2 sm:pt-3 pb-1.5 [@media(max-height:460px)]:pt-1.5 [@media(max-height:460px)]:pb-1 bg-[#262a31]/92 shrink-0">
              <div className="border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Graphics &amp; Performance
                </h2>
              </div>
              <div className="hidden sm:block border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Atmosphere &amp; View
                </h2>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 px-3.5 sm:px-6 pt-2 sm:pt-3 pb-1.5 [@media(max-height:460px)]:pt-1.5 [@media(max-height:460px)]:pb-1 bg-[#262a31]/92 shrink-0">
              <div className="border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Controls Setup
                </h2>
              </div>
              <div className="hidden sm:block border-b border-[#b9871f]/80 pb-1 [@media(max-height:460px)]:pb-0.5 text-center">
                <h2 className="italic font-semibold text-sm sm:text-base lg:text-lg [@media(max-height:460px)]:text-sm text-[#f5b726] tracking-wide">
                  Key &amp; Touch Mapping
                </h2>
              </div>
            </div>
          )}

          {/* Main Scroll-Safe Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-2.5 sm:py-3.5 lg:py-4 [@media(max-height:460px)]:py-2">
            {activeTab === 'gameplay' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 gap-y-2 sm:gap-y-2.5 lg:gap-y-3 [@media(max-height:460px)]:gap-y-1.5">
                {/* LEFT COLUMN: Gameplay */}
                <div className="flex flex-col gap-2 sm:gap-2.5 lg:gap-3 [@media(max-height:460px)]:gap-1.5">
                  <CycleRow
                    label="Match Level"
                    options={MATCH_LEVEL_OPTIONS}
                    value={draft.matchLevel}
                    indicatorStyle="dash"
                    testId="setting-match-level"
                    onChange={(matchLevel) => patchDraft({ matchLevel })}
                  />

                  <CycleRow
                    label="Match Time"
                    options={MATCH_TIME_OPTIONS}
                    value={draft.halfDurationSeconds}
                    indicatorStyle="dot"
                    testId="setting-match-time"
                    onChange={(halfDurationSeconds) => patchDraft({ halfDurationSeconds })}
                  />

                  <CycleRow
                    label="Control Mode"
                    options={CONTROL_MODE_OPTIONS}
                    value={draft.controlMode}
                    indicatorStyle="dash"
                    testId="setting-control-mode"
                    onChange={(controlMode) => patchDraft({ controlMode })}
                  />

                  <CycleRow
                    label="Weather"
                    options={WEATHER_OPTIONS}
                    value={draft.weather}
                    indicatorStyle="dash"
                    testId="setting-weather"
                    onChange={(weather) => patchDraft({ weather })}
                  />

                  <CycleRow
                    label="Camera Type"
                    options={CAMERA_TYPE_OPTIONS}
                    value={effectiveCameraMode}
                    indicatorStyle="dash"
                    testId="setting-camera-type"
                    onChange={(cameraMode) => patchDraft({ cameraMode })}
                  />

                  {/* Camera Height Slider Row */}
                  <div data-testid="setting-camera-height" className={BAR_CLASS}>
                    <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px] whitespace-nowrap">
                      Camera Height
                    </span>
                    <div className="flex items-center gap-3.5 flex-1 max-w-[62%]">
                      <SliderControl
                        ariaLabel="Camera Height"
                        min={CAMERA_HEIGHT_MIN}
                        max={CAMERA_HEIGHT_MAX}
                        value={draft.cameraHeight}
                        onChange={(cameraHeight) => patchDraft({ cameraHeight })}
                      />
                      <span
                        data-testid="setting-camera-height-value"
                        className="italic font-semibold text-xs sm:text-[13px] text-[#22272e] tabular-nums w-9 text-right shrink-0"
                      >
                        {draft.cameraHeight} m
                      </span>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Sound & View */}
                <div className="flex flex-col gap-2 sm:gap-2.5 lg:gap-3 [@media(max-height:460px)]:gap-1.5">
                  <div className="sm:hidden border-b border-[#b9871f]/80 pb-1 mt-1 text-center">
                    <span className="italic font-semibold text-sm text-[#f5b726] tracking-wide">
                      Sound &amp; View
                    </span>
                  </div>

                  {/* Sound Checkbox + Slider */}
                  <div data-testid="setting-sound" className={BAR_CLASS}>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px]">
                        Sound
                      </span>
                      <CheckboxSquare
                        checked={draft.soundEnabled}
                        ariaLabel="Enable Sound"
                        testId="setting-sound-toggle"
                        onToggle={() => patchDraft({ soundEnabled: !draft.soundEnabled })}
                      />
                    </div>
                    <div className="flex items-center gap-3.5 flex-1 max-w-[64%]">
                      <SliderControl
                        ariaLabel="Sound Volume"
                        min={0}
                        max={100}
                        value={draft.soundVolume}
                        disabled={!draft.soundEnabled}
                        onChange={(soundVolume) =>
                          patchDraft({ soundVolume, soundEnabled: soundVolume > 0 ? true : draft.soundEnabled })
                        }
                      />
                      <span
                        data-testid="setting-sound-value"
                        className="italic font-semibold text-xs sm:text-[13px] text-[#22272e] tabular-nums w-11 text-right shrink-0"
                      >
                        {draft.soundVolume} %
                      </span>
                    </div>
                  </div>

                  {/* Effect Sound Checkbox + Slider */}
                  <div data-testid="setting-effects" className={BAR_CLASS}>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px] whitespace-nowrap">
                        Effect Sound
                      </span>
                      <CheckboxSquare
                        checked={draft.effectsEnabled}
                        ariaLabel="Enable Effect Sound"
                        testId="setting-effects-toggle"
                        onToggle={() => patchDraft({ effectsEnabled: !draft.effectsEnabled })}
                      />
                    </div>
                    <div className="flex items-center gap-3.5 flex-1 max-w-[54%]">
                      <SliderControl
                        ariaLabel="Effect Sound Volume"
                        min={0}
                        max={100}
                        value={draft.effectsVolume}
                        disabled={!draft.effectsEnabled}
                        onChange={(effectsVolume) =>
                          patchDraft({
                            effectsVolume,
                            effectsEnabled: effectsVolume > 0 ? true : draft.effectsEnabled,
                          })
                        }
                      />
                      <span
                        data-testid="setting-effects-value"
                        className="italic font-semibold text-xs sm:text-[13px] text-[#22272e] tabular-nums w-11 text-right shrink-0"
                      >
                        {draft.effectsVolume} %
                      </span>
                    </div>
                  </div>

                  {/* User Color */}
                  <ColorRow
                    label="User Color"
                    palette={USER_COLOR_PALETTE}
                    value={draft.userIndicatorColor}
                    testId="setting-user-color"
                    onChange={(userIndicatorColor) => patchDraft({ userIndicatorColor })}
                  />

                  {/* Rival Color */}
                  <ColorRow
                    label="Rival Color"
                    palette={RIVAL_COLOR_PALETTE}
                    value={draft.rivalIndicatorColor}
                    testId="setting-rival-color"
                    onChange={(rivalIndicatorColor) => patchDraft({ rivalIndicatorColor })}
                  />

                  {/* Split Row: Show Radar + Show Player Name */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={BAR_CLASS}>
                      <span className="font-semibold tracking-tight text-[#252a32] text-[11px] sm:text-xs lg:text-sm whitespace-nowrap">
                        Show Radar
                      </span>
                      <CheckboxSquare
                        checked={draft.showRadar}
                        ariaLabel="Show Radar"
                        testId="setting-show-radar"
                        onToggle={() => patchDraft({ showRadar: !draft.showRadar })}
                      />
                    </div>

                    <div className={BAR_CLASS}>
                      <span className="font-semibold tracking-tight text-[#252a32] text-[11px] sm:text-xs lg:text-sm whitespace-nowrap truncate">
                        Show Player Name
                      </span>
                      <CheckboxSquare
                        checked={draft.showPlayerName}
                        ariaLabel="Show Player Name"
                        testId="setting-show-player-name"
                        onToggle={() => patchDraft({ showPlayerName: !draft.showPlayerName })}
                      />
                    </div>
                  </div>

                  {/* Split Row: Show Circle + View Mode */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={BAR_CLASS}>
                      <span className="font-semibold tracking-tight text-[#252a32] text-[11px] sm:text-xs lg:text-sm whitespace-nowrap">
                        Show Circle
                      </span>
                      <CheckboxSquare
                        checked={draft.showCircle}
                        ariaLabel="Show Circle"
                        testId="setting-show-circle"
                        onToggle={() => patchDraft({ showCircle: !draft.showCircle })}
                      />
                    </div>

                    <CycleRow
                      label="View Mode"
                      options={VIEW_MODE_OPTIONS}
                      value={draft.viewMode}
                      indicatorStyle="dash"
                      compact
                      testId="setting-view-mode"
                      onChange={(viewMode) => patchDraft({ viewMode })}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'graphics' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 gap-y-2.5 sm:gap-y-3">
                <div className="flex flex-col gap-2.5">
                  <CycleRow
                    label="Quality"
                    options={QUALITY_OPTIONS}
                    value={draft.quality}
                    indicatorStyle="dash"
                    testId="setting-quality"
                    onChange={(quality) => patchDraft({ quality })}
                  />
                  <CycleRow
                    label="View Mode"
                    options={VIEW_MODE_OPTIONS}
                    value={draft.viewMode}
                    indicatorStyle="dash"
                    onChange={(viewMode) => patchDraft({ viewMode })}
                  />
                  <div className="rounded-[10px] bg-black/35 border border-white/10 px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed">
                    <div className="font-semibold text-[#f5b726] uppercase tracking-wider text-[11px] mb-1">
                      Render Preset · {draft.quality.toUpperCase()}
                    </div>
                    {draft.quality === 'high'
                      ? 'Full retina DPR (up to 2x), dynamic stadium shadows across all players, and full crowd density.'
                      : draft.quality === 'medium'
                        ? 'Balanced 1.5x DPR with action-focused dynamic shadows and optimized mobile stadium crowd.'
                        : 'Battery-saver 1x DPR with lightweight blob shadows for smooth 60 FPS on compact devices.'}
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <CycleRow
                    label="Weather"
                    options={WEATHER_OPTIONS}
                    value={draft.weather}
                    indicatorStyle="dash"
                    onChange={(weather) => patchDraft({ weather })}
                  />
                  <CycleRow
                    label="Camera Type"
                    options={CAMERA_TYPE_OPTIONS}
                    value={effectiveCameraMode}
                    indicatorStyle="dash"
                    onChange={(cameraMode) => patchDraft({ cameraMode })}
                  />
                  <div className={BAR_CLASS}>
                    <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px] whitespace-nowrap">
                      Camera Height
                    </span>
                    <div className="flex items-center gap-2.5 flex-1 max-w-[62%]">
                      <SliderControl
                        ariaLabel="Graphics Camera Height"
                        min={CAMERA_HEIGHT_MIN}
                        max={CAMERA_HEIGHT_MAX}
                        value={draft.cameraHeight}
                        onChange={(cameraHeight) => patchDraft({ cameraHeight })}
                      />
                      <span className="italic font-semibold text-xs sm:text-[13px] text-[#22272e] tabular-nums w-9 text-right shrink-0">
                        {draft.cameraHeight} m
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'controls' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 lg:gap-x-8 gap-y-2.5 sm:gap-y-3">
                <div className="flex flex-col gap-2.5">
                  <CycleRow
                    label="Control Mode"
                    options={CONTROL_MODE_OPTIONS}
                    value={draft.controlMode}
                    indicatorStyle="dash"
                    onChange={(controlMode) => patchDraft({ controlMode })}
                  />
                  <div className={BAR_CLASS}>
                    <span className="font-semibold tracking-tight text-[#252a32] text-xs sm:text-[13px] lg:text-[15px]">
                      Touch Controls
                    </span>
                    <CheckboxSquare
                      checked={draft.showTouchControls}
                      ariaLabel="Show On-Screen Touch Controls"
                      testId="setting-touch-controls"
                      onToggle={() => patchDraft({ showTouchControls: !draft.showTouchControls })}
                    />
                  </div>
                  <div className="rounded-[10px] bg-black/35 border border-white/10 px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed">
                    <div className="font-semibold text-[#f5b726] uppercase tracking-wider text-[11px] mb-1">
                      Switching · {CONTROL_MODE_OPTIONS.find((o) => o.value === draft.controlMode)?.label}
                    </div>
                    {draft.controlMode === 'manual'
                      ? 'Full manual defender switching via Q / SELECT button.'
                      : draft.controlMode === 'assisted'
                        ? 'Automatically switches to the nearest defender when defending far from the ball.'
                        : 'Switches automatically only on long transitions while preserving manual control.'}
                  </div>
                </div>

                <div className="rounded-[10px] bg-black/40 border border-white/15 p-3 sm:p-3.5 text-xs text-slate-200 space-y-2">
                  <div className="font-semibold text-[#f5b726] uppercase tracking-wider text-[11px]">
                    Keyboard &amp; Mobile Pad
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:text-xs">
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Move</span>
                      <span className="font-semibold text-white">WASD / Joystick</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Sprint / Press</span>
                      <span className="font-semibold text-white">Shift / SPRINT</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Pass / Tackle</span>
                      <span className="font-semibold text-white">K / PASS</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Shoot / Slide</span>
                      <span className="font-semibold text-white">Space / SHOOT</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Through / Lob</span>
                      <span className="font-semibold text-white">L / THROUGH</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">Switch / Camera</span>
                      <span className="font-semibold text-white">Q / C</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Action Bar matching reference screenshot */}
      <div className="w-full h-11 sm:h-13 [@media(max-height:460px)]:h-10 bg-[#15181d]/96 border-t border-white/15 px-2 sm:px-6 flex items-center justify-between gap-2 shrink-0">
        {/* Left Navigation Tabs */}
        <div className="flex items-stretch h-full">
          <button
            type="button"
            data-testid="settings-tab-gameplay"
            onClick={() => setActiveTab('gameplay')}
            className={`relative px-4 sm:px-8 h-full font-semibold text-xs sm:text-sm lg:text-base tracking-wide transition-colors cursor-pointer ${
              activeTab === 'gameplay'
                ? 'bg-gradient-to-b from-[#3d2817]/90 to-[#2b1b0f]/95 text-[#f5b726] border-b-2 border-sky-400'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Gameplay
          </button>

          <button
            type="button"
            data-testid="settings-tab-graphics"
            onClick={() => setActiveTab('graphics')}
            className={`relative px-4 sm:px-8 h-full font-semibold text-xs sm:text-sm lg:text-base tracking-wide transition-colors cursor-pointer ${
              activeTab === 'graphics'
                ? 'bg-gradient-to-b from-[#3d2817]/90 to-[#2b1b0f]/95 text-[#f5b726] border-b-2 border-sky-400'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Graphics
          </button>
        </div>

        {/* Right Controls / Cancel / OK */}
        <div className="flex items-center gap-2 sm:gap-5 lg:gap-7">
          <button
            type="button"
            data-testid="settings-tab-controls"
            onClick={() => setActiveTab((prev) => (prev === 'controls' ? 'gameplay' : 'controls'))}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md font-semibold text-xs sm:text-sm tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === 'controls'
                ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/50'
                : 'text-slate-100 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 shrink-0" />
            <span className="hidden xs:inline sm:inline">CONTROLS</span>
          </button>

          <button
            type="button"
            data-testid="settings-cancel-btn"
            onClick={onCancel}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md text-slate-100 hover:text-white hover:bg-white/5 font-semibold text-xs sm:text-sm tracking-wider uppercase transition-colors cursor-pointer"
          >
            <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#8f2d1e] border border-white/75 flex items-center justify-center shadow-md shrink-0">
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2.8]" />
            </span>
            <span>CANCEL</span>
          </button>

          <button
            type="button"
            data-testid="settings-ok-btn"
            onClick={() => onSave(draft)}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md text-slate-100 hover:text-white hover:bg-white/5 font-semibold text-xs sm:text-sm tracking-wider uppercase transition-colors cursor-pointer"
          >
            <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#24598c] border border-white/75 flex items-center justify-center shadow-md shrink-0">
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white fill-white ml-0.5" />
            </span>
            <span>OK</span>
          </button>
        </div>
      </div>
    </div>
  );
}

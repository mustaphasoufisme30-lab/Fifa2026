import { FacePresetId, HairStyleId } from '../core/types';
import {
  BOOTS_COLOR_SWATCHES,
  HAIR_COLOR_SWATCHES,
  SKIN_TONE_SWATCHES,
} from './customPlayer';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ReferenceExtractionResult {
  adapterId: string;
  skinTone: string;
  hairColor: string;
  bootsColor: string;
  suggestedHairStyle: HairStyleId;
  suggestedFacePreset: FacePresetId;
  summary: string;
}

/**
 * Extensible plugin contract for future user-provided reference image generators.
 * Any adapter must generate an ORIGINAL stylized character without copying real-world identities.
 */
export interface ReferenceAvatarAdapter {
  readonly id: string;
  readonly label: string;
  analyzeImage(dataUrl: string): Promise<ReferenceExtractionResult>;
}

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean
        .split('')
        .map((c) => c + c)
        .join('')
    : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function colorDistanceSq(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

export function findNearestSwatch(rgb: RgbColor, swatches: Array<{ hex: string }>): string {
  let best = swatches[0].hex;
  let bestDist = Infinity;
  for (const s of swatches) {
    const d = colorDistanceSq(rgb, hexToRgb(s.hex));
    if (d < bestDist) {
      bestDist = d;
      best = s.hex;
    }
  }
  return best;
}

/**
 * Pure RGBA pixel-buffer palette analyzer for stylized original character generation.
 * Samples upper region (hair tone), center region (warm skin tone), and accent chroma (boots).
 */
export function extractPaletteFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ReferenceExtractionResult {
  let topR = 0;
  let topG = 0;
  let topB = 0;
  let topCount = 0;

  let midR = 0;
  let midG = 0;
  let midB = 0;
  let midCount = 0;

  let accentBest: RgbColor = { r: 56, g: 189, b: 248 };
  let bestChroma = -1;

  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height);
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width);
      const idx = (y * width + x) * 4;
      const a = rgba[idx + 3];
      if (a < 128) continue;

      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      // Upper-center crown region -> hair color inspiration
      if (ny >= 0.08 && ny <= 0.32 && nx >= 0.28 && nx <= 0.72) {
        topR += r;
        topG += g;
        topB += b;
        topCount++;
      }

      // Center region -> skin tone inspiration
      if (ny >= 0.34 && ny <= 0.68 && nx >= 0.3 && nx <= 0.7) {
        midR += r;
        midG += g;
        midB += b;
        midCount++;
      }

      // Most vibrant pixel anywhere -> boots accent inspiration
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      if (chroma > bestChroma) {
        bestChroma = chroma;
        accentBest = { r, g, b };
      }
    }
  }

  const hairRgb: RgbColor =
    topCount > 0
      ? { r: topR / topCount, g: topG / topCount, b: topB / topCount }
      : { r: 30, g: 24, b: 20 };

  const skinRgb: RgbColor =
    midCount > 0
      ? { r: midR / midCount, g: midG / midCount, b: midB / midCount }
      : { r: 217, g: 158, b: 120 };

  const skinTone = findNearestSwatch(skinRgb, SKIN_TONE_SWATCHES);
  const hairColor = findNearestSwatch(hairRgb, HAIR_COLOR_SWATCHES);
  const bootsColor = findNearestSwatch(accentBest, BOOTS_COLOR_SWATCHES);

  const lumaTop = (hairRgb.r * 0.3 + hairRgb.g * 0.59 + hairRgb.b * 0.11) / 255;
  const suggestedHairStyle: HairStyleId =
    lumaTop < 0.25 ? 'fade' : lumaTop < 0.55 ? 'short' : 'curly';
  const suggestedFacePreset: FacePresetId = lumaTop < 0.32 ? 'athletic' : 'classic';

  return {
    adapterId: 'local-canvas-palette-v1',
    skinTone,
    hairColor,
    bootsColor,
    suggestedHairStyle,
    suggestedFacePreset,
    summary: 'Stylized original palette extracted locally from reference image.',
  };
}

/**
 * Default browser-local adapter using an offscreen 48x48 Canvas.
 * Keeps all reference image processing private on-device and generates original stylized tones only.
 */
export class LocalCanvasReferenceAdapter implements ReferenceAvatarAdapter {
  public readonly id = 'local-canvas-palette-v1';
  public readonly label = 'Local Stylized Palette Adapter';

  public async analyzeImage(dataUrl: string): Promise<ReferenceExtractionResult> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 48;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size);
          resolve(extractPaletteFromRgba(imageData.data, size, size));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode reference image'));
      img.src = dataUrl;
    });
  }
}

export const defaultReferenceAdapter: ReferenceAvatarAdapter = new LocalCanvasReferenceAdapter();

/**
 * Resizes an uploaded File into a compact JPEG data URL (max 160px) suitable for localStorage persistence.
 */
export async function readReferenceImageFile(file: File): Promise<string> {
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('Image is too large (max 8 MB).');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

  // Downscale thumbnail for fast storage & low mobile RAM footprint
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 160;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

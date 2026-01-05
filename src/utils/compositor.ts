import type { AssetUrls, ColorOption } from '../types/configurator';

export interface FetchLog {
  url: string;
  stage: string;
  status?: number;
  ok: boolean;
  contentType?: string | null;
  error?: string;
  fromCache?: boolean;
}

export interface CompositeResult {
  url: string | null;
  fetchLogs: FetchLog[];
  error?: string;
  fallbackUrl?: string | null;
}

const bitmapCache = new Map<string, { promise: Promise<ImageBitmap | null>; log?: FetchLog }>();

const supportsOffscreenWithBlob =
  typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function';

function hexToRgb(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function pushCachedLog(cacheEntry: { log?: FetchLog }, logs?: FetchLog[]) {
  if (!logs || !cacheEntry.log) return;
  logs.push({ ...cacheEntry.log, fromCache: true });
}

async function fetchBitmap(url?: string, stage = 'bitmap', logs?: FetchLog[]): Promise<ImageBitmap | null> {
  if (!url) return null;
  const cached = bitmapCache.get(url);
  if (cached) {
    pushCachedLog(cached, logs);
    return cached.promise;
  }

  const log: FetchLog = { url, stage, ok: false };
  const promise = (async () => {
    try {
      const res = await fetch(url);
      log.status = res.status;
      log.ok = res.ok;
      log.contentType = res.headers.get('content-type');
      if (!res.ok) {
        throw new Error('Asset fetch failed');
      }
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      return bitmap;
    } catch (error) {
      log.ok = false;
      log.error = (error as Error).message;
      console.error('Failed to fetch bitmap', url, error);
      return null;
    } finally {
      logs?.push({ ...log });
    }
  })();

  bitmapCache.set(url, { promise, log });
  return promise;
}

function createWorkingCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (supportsOffscreenWithBlob) {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToWebpBlob(canvas: OffscreenCanvas | HTMLCanvasElement, quality = 0.95): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality });
  }

  if (canvas instanceof HTMLCanvasElement) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  }

  if (canvas instanceof OffscreenCanvas) {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = canvas.width;
    fallbackCanvas.height = canvas.height;
    const bitmap = canvas.transferToImageBitmap();
    const ctx = fallbackCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>((resolve) => fallbackCanvas.toBlob(resolve, 'image/webp', quality));
  }

  return null;
}

function getImageData(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = createWorkingCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

const dimensionWarningLogged = new Set<string>();

function bitmapToImageData(bitmap: ImageBitmap, width: number, height: number, url?: string) {
  if ((bitmap.width !== width || bitmap.height !== height) && url && !dimensionWarningLogged.has(url)) {
    console.warn(`Bitmap dimensions differ from base (${bitmap.width}x${bitmap.height} vs ${width}x${height}) for ${url}`);
    dimensionWarningLogged.add(url);
  }

  return getImageData(bitmap, width, height);
}

function applyTint(
  target: ImageData,
  source: ImageData,
  mask: ImageData,
  rgb: [number, number, number],
  strength: number
) {
  const data = target.data;
  const base = source.data;
  const maskData = mask.data;
  for (let i = 0; i < data.length; i += 4) {
    const maskValue = ((maskData[i] + maskData[i + 1] + maskData[i + 2]) / 3) * (maskData[i + 3] / 255) / 255;
    if (maskValue <= 0) continue;

    const lum = (0.2126 * base[i] + 0.7152 * base[i + 1] + 0.0722 * base[i + 2]) / 255;
    const tintedR = rgb[0] * lum * 255;
    const tintedG = rgb[1] * lum * 255;
    const tintedB = rgb[2] * lum * 255;

    const mix = maskValue * strength;
    data[i] = data[i] + (tintedR - data[i]) * mix;
    data[i + 1] = data[i + 1] + (tintedG - data[i + 1]) * mix;
    data[i + 2] = data[i + 2] + (tintedB - data[i + 2]) * mix;
  }
}

function applyAo(target: ImageData, ao: ImageData, intensity: number) {
  const data = target.data;
  const aoData = ao.data;
  for (let i = 0; i < data.length; i += 4) {
    const aoValue = (aoData[i] / 255) * intensity + (1 - intensity);
    data[i] *= aoValue;
    data[i + 1] *= aoValue;
    data[i + 2] *= aoValue;
  }
}

function applyEmission(target: ImageData, emission: ImageData, intensity: number) {
  const data = target.data;
  const em = emission.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.min(1, (em[i] / 255) * intensity);
    const g = Math.min(1, (em[i + 1] / 255) * intensity);
    const b = Math.min(1, (em[i + 2] / 255) * intensity);

    data[i] = 255 * (1 - (1 - data[i] / 255) * (1 - r));
    data[i + 1] = 255 * (1 - (1 - data[i + 1] / 255) * (1 - g));
    data[i + 2] = 255 * (1 - (1 - data[i + 2] / 255) * (1 - b));
  }
}

function pickBestFallbackAsset(assets: AssetUrls) {
  return assets.beautyFgUrl ?? assets.beautyUrl ?? assets.thumbUrl ?? null;
}

export const compositeProduct = async (options: {
  assets: AssetUrls;
  colors: {
    base?: ColorOption | null;
    shade?: ColorOption | null;
    adapter?: ColorOption | null;
    guard?: ColorOption | null;
  };
  colorStrength?: number;
  aoIntensity?: number;
  emissionIntensity?: number;
}): Promise<CompositeResult> => {
  const fetchLogs: FetchLog[] = [];
  const fallbackUrl = pickBestFallbackAsset(options.assets);

  try {
    const { assets, colors } = options;
    const colorStrength = options.colorStrength ?? 0.85;
    const aoIntensity = options.aoIntensity ?? 0.35;
    const emissionIntensity = options.emissionIntensity ?? 1;

    const variant = assets.variant ?? (assets.beautyFgUrl ? 'separateBackground' : 'embeddedBackground');

    const baseBitmapPromise = (async () => {
      const primary = variant === 'separateBackground' ? assets.beautyFgUrl : assets.beautyUrl;
      const secondary = variant === 'separateBackground' ? assets.beautyUrl : assets.beautyFgUrl;

      const primaryBitmap = await fetchBitmap(primary, 'base', fetchLogs);
      if (primaryBitmap) return primaryBitmap;
      return fetchBitmap(secondary, 'base-fallback', fetchLogs);
    })();

    const backgroundPromise =
      variant === 'separateBackground' ? fetchBitmap(assets.backgroundUrl, 'background', fetchLogs) : null;

    const [baseBitmap, backgroundBitmap] = await Promise.all([baseBitmapPromise, backgroundPromise]);
    if (!baseBitmap) return { url: fallbackUrl, fetchLogs, fallbackUrl };

    const width = baseBitmap.width;
    const height = baseBitmap.height;
    const canvas = createWorkingCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { url: fallbackUrl, fetchLogs, fallbackUrl };

    ctx.clearRect(0, 0, width, height);
    if (backgroundBitmap) {
      ctx.drawImage(backgroundBitmap, 0, 0, width, height);
    }
    ctx.drawImage(baseBitmap, 0, 0, width, height);

    const baseData = ctx.getImageData(0, 0, width, height);
    const workingData = ctx.getImageData(0, 0, width, height);

    const maskTasks: Array<Promise<void>> = [];
    const applyForPart = (stage: string, maskUrl?: string, color?: ColorOption | null) => {
      if (!maskUrl || !color) return;
      const rgb = hexToRgb(color.hex);
      if (!rgb) return;
      maskTasks.push(
        (async () => {
          const maskBitmap = await fetchBitmap(maskUrl, stage, fetchLogs);
          if (!maskBitmap) return;
          const maskData = bitmapToImageData(maskBitmap, width, height, maskUrl);
          applyTint(workingData, baseData, maskData, rgb, colorStrength);
        })()
      );
    };

    applyForPart('mask_base', assets.maskBaseUrl, colors.base);
    applyForPart('mask_shade', assets.maskShadeUrl, colors.shade);
    applyForPart('mask_adapter', assets.maskAdapterUrl, colors.adapter);
    applyForPart('mask_guard', assets.maskGuardUrl, colors.guard);

    await Promise.all(maskTasks);

    if (assets.aoUrl) {
      const aoBitmap = await fetchBitmap(assets.aoUrl, 'ao', fetchLogs);
      if (aoBitmap) {
        const aoData = bitmapToImageData(aoBitmap, width, height, assets.aoUrl);
        applyAo(workingData, aoData, aoIntensity);
      }
    }

    if (assets.emissionUrl) {
      const emissionBitmap = await fetchBitmap(assets.emissionUrl, 'emission', fetchLogs);
      if (emissionBitmap) {
        const emissionData = bitmapToImageData(emissionBitmap, width, height, assets.emissionUrl);
        applyEmission(workingData, emissionData, emissionIntensity);
      }
    }

    ctx.putImageData(workingData, 0, 0);

    const blob = await canvasToWebpBlob(canvas, 0.95);
    if (!blob) return { url: fallbackUrl, fetchLogs, fallbackUrl };
    return { url: URL.createObjectURL(blob), fetchLogs };
  } catch (error) {
    console.error('Failed to composite product preview', error);
    return { url: fallbackUrl, fetchLogs, error: (error as Error).message, fallbackUrl };
  }
};

export function revokeObjectUrl(url?: string | null) {
  if (!url || !url.startsWith('blob:')) return;
  URL.revokeObjectURL(url);
}

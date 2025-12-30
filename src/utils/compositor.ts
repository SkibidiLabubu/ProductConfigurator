import type { AssetUrls, ColorOption } from '../types/configurator';

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();

function hexToRgb(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
}

async function fetchBitmap(url?: string): Promise<ImageBitmap | null> {
  if (!url) return null;
  if (bitmapCache.has(url)) {
    return bitmapCache.get(url)!;
  }
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error('Asset fetch failed');
      return res.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .catch((error) => {
      console.error('Failed to fetch bitmap', url, error);
      return null;
    });
  bitmapCache.set(url, promise);
  return promise;
}

function createWorkingCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getImageData(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = createWorkingCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
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

async function bitmapToImageData(bitmap: ImageBitmap) {
  return getImageData(bitmap, bitmap.width, bitmap.height);
}

export async function compositeProduct(options: {
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
}): Promise<string | null> {
  const { assets, colors } = options;
  const colorStrength = options.colorStrength ?? 0.85;
  const aoIntensity = options.aoIntensity ?? 0.35;
  const emissionIntensity = options.emissionIntensity ?? 1;

  const variant = assets.variant ?? (assets.beautyFgUrl ? 'separateBackground' : 'embeddedBackground');
  const baseBitmapPromise =
    variant === 'separateBackground'
      ? fetchFirstBitmap([assets.beautyFgUrl, assets.beautyUrl])
      : fetchFirstBitmap([assets.beautyUrl, assets.beautyFgUrl]);
  const backgroundPromise = variant === 'separateBackground' ? fetchBitmap(assets.backgroundUrl) : null;

  const [baseBitmap, backgroundBitmap] = await Promise.all([baseBitmapPromise, backgroundPromise]);
  if (!baseBitmap) return assets.thumbUrl ?? null;

  const width = baseBitmap.width;
  const height = baseBitmap.height;
  const canvas = createWorkingCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  if (backgroundBitmap) {
    ctx.drawImage(backgroundBitmap, 0, 0, width, height);
  }
  ctx.drawImage(baseBitmap, 0, 0, width, height);

  const baseData = ctx.getImageData(0, 0, width, height);
  const workingData = ctx.getImageData(0, 0, width, height);

  const maskTasks: Array<Promise<void>> = [];
  const applyForPart = (maskUrl?: string, color?: ColorOption | null) => {
    if (!maskUrl || !color) return;
    const rgb = hexToRgb(color.hex);
    if (!rgb) return;
    maskTasks.push(
      (async () => {
        const maskBitmap = await fetchBitmap(maskUrl);
        if (!maskBitmap) return;
        const maskData = await bitmapToImageData(maskBitmap);
        applyTint(workingData, baseData, maskData, rgb, colorStrength);
      })()
    );
  };

  applyForPart(assets.maskBaseUrl, colors.base);
  applyForPart(assets.maskShadeUrl, colors.shade);
  applyForPart(assets.maskAdapterUrl, colors.adapter);
  applyForPart(assets.maskGuardUrl, colors.guard);

  await Promise.all(maskTasks);

  if (assets.aoUrl) {
    const aoBitmap = await fetchBitmap(assets.aoUrl);
    if (aoBitmap) {
      const aoData = await bitmapToImageData(aoBitmap);
      applyAo(workingData, aoData, aoIntensity);
    }
  }

  if (assets.emissionUrl) {
    const emissionBitmap = await fetchBitmap(assets.emissionUrl);
    if (emissionBitmap) {
      const emissionData = await bitmapToImageData(emissionBitmap);
      applyEmission(workingData, emissionData, emissionIntensity);
    }
  }

  ctx.putImageData(workingData, 0, 0);

  const blob = canvas instanceof OffscreenCanvas ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.95 }) : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/webp', 0.95));
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url?: string | null) {
  if (!url || !url.startsWith('blob:')) return;
  URL.revokeObjectURL(url);
}

import type { AssetUrls } from '../types/configurator';

const preloadCache = new Set<string>();

export function preloadImage(url?: string) {
  if (!url || preloadCache.has(url)) return;
  const img = new Image();
  img.src = url;
  preloadCache.add(url);
}

export function preloadAssetSet(urls: AssetUrls) {
  preloadImage(urls.thumbUrl);
  preloadImage(urls.beautyUrl);
  preloadImage(urls.beautyFgUrl);
  preloadImage(urls.backgroundUrl);
}

import { AVAILABLE_BASES, AVAILABLE_CAMERAS, AVAILABLE_SHADES, AVAILABLE_STATES, CDN_ROOT, DEFAULT_CAMERA, DEFAULT_STATE } from '../config';
import { getDefaultColors } from '../colors';
import type {
  AssetAvailability,
  AssetUrls,
  AvailabilityMap,
  BaseKey,
  CameraKey,
  Configuration,
  ShadeKey,
  StateKey
} from '../types/configurator';

const probeCache = new Map<string, Promise<boolean>>();

const EMPTY_STATE_MAP: Record<StateKey, AssetAvailability | undefined> = { on: undefined, off: undefined };

const STATES: StateKey[] = [...AVAILABLE_STATES];
const CAMERAS: CameraKey[] = [...AVAILABLE_CAMERAS];
const DEFAULT_COLORS = getDefaultColors();

function buildBasePath(config: Configuration, root = CDN_ROOT) {
  return `${root}/${config.base}/${config.shade}/${config.camera}/${config.state}`;
}

function buildBackgroundPath(camera: CameraKey, root = CDN_ROOT) {
  return `${root}/background/${camera}`;
}

function buildAssetPath(basePath: string, filename: string, extension: 'webp' | 'png' = 'webp', frameSuffix = '') {
  if (frameSuffix) {
    return `${basePath}/${filename}.${extension}${frameSuffix}.${extension}`;
  }
  return `${basePath}/${filename}.${extension}`;
}

function buildAssetCandidates(basePath: string, filename: string) {
  const extensions: Array<'webp' | 'png'> = ['webp', 'png'];
  const frameSuffixes = ['0001', ''];

  return extensions.flatMap((extension) =>
    frameSuffixes.map((frameSuffix) => buildAssetPath(basePath, filename, extension, frameSuffix))
  );
}

function pickPrimaryAssetCandidate(basePath: string, filename: string) {
  return buildAssetCandidates(basePath, filename)[0];
}

async function headExists(url: string): Promise<boolean> {
  if (!probeCache.has(url)) {
    probeCache.set(
      url,
      fetch(url, { method: 'HEAD' })
        .then((res) => res.ok)
        .catch(() => false)
    );
  }
  return probeCache.get(url) as Promise<boolean>;
}

async function withExtensionFallback(basePath: string, filename: string) {
  const candidates = buildAssetCandidates(basePath, filename);

  for (const candidate of candidates) {
    if (await headExists(candidate)) {
      return { url: candidate, exists: true } as const;
    }
  }

  return { url: candidates[0], exists: false } as const;
}

export function resolveAssetUrls(config: Configuration, root = CDN_ROOT): AssetUrls {
  const basePath = buildBasePath(config, root);
  const backgroundPath = buildBackgroundPath(config.camera, root);
  return {
    variant: undefined,
    beautyUrl: pickPrimaryAssetCandidate(basePath, 'beauty'),
    beautyFgUrl: pickPrimaryAssetCandidate(basePath, 'beauty_fg'),
    backgroundUrl: pickPrimaryAssetCandidate(backgroundPath, 'bg'),
    thumbUrl: pickPrimaryAssetCandidate(basePath, 'beauty_512'),
    aoUrl: pickPrimaryAssetCandidate(basePath, 'ao'),
    emissionUrl: config.state === 'on' ? pickPrimaryAssetCandidate(basePath, 'emission') : undefined,
    maskBaseUrl: pickPrimaryAssetCandidate(basePath, 'mask_base'),
    maskShadeUrl: pickPrimaryAssetCandidate(basePath, 'mask_shade'),
    maskAdapterUrl: pickPrimaryAssetCandidate(basePath, 'mask_adapter'),
    maskGuardUrl: pickPrimaryAssetCandidate(basePath, 'mask_guard')
  };
}

export async function resolveAssetUrlsWithFallback(config: Configuration, root = CDN_ROOT): Promise<AssetUrls> {
  const basePath = buildBasePath(config, root);
  const backgroundPath = buildBackgroundPath(config.camera, root);
  const [beautyFg, beauty, thumb, ao, emission, maskBase, maskShade, maskAdapter, maskGuard] = await Promise.all([
    withExtensionFallback(basePath, 'beauty_fg'),
    withExtensionFallback(basePath, 'beauty'),
    withExtensionFallback(basePath, 'beauty_512'),
    withExtensionFallback(basePath, 'ao'),
    config.state === 'on' ? withExtensionFallback(basePath, 'emission') : Promise.resolve({ url: undefined, exists: false }),
    withExtensionFallback(basePath, 'mask_base'),
    withExtensionFallback(basePath, 'mask_shade'),
    withExtensionFallback(basePath, 'mask_adapter'),
    withExtensionFallback(basePath, 'mask_guard')
  ]);
  const variant: AssetUrls['variant'] = beautyFg.exists ? 'separateBackground' : 'embeddedBackground';
  const background = variant === 'separateBackground' ? await withExtensionFallback(backgroundPath, 'bg') : { url: undefined, exists: false };

  return {
    variant,
    beautyUrl: variant === 'embeddedBackground' ? beauty.url : undefined,
    beautyFgUrl: beautyFg.exists ? beautyFg.url : undefined,
    backgroundUrl: background.url,
    thumbUrl: thumb.url,
    aoUrl: ao.url,
    emissionUrl: emission.url,
    maskBaseUrl: maskBase.url,
    maskShadeUrl: maskShade.url,
    maskAdapterUrl: maskAdapter.url,
    maskGuardUrl: maskGuard.url
  };
}

export async function probeAvailability(config: Configuration, root = CDN_ROOT): Promise<AssetAvailability> {
  const urls = await resolveAssetUrlsWithFallback(config, root);
  const exists = Boolean((urls.variant === 'separateBackground' ? urls.beautyFgUrl : urls.beautyUrl) || urls.thumbUrl);
  return { ...urls, exists } as AssetAvailability;
}

export interface ProbeOptions {
  bases?: BaseKey[];
  shades?: ShadeKey[];
  cameras?: CameraKey[];
  states?: StateKey[];
}

export async function buildAvailabilityMap(options: ProbeOptions = {}): Promise<AvailabilityMap> {
  const bases = options.bases ?? (AVAILABLE_BASES as BaseKey[]);
  const shades = options.shades ?? (AVAILABLE_SHADES as ShadeKey[]);
  const cameras = options.cameras ?? CAMERAS;
  const states = options.states ?? STATES;

  const map: AvailabilityMap = { bases: {} };
  const tasks: Promise<void>[] = [];

  for (const base of bases) {
    for (const shade of shades) {
      for (const camera of cameras) {
        for (const state of states) {
          const configuration: Configuration = { base, shade, camera, state, ...DEFAULT_COLORS };
          tasks.push(
            (async () => {
              const availability = await probeAvailability(configuration);
              if (!availability.exists) return;

              if (!map.bases[base]) {
                map.bases[base] = { shades: {} };
              }
              const shadeEntry = map.bases[base]!;
              if (!shadeEntry.shades[shade]) {
                shadeEntry.shades[shade] = {} as Record<CameraKey, { states: Record<StateKey, AssetAvailability | undefined> }>;
              }
              const cameraEntry = shadeEntry.shades[shade]!;
              if (!cameraEntry[camera]) {
                cameraEntry[camera] = { states: { on: undefined, off: undefined } as Record<StateKey, AssetAvailability | undefined> };
              }
              cameraEntry[camera]!.states[state] = availability;
            })()
          );
        }
      }
    }
  }

  await Promise.all(tasks);
  return map;
}

export function buildStaticManifest(): AvailabilityMap {
  const map: AvailabilityMap = { bases: {} };
  const devBases: BaseKey[] = ['base_01', 'base_05', 'base_10'];
  const devShades: ShadeKey[] = ['shade_01', 'shade_10', 'shade_20'];

  for (const base of devBases) {
    map.bases[base] = { shades: {} };
    for (const shade of devShades) {
      map.bases[base]!.shades[shade] = {} as Record<CameraKey, { states: Record<StateKey, AssetAvailability | undefined> }>;
      for (const camera of CAMERAS) {
        const states: Record<StateKey, AssetAvailability | undefined> = { on: undefined, off: undefined };
        const urls = resolveAssetUrls({ base, shade, camera, state: DEFAULT_STATE, ...DEFAULT_COLORS });
        states[DEFAULT_STATE] = { ...urls, exists: true } as AssetAvailability;
        map.bases[base]!.shades[shade]![camera] = { states };
      }
    }
  }

  return map;
}

export function pickFirstAvailableConfiguration(map: AvailabilityMap): Configuration {
  for (const base of Object.keys(map.bases)) {
    const shades = map.bases[base as BaseKey]?.shades ?? {};
    for (const shade of Object.keys(shades)) {
      const cameras = shades[shade as ShadeKey] ?? {};
      for (const camera of Object.keys(cameras)) {
        const states = cameras[camera as CameraKey]?.states ?? EMPTY_STATE_MAP;
        const existingState = (Object.keys(states) as StateKey[]).find((state) => states[state]?.exists);
        if (existingState) {
          return {
            base: base as BaseKey,
            shade: shade as ShadeKey,
            camera: camera as CameraKey,
            state: existingState,
            ...DEFAULT_COLORS
          };
        }
      }
    }
  }

  return {
    base: AVAILABLE_BASES[0] as BaseKey,
    shade: AVAILABLE_SHADES[0] as ShadeKey,
    camera: DEFAULT_CAMERA,
    state: DEFAULT_STATE,
    ...DEFAULT_COLORS
  };
}

export function getAvailableBases(map: AvailabilityMap): BaseKey[] {
  return Object.keys(map.bases) as BaseKey[];
}

export function getAvailableShades(map: AvailabilityMap, base: BaseKey): ShadeKey[] {
  const shades = map.bases[base]?.shades ?? {};
  return Object.keys(shades) as ShadeKey[];
}

export function getAvailableCameras(map: AvailabilityMap, base: BaseKey, shade: ShadeKey): CameraKey[] {
  const shadeEntry = map.bases[base]?.shades?.[shade] ?? {};
  return Object.keys(shadeEntry) as CameraKey[];
}

export function getAvailableStates(map: AvailabilityMap, base: BaseKey, shade: ShadeKey, camera: CameraKey): StateKey[] {
  const states = map.bases[base]?.shades?.[shade]?.[camera]?.states ?? EMPTY_STATE_MAP;
  return (Object.keys(states) as StateKey[]).filter((key) => states[key]);
}

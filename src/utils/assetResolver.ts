import {
  AVAILABLE_BASES,
  AVAILABLE_CAMERAS,
  AVAILABLE_SHADES,
  AVAILABLE_STATES,
  CDN_ROOT,
  DEFAULT_CAMERA,
  DEFAULT_STATE
} from '../config';
import { getDefaultColors } from '../colors';
import type {
  AssetAvailability,
  AssetProbe,
  AssetProbeAttempt,
  AssetUrls,
  AvailabilityMap,
  BaseKey,
  CameraKey,
  Configuration,
  ExpectedAssetFile,
  ShadeKey,
  StateKey
} from '../types/configurator';

const probeCache = new Map<string, Promise<AssetProbeAttempt>>();

const EMPTY_STATE_MAP: Record<StateKey, AssetAvailability | undefined> = { on: undefined, off: undefined };

const STATES: StateKey[] = [...AVAILABLE_STATES];
const CAMERAS: CameraKey[] = [...AVAILABLE_CAMERAS];
const DEFAULT_COLORS = getDefaultColors();

const REQUIRED_COMMON: Array<'beauty_512' | 'mask_base' | 'mask_shade' | 'mask_adapter' | 'mask_guard'> = [
  'beauty_512',
  'mask_base',
  'mask_shade',
  'mask_adapter',
  'mask_guard'
];

type AssetFilename =
  | 'beauty'
  | 'beauty_fg'
  | 'beauty_512'
  | 'bg'
  | 'mask_base'
  | 'mask_shade'
  | 'mask_adapter'
  | 'mask_guard'
  | 'ao'
  | 'normal'
  | 'emission';

type ProbeMethod = 'HEAD' | 'GET';

function buildBasePath(config: Configuration, root = CDN_ROOT) {
  return `${root}/${config.base}/${config.shade}/${config.camera}/${config.state}`;
}

function buildBackgroundPath(camera: CameraKey, root = CDN_ROOT) {
  return `${root}/background/${camera}`;
}

function expectedPath(basePath: string, filename: AssetFilename): ExpectedAssetFile {
  return {
    label: filename,
    path: `${basePath}/${filename}.webp`,
    alternatives: [`${basePath}/${filename}.png`]
  };
}

function buildAssetPath(basePath: string, filename: AssetFilename, extension: 'webp' | 'png' = 'webp', frameSuffix = '') {
  if (frameSuffix) {
    return `${basePath}/${filename}.${extension}${frameSuffix}.${extension}`;
  }
  return `${basePath}/${filename}.${extension}`;
}

function buildAssetCandidates(basePath: string, filename: AssetFilename, includeFrameSuffix = true) {
  const extensions: Array<'webp' | 'png'> = ['webp', 'png'];
  const frameSuffixes = includeFrameSuffix ? ['0001'] : [];

  const unsuffixed = extensions.map((extension) => buildAssetPath(basePath, filename, extension));
  const frameCandidates = frameSuffixes.flatMap((frameSuffix) =>
    extensions.map((extension) => buildAssetPath(basePath, filename, extension, frameSuffix))
  );

  return { unsuffixed, frameCandidates };
}

function pickPrimaryAssetCandidate(basePath: string, filename: AssetFilename) {
  return buildAssetPath(basePath, filename, 'webp');
}

function makeAttempt(url: string, method: ProbeMethod, res: Response): AssetProbeAttempt {
  return { url, ok: res.ok, status: res.status, method };
}

function makeFailedAttempt(url: string, method: ProbeMethod): AssetProbeAttempt {
  return { url, ok: false, method };
}

async function probeWithHead(url: string): Promise<AssetProbeAttempt> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return makeAttempt(url, 'HEAD', res);
  } catch {
    return makeFailedAttempt(url, 'HEAD');
  }
}

async function probeWithGet(url: string, useRange: boolean): Promise<AssetProbeAttempt> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: useRange ? { Range: 'bytes=0-0' } : undefined
    });
    return makeAttempt(url, 'GET', res);
  } catch {
    return makeFailedAttempt(url, 'GET');
  }
}

async function probeUrl(url: string): Promise<AssetProbeAttempt> {
  if (!probeCache.has(url)) {
    probeCache.set(
      url,
      (async () => {
        const headResult = await probeWithHead(url);
        if (headResult.ok) return headResult;

        const rangedGetResult = await probeWithGet(url, true);
        if (rangedGetResult.ok) return rangedGetResult;

        return probeWithGet(url, false);
      })()
    );
  }

  return probeCache.get(url) as Promise<AssetProbeAttempt>;
}

async function probeAsset(
  basePath: string,
  filename: AssetFilename,
  { includeFrameSuffix }: { includeFrameSuffix?: boolean } = {}
) {
  const { unsuffixed, frameCandidates } = buildAssetCandidates(basePath, filename, includeFrameSuffix);
  const attempts: AssetProbeAttempt[] = [];

  for (const candidate of unsuffixed) {
    const result = await probeUrl(candidate);
    attempts.push(result);
    if (result.ok) {
      return { url: candidate, exists: true, attempts, expected: expectedPath(basePath, filename), frameOnly: false } as const;
    }
  }

  let frameHit: string | undefined;
  for (const candidate of frameCandidates) {
    const result = await probeUrl(candidate);
    attempts.push({ ...result, fromFrameSuffix: true });
    if (result.ok && !frameHit) {
      frameHit = candidate;
    }
  }

  return {
    url: frameHit,
    exists: false,
    attempts,
    expected: expectedPath(basePath, filename),
    frameOnly: Boolean(frameHit)
  } as const;
}

function makeProbe(asset: AssetFilename | 'background', probe: Awaited<ReturnType<typeof probeAsset>>, expected?: ExpectedAssetFile) {
  const base: AssetProbe = {
    asset,
    attempts: probe.attempts,
    expected: expected ?? probe.expected,
    frameOnly: probe.frameOnly
  };

  switch (asset) {
    case 'beauty':
      base.beautyUrl = probe.url;
      break;
    case 'beauty_fg':
      base.beautyFgUrl = probe.url;
      break;
    case 'beauty_512':
      base.thumbUrl = probe.url;
      break;
    case 'bg':
    case 'background':
      base.backgroundUrl = probe.url;
      break;
    case 'mask_base':
      base.maskBaseUrl = probe.url;
      break;
    case 'mask_shade':
      base.maskShadeUrl = probe.url;
      break;
    case 'mask_adapter':
      base.maskAdapterUrl = probe.url;
      break;
    case 'mask_guard':
      base.maskGuardUrl = probe.url;
      break;
    case 'ao':
      base.aoUrl = probe.url;
      break;
    case 'normal':
      base.normalUrl = probe.url;
      break;
    case 'emission':
      base.emissionUrl = probe.url;
      break;
    default:
      break;
  }

  return base;
}

function addMissingIfNeeded(
  target: ExpectedAssetFile[],
  frameOnlyTarget: ExpectedAssetFile[],
  probe: Awaited<ReturnType<typeof probeAsset>>,
  expected: ExpectedAssetFile
) {
  if (probe.frameOnly) {
    frameOnlyTarget.push(expected);
  }
  if (!probe.exists && !probe.frameOnly) {
    target.push(expected);
  }
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
    normalUrl: pickPrimaryAssetCandidate(basePath, 'normal'),
    emissionUrl: config.state === 'on' ? pickPrimaryAssetCandidate(basePath, 'emission') : undefined,
    maskBaseUrl: pickPrimaryAssetCandidate(basePath, 'mask_base'),
    maskShadeUrl: pickPrimaryAssetCandidate(basePath, 'mask_shade'),
    maskAdapterUrl: pickPrimaryAssetCandidate(basePath, 'mask_adapter'),
    maskGuardUrl: pickPrimaryAssetCandidate(basePath, 'mask_guard')
  };
}

export async function resolveAssetUrlsWithFallback(config: Configuration, root = CDN_ROOT): Promise<AssetAvailability> {
  const basePath = buildBasePath(config, root);
  const backgroundPath = buildBackgroundPath(config.camera, root);
  const [
    beautyFg,
    beauty,
    thumb,
    ao,
    normal,
    emission,
    maskBase,
    maskShade,
    maskAdapter,
    maskGuard,
    background
  ] = await Promise.all([
    probeAsset(basePath, 'beauty_fg'),
    probeAsset(basePath, 'beauty'),
    probeAsset(basePath, 'beauty_512'),
    probeAsset(basePath, 'ao'),
    probeAsset(basePath, 'normal'),
    config.state === 'on' ? probeAsset(basePath, 'emission') : probeAsset(basePath, 'emission', { includeFrameSuffix: false }),
    probeAsset(basePath, 'mask_base'),
    probeAsset(basePath, 'mask_shade'),
    probeAsset(basePath, 'mask_adapter'),
    probeAsset(basePath, 'mask_guard'),
    probeAsset(backgroundPath, 'bg')
  ]);

  const beautyFgPresent = beautyFg.exists || beautyFg.frameOnly;
  const beautyPresent = beauty.exists || beauty.frameOnly;
  const variant: AssetUrls['variant'] = beautyFgPresent
    ? 'separateBackground'
    : beautyPresent
    ? 'embeddedBackground'
    : undefined;

  const probes: AssetProbe[] = [
    makeProbe('beauty_fg', beautyFg),
    makeProbe('beauty', beauty),
    makeProbe('beauty_512', thumb),
    makeProbe('ao', ao),
    makeProbe('normal', normal),
    makeProbe('emission', emission),
    makeProbe('mask_base', maskBase),
    makeProbe('mask_shade', maskShade),
    makeProbe('mask_adapter', maskAdapter),
    makeProbe('mask_guard', maskGuard),
    makeProbe('background', background, expectedPath(backgroundPath, 'bg'))
  ];

  const missingFiles: ExpectedAssetFile[] = [];
  const frameOnlyFiles: ExpectedAssetFile[] = [];
  const requiredAssets: Array<{ probe: Awaited<ReturnType<typeof probeAsset>>; expected: ExpectedAssetFile }> = [];

  if (variant === 'separateBackground' || !variant) {
    requiredAssets.push({ probe: beautyFg, expected: beautyFg.expected });
    requiredAssets.push({ probe: background, expected: expectedPath(backgroundPath, 'bg') });
  }
  if (variant === 'embeddedBackground' || !variant) {
    requiredAssets.push({ probe: beauty, expected: beauty.expected });
  }

  REQUIRED_COMMON.forEach((key) => {
    const lookup: Record<typeof REQUIRED_COMMON[number], Awaited<ReturnType<typeof probeAsset>>> = {
      beauty_512: thumb,
      mask_base: maskBase,
      mask_shade: maskShade,
      mask_adapter: maskAdapter,
      mask_guard: maskGuard
    };
    requiredAssets.push({ probe: lookup[key], expected: lookup[key].expected });
  });

  requiredAssets.forEach(({ probe, expected }) => addMissingIfNeeded(missingFiles, frameOnlyFiles, probe, expected));

  const assets: AssetAvailability = {
    variant,
    beautyUrl: variant === 'embeddedBackground' ? beauty.url : undefined,
    beautyFgUrl: variant === 'separateBackground' ? beautyFg.url : undefined,
    backgroundUrl: variant === 'separateBackground' ? background.url : undefined,
    thumbUrl: thumb.url,
    aoUrl: ao.url,
    normalUrl: normal.url,
    emissionUrl: config.state === 'on' ? emission.url : undefined,
    maskBaseUrl: maskBase.url,
    maskShadeUrl: maskShade.url,
    maskAdapterUrl: maskAdapter.url,
    maskGuardUrl: maskGuard.url,
    exists: Boolean(variant) && missingFiles.length === 0,
    probes,
    missingFiles,
    frameOnlyFiles
  };

  return assets;
}

export async function probeAvailability(config: Configuration, root = CDN_ROOT): Promise<AssetAvailability> {
  return resolveAssetUrlsWithFallback(config, root);
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

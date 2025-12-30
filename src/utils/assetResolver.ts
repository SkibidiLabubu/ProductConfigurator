import { AVAILABLE_BASES, AVAILABLE_CAMERAS, AVAILABLE_SHADES, AVAILABLE_STATES, CDN_ROOT, DEFAULT_CAMERA, DEFAULT_STATE } from '../config';
import type { AssetAvailability, AssetUrls, AvailabilityMap, BaseKey, CameraKey, Configuration, ShadeKey, StateKey } from '../types/configurator';

const probeCache = new Map<string, Promise<boolean>>();

const STATES: StateKey[] = [...AVAILABLE_STATES];
const CAMERAS: CameraKey[] = [...AVAILABLE_CAMERAS];

function buildBasePath(config: Configuration, root = CDN_ROOT) {
  return `${root}/${config.base}/${config.shade}/${config.camera}/${config.state}`;
}

export function resolveAssetUrls(config: Configuration, root = CDN_ROOT): AssetUrls {
  const basePath = buildBasePath(config, root);
  return {
    beautyUrl: `${basePath}/beauty.webp`,
    thumbUrl: `${basePath}/beauty_512.webp`,
    aoUrl: `${basePath}/ao.webp`,
    normalUrl: `${basePath}/normal.webp`,
    emissionUrl: config.state === 'on' ? `${basePath}/emission.webp` : undefined
  };
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

export async function probeAvailability(config: Configuration, root = CDN_ROOT): Promise<AssetAvailability> {
  const urls = resolveAssetUrls(config, root);
  const [beautyOk, thumbOk] = await Promise.all([headExists(urls.beautyUrl), headExists(urls.thumbUrl)]);
  return {
    ...urls,
    exists: Boolean(beautyOk || thumbOk)
  };
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
          const configuration: Configuration = { base, shade, camera, state };
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
        const urls = resolveAssetUrls({ base, shade, camera, state: DEFAULT_STATE });
        states[DEFAULT_STATE] = { ...urls, exists: true };
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
        const states = cameras[camera as CameraKey]?.states ?? {};
        const existingState = (Object.keys(states) as StateKey[]).find((state) => states[state]?.exists);
        if (existingState) {
          return {
            base: base as BaseKey,
            shade: shade as ShadeKey,
            camera: camera as CameraKey,
            state: existingState
          };
        }
      }
    }
  }

  return {
    base: AVAILABLE_BASES[0] as BaseKey,
    shade: AVAILABLE_SHADES[0] as ShadeKey,
    camera: DEFAULT_CAMERA,
    state: DEFAULT_STATE
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
  const states = map.bases[base]?.shades?.[shade]?.[camera]?.states ?? {};
  return (Object.keys(states) as StateKey[]).filter((key) => states[key]);
}

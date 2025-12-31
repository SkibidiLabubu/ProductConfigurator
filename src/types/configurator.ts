export type BaseKey = `base_${string}`;
export type ShadeKey = `shade_${string}`;
export type CameraKey = 'CAM_01' | 'CAM_02' | 'CAM_03';
export type StateKey = 'on' | 'off';
export type ColorId = string;
export type ColorPart = 'lamp' | 'base' | 'adapter' | 'guard';

export interface Configuration {
  base: BaseKey;
  shade: ShadeKey;
  camera: CameraKey;
  state: StateKey;
  lampColor: ColorId;
  baseColor: ColorId;
  adapterColor: ColorId;
  guardColor: ColorId;
}

export interface AssetUrls {
  variant?: 'separateBackground' | 'embeddedBackground';
  beautyUrl?: string;
  beautyFgUrl?: string;
  backgroundUrl?: string;
  thumbUrl?: string;
  aoUrl?: string;
  normalUrl?: string;
  emissionUrl?: string;
  maskBaseUrl?: string;
  maskShadeUrl?: string;
  maskAdapterUrl?: string;
  maskGuardUrl?: string;
}

export interface AssetProbeAttempt {
  url: string;
  ok: boolean;
  status?: number;
  fromFrameSuffix?: boolean;
}

export interface ExpectedAssetFile {
  label: string;
  path: string;
  alternatives?: string[];
}

export interface AssetProbe extends AssetUrls {
  asset: string;
  attempts: AssetProbeAttempt[];
  expected: ExpectedAssetFile;
  frameOnly?: boolean;
}

export interface AssetAvailability extends AssetUrls {
  exists: boolean;
  probes?: AssetProbe[];
  missingFiles?: ExpectedAssetFile[];
  frameOnlyFiles?: ExpectedAssetFile[];
}

export interface ConfigurationAvailability {
  states: Record<StateKey, AssetAvailability | undefined>;
}

export interface ShadeAvailability {
  shades: Record<ShadeKey, Record<CameraKey, ConfigurationAvailability | undefined>>;
}

export interface AvailabilityMap {
  bases: Record<BaseKey, ShadeAvailability | undefined>;
}

export interface ColorOption {
  id: ColorId;
  name: string;
  hex: string;
  finish: string;
  forBase: boolean;
  forShade: boolean;
  forAdapter: boolean;
  forGuard: boolean;
}

export type BaseKey = `base_${string}`;
export type ShadeKey = `shade_${string}`;
export type CameraKey = 'CAM_01' | 'CAM_02' | 'CAM_03';
export type StateKey = 'on' | 'off';
export type ColorId = string;
export type ColorPart = 'lamp' | 'base' | 'adapter' | 'guard';
export type RenderPass = 'beauty' | 'ao' | 'normal' | 'emission';

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
  beautyUrl: string;
  thumbUrl: string;
  aoUrl: string;
  normalUrl: string;
  emissionUrl?: string;
}

export interface AssetAvailability extends AssetUrls {
  exists: boolean;
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

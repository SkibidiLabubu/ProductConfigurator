export const CDN_ROOT = '/renders';

export const AVAILABLE_BASES = Array.from({ length: 38 }, (_, i) => `base_${String(i + 1).padStart(2, '0')}`);
export const AVAILABLE_SHADES = Array.from({ length: 42 }, (_, i) => `shade_${String(i + 1).padStart(2, '0')}`);
export const AVAILABLE_CAMERAS = ['CAM_01', 'CAM_02', 'CAM_03'] as const;
export const AVAILABLE_STATES = ['on', 'off'] as const;

export const DEFAULT_CAMERA = 'CAM_01' as const;
export const DEFAULT_STATE = 'on' as const;

export const CONFIGURATOR_VERSION = 'v1';
export const VARIANT_ID = '1234567890';

import type { ColorId, ColorOption, ColorPart } from './types/configurator';

export const COLORS: ColorOption[] = [
  {
    id: 'clr_arctic_white',
    name: 'Arctic White',
    hex: '#F8FAFC',
    finish: 'matte',
    forBase: true,
    forShade: true,
    forAdapter: true,
    forGuard: true
  },
  {
    id: 'clr_midnight_black',
    name: 'Midnight Black',
    hex: '#0B0C10',
    finish: 'matte',
    forBase: true,
    forShade: true,
    forAdapter: true,
    forGuard: true
  },
  {
    id: 'clr_soft_grey',
    name: 'Soft Grey',
    hex: '#CBD5E1',
    finish: 'satin',
    forBase: true,
    forShade: true,
    forAdapter: true,
    forGuard: true
  },
  {
    id: 'clr_warm_taupe',
    name: 'Warm Taupe',
    hex: '#B79C86',
    finish: 'satin',
    forBase: true,
    forShade: true,
    forAdapter: false,
    forGuard: false
  },
  {
    id: 'clr_brushed_steel',
    name: 'Brushed Steel',
    hex: '#A7B0B9',
    finish: 'brushed metal',
    forBase: true,
    forShade: false,
    forAdapter: true,
    forGuard: true
  },
  {
    id: 'clr_soft_gold',
    name: 'Soft Gold',
    hex: '#D4AF37',
    finish: 'satin metallic',
    forBase: true,
    forShade: false,
    forAdapter: true,
    forGuard: true
  },
  {
    id: 'clr_forest_green',
    name: 'Forest Green',
    hex: '#234F35',
    finish: 'matte',
    forBase: true,
    forShade: true,
    forAdapter: false,
    forGuard: false
  },
  {
    id: 'clr_deep_navy',
    name: 'Deep Navy',
    hex: '#0F172A',
    finish: 'matte',
    forBase: true,
    forShade: true,
    forAdapter: true,
    forGuard: true
  }
];

export function colorsForPart(part: ColorPart): ColorOption[] {
  switch (part) {
    case 'base':
      return COLORS.filter((color) => color.forBase);
    case 'lamp':
      return COLORS.filter((color) => color.forShade);
    case 'adapter':
      return COLORS.filter((color) => color.forAdapter);
    case 'guard':
      return COLORS.filter((color) => color.forGuard);
    default:
      return COLORS;
  }
}

export function findColorById(id?: ColorId): ColorOption | undefined {
  if (!id) return undefined;
  return COLORS.find((color) => color.id === id);
}

export function getDefaultColorId(part: ColorPart): ColorId {
  const options = colorsForPart(part);
  return options[0]?.id ?? COLORS[0]?.id ?? '';
}

export function getDefaultColors(): {
  lampColor: ColorId;
  baseColor: ColorId;
  adapterColor: ColorId;
  guardColor: ColorId;
} {
  return {
    lampColor: getDefaultColorId('lamp'),
    baseColor: getDefaultColorId('base'),
    adapterColor: getDefaultColorId('adapter'),
    guardColor: getDefaultColorId('guard')
  };
}

export function normalizeColorSelection(id: ColorId, part: ColorPart): ColorId {
  const options = colorsForPart(part);
  const exists = options.find((color) => color.id === id);
  if (exists) return id;
  return getDefaultColorId(part);
}

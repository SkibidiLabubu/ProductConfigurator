import { useEffect, useMemo, useState } from 'react';
import ColorSwatchGrid from './ColorSwatchGrid';
import { buildStaticManifest, pickFirstAvailableConfiguration, probeAvailability, resolveAssetUrls } from '../utils/assetResolver';
import { colorsForPart, findColorById, normalizeColorSelection } from '../colors';
import { preloadAssetSet } from '../utils/preload';
import type {
  AssetAvailability,
  AvailabilityMap,
  BaseKey,
  CameraKey,
  ColorPart,
  Configuration,
  RenderPass,
  ShadeKey,
  StateKey
} from '../types/configurator';
import { AVAILABLE_BASES, AVAILABLE_CAMERAS, AVAILABLE_SHADES, AVAILABLE_STATES, CONFIGURATOR_VERSION, DEFAULT_STATE, VARIANT_ID } from '../config';

const COLOR_KEYS: Record<ColorPart, 'lampColor' | 'baseColor' | 'adapterColor' | 'guardColor'> = {
  lamp: 'lampColor',
  base: 'baseColor',
  adapter: 'adapterColor',
  guard: 'guardColor'
};
const SHOPIFY_HOST_PATTERN = /(?:myshopify\.com|shopify\.com)$/;

interface CartPayload {
  id: string;
  quantity: number;
  properties: Record<string, string>;
}

function coerceConfig(_map: AvailabilityMap, current: Configuration): Configuration {
  const base = AVAILABLE_BASES.includes(current.base) ? current.base : (AVAILABLE_BASES[0] as BaseKey);
  const shade = AVAILABLE_SHADES.includes(current.shade) ? current.shade : (AVAILABLE_SHADES[0] as ShadeKey);
  const camera = AVAILABLE_CAMERAS.includes(current.camera) ? current.camera : (AVAILABLE_CAMERAS[0] as CameraKey);
  const state = AVAILABLE_STATES.includes(current.state) ? current.state : DEFAULT_STATE;
  const lampColor = normalizeColorSelection(current.lampColor, 'lamp');
  const baseColor = normalizeColorSelection(current.baseColor, 'base');
  const adapterColor = normalizeColorSelection(current.adapterColor, 'adapter');
  const guardColor = normalizeColorSelection(current.guardColor, 'guard');

  return {
    base: base ?? current.base,
    shade: shade ?? current.shade,
    camera: camera ?? current.camera,
    state: state ?? current.state,
    lampColor,
    baseColor,
    adapterColor,
    guardColor
  };
}

function SelectorGrid<T extends string>({
  options,
  selected,
  onSelect,
  thumbFor,
  labelFor
}: {
  options: T[];
  selected: T;
  onSelect: (value: T) => void;
  thumbFor: (value: T) => string | undefined;
  labelFor: (value: T) => string;
}) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
      {options.map((value) => {
        const thumb = thumbFor(value) ?? '';
        return (
          <button
            key={value}
            className={`selector-tile ${selected === value ? 'selected' : ''}`}
            onClick={() => onSelect(value)}
            type="button"
          >
            <img src={thumb} alt={labelFor(value)} className="thumb" loading="lazy" />
            <div className="selector-label">
              <span>{labelFor(value)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          key={option.value}
          className={option.value === value ? 'active' : ''}
          disabled={option.disabled}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function Configurator() {
  const [availability, setAvailability] = useState<AvailabilityMap>(() => buildStaticManifest());
  const [configuration, setConfiguration] = useState<Configuration>(() => pickFirstAvailableConfiguration(buildStaticManifest()));
  const [colorTab, setColorTab] = useState<ColorPart>('lamp');
  const [renderPass, setRenderPass] = useState<RenderPass>('beauty');
  const [currentAsset, setCurrentAsset] = useState<AssetAvailability | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [isShopifyHost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return SHOPIFY_HOST_PATTERN.test(window.location.hostname);
  });
  const colorOptions = useMemo(
    () => ({
      lamp: colorsForPart('lamp'),
      base: colorsForPart('base'),
      adapter: colorsForPart('adapter'),
      guard: colorsForPart('guard')
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    const nextConfig = coerceConfig(availability, configuration);
    setConfiguration(nextConfig);
    setStatusMessage(null);
    (async () => {
      const availabilityForSelection = await probeAvailability(nextConfig);
      if (cancelled) return;
      setCurrentAsset(availabilityForSelection);
      setAvailabilityMessage(availabilityForSelection.exists ? null : 'Combination not available');
      if (!availabilityForSelection.exists) {
        setIsLoadingImage(false);
        return;
      }
      if (availabilityForSelection.exists) {
        preloadAssetSet(availabilityForSelection);
      }
    })();
    const nextThumbCandidates = [resolveAssetUrls({ ...nextConfig, camera: nextConfig.camera })];
    nextThumbCandidates.forEach(preloadAssetSet);
    return () => {
      cancelled = true;
    };
  }, [availability, configuration]);

  useEffect(() => {
    if (configuration.state === 'off' && renderPass === 'emission') {
      setRenderPass('beauty');
    }
  }, [configuration.state, renderPass]);

  const baseOptions = useMemo(() => AVAILABLE_BASES as BaseKey[], []);
  const shadeOptions = useMemo(() => AVAILABLE_SHADES as ShadeKey[], []);
  const cameraOptions = useMemo(() => [...AVAILABLE_CAMERAS] as CameraKey[], []);
  const stateOptions = useMemo(() => [...AVAILABLE_STATES] as StateKey[], []);

  const handleColorSelect = (part: ColorPart, id: string) => {
    setConfiguration((prev) => coerceConfig(availability, { ...prev, [COLOR_KEYS[part]]: id } as Configuration));
  };

  const handleColorClear = (part: ColorPart) => {
    setConfiguration((prev) =>
      coerceConfig(availability, { ...prev, [COLOR_KEYS[part]]: normalizeColorSelection('', part) } as Configuration)
    );
  };

  const baseThumbnail = (base: BaseKey) => {
    return resolveAssetUrls({ ...configuration, base }).thumbUrl;
  };

  const shadeThumbnail = (shade: ShadeKey) => {
    return resolveAssetUrls({ ...configuration, shade }).thumbUrl;
  };

  const handleAddToCart = async () => {
    if (!currentAsset || !currentAsset.exists) {
      setStatusMessage('Combination not available');
      return;
    }
    if (!isShopifyHost) {
      setStatusMessage('Add to cart is disabled in preview mode.');
      return;
    }
    setIsAdding(true);
    setStatusMessage(null);
    const formatColorProperty = (id: string) => {
      const color = findColorById(id);
      return color ? JSON.stringify({ name: color.name, id: color.id, hex: color.hex, finish: color.finish }) : '';
    };
    const payload: { items: CartPayload[] } = {
      items: [
        {
          id: VARIANT_ID,
          quantity: 1,
          properties: {
            Base: configuration.base,
            Shade: configuration.shade,
            Camera: configuration.camera,
            State: configuration.state,
            LampColor: formatColorProperty(configuration.lampColor),
            BaseColor: formatColorProperty(configuration.baseColor),
            AdapterColor: formatColorProperty(configuration.adapterColor),
            GuardColor: formatColorProperty(configuration.guardColor),
            PreviewUrl: currentAsset.beautyUrl,
            ConfiguratorVersion: CONFIGURATOR_VERSION
          }
        }
      ]
    };

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Add to cart failed');
      }
      setStatusMessage('Toegevoegd aan winkelwagen');
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsAdding(false);
    }
  };

  const selectedColorId = configuration[COLOR_KEYS[colorTab]];
  const displayedUrl = useMemo(() => {
    if (!currentAsset) return undefined;
    switch (renderPass) {
      case 'ao':
        return currentAsset.aoUrl;
      case 'normal':
        return currentAsset.normalUrl;
      case 'emission':
        return currentAsset.emissionUrl ?? currentAsset.beautyUrl;
      case 'beauty':
      default:
        return currentAsset.beautyUrl;
    }
  }, [currentAsset, renderPass]);

  const onImageLoad = () => setIsLoadingImage(false);

  useEffect(() => {
    setIsLoadingImage(true);
  }, [displayedUrl]);

  return (
    <div>
      <div className="header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '-0.01em' }}>Product Configurator</h1>
          <p style={{ margin: '0.35rem 0 0 0', color: '#475569' }}>Snelle WebP previews en Shopify cart properties.</p>
        </div>
        <span className="badge">Version {CONFIGURATOR_VERSION}</span>
      </div>

      <div className="layout" style={{ padding: 0 }}>
        <div>
          <div className="section">
            <h3>Base</h3>
            <p>Kies een basis. Alleen combinaties met assets worden getoond.</p>
            <SelectorGrid<BaseKey>
              options={baseOptions}
              selected={configuration.base}
              onSelect={(base) => setConfiguration((prev) => coerceConfig(availability, { ...prev, base }))}
              thumbFor={baseThumbnail}
              labelFor={(base) => base.replace('base_', 'Base ')}
            />
          </div>

          <div className="section">
            <h3>Shade</h3>
            <p>Beschikbare kappen per gekozen base.</p>
            <SelectorGrid<ShadeKey>
              options={shadeOptions}
              selected={configuration.shade}
              onSelect={(shade) => setConfiguration((prev) => coerceConfig(availability, { ...prev, shade }))}
              thumbFor={shadeThumbnail}
              labelFor={(shade) => shade.replace('shade_', 'Shade ')}
            />
          </div>

          <div className="section">
            <div className="section-heading">
              <div>
                <h3>Colors</h3>
                <p>Kies kleuren per onderdeel. Filters en zoeken helpen je sneller kiezen.</p>
              </div>
              <SegmentedControl
                options={[
                  { value: 'lamp', label: 'Lamp' },
                  { value: 'base', label: 'Base' },
                  { value: 'adapter', label: 'Adapter' },
                  { value: 'guard', label: 'Guard' }
                ]}
                value={colorTab}
                onChange={(value) => setColorTab(value as ColorPart)}
              />
            </div>
            <ColorSwatchGrid
              colors={colorOptions[colorTab]}
              selected={selectedColorId}
              onSelect={(id) => handleColorSelect(colorTab, id)}
              onClear={() => handleColorClear(colorTab)}
              label={colorTab}
            />
          </div>

          <div className="section" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h3>Camera</h3>
              <SegmentedControl
                options={cameraOptions.map((cam) => ({ value: cam, label: cam }))}
                value={configuration.camera}
                onChange={(value) => setConfiguration((prev) => coerceConfig(availability, { ...prev, camera: value as CameraKey }))}
              />
            </div>
            <div>
              <h3>State</h3>
              <SegmentedControl
                options={['on', 'off'].map((state) => ({
                  value: state,
                  label: state.toUpperCase(),
                  disabled: !stateOptions.includes(state as StateKey)
                }))}
                value={configuration.state}
                onChange={(value) => setConfiguration((prev) => coerceConfig(availability, { ...prev, state: value as StateKey }))}
              />
            </div>
            <div>
              <h3>Pass</h3>
              <SegmentedControl
                options={[
                  { value: 'beauty', label: 'Beauty' },
                  { value: 'ao', label: 'AO' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'emission', label: 'Emission', disabled: configuration.state === 'off' }
                ]}
                value={renderPass}
                onChange={(value) => setRenderPass(value as RenderPass)}
              />
            </div>
          </div>

          <div className="section" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="button"
              onClick={handleAddToCart}
              disabled={isAdding || !currentAsset?.exists || !isShopifyHost}
            >
              {isAdding ? 'Toevoegen…' : 'Add to cart'}
            </button>
            {!isShopifyHost && (
              <span className="host-guard">Add to cart is uitgeschakeld buiten Shopify (preview mode).</span>
            )}
            {statusMessage && <span style={{ color: '#0f172a', fontWeight: 600 }}>{statusMessage}</span>}
            {availabilityMessage && <span style={{ color: '#b91c1c', fontWeight: 600 }}>{availabilityMessage}</span>}
          </div>
        </div>

        <div>
          <div className="preview-shell">
            {currentAsset?.exists && displayedUrl && (
              <img
                key={displayedUrl}
                src={displayedUrl}
                alt={`Preview ${configuration.base} ${configuration.shade}`}
                className="preview-image"
                style={{ opacity: isLoadingImage ? 0 : 1, transition: 'opacity 240ms ease' }}
                onLoad={onImageLoad}
              />
            )}
            {isLoadingImage && <div className="preview-skeleton" />}
            {!currentAsset?.exists && availabilityMessage && (
              <div className="preview-unavailable">{availabilityMessage}</div>
            )}
          </div>
          <p style={{ marginTop: '0.75rem', color: '#475569' }}>
            Assets worden resolved via vaste paden en geprobeerd met HEAD requests. UI toont alleen combinaties met een geldige
            beauty of thumbnail.
          </p>
        </div>
      </div>
    </div>
  );
}

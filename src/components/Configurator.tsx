import { useEffect, useMemo, useState } from 'react';
import {
  buildAvailabilityMap,
  buildStaticManifest,
  getAvailableBases,
  getAvailableCameras,
  getAvailableShades,
  getAvailableStates,
  pickFirstAvailableConfiguration,
  resolveAssetUrls
} from '../utils/assetResolver';
import { preloadAssetSet } from '../utils/preload';
import type { AssetAvailability, AvailabilityMap, BaseKey, CameraKey, Configuration, ShadeKey, StateKey } from '../types/configurator';
import { CONFIGURATOR_VERSION, DEFAULT_STATE, VARIANT_ID } from '../config';

interface CartPayload {
  id: string;
  quantity: number;
  properties: Record<string, string>;
}

function findAsset(map: AvailabilityMap, config: Configuration): AssetAvailability | undefined {
  return map.bases[config.base]?.shades?.[config.shade]?.[config.camera]?.states?.[config.state];
}

function coerceConfig(map: AvailabilityMap, current: Configuration): Configuration {
  const bases = getAvailableBases(map);
  const base = bases.includes(current.base) ? current.base : bases[0];
  const shades = base ? getAvailableShades(map, base) : [];
  const shade = shades.includes(current.shade) ? current.shade : shades[0];
  const cameras = base && shade ? getAvailableCameras(map, base, shade) : [];
  const camera = cameras.includes(current.camera) ? current.camera : cameras[0];
  const states = base && shade && camera ? getAvailableStates(map, base, shade, camera) : [];
  const state = states.includes(current.state) ? current.state : states[0] ?? DEFAULT_STATE;

  return {
    base: base ?? current.base,
    shade: shade ?? current.shade,
    camera: camera ?? current.camera,
    state: state ?? current.state
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
  const [currentAsset, setCurrentAsset] = useState<AssetAvailability | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    buildAvailabilityMap()
      .then((map) => {
        if (!active) return;
        const hasEntries = Object.keys(map.bases).length > 0;
        if (hasEntries) {
          setAvailability(map);
          setConfiguration((prev) => coerceConfig(map, prev));
        }
      })
      .catch(() => {
        /* Ignore and keep static manifest */
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextConfig = coerceConfig(availability, configuration);
    setConfiguration(nextConfig);
    const asset = findAsset(availability, nextConfig) ?? {
      ...resolveAssetUrls(nextConfig),
      exists: true
    };
    setCurrentAsset(asset);
    preloadAssetSet(asset);
    const shadeOptions = getAvailableShades(availability, nextConfig.base);
    const cameraOptions = getAvailableCameras(availability, nextConfig.base, nextConfig.shade);
    const nextThumbCandidates = [
      ...cameraOptions.map((camera) => resolveAssetUrls({ ...nextConfig, camera })),
      ...shadeOptions.map((shade) => resolveAssetUrls({ ...nextConfig, shade }))
    ];
    nextThumbCandidates.forEach(preloadAssetSet);
  }, [availability, configuration]);

  const baseOptions = useMemo(() => getAvailableBases(availability), [availability]);
  const shadeOptions = useMemo(() => getAvailableShades(availability, configuration.base), [availability, configuration.base]);
  const cameraOptions = useMemo(
    () => getAvailableCameras(availability, configuration.base, configuration.shade),
    [availability, configuration.base, configuration.shade]
  );
  const stateOptions = useMemo(
    () => getAvailableStates(availability, configuration.base, configuration.shade, configuration.camera),
    [availability, configuration.base, configuration.shade, configuration.camera]
  );

  const baseThumbnail = (base: BaseKey) => {
    const shades = availability.bases[base]?.shades ?? {};
    const firstShade = (Object.keys(shades) as ShadeKey[])[0];
    const firstCamera = firstShade ? (Object.keys(shades[firstShade] ?? {}) as CameraKey[])[0] : undefined;
    if (!firstShade || !firstCamera) return undefined;
    const states = availability.bases[base]?.shades?.[firstShade]?.[firstCamera]?.states ?? {};
    const firstState = (Object.keys(states) as StateKey[]).find((state) => states[state]);
    const asset = firstState ? states[firstState] : undefined;
    const fallbackState = firstState ?? DEFAULT_STATE;
    return asset?.thumbUrl ?? resolveAssetUrls({ base, shade: firstShade, camera: firstCamera, state: fallbackState }).thumbUrl;
  };

  const shadeThumbnail = (shade: ShadeKey) => {
    const cameras = availability.bases[configuration.base]?.shades?.[shade] ?? {};
    const firstCamera = (Object.keys(cameras) as CameraKey[])[0];
    if (!firstCamera) return undefined;
    const states = availability.bases[configuration.base]?.shades?.[shade]?.[firstCamera]?.states ?? {};
    const firstState = (Object.keys(states) as StateKey[]).find((state) => states[state]);
    const asset = firstState ? states[firstState] : undefined;
    const fallbackState = firstState ?? DEFAULT_STATE;
    return asset?.thumbUrl ?? resolveAssetUrls({ base: configuration.base, shade, camera: firstCamera, state: fallbackState }).thumbUrl;
  };

  const handleAddToCart = async () => {
    if (!currentAsset) return;
    setIsAdding(true);
    setStatusMessage(null);
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

  const onImageLoad = () => setIsLoadingImage(false);

  useEffect(() => {
    setIsLoadingImage(true);
  }, [currentAsset?.beautyUrl]);

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
          </div>

          <div className="section" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="button" onClick={handleAddToCart} disabled={isAdding || !currentAsset}>
              {isAdding ? 'Toevoegen…' : 'Add to cart'}
            </button>
            {statusMessage && <span style={{ color: '#0f172a', fontWeight: 600 }}>{statusMessage}</span>}
          </div>
        </div>

        <div>
          <div className="preview-shell">
            {currentAsset && (
              <img
                key={currentAsset.beautyUrl}
                src={currentAsset.beautyUrl}
                alt={`Preview ${configuration.base} ${configuration.shade}`}
                className="preview-image"
                style={{ opacity: isLoadingImage ? 0 : 1, transition: 'opacity 240ms ease' }}
                onLoad={onImageLoad}
              />
            )}
            {isLoadingImage && <div className="preview-skeleton" />}
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

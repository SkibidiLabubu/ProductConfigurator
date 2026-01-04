import { useEffect, useMemo, useState } from 'react';
import ColorSwatchGrid from './ColorSwatchGrid';
import {
  buildAvailabilityMap,
  buildStaticManifest,
  getAvailableBases,
  getAvailableCameras,
  getAvailableShades,
  getAvailableStates,
  pickFirstAvailableConfiguration,
  probeAvailability,
  resolveAssetUrls
} from '../utils/assetResolver';
import { colorsForPart, findColorById, normalizeColorSelection } from '../colors';
import { preloadAssetSet } from '../utils/preload';
import { compositeProduct, revokeObjectUrl } from '../utils/compositor';
import type {
  AssetAvailability,
  AvailabilityMap,
  BaseKey,
  CameraKey,
  ColorPart,
  Configuration,
  ExpectedAssetFile,
  ShadeKey,
  StateKey
} from '../types/configurator';
import { CONFIGURATOR_VERSION, DEFAULT_STATE, VARIANT_ID } from '../config';

const EMPTY_STATE_MAP: Record<StateKey, AssetAvailability | undefined> = { on: undefined, off: undefined };
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

function formatExpectedFile(file: ExpectedAssetFile) {
  const alternatives = file.alternatives?.length ? ` (or ${file.alternatives.join(', ')})` : '';
  return `${file.path}${alternatives}`;
}

function DebugPanel({ probes }: { probes?: AssetAvailability['probes'] }) {
  if (!probes?.length) return null;

  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: '0.75rem',
        border: '1px dashed #cbd5e1',
        borderRadius: 8,
        background: '#f8fafc'
      }}
    >
      <details open>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0f172a' }}>Asset diagnostics</summary>
        <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.35rem' }}>
          {probes.map((probe) => (
            <div key={probe.asset} style={{ padding: '0.4rem', borderRadius: 6, background: '#e2e8f0' }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{probe.asset}</div>
              <div style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                Expected: <code>{formatExpectedFile(probe.expected)}</code>
              </div>
              <ul style={{ margin: '0.35rem 0 0 0.75rem', padding: 0, listStyle: 'disc' }}>
                {probe.attempts.map((attempt, index) => (
                  <li key={`${probe.asset}-${index}`} style={{ color: '#0f172a', fontSize: '0.85rem' }}>
                    <code>{attempt.url}</code> —{' '}
                    {attempt.ok
                      ? 'ok'
                      : attempt.status === 404
                      ? '404'
                      : typeof attempt.status === 'number'
                      ? `status ${attempt.status}`
                      : 'unreachable'}
                    {attempt.fromFrameSuffix ? ' (frame suffix)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
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
  const [currentAsset, setCurrentAsset] = useState<AssetAvailability | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
    setIsLoadingImage(true);
    (async () => {
      const availabilityForSelection = await probeAvailability(nextConfig);
      if (cancelled) return;
      const missingAssets = availabilityForSelection.missingFiles ?? [];
      const frameOnlyAssets = availabilityForSelection.frameOnlyFiles ?? [];
      const messageParts = [] as string[];
      if (!availabilityForSelection.exists) {
        messageParts.push('Missing render assets for this combination');
      }
      if (frameOnlyAssets.length) {
        messageParts.push('Frame-suffixed files were found; exports should be unsuffixed');
      }
      if (missingAssets.length) {
        messageParts.push(`Expected: ${missingAssets.map((file) => formatExpectedFile(file)).join(', ')}`);
      }
      setCurrentAsset(availabilityForSelection);
      setAvailabilityMessage(messageParts.length ? messageParts.join(' — ') : null);
      if (!availabilityForSelection.exists) {
        setPreviewUrl((prev) => {
          revokeObjectUrl(prev);
          return null;
        });
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

  useEffect(() => {
    let cancelled = false;
    if (!currentAsset?.exists) {
      setPreviewUrl((prev) => {
        revokeObjectUrl(prev);
        return null;
      });
      setIsLoadingImage(false);
      return undefined;
    }

    const baseColor = findColorById(configuration.baseColor);
    const shadeColor = findColorById(configuration.lampColor);
    const adapterColor = findColorById(configuration.adapterColor);
    const guardColor = findColorById(configuration.guardColor);

    setIsLoadingImage(true);
    (async () => {
      try {
        const url = await compositeProduct({
          assets: currentAsset,
          colors: {
            base: baseColor,
            shade: shadeColor,
            adapter: adapterColor,
            guard: guardColor
          }
        });
        if (cancelled) {
          revokeObjectUrl(url);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev && prev !== url) revokeObjectUrl(prev);
          return url;
        });
      } catch (error) {
        console.error('Failed to create preview image', error);
        setPreviewUrl((prev) => {
          revokeObjectUrl(prev);
          return currentAsset?.thumbUrl ?? currentAsset?.beautyUrl ?? currentAsset?.beautyFgUrl ?? null;
        });
      } finally {
        setIsLoadingImage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAsset, configuration.baseColor, configuration.lampColor, configuration.adapterColor, configuration.guardColor]);

  const handleColorSelect = (part: ColorPart, id: string) => {
    setConfiguration((prev) => coerceConfig(availability, { ...prev, [COLOR_KEYS[part]]: id } as Configuration));
  };

  const handleColorClear = (part: ColorPart) => {
    setConfiguration((prev) =>
      coerceConfig(availability, { ...prev, [COLOR_KEYS[part]]: normalizeColorSelection('', part) } as Configuration)
    );
  };

  const baseThumbnail = (base: BaseKey) => {
    const shades = availability.bases[base]?.shades ?? {};
    const firstShade = (Object.keys(shades) as ShadeKey[])[0];
    const firstCamera = firstShade ? (Object.keys(shades[firstShade] ?? {}) as CameraKey[])[0] : undefined;
    if (!firstShade || !firstCamera) return undefined;
    const states = availability.bases[base]?.shades?.[firstShade]?.[firstCamera]?.states ?? EMPTY_STATE_MAP;
    const firstState = (Object.keys(states) as StateKey[]).find((state) => states[state]);
    const asset = firstState ? states[firstState] : undefined;
    const fallbackState = firstState ?? DEFAULT_STATE;
    return (
      asset?.thumbUrl ??
      resolveAssetUrls({ ...configuration, base, shade: firstShade, camera: firstCamera, state: fallbackState }).thumbUrl
    );
  };

  const shadeThumbnail = (shade: ShadeKey) => {
    const cameras = availability.bases[configuration.base]?.shades?.[shade] ?? {};
    const firstCamera = (Object.keys(cameras) as CameraKey[])[0];
    if (!firstCamera) return undefined;
    const states = availability.bases[configuration.base]?.shades?.[shade]?.[firstCamera]?.states ?? EMPTY_STATE_MAP;
    const firstState = (Object.keys(states) as StateKey[]).find((state) => states[state]);
    const asset = firstState ? states[firstState] : undefined;
    const fallbackState = firstState ?? DEFAULT_STATE;
    return (
      asset?.thumbUrl ??
      resolveAssetUrls({ ...configuration, shade, camera: firstCamera, state: fallbackState }).thumbUrl
    );
  };

  const handleAddToCart = async () => {
    if (!currentAsset) return;
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
    const previewAssetUrl = currentAsset?.beautyUrl ?? currentAsset?.beautyFgUrl ?? currentAsset?.thumbUrl ?? '';
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
            ShadeColor: formatColorProperty(configuration.lampColor),
            BaseColor: formatColorProperty(configuration.baseColor),
            AdapterColor: formatColorProperty(configuration.adapterColor),
            GuardColor: formatColorProperty(configuration.guardColor),
            PreviewUrl: previewAssetUrl,
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
  const missingFiles = currentAsset?.missingFiles ?? [];
  const frameOnlyFiles = currentAsset?.frameOnlyFiles ?? [];

  const onImageLoad = () => setIsLoadingImage(false);

  useEffect(() => {
    setIsLoadingImage(true);
  }, [previewUrl]);

  useEffect(() => () => revokeObjectUrl(previewUrl), [previewUrl]);

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
                  { value: 'lamp', label: 'Shade' },
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
          </div>

          <div className="section" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="button" onClick={handleAddToCart} disabled={isAdding || !currentAsset || !isShopifyHost}>
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
            {currentAsset?.exists && previewUrl && (
              <img
                key={previewUrl}
                src={previewUrl}
                alt={`Preview ${configuration.base} ${configuration.shade}`}
                className="preview-image"
                style={{ opacity: isLoadingImage ? 0 : 1, transition: 'opacity 240ms ease' }}
                onLoad={onImageLoad}
              />
            )}
            {isLoadingImage && <div className="preview-skeleton" />}
            {!currentAsset?.exists && (
              <div className="preview-unavailable" style={{ textAlign: 'left' }}>
                <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>
                  Missing render assets for this combination.
                </p>
                {availabilityMessage && <p style={{ margin: 0, color: '#b91c1c' }}>{availabilityMessage}</p>}
                {!!missingFiles.length && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>Expected filenames:</div>
                    <ul style={{ margin: '0.35rem 0 0 1.1rem', padding: 0 }}>
                      {missingFiles.map((file) => (
                        <li key={file.path} style={{ fontSize: '0.9rem' }}>
                          <code>{formatExpectedFile(file)}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!frameOnlyFiles.length && (
                  <p style={{ marginTop: '0.5rem', color: '#b91c1c' }}>
                    Frame-suffixed files were detected. Please export unsuffixed versions for deployment.
                  </p>
                )}
              </div>
            )}
          </div>
          {!currentAsset?.exists && <DebugPanel probes={currentAsset?.probes} />}
          <p style={{ marginTop: '0.75rem', color: '#475569' }}>
            Assets worden resolved via vaste paden en geprobeerd met HEAD requests. UI toont alleen combinaties met een geldige
            beauty of thumbnail.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { ColorId, ColorOption } from '../types/configurator';

interface Props {
  colors: ColorOption[];
  selected: ColorId;
  onSelect: (id: ColorId) => void;
  onClear: () => void;
  label: string;
}

export default function ColorSwatchGrid({ colors, selected, onSelect, onClear, label }: Props) {
  const finishes = useMemo(() => Array.from(new Set(colors.map((color) => color.finish))), [colors]);
  const [finishFilter, setFinishFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return colors.filter((color) => {
      const matchesFinish = finishFilter === 'all' || color.finish === finishFilter;
      const matchesQuery = color.name.toLowerCase().includes(query.trim().toLowerCase());
      return matchesFinish && matchesQuery;
    });
  }, [colors, finishFilter, query]);

  return (
    <div className="color-grid-shell">
      <div className="color-grid-toolbar">
        <div className="control-group">
          <label className="control-label" htmlFor={`${label}-search`}>
            Search {label}
          </label>
          <input
            id={`${label}-search`}
            type="text"
            placeholder="Search colors"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="control-group">
          <label className="control-label" htmlFor={`${label}-finish`}>
            Finish
          </label>
          <select
            id={`${label}-finish`}
            value={finishFilter}
            onChange={(event) => setFinishFilter(event.target.value)}
          >
            <option value="all">All</option>
            {finishes.map((finish) => (
              <option key={finish} value={finish}>
                {finish}
              </option>
            ))}
          </select>
        </div>
        <button className="button secondary" type="button" onClick={onClear} disabled={!selected}>
          Clear
        </button>
      </div>

      <div className="color-grid" role="list">
        {filtered.map((color) => {
          const isSelected = color.id === selected;
          return (
            <button
              key={color.id}
              type="button"
              role="listitem"
              aria-pressed={isSelected}
              className={`color-swatch ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(color.id)}
              title={`${color.name} (${color.finish})`}
            >
              <span className="color-swatch-chip" style={{ backgroundColor: color.hex }}>
                <span className="color-swatch-check" aria-hidden={!isSelected}>
                  ✓
                </span>
              </span>
              <span className="color-swatch-meta">
                <span className="color-name">{color.name}</span>
                <span className="color-finish">{color.finish}</span>
              </span>
            </button>
          );
        })}
        {!filtered.length && <div className="empty-note">No colors match these filters.</div>}
      </div>
    </div>
  );
}

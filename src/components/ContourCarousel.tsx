import { useMemo, useState } from 'react';

export type ContourItem = {
  id: string;
  name: string;
};

function getWindow<T>(items: T[], activeIndex: number, windowSize = 2) {
  if (items.length <= windowSize * 2 + 1) return items;
  const start = Math.max(0, activeIndex - windowSize);
  const end = Math.min(items.length, activeIndex + windowSize + 1);
  if (start === 0) return items.slice(0, windowSize * 2 + 1);
  if (end === items.length) return items.slice(items.length - (windowSize * 2 + 1));
  return items.slice(start, end);
}

export default function ContourCarousel({
  items,
  activeId,
  onSelect,
  label
}: {
  items: ContourItem[];
  activeId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const visibleItems = useMemo(() => {
    if (isExpanded) return items;
    return getWindow(items, activeIndex >= 0 ? activeIndex : 0, 2);
  }, [items, activeIndex, isExpanded]);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < items.length - 1;

  const handlePrev = () => {
    if (!canGoPrev) return;
    onSelect(items[activeIndex - 1].id);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    onSelect(items[activeIndex + 1].id);
  };

  return (
    <div className={`contour-carousel ${isExpanded ? 'expanded' : ''}`} aria-label={label}>
      <div className="contour-carousel-row">
        <button
          className="contour-carousel-arrow"
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          aria-label={`Previous ${label}`}
        >
          ◀
        </button>
        <div className={`contour-carousel-items ${isExpanded ? 'expanded' : 'collapsed'}`}>
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`contour-carousel-item ${item.id === activeId ? 'active' : ''}`}
              onClick={() => {
                onSelect(item.id);
                setIsExpanded(false);
              }}
            >
              <span className="contour-carousel-thumb" aria-hidden="true">
                {item.name}
              </span>
            </button>
          ))}
        </div>
        <button
          className="contour-carousel-arrow"
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label={`Next ${label}`}
        >
          ▶
        </button>
        <button
          className="contour-carousel-toggle"
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? 'Close' : 'All'}
        </button>
      </div>
      {isExpanded && (
        <div className="contour-carousel-grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`contour-carousel-item ${item.id === activeId ? 'active' : ''}`}
              onClick={() => {
                onSelect(item.id);
                setIsExpanded(false);
              }}
            >
              <span className="contour-carousel-thumb" aria-hidden="true">
                {item.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const cache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string): HTMLImageElement | null {
  if (cache.has(src)) {
    const img = cache.get(src)!;
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  const img = new Image();
  img.src = src;
  cache.set(src, img);
  return null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  if (cache.has(src)) {
    const img = cache.get(src)!;
    if (img.complete && img.naturalWidth > 0) return Promise.resolve(img);
    return new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
    });
  }
  const img = new Image();
  cache.set(src, img);
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

import { useMemo, useState } from "react";
import {
  buildCloudinaryProductImageUrl,
  buildCloudinaryProductPlaceholderUrl,
} from "../../utils/imageOptimization";

const DEFAULT_PRODUCT_IMAGE =
  "https://placehold.co/800x600/e2e8f0/334155?text=CampusKart";

function toDimension(value, fallbackValue) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallbackValue;
  }
  return Math.round(number);
}

function OptimizedProductImage({
  src,
  alt,
  width = 800,
  height = 600,
  className = "",
  imgClassName = "",
  sizes,
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
}) {
  const safeSrc = src || DEFAULT_PRODUCT_IMAGE;
  const targetWidth = toDimension(width, 800);
  const targetHeight = toDimension(height, 600);

  const optimizedSrc = useMemo(
    () =>
      buildCloudinaryProductImageUrl(safeSrc, {
        width: targetWidth,
        height: targetHeight,
        quality: "auto",
        format: "webp",
      }),
    [safeSrc, targetWidth, targetHeight],
  );

  const placeholderSrc = useMemo(
    () =>
      buildCloudinaryProductPlaceholderUrl(
        safeSrc,
        Math.max(24, Math.round(targetWidth / 10)),
        Math.max(24, Math.round(targetHeight / 10)),
      ),
    [safeSrc, targetWidth, targetHeight],
  );

  const hasProgressivePlaceholder =
    placeholderSrc && placeholderSrc !== optimizedSrc;

  const [loadedSource, setLoadedSource] = useState("");
  const [fallbackLevelBySource, setFallbackLevelBySource] = useState({});

  const fallbackLevel = fallbackLevelBySource[optimizedSrc] || 0;
  const resolvedSrc =
    fallbackLevel === 0
      ? optimizedSrc
      : fallbackLevel === 1
        ? safeSrc
        : DEFAULT_PRODUCT_IMAGE;

  const isLoaded =
    !hasProgressivePlaceholder || loadedSource === resolvedSrc || fallbackLevel >= 2;

  const handleError = () => {
    setFallbackLevelBySource((current) => {
      const nextLevel = Math.min((current[optimizedSrc] || 0) + 1, 2);
      return {
        ...current,
        [optimizedSrc]: nextLevel,
      };
    });
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {hasProgressivePlaceholder && !isLoaded ? (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full scale-105 object-cover blur-xl transition-opacity duration-300 ${imgClassName}`}
        />
      ) : null}

      <img
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchpriority={fetchPriority}
        sizes={sizes}
        onLoad={() => setLoadedSource(resolvedSrc)}
        onError={handleError}
        className={`${imgClassName} transition-opacity duration-500 ${hasProgressivePlaceholder ? (isLoaded ? "opacity-100" : "opacity-0") : "opacity-100"}`}
      />
    </div>
  );
}

export default OptimizedProductImage;

const CLOUDINARY_UPLOAD_SEGMENT = "/upload/";

function hasCloudinaryUploadSegment(url) {
  return (
    typeof url === "string" &&
    url.includes("res.cloudinary.com") &&
    url.includes(CLOUDINARY_UPLOAD_SEGMENT)
  );
}

function insertCloudinaryTransformation(url, transformation) {
  if (!hasCloudinaryUploadSegment(url) || !transformation) {
    return url;
  }

  return url.replace(
    CLOUDINARY_UPLOAD_SEGMENT,
    `${CLOUDINARY_UPLOAD_SEGMENT}${transformation}/`,
  );
}

export function buildCloudinaryProductImageUrl(
  url,
  {
    width,
    height,
    quality = "auto",
    format = "webp",
    crop = "fill",
    effect,
  } = {},
) {
  if (!hasCloudinaryUploadSegment(url)) {
    return url;
  }

  const transforms = [];
  if (format) {
    transforms.push(`f_${format}`);
  }
  if (quality) {
    transforms.push(`q_${quality}`);
  }
  if (width) {
    transforms.push(`w_${Math.max(1, Math.round(Number(width)))}`);
  }
  if (height) {
    transforms.push(`h_${Math.max(1, Math.round(Number(height)))}`);
  }
  if (width || height) {
    transforms.push(`c_${crop}`);
  }
  if (effect) {
    transforms.push(`e_${effect}`);
  }

  return insertCloudinaryTransformation(url, transforms.join(","));
}

export function buildCloudinaryProductPlaceholderUrl(url, width, height) {
  return buildCloudinaryProductImageUrl(url, {
    width,
    height,
    quality: 1,
    format: "webp",
    crop: "fill",
    effect: "blur:1000",
  });
}

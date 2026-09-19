/**
 * OpenCV.js Image Quality Validation and Conservative Preprocessing Engine.
 *
 * Implements:
 * 1. Asynchronous on-demand loading of browser-compatible OpenCV.js (WebAssembly/JS) with resilient fallback
 * 2. Laplacian-variance sharpness / blur detection
 * 3. Luminance / brightness detection (too dark, too bright)
 * 4. Contrast measurement (standard deviation of gray intensity)
 * 5. Conservative mild unsharp-mask sharpening / noise reduction (craft-safe, preserving embroidery, textures, paintings)
 * 6. High-resolution scaling to a processing copy without altering or destroying the original capture
 * 7. Comprehensive resource cleanup (mat.delete() calls) to prevent mobile memory leaks
 */

// Global window declaration for OpenCV.js
declare global {
  interface Window {
    cv?: any;
    Module?: any;
  }
}

/**
 * Single source of truth configuration thresholds for calibration with real artisan craft images.
 */
export const OPENCV_QUALITY_CONFIG = {
  // Laplacian variance threshold for sharpness (lower values = blurry)
  SHARPNESS_BLURRY_THRESHOLD: 45.0,

  // Mean luminance threshold (0 - 255)
  BRIGHTNESS_TOO_DARK_THRESHOLD: 40.0,
  BRIGHTNESS_TOO_BRIGHT_THRESHOLD: 225.0,

  // Contrast threshold (standard deviation of grayscale values)
  CONTRAST_LOW_THRESHOLD: 24.0,

  // Maximum dimension for the OpenCV processing copy (preserves full original separate)
  MAX_PROCESS_DIMENSION: 1600,

  // CDN endpoints for browser OpenCV.js
  OPENCV_CDN_URLS: [
    "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.1/dist/opencv.js",
    "https://docs.opencv.org/4.8.0/opencv.js",
  ],
} as const;

export interface ImageQualityResult {
  sharpness: number;
  brightness: number;
  contrast: number;
  isBlurry: boolean;
  isTooDark: boolean;
  isTooBright: boolean;
  isLowContrast: boolean;
  qualityPassed: boolean;
  warnings: string[];
}

export interface ProcessedCaptureOutput {
  originalImage: string; // The untouched, preserved raw capture
  processedImage: string; // Quality-validated & conservatively preprocessed copy
  quality: ImageQualityResult;
  usedOpenCV: boolean;
}

let openCvLoadPromise: Promise<boolean> | null = null;

/**
 * Loads OpenCV.js asynchronously into the browser environment.
 * If loading fails or times out, returns false without throwing to ensure non-blocking fallback.
 */
export function loadOpenCV(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  if (window.cv && window.cv.Mat) {
    return Promise.resolve(true);
  }

  if (openCvLoadPromise) {
    return openCvLoadPromise;
  }

  openCvLoadPromise = new Promise<boolean>((resolve) => {
    let settled = false;

    // Timeout safety for poor mobile connections: don't block artisan scanning
    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn("[OpenCV] Loading timed out, falling back gracefully to native pipeline.");
        resolve(false);
      }
    }, 8000);

    const tryLoadFromUrls = async (urls: readonly string[]): Promise<boolean> => {
      for (const url of urls) {
        try {
          const success = await new Promise<boolean>((res) => {
            // Check again if already available
            if (window.cv && window.cv.Mat) {
              res(true);
              return;
            }

            const script = document.createElement("script");
            script.src = url;
            script.async = true;
            script.crossOrigin = "anonymous";

            window.Module = {
              onRuntimeInitialized: () => {
                res(true);
              },
            };

            script.onload = () => {
              // Some builds initialize immediately or via onRuntimeInitialized
              if (window.cv && window.cv.Mat) {
                res(true);
              }
            };

            script.onerror = () => {
              console.warn(`[OpenCV] Failed loading from ${url}`);
              res(false);
            };

            document.head.appendChild(script);
          });

          if (success) return true;
        } catch {
          // Continue to next mirror
        }
      }
      return false;
    };

    tryLoadFromUrls(OPENCV_QUALITY_CONFIG.OPENCV_CDN_URLS)
      .then((loaded) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          if (loaded && window.cv && window.cv.Mat) {
            console.info("[OpenCV.js] Engine successfully initialized.");
            resolve(true);
          } else {
            console.warn("[OpenCV.js] Unavailable on client device; native fallback will be used.");
            resolve(false);
          }
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          console.warn("[OpenCV.js] Initialization error:", err);
          resolve(false);
        }
      });
  });

  return openCvLoadPromise;
}

/**
 * Helper to load HTMLImageElement from base64 data URL
 */
function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Calculates Laplacian variance for sharpness/blur detection.
 * High variance = sharp edges; Low variance = blurry image.
 */
function computeLaplacianVariance(cv: any, grayMat: any): number {
  const laplacianMat = new cv.Mat();
  const meanMat = new cv.Mat();
  const stddevMat = new cv.Mat();

  try {
    // Compute second derivatives using Laplacian operator with standard CV_64F depth
    cv.Laplacian(grayMat, laplacianMat, cv.CV_64F);
    cv.meanStdDev(laplacianMat, meanMat, stddevMat);

    const stddev = stddevMat.doubleAt(0, 0);
    const variance = stddev * stddev;
    return Number.isFinite(variance) ? Math.round(variance * 10) / 10 : 0;
  } finally {
    laplacianMat.delete();
    meanMat.delete();
    stddevMat.delete();
  }
}

/**
 * Calculates mean brightness and contrast (standard deviation).
 */
function computeLuminanceStats(cv: any, grayMat: any): { brightness: number; contrast: number } {
  const meanMat = new cv.Mat();
  const stddevMat = new cv.Mat();

  try {
    cv.meanStdDev(grayMat, meanMat, stddevMat);
    const brightness = Math.round(meanMat.doubleAt(0, 0) * 10) / 10;
    const contrast = Math.round(stddevMat.doubleAt(0, 0) * 10) / 10;
    return { brightness, contrast };
  } finally {
    meanMat.delete();
    stddevMat.delete();
  }
}

/**
 * Conservative mild sharpening & light noise reduction:
 * Preserves intricate artisan craft textures (embroidery, weave, jewellery, pottery carvings)
 * by applying an unsharp-mask with very gentle blend weight (alpha ~ 1.08, beta ~ -0.08).
 */
function applyConservativeEnhancement(cv: any, srcMat: any): any {
  const blurred = new cv.Mat();
  const sharpened = new cv.Mat();
  try {
    // 3x3 gentle Gaussian blur to establish baseline spatial frequency
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(srcMat, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

    // Unsharp mask: src * 1.1 - blurred * 0.1 (extremely conservative, non-destructive to craft motifs)
    cv.addWeighted(srcMat, 1.1, blurred, -0.1, 0, sharpened);
    return sharpened;
  } catch (err) {
    console.warn("[OpenCV] Conservative enhancement fallback:", err);
    sharpened.delete();
    return srcMat.clone();
  } finally {
    blurred.delete();
  }
}

/**
 * Fallback browser canvas implementation for quality metrics when OpenCV is not loaded.
 * Ensures the app never breaks on offline, unsupported, or restricted mobile devices.
 */
function evaluateCanvasQualityFallback(img: HTMLImageElement): { quality: ImageQualityResult; copyDataUrl: string } {
  const canvas = document.createElement("canvas");
  const maxDim = OPENCV_QUALITY_CONFIG.MAX_PROCESS_DIMENSION;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;

  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return {
      quality: {
        sharpness: 60,
        brightness: 128,
        contrast: 50,
        isBlurry: false,
        isTooDark: false,
        isTooBright: false,
        isLowContrast: false,
        qualityPassed: true,
        warnings: [],
      },
      copyDataUrl: img.src,
    };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let totalLuma = 0;
  const sampleStep = Math.max(1, Math.floor((w * h) / 10000));
  let sampleCount = 0;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    totalLuma += luma;
    sampleCount++;
  }

  const brightness = sampleCount > 0 ? Math.round((totalLuma / sampleCount) * 10) / 10 : 128;

  let varianceSum = 0;
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    varianceSum += (luma - brightness) ** 2;
  }
  const contrast = sampleCount > 0 ? Math.round(Math.sqrt(varianceSum / sampleCount) * 10) / 10 : 45;

  const isTooDark = brightness < OPENCV_QUALITY_CONFIG.BRIGHTNESS_TOO_DARK_THRESHOLD;
  const isTooBright = brightness > OPENCV_QUALITY_CONFIG.BRIGHTNESS_TOO_BRIGHT_THRESHOLD;
  const isLowContrast = contrast < OPENCV_QUALITY_CONFIG.CONTRAST_LOW_THRESHOLD;

  const warnings: string[] = [];
  if (isTooDark) warnings.push("Image is too dark. Please move to a brighter area.");
  if (isTooBright) warnings.push("Image is overexposed. Please reduce direct glare and capture again.");
  if (isLowContrast) warnings.push("Lighting has low contrast. Try capturing near natural light.");

  return {
    quality: {
      sharpness: 55, // safe nominal for fallback
      brightness,
      contrast,
      isBlurry: false,
      isTooDark,
      isTooBright,
      isLowContrast,
      qualityPassed: !isTooDark && !isTooBright,
      warnings,
    },
    copyDataUrl: canvas.toDataURL("image/jpeg", 0.94),
  };
}

/**
 * Main Product Scanning OpenCV Image Processing Pipeline.
 *
 * CRITICAL INVARIANT: The original captured image is NEVER mutated or destroyed.
 * OpenCV runs exclusively on an allocated processing copy.
 */
export async function processCapturedImageWithOpenCV(capturedImageBase64: string): Promise<ProcessedCaptureOutput> {
  // 1. Preserve original capture immutably
  const originalImage = capturedImageBase64;

  let imgElement: HTMLImageElement;
  try {
    imgElement = await createImage(capturedImageBase64);
  } catch (err) {
    console.error("[OpenCV Pipeline] Error reading captured image:", err);
    return {
      originalImage,
      processedImage: originalImage,
      quality: {
        sharpness: 50,
        brightness: 120,
        contrast: 40,
        isBlurry: false,
        isTooDark: false,
        isTooBright: false,
        isLowContrast: false,
        qualityPassed: true,
        warnings: [],
      },
      usedOpenCV: false,
    };
  }

  // 2. Check if OpenCV.js is ready
  const isOpenCvAvailable = window.cv && window.cv.Mat && typeof window.cv.imread === "function";

  if (!isOpenCvAvailable) {
    // Perform browser-native quality metrics and downscale copy
    const fallback = evaluateCanvasQualityFallback(imgElement);
    return {
      originalImage,
      processedImage: fallback.copyDataUrl,
      quality: fallback.quality,
      usedOpenCV: false,
    };
  }

  const cv = window.cv;

  // 3. Create a detached offscreen canvas copy for OpenCV processing
  const maxDim = OPENCV_QUALITY_CONFIG.MAX_PROCESS_DIMENSION;
  let targetW = imgElement.naturalWidth || imgElement.width;
  let targetH = imgElement.naturalHeight || imgElement.height;

  if (targetW > maxDim || targetH > maxDim) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDim) / targetW);
      targetW = maxDim;
    } else {
      targetW = Math.round((targetW * maxDim) / targetH);
      targetH = maxDim;
    }
  }

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = targetW;
  offscreenCanvas.height = targetH;
  const ctx = offscreenCanvas.getContext("2d");
  if (!ctx) {
    const fallback = evaluateCanvasQualityFallback(imgElement);
    return {
      originalImage,
      processedImage: fallback.copyDataUrl,
      quality: fallback.quality,
      usedOpenCV: false,
    };
  }

  ctx.drawImage(imgElement, 0, 0, targetW, targetH);

  let srcMat: any = null;
  let grayMat: any = null;
  let enhancedMat: any = null;

  try {
    // Read the separate canvas copy into OpenCV Mat
    srcMat = cv.imread(offscreenCanvas);
    grayMat = new cv.Mat();

    // Convert to grayscale for sharpness, brightness, and contrast measurements
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

    // 4. Measure Quality Metrics
    const sharpness = computeLaplacianVariance(cv, grayMat);
    const { brightness, contrast } = computeLuminanceStats(cv, grayMat);

    const isBlurry = sharpness < OPENCV_QUALITY_CONFIG.SHARPNESS_BLURRY_THRESHOLD;
    const isTooDark = brightness < OPENCV_QUALITY_CONFIG.BRIGHTNESS_TOO_DARK_THRESHOLD;
    const isTooBright = brightness > OPENCV_QUALITY_CONFIG.BRIGHTNESS_TOO_BRIGHT_THRESHOLD;
    const isLowContrast = contrast < OPENCV_QUALITY_CONFIG.CONTRAST_LOW_THRESHOLD;

    const warnings: string[] = [];
    if (isBlurry) {
      warnings.push("Image is blurry. Please hold the phone steady and capture again.");
    }
    if (isTooDark) {
      warnings.push("Image is too dark. Please move to a brighter area.");
    }
    if (isTooBright) {
      warnings.push("Image is overexposed. Please reduce direct glare and capture again.");
    }
    if (isLowContrast) {
      warnings.push("Image has low contrast. Try capturing near natural light.");
    }

    // Determine quality pass (fails on severe blur, extreme darkness, or heavy glare)
    const qualityPassed = !isBlurry && !isTooDark && !isTooBright;

    // 5. Conservative preprocessing: apply craft-safe mild unsharp-mask enhancement
    enhancedMat = applyConservativeEnhancement(cv, srcMat);

    // Render processed copy back to offscreen canvas
    cv.imshow(offscreenCanvas, enhancedMat);
    const processedImage = offscreenCanvas.toDataURL("image/jpeg", 0.94);

    return {
      originalImage,
      processedImage,
      quality: {
        sharpness,
        brightness,
        contrast,
        isBlurry,
        isTooDark,
        isTooBright,
        isLowContrast,
        qualityPassed,
        warnings,
      },
      usedOpenCV: true,
    };
  } catch (err) {
    console.error("[OpenCV Processing] Error during image quality pipeline:", err);
    // On unexpected OpenCV matrix error, fallback safely without modifying the image
    const fallback = evaluateCanvasQualityFallback(imgElement);
    return {
      originalImage,
      processedImage: fallback.copyDataUrl,
      quality: fallback.quality,
      usedOpenCV: false,
    };
  } finally {
    // 6. Strict memory cleanup: release all OpenCV Mat allocations to prevent memory leaks on mobile
    if (srcMat) srcMat.delete();
    if (grayMat) grayMat.delete();
    if (enhancedMat) enhancedMat.delete();
  }
}

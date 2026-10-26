/**
 * Client-side Image Compression and Size Validation Utility
 *
 * Compresses large camera/desktop photos down to optimized WebP/JPEG format
 * before uploading to prevent Nginx "413 Request Entity Too Large" errors
 * and dramatically speed up upload times.
 */

export interface CompressionOptions {
  /** Maximum width or height in pixels. Default: 1200 */
  maxDimension?: number
  /** Initial compression quality (0.0 to 1.0). Default: 0.82 */
  quality?: number
  /** Target maximum bytes (e.g. 600KB to stay well below 1MB Nginx limits). Default: 614400 (600 KB) */
  targetMaxBytes?: number
  /** Preferred mime type. Default: auto (WebP with fallback to JPEG) */
  preferredMimeType?: 'image/webp' | 'image/jpeg'
}

export interface CompressionResult {
  file: File
  previewUrl: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  reductionPercent: number
  mimeType: string
}

export const MAX_ALLOWED_FILE_MB = 10
export const MAX_ALLOWED_FILE_BYTES = MAX_ALLOWED_FILE_MB * 1024 * 1024

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function validateImageFile(file: File, maxBytes = MAX_ALLOWED_FILE_BYTES): { valid: boolean; error?: string } {
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'Selected file is not an image. Please select a JPG, PNG, or WebP file.' }
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size is ${formatFileSize(file.size)}, which exceeds the maximum limit of ${formatFileSize(maxBytes)}. Please select a smaller image.`,
    }
  }

  return { valid: true }
}

/**
 * Loads a File into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image file for compression.'))
    }
    img.src = url
  })
}

/**
 * Compresses an image file on the client using HTML5 Canvas.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  // If already SVG or tiny image (under 120KB) and correct format, we can skip heavy canvas operations
  // but if it's over 300KB or high-res, compress it!
  const maxDim = options.maxDimension ?? 1200
  const targetMaxBytes = options.targetMaxBytes ?? 600 * 1024 // 600 KB

  const img = await loadImage(file)
  let { naturalWidth: width, naturalHeight: height } = img

  // Scale down dimensions if needed while preserving aspect ratio
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context 2D not supported')
  }

  // High quality resampling
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  // Determine export MIME type: test if browser supports image/webp export
  let mimeType = options.preferredMimeType || 'image/webp'
  try {
    const testData = canvas.toDataURL('image/webp')
    if (!testData.startsWith('data:image/webp')) {
      mimeType = 'image/jpeg'
    }
  } catch {
    mimeType = 'image/jpeg'
  }

  const extension = mimeType === 'image/webp' ? '.webp' : '.jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  const outputFileName = `${baseName}${extension}`

  // Helper to convert canvas to Blob
  const exportBlob = (q: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        mimeType,
        q
      )
    })

  // Progressive compression to meet targetMaxBytes
  let currentQuality = options.quality ?? 0.82
  let blob = await exportBlob(currentQuality)

  while (blob.size > targetMaxBytes && currentQuality > 0.45) {
    currentQuality = Math.max(0.4, currentQuality - 0.1)
    blob = await exportBlob(currentQuality)
  }

  // If still too large (e.g. extremely complex visual), scale dimensions down an additional 25%
  if (blob.size > targetMaxBytes && width > 600 && height > 600) {
    const smallerCanvas = document.createElement('canvas')
    smallerCanvas.width = Math.round(width * 0.75)
    smallerCanvas.height = Math.round(height * 0.75)
    const sCtx = smallerCanvas.getContext('2d')
    if (sCtx) {
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height)
      const smallerBlob = await new Promise<Blob | null>((res) =>
        smallerCanvas.toBlob(res, mimeType, 0.75)
      )
      if (smallerBlob && smallerBlob.size < blob.size) {
        blob = smallerBlob
        width = smallerCanvas.width
        height = smallerCanvas.height
      }
    }
  }

  const compressedFile = new File([blob], outputFileName, {
    type: mimeType,
    lastModified: Date.now(),
  })

  const reductionPercent =
    file.size > compressedFile.size
      ? Math.round(((file.size - compressedFile.size) / file.size) * 100)
      : 0

  return {
    file: compressedFile,
    previewUrl: URL.createObjectURL(compressedFile),
    originalSize: file.size,
    compressedSize: compressedFile.size,
    width,
    height,
    reductionPercent,
    mimeType,
  }
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_VIDEO_DURATION_SECONDS = 100

export function isAcceptedVideoSize(bytes: number) {
  return bytes <= MAX_VIDEO_BYTES
}

export function isAcceptedVideoDurationSeconds(seconds: number) {
  return seconds <= MAX_VIDEO_DURATION_SECONDS
}

export function getVideoUploadLimitCopy() {
  return 'Videos can be up to 100 seconds and 100MB.'
}

export function getVideoUploadTooLargeCopy() {
  return 'Videos must be 100MB or smaller.'
}

export function getVideoUploadTooLongCopy() {
  return 'Videos must be 100 seconds or shorter.'
}

export function getUploadFailureCopy(status: number, responseText: string) {
  const body = responseText.toLowerCase()
  if (
    status === 413 ||
    body.includes('payload too large') ||
    body.includes('maximum allowed size') ||
    body.includes('exceeded the maximum allowed size')
  ) {
    return getVideoUploadLimitCopy()
  }
  return `Upload failed (${status}): ${responseText}`
}

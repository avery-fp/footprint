import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  getVideoUploadLimitCopy,
  isAcceptedVideoDurationSeconds,
  isAcceptedVideoSize,
} from '@/lib/upload-validation'

describe('video upload validation', () => {
  it('accepts a 100-second uploaded video', () => {
    expect(isAcceptedVideoDurationSeconds(MAX_VIDEO_DURATION_SECONDS)).toBe(true)
  })

  it('rejects an uploaded video over 100 seconds', () => {
    expect(isAcceptedVideoDurationSeconds(MAX_VIDEO_DURATION_SECONDS + 0.01)).toBe(false)
  })

  it('accepts a 100MB uploaded video', () => {
    expect(isAcceptedVideoSize(MAX_VIDEO_BYTES)).toBe(true)
  })

  it('rejects an uploaded video over 100MB', () => {
    expect(isAcceptedVideoSize(MAX_VIDEO_BYTES + 1)).toBe(false)
  })

  it('leaves non-video image upload behavior unchanged', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })

  it('uses the updated user-facing copy', () => {
    expect(getVideoUploadLimitCopy()).toBe('Videos can be up to 100 seconds and 100MB.')
  })
})

'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'

interface AvatarUploadProps {
  currentUrl: string | null
  footprintId: string
  onUpload: (url: string) => void
}

/**
 * Avatar Upload Component
 * 
 * A beautiful drag-and-drop avatar uploader with:
 * - Click to select file
 * - Drag and drop support
 * - Image preview before upload
 * - Upload progress feedback
 * - Size and type validation
 * 
 * The design philosophy: make it feel effortless.
 * No cropping UI, no aspect ratio controls. Just drop an image
 * and we handle the rest. Square crops are applied in CSS.
 */
export default function AvatarUpload({ currentUrl, footprintId, onUpload }: AvatarUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Handle file selection (from click or drop)
  const handleFile = useCallback(async (file: File) => {
    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Use JPG, PNG, GIF, or WebP')
      return
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Upload
    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('footprint_id', footprintId)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      onUpload(data.avatar_url)
      toast.success('Avatar updated!')
      
    } catch (error) {
      toast.error('Upload failed')
      setPreview(null)
    } finally {
      setIsUploading(false)
    }
  }, [footprintId, onUpload])

  // Click handler
  const handleClick = () => {
    inputRef.current?.click()
  }

  // File input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  // Drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  // The image to display (preview or current or placeholder)
  const displayUrl = preview || currentUrl

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-24 h-24 rounded-full cursor-pointer transition-all duration-200
        ${isDragging 
          ? 'scale-105 ring-2 ring-white/40 ring-offset-2 ring-offset-[var(--bg,#07080A)]' 
          : 'hover:ring-2 hover:ring-white/20 hover:ring-offset-2 hover:ring-offset-[var(--bg,#07080A)]'
        }
        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Avatar display */}
      {displayUrl ? (
        <img
          src={displayUrl}
          alt="Avatar"
          className="w-full h-full rounded-full object-cover border-2 border-[var(--border,rgba(255,255,255,0.12))]"
        />
      ) : (
        <div className="w-full h-full rounded-full border-2 border-dashed border-[var(--border,rgba(255,255,255,0.2))] flex items-center justify-center bg-[var(--glass,rgba(255,255,255,0.08))]">
          <span className="text-2xl opacity-40">+</span>
        </div>
      )}

      {/* Upload indicator */}
      {isUploading && (
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
        <span className="text-white text-xs font-mono">
          {displayUrl ? 'Change' : 'Upload'}
        </span>
      </div>
    </div>
  )
}

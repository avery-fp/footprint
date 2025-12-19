'use client'

import { useState } from 'react'
import { getAllThemes, Theme } from '@/lib/themes'
import { toast } from 'sonner'

interface ThemePickerProps {
  currentTheme: string
  footprintId: string
  onSelect: (themeId: string) => void
}

/**
 * Theme Picker Component
 * 
 * A visual grid of theme options for customizing footprint appearance.
 * Each theme shows a preview gradient and name, with the current selection highlighted.
 * 
 * The design principle: show don't tell. The preview gradients give users an
 * immediate sense of what each theme looks like without needing to read descriptions.
 * Clicking instantly applies the theme (optimistic update) and saves to the database.
 */
export default function ThemePicker({ currentTheme, footprintId, onSelect }: ThemePickerProps) {
  const [saving, setSaving] = useState(false)
  const themes = getAllThemes()

  const handleSelect = async (theme: Theme) => {
    if (theme.id === currentTheme) return
    
    setSaving(true)
    
    // Optimistic update
    onSelect(theme.id)
    
    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: footprintId,
          theme: theme.id,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save theme')
      }

      toast.success(`Theme: ${theme.name}`)
    } catch (error) {
      // Revert on error
      onSelect(currentTheme)
      toast.error('Failed to save theme')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted,rgba(255,255,255,0.4))]">
          Theme
        </label>
        {saving && (
          <span className="font-mono text-xs text-[var(--text-muted,rgba(255,255,255,0.4))]">
            Saving...
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleSelect(theme)}
            disabled={saving}
            className={`
              relative aspect-square rounded-lg overflow-hidden transition-all duration-200
              ${currentTheme === theme.id 
                ? 'ring-2 ring-[var(--accent,#F5F5F5)] ring-offset-2 ring-offset-[var(--bg,#07080A)]' 
                : 'hover:scale-105 hover:ring-1 hover:ring-[var(--border,rgba(255,255,255,0.2))]'
              }
              ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={theme.name}
          >
            {/* Preview gradient */}
            <div 
              className="absolute inset-0"
              style={{ background: theme.preview }}
            />
            
            {/* Theme name overlay on hover */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <span className="text-white text-xs font-mono text-center px-1">
                {theme.name}
              </span>
            </div>

            {/* Selected indicator */}
            {currentTheme === theme.id && (
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                <span className="text-black text-xs">✓</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

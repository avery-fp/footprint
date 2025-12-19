import { create } from 'zustand'
import type { Footprint, Content } from './supabase'

/**
 * Editor Store
 * 
 * Zustand store for managing the editor state.
 * 
 * Why Zustand?
 * - Simple API, minimal boilerplate
 * - Works great with React Server Components
 * - Optimistic updates for snappy UX
 * - Easy to persist to localStorage if needed
 * 
 * The store manages:
 * - Current user
 * - Active footprint/room
 * - All user's footprints (rooms)
 * - Content items
 * - UI state (loading, saving, etc.)
 */

interface User {
  id: string
  email: string
  serial_number: number
}

interface EditorState {
  // User
  user: User | null
  setUser: (user: User | null) => void
  
  // Footprints (rooms)
  footprints: Footprint[]
  activeFootprint: Footprint | null
  setFootprints: (footprints: Footprint[]) => void
  setActiveFootprint: (footprint: Footprint | null) => void
  addFootprint: (footprint: Footprint) => void
  updateFootprint: (id: string, updates: Partial<Footprint>) => void
  deleteFootprint: (id: string) => void
  
  // Content
  content: Content[]
  setContent: (content: Content[]) => void
  addContent: (content: Content) => void
  updateContent: (id: string, updates: Partial<Content>) => void
  deleteContent: (id: string) => void
  reorderContent: (activeId: string, overId: string) => void
  
  // UI State
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  
  // Actions
  reset: () => void
}

const initialState = {
  user: null,
  footprints: [],
  activeFootprint: null,
  content: [],
  isSaving: false,
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,
  
  // User actions
  setUser: (user) => set({ user }),
  
  // Footprint actions
  setFootprints: (footprints) => set({ footprints }),
  
  setActiveFootprint: (footprint) => set({ activeFootprint: footprint }),
  
  addFootprint: (footprint) => set((state) => ({
    footprints: [...state.footprints, footprint],
  })),
  
  updateFootprint: (id, updates) => set((state) => ({
    footprints: state.footprints.map((fp) =>
      fp.id === id ? { ...fp, ...updates } : fp
    ),
    // Also update activeFootprint if it's the one being updated
    activeFootprint: state.activeFootprint?.id === id
      ? { ...state.activeFootprint, ...updates }
      : state.activeFootprint,
  })),
  
  deleteFootprint: (id) => set((state) => ({
    footprints: state.footprints.filter((fp) => fp.id !== id),
    activeFootprint: state.activeFootprint?.id === id 
      ? null 
      : state.activeFootprint,
  })),
  
  // Content actions
  setContent: (content) => set({ content }),
  
  addContent: (content) => set((state) => ({
    // Add to the beginning (newest first)
    content: [content, ...state.content],
  })),
  
  updateContent: (id, updates) => set((state) => ({
    content: state.content.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    ),
  })),
  
  deleteContent: (id) => set((state) => ({
    content: state.content.filter((item) => item.id !== id),
  })),
  
  /**
   * Reorder content with drag and drop
   * 
   * This is the tricky part. When user drags content:
   * 1. Find the dragged item and where it's being dropped
   * 2. Remove it from its current position
   * 3. Insert it at the new position
   * 4. Update all position values
   * 
   * We do this optimistically (update UI immediately)
   * then sync to the database.
   */
  reorderContent: (activeId, overId) => set((state) => {
    const items = [...state.content]
    
    // Find indices
    const activeIndex = items.findIndex((item) => item.id === activeId)
    const overIndex = items.findIndex((item) => item.id === overId)
    
    if (activeIndex === -1 || overIndex === -1) {
      return state
    }
    
    // Remove the active item
    const [removed] = items.splice(activeIndex, 1)
    
    // Insert at the new position
    items.splice(overIndex, 0, removed)
    
    // Update positions
    const reordered = items.map((item, index) => ({
      ...item,
      position: index,
    }))
    
    return { content: reordered }
  }),
  
  // UI State
  setIsSaving: (isSaving) => set({ isSaving }),
  
  // Reset
  reset: () => set(initialState),
}))

/**
 * Custom hook for syncing content order to database
 * 
 * Call this after drag-and-drop to persist the new order.
 */
export async function syncContentOrder(footprintId: string, content: Content[]) {
  const updates = content.map((item, index) => ({
    id: item.id,
    position: index,
  }))
  
  // Send to API
  await fetch('/api/content/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      footprint_id: footprintId,
      updates,
    }),
  })
}

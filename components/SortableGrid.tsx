'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableCard } from './SortableCard'
import ContentCard from './ContentCard'
import type { Content } from '@/lib/supabase'

interface SortableGridProps {
  items: Content[]
  onReorder: (items: Content[]) => void
  onDelete: (id: string) => void
}

/**
 * Sortable Content Grid
 * 
 * A beautiful drag-and-drop grid for reordering content.
 * 
 * Uses @dnd-kit for accessibility and smooth animations.
 * The key insight: we track the dragged item separately
 * so we can render it in an overlay (looks smoother).
 * 
 * When drag ends:
 * 1. Calculate new order
 * 2. Update local state immediately (optimistic)
 * 3. Sync to database in background
 */
export default function SortableGrid({ items, onReorder, onDelete }: SortableGridProps) {
  // Track which item is being dragged
  const [activeId, setActiveId] = useState<string | null>(null)
  
  // Get the active item for the overlay
  const activeItem = activeId ? items.find(item => item.id === activeId) : null

  // Configure sensors for drag detection
  // Mouse = desktop clicks, Touch = mobile with long-press, Keyboard = accessibility
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Desktop: small distance prevents accidental drags when clicking
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      // Mobile: long-press to drag (250ms delay)
      // This allows normal scrolling and taps to work naturally
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag start - track which item is being dragged
  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  // Handle drag end - reorder items
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    
    setActiveId(null)
    
    if (!over || active.id === over.id) {
      return
    }

    // Find the indices
    const oldIndex = items.findIndex(item => item.id === active.id)
    const newIndex = items.findIndex(item => item.id === over.id)

    // Reorder the array
    const newItems = arrayMove(items, oldIndex, newIndex)
    
    // Update positions
    const reordered = newItems.map((item, index) => ({
      ...item,
      position: index,
    }))

    // Call the callback with new order
    onReorder(reordered)
  }

  // Handle drag cancel - clear active state
  function handleDragCancel() {
    setActiveId(null)
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-white/40">
        <p className="text-5xl mb-4 opacity-20">◈</p>
        <p className="text-lg mb-2">Nothing here yet</p>
        <p className="font-mono text-xs">Paste a URL above to get started</p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext 
        items={items.map(item => item.id)} 
        strategy={rectSortingStrategy}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <SortableCard
              key={item.id}
              id={item.id}
              content={item}
              onDelete={() => onDelete(item.id)}
              isDragging={item.id === activeId}
            />
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay - the floating card while dragging */}
      <DragOverlay adjustScale={false}>
        {activeItem ? (
          <div className="opacity-90 rotate-3 scale-105">
            <ContentCard content={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

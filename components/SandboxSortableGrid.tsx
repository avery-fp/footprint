'use client'

import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import UnifiedTile from '@/components/UnifiedTile'
import type { DraftContent } from '@/lib/draft-store'

// ═══════════════════════════════════════════
// SANDBOX SORTABLE GRID
//
// DraftContent[] version of SortableGrid.
// Same sensors, DragOverlay, and handle pattern
// but typed for sandbox (no footprint_id/created_at).
// ═══════════════════════════════════════════

interface SandboxSortableGridProps {
  tiles: DraftContent[]
  onReorder: (tiles: DraftContent[]) => void
  onRemove: (id: string) => void
  onAddTap: () => void
}

// ── Sortable tile wrapper ──
function SandboxSortableCard({
  tile,
  isDragging,
  onRemove,
}: {
  tile: DraftContent
  isDragging: boolean
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
    isOver,
  } = useSortable({ id: tile.id })

  const isActive = isDragging || isSortableDragging

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: isActive ? 0.4 : 1,
    willChange: isActive ? ('transform' as const) : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative group aspect-square overflow-hidden
        bg-white/[0.04]
        ${isOver ? 'ring-2 ring-white/20' : ''}
        ${isActive ? 'scale-[0.98]' : ''}
      `}
    >
      {/* Tile content */}
      <UnifiedTile
        item={{
          id: tile.id,
          url: tile.url,
          type: tile.type,
          title: tile.title,
          description: tile.description,
          thumbnail_url: tile.thumbnail_url,
          embed_html: tile.embed_html,
        }}
        index={0}
        size={1}
        aspect="square"
        mode="sandbox"
      />

      {/* Drag handle — top-left, separated from content */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <div className="w-11 h-11 sm:w-8 sm:h-8 rounded-lg bg-black/80 sm:bg-black/70 flex items-center justify-center text-white/80 sm:text-white/60 active:scale-95 transition-transform">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M5 3H9M5 7H9M5 11H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Remove button — top-right */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute top-2 right-2 z-20 w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-black/70 backdrop-blur-sm text-white/50 hover:text-white flex items-center justify-center text-xs opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200"
      >
        ×
      </button>
    </div>
  )
}

// ── Tile renderer for DragOverlay ──
function SandboxTileOverlay({ tile }: { tile: DraftContent }) {
  return (
    <div className="aspect-square overflow-hidden opacity-95 rotate-2 scale-[1.02] shadow-2xl shadow-black/50 ring-1 ring-white/10">
      <UnifiedTile
        item={{
          id: tile.id,
          url: tile.url,
          type: tile.type,
          title: tile.title,
          description: tile.description,
          thumbnail_url: tile.thumbnail_url,
          embed_html: tile.embed_html,
        }}
        index={0}
        size={1}
        aspect="square"
        mode="sandbox"
      />
    </div>
  )
}

export default function SandboxSortableGrid({
  tiles,
  onReorder,
  onRemove,
  onAddTap,
}: SandboxSortableGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeItem = activeId ? tiles.find((t) => t.id === activeId) : null

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 8 },
    }),
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = tiles.findIndex((t) => t.id === active.id)
    const newIndex = tiles.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(tiles, oldIndex, newIndex).map((t, i) => ({
      ...t,
      position: i,
    }))
    onReorder(reordered)
  }

  function handleDragCancel() {
    setActiveId(null)
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
        items={tiles.map((t) => t.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: '3px' }}>
          {tiles.map((tile) => (
            <SandboxSortableCard
              key={tile.id}
              tile={tile}
              isDragging={tile.id === activeId}
              onRemove={() => onRemove(tile.id)}
            />
          ))}

          {/* Add more — ghost tile */}
          <button
            onClick={onAddTap}
            className="
              aspect-square overflow-hidden
              bg-white/[0.02] hover:bg-white/[0.04]
              border border-dashed border-white/[0.06] hover:border-white/[0.10]
              transition-all duration-300
              flex items-center justify-center
              cursor-pointer active:scale-[0.98]
            "
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white/15 hover:text-white/30 transition-colors"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </SortableContext>

      <DragOverlay
        adjustScale={false}
        dropAnimation={{
          duration: 250,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.18)',
        }}
      >
        {activeItem ? <SandboxTileOverlay tile={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

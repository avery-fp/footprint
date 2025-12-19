'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ContentCard from './ContentCard'
import type { Content } from '@/lib/supabase'

interface SortableCardProps {
  id: string
  content: Content
  onDelete: () => void
  isDragging: boolean
}

/**
 * Sortable Card Wrapper
 * 
 * Wraps a ContentCard with dnd-kit's useSortable hook.
 * This adds all the drag-and-drop functionality:
 * - Drag handle attributes
 * - Transform during drag
 * - Transition animations
 * 
 * The visual state changes based on isDragging:
 * - When dragging, the original card fades out (placeholder)
 * - The DragOverlay shows the floating card
 */
export function SortableCard({ id, content, onDelete, isDragging }: SortableCardProps) {
  // Get all the sortable props and listeners
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id })

  // Build the transform style
  // CSS.Transform.toString converts the transform object to CSS
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Fade out when this card is being dragged (the overlay shows instead)
    opacity: isDragging || isSortableDragging ? 0.3 : 1,
    // Add a slight scale on hover for feedback
    cursor: 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      {/* Drag handle - the whole card area triggers drag */}
      <div 
        {...attributes} 
        {...listeners}
        className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
      />
      
      {/* The actual content card */}
      <ContentCard 
        content={content} 
        editable 
        onDelete={onDelete}
      />
      
      {/* Drag indicator - shows on hover */}
      <div className="absolute top-3 left-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-8 h-8 rounded-lg bg-black/70 flex items-center justify-center text-white/60">
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 14 14" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M5 3H9M5 7H9M5 11H9" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

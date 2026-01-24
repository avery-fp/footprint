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

export function SortableCard({ id, content, onDelete, isDragging }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
    isOver,
  } = useSortable({ id })

  const isActive = isDragging || isSortableDragging

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isActive ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isOver ? 'ring-2 ring-white/30 rounded-xl' : ''} ${isActive ? 'scale-[0.98]' : ''}`}
    >
      {/* The actual content card - receives clicks normally */}
      <ContentCard content={content} editable onDelete={onDelete} />

      {/* Drag handle - ONLY this triggers drag */}
      {/* Mobile: always visible with larger touch target, Desktop: show on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 drag-handle opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        {/* Larger touch target for mobile (44x44px minimum) */}
        <div className="w-11 h-11 sm:w-8 sm:h-8 rounded-lg bg-black/80 sm:bg-black/70 flex items-center justify-center text-white/80 sm:text-white/60 active:scale-95 transition-transform">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-[14px] sm:h-[14px]">
            <path d="M5 3H9M5 7H9M5 11H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

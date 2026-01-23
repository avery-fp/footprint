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
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.3 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      {/* The actual content card - receives clicks normally */}
      <ContentCard content={content} editable onDelete={onDelete} />

      {/* Drag handle - ONLY this triggers drag */}
      {/* Mobile: always visible (no hover), Desktop: show on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-3 left-3 z-20 touch-none opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <div className="w-8 h-8 rounded-lg bg-black/70 flex items-center justify-center text-white/60">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 3H9M5 7H9M5 11H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

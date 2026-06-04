'use client'

import type { ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function OwnerDndFrame({
  children,
  onDragStart,
  onDragEnd,
}: {
  children: ReactNode
  onDragStart: (event: any) => void
  onDragEnd: (event: any) => void
}) {
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const ownerSensors = useSensors(mouseSensor, touchSensor, keyboardSensor)

  return (
    <DndContext
      sensors={ownerSensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  )
}

export function OwnerSortableContext({
  children,
  items,
  orientation = 'grid',
}: {
  children: ReactNode
  items: string[]
  orientation?: 'grid' | 'horizontal'
}) {
  return (
    <SortableContext
      items={items}
      strategy={orientation === 'horizontal' ? horizontalListSortingStrategy : rectSortingStrategy}
    >
      {children}
    </SortableContext>
  )
}

export function SortableTileWrapper({
  item,
  children,
  className,
  style: extraStyle,
  disabled,
  dataCollectionChildId,
}: {
  item: any
  idx?: number
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  dataCollectionChildId?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  const baseTransform = CSS.Transform.toString(transform) || 'translate3d(0,0,0)'
  const style: React.CSSProperties = {
    transform: baseTransform,
    transition: isDragging ? 'none' : (transition || 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)'),
    willChange: 'transform',
    boxShadow: isDragging ? '0 18px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)' : 'none',
    ...(isDragging ? {
      zIndex: 50,
      cursor: 'grabbing',
    } : null),
    ...extraStyle,
  }

  return (
    <div ref={setNodeRef} style={style} className={className} data-collection-child-id={dataCollectionChildId} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

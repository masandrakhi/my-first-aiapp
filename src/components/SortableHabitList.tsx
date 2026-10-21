import type { ReactNode } from 'react'
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import type { Habit, HabitId } from '../types'
import type { SortableWiring } from './HabitCard'

interface SortableHabitListProps {
  label: string
  habits: Habit[]
  onReorder: (activeId: HabitId, overId: HabitId) => void
  /** Renders one card; spread the wiring into HabitCard's `sortable` prop. */
  renderItem: (habit: Habit) => (wiring: SortableWiring) => ReactNode
}

/** A vertical list whose items are reordered by dragging their grip handle (mouse, touch, or keyboard). */
export function SortableHabitList({ label, habits, onReorder, renderItem }: SortableHabitListProps) {
  const sensors = useSensors(
    // The handle has touch-action: none, so a small distance is enough on touch screens too.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3" aria-label={label}>
          {habits.map((habit) => (
            <SortableItem key={habit.id} id={habit.id} render={renderItem(habit)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ id, render }: { id: HabitId; render: (wiring: SortableWiring) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return render({
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition, position: 'relative' },
    dragging: isDragging,
    handleProps: { ...attributes, ...listeners },
  })
}

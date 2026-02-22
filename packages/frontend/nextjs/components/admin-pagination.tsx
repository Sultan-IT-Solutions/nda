"use client"

import { Button } from "@/components/ui/button"

interface AdminPaginationProps {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}

export function AdminPagination({ page, totalPages, onPrev, onNext }: AdminPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-4">
      <div className="text-sm text-muted-foreground">
        Страница {page} из {totalPages}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onPrev} disabled={page <= 1} type="button">
          ← Назад
        </Button>
        <Button variant="outline" onClick={onNext} disabled={page >= totalPages} type="button">
          Вперёд →
        </Button>
      </div>
    </div>
  )
}

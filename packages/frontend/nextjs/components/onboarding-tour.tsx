"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { driver, type Driver } from "driver.js"

type TourStep = {
  route: string
  element: string
  title: string
  description: string
}

const TOUR_DONE_KEY = "nda_tour_done"

function hasTourTrigger(): boolean {
  if (typeof window === "undefined") return false

  const params = new URLSearchParams(window.location.search)
  if (params.get("tour") === "1") return true

  return window.sessionStorage.getItem("nda_start_tour") === "1"
}

function queryElement(selector: string): Element | null {
  if (typeof document === "undefined") return null
  return document.querySelector(selector)
}

async function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = queryElement(selector)
    if (el) return el
    await new Promise((r) => setTimeout(r, 100))
  }

  return null
}

function ensurePopoverHeader(popover: { wrapper: HTMLElement; title: HTMLElement; closeButton: HTMLButtonElement }) {
  const existing = popover.wrapper.querySelector<HTMLElement>(".nda-driver-header")
  if (existing) return

  const header = document.createElement("div")
  header.className = "nda-driver-header"

  popover.wrapper.insertBefore(header, popover.title)
  header.append(popover.title)
  header.append(popover.closeButton)
}

function ensureCustomPrevButton(
  popover: { footerButtons: HTMLElement; nextButton: HTMLButtonElement },
  opts: { disabled: boolean; onClick: () => void }
) {
  const existing = popover.footerButtons.querySelector<HTMLButtonElement>(".nda-driver-prev-custom")
  if (existing) existing.remove()

  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "nda-driver-prev nda-driver-prev-custom"
  btn.textContent = "Назад"

  btn.classList.toggle("driver-popover-btn-disabled", opts.disabled)
  btn.setAttribute("aria-disabled", opts.disabled ? "true" : "false")
  btn.tabIndex = opts.disabled ? -1 : 0

  btn.addEventListener("click", (e) => {
    e.preventDefault()
    if (opts.disabled) return
    opts.onClick()
  })

  popover.footerButtons.insertBefore(btn, popover.nextButton)
}

function markTourDone() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(TOUR_DONE_KEY, "1")
  window.sessionStorage.removeItem("nda_start_tour")

  const params = new URLSearchParams(window.location.search)
  if (params.has("tour")) {
    params.delete("tour")
    const next = params.toString()
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname
    window.history.replaceState({}, "", nextUrl)
  }
}

export function OnboardingTour() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const steps: TourStep[] = useMemo(
    () => [
      {
        route: "/profile",
        element: "[data-tour='profile-title']",
        title: "Добро пожаловать!",
        description: "Покажем основные разделы. Можно нажать «Пропустить».",
      },
      {
        route: "/profile",
        element: "[data-tour='notifications']",
        title: "Уведомления",
        description: "Здесь появляются важные обновления: переносы, отмены, и другие события.",
      },
      {
        route: "/profile",
        element: "[data-tour='profile-attendance']",
        title: "Посещаемость",
        description: "Нажимайте на статусы или кнопку «Занятия», чтобы увидеть историю посещений по группе.",
      },
      {
        route: "/schedule",
        element: "[data-tour='schedule-filters']",
        title: "Расписание групп",
        description: "Здесь можно подобрать группу по преподавателю, залу, времени и типу, и записаться.",
      },
      {
        route: "/my-groups",
        element: "[data-tour='my-groups-list']",
        title: "Мои группы",
        description: "Здесь можно посмотреть ваши текущие записи.",
      },
      {
        route: "/trial",
        element: "[data-tour='trial-available']",
        title: "Пробный урок",
        description: "Здесь можно записаться на пробный урок, узнать цену, и смотреть расписание прямо в карточках.",
      },
    ],
    []
  )

  const driverRef = useRef<Driver | null>(null)
  const [running, setRunning] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    if (running) return

    const triggered =
      searchParams.get("tour") === "1" || window.sessionStorage.getItem("nda_start_tour") === "1"

    const alreadyDone = window.localStorage.getItem(TOUR_DONE_KEY) === "1"
    if (!triggered && alreadyDone) return
    if (!triggered) return

    if (pathname === "/login" || pathname === "/register") return

    try {
      window.sessionStorage.setItem("nda_start_tour", "1")
    } catch {
      // ignoring
    }

    setRunning(true)

    const indexForRoute = Math.max(
      0,
      steps.findIndex((s) => s.route === pathname)
    )
    setStepIndex(indexForRoute >= 0 ? indexForRoute : 0)
  }, [pathname, running, searchParams, steps])

  useEffect(() => {
    if (!running) return

    const currentStep = steps[stepIndex]
    if (!currentStep) return

    if (pathname !== currentStep.route) {
      if (pendingRoute !== currentStep.route) {
        setPendingRoute(currentStep.route)
        router.push(currentStep.route)
      }
      return
    }

    setPendingRoute(null)

    try {
      driverRef.current?.destroy()
    } catch {
      // ignoring
    }

    const isLast = stepIndex === steps.length - 1

    const goPrev = () => {
      if (stepIndex <= 0) return
      try {
        driverRef.current?.destroy()
      } catch {
        // ignoring
      }
      setStepIndex((i) => Math.max(0, i - 1))
    }

    const goNext = () => {
      if (isLast) {
        markTourDone()
        setRunning(false)
        try {
          driverRef.current?.destroy()
        } catch {
          // ignoring
        }
        return
      }

      try {
        driverRef.current?.destroy()
      } catch {
        // ignoring
      }
      setStepIndex((i) => Math.min(steps.length - 1, i + 1))
    }

    const selector = currentStep.element

    let cancelled = false
    let instance: Driver | null = null

    ;(async () => {
      const target = (await waitForElement(selector, 6000)) ?? document.body
      if (cancelled) return

      instance = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: false,
        overlayClickBehavior: "close",
        animate: false,
        popoverClass: "nda-driver-popover",
        doneBtnText: "Готово",
        nextBtnText: "Далее",
        prevBtnText: "Назад",
        showButtons: ["close", "next"],
        onPopoverRender: (popover) => {
          popover.wrapper.classList.add("nda-driver-popover")

          popover.closeButton.textContent = "Пропустить"
          popover.closeButton.classList.add("nda-driver-skip")
          popover.nextButton.classList.add("nda-driver-next")

          popover.progress.textContent = `${stepIndex + 1} из ${steps.length}`
          popover.nextButton.textContent = isLast ? "Готово" : "Далее"

          ensureCustomPrevButton(
            { footerButtons: popover.footerButtons, nextButton: popover.nextButton },
            { disabled: stepIndex <= 0, onClick: goPrev }
          )

          ensurePopoverHeader(popover)
        },
        onCloseClick: () => {
          markTourDone()
          setRunning(false)
          try {
            driverRef.current?.destroy()
          } catch {
            // ignoring
          }
        },
        onPrevClick: () => {
        },
        onNextClick: () => {
          goNext()
        },
        steps: [
          {
            element: target,
            popover: {
              title: currentStep.title,
              description: currentStep.description,
            },
          },
        ],
      })

      driverRef.current = instance

      try {
        instance.drive()
      } catch {
        // ignoring
      }
    })()

    return () => {
      cancelled = true
      try {
        instance?.destroy()
      } catch {
        // ignoring
      }
    }
  }, [pathname, pendingRoute, router, running, stepIndex, steps])

  return null
}

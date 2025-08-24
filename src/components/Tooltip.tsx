import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  content: React.ReactNode
  children: React.ReactElement
  delay?: number
}

export default function Tooltip({ content, children, delay = 120 }: Props) {
  // prefer to anchor to .app-root but fall back to document.body so tooltips
  // work immediately on first render even if app-root isn't mounted yet
  let appRoot = typeof document !== 'undefined' ? (document.querySelector('.app-root') as HTMLElement | null) : null
  let root = typeof document !== 'undefined' ? document.getElementById('tooltip-root') : null
  if (typeof document !== 'undefined' && !root) {
    root = document.createElement('div')
    root.id = 'tooltip-root'
    // append to appRoot if present, otherwise body
    ;((appRoot as HTMLElement) || document.body).appendChild(root)
  }
  // ensure appRoot has a usable fallback
  if (!appRoot && typeof document !== 'undefined') appRoot = document.body as HTMLElement
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; placeBelow: boolean }>({ left: 0, top: 0, placeBelow: false })
  const timer = useRef<number | null>(null)
  const hostRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  if (!root || !appRoot) return children

  const show = (el: HTMLElement) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
  hostRef.current = el
  const appRect = appRoot.getBoundingClientRect()
  // prefer anchoring to the nested .talisman-area so the tooltip's top-left
  // aligns with the talisman area top-left (this keeps the slot-icon visible
  // to the left of the tooltip). Fall back to .slot-icon or the whole element.
  const talismanEl = (el.querySelector && (el.querySelector('.talisman-area') as HTMLElement)) || null
  const iconEl = (el.querySelector && (el.querySelector('.slot-icon') as HTMLElement)) || null
  const anchor = talismanEl ?? iconEl ?? el
  const r = anchor.getBoundingClientRect()
  // align tooltip top-left to the anchor's top-left
  const offsetX = 8
  const left = Math.max(0, Math.round(r.left - appRect.left))
  const tentativeTop = Math.round(r.top - appRect.top)
  // if tooltip would be too close to top of app, place it below the anchor
  const placeBelow = tentativeTop < 8
  const top = placeBelow ? anchor.getBoundingClientRect().bottom - appRect.top + offsetX : tentativeTop
  setPos({ left, top, placeBelow })
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setVisible(false)
  }

  // clone child to attach hover/focus handlers without changing its props
  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e)
      show(e.currentTarget as HTMLElement)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e)
      show(e.currentTarget as HTMLElement)
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e)
      hide()
    },
  })

  const tooltipNode = visible ? (
    <div className="tooltip" style={{ left: pos.left, top: pos.top }} role="tooltip">
      <div className="tooltip-card">
        <div className="tooltip-content">{content}</div>
      </div>
    </div>
  ) : null

  return (
    <>
      {child}
      {createPortal(tooltipNode, root)}
    </>
  )
}

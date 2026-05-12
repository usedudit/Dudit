"use client"

import type React from "react"
import {
  useState,
  useRef,
  useEffect,
  memo,
} from "react"

import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable"
import { useMediaQuery } from "@/components/erp/hooks"
import {
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateIcon,
} from "@/lib/icons"

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm?: (img: string) => void
  onCropComplete?: (img: string) => void
  imageFile?: File | null
  imageSrc?: string | null
  aspectRatio?: number
}

const MAX_ZOOM = 5
const MIN_CROP = 50
const INERTIA = 0.92

const ImageCropperModal = memo(({
  isOpen,
  onClose,
  onConfirm,
  onCropComplete,
  imageFile,
  imageSrc: imageSrcProp,
  aspectRatio,
}: Props) => {

  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const isWideCrop = !!aspectRatio && aspectRatio > 1
  const SIZE = isDesktop ? (isWideCrop ? 640 : 420) : 360
  const cropperWidth = SIZE
  const cropperHeight = isWideCrop ? Math.round(SIZE / aspectRatio) : SIZE

  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const rafRef = useRef<number>(0)
  const inertiaRef = useRef<number>(0)

  const velocity = useRef({ x: 0, y: 0 })

  const drag = useRef({
    active: false,
    type: "" as "move-img" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "",
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    initialPos: { x: 0, y: 0 },
    initialCrop: { x: 0, y: 0, width: 400, height: 400 },
  })

  const [imageSrc, setImageSrc] = useState("")
  const [zoom, setZoom] = useState(1)
  const [minZoom, setMinZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [imageBaseSize, setImageBaseSize] = useState<{ width: number; height: number } | null>(null)

  const [imagePos, setImagePos] = useState({ x: 0, y: 0 })
  const imagePosRef = useRef(imagePos)
  imagePosRef.current = imagePos

  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
    width: SIZE,
    height: SIZE
  })
  const cropRef = useRef(crop)
  cropRef.current = crop

  // Update crop on SIZE change
  useEffect(() => {
    if (isOpen) {
      reset()
    }
  }, [SIZE, isOpen])

  /* LOAD IMAGE */

  useEffect(() => {

    if (!isOpen) return

    setImageBaseSize(null)

    if (imageSrcProp) {
      setImageSrc(
        imageSrcProp.startsWith("http")
          ? `${imageSrcProp}${imageSrcProp.includes('?') ? '&' : '?'}cb=${Date.now()}`
          : imageSrcProp
      )
    }

    else if (imageFile) {

      const reader = new FileReader()

      reader.onload = e =>
        setImageSrc(e.target?.result as string)

      reader.readAsDataURL(imageFile)

    }

    reset()

  }, [imageFile, imageSrcProp, isOpen])

  /* RESET */

  const reset = () => {

    setZoom(1)
    setMinZoom(1)
    setRotation(0)
    setImagePos({ x: 0, y: 0 })

    if (aspectRatio) {
      let w = cropperWidth
      let h = cropperWidth / aspectRatio
      if (h > cropperHeight) {
        h = cropperHeight
        w = cropperHeight * aspectRatio
      }
      setCrop({
        x: (cropperWidth - w) / 2,
        y: (cropperHeight - h) / 2,
        width: w,
        height: h
      })
    } else {
      setCrop({
        x: 0,
        y: 0,
        width: cropperWidth,
        height: cropperHeight
      })
    }

  }

  /* IMAGE LOAD */

  const onImageLoad = () => {

    const img = imgRef.current!

    const fit = Math.min(
      cropperWidth / img.naturalWidth,
      cropperHeight / img.naturalHeight
    )
    const baseScale = Number.isFinite(fit) && fit > 0 ? fit : 1

    setImageBaseSize({
      width: img.naturalWidth * baseScale,
      height: img.naturalHeight * baseScale,
    })
    reset()

  }

  /* INERTIA */

  const runInertia = () => {

    cancelAnimationFrame(inertiaRef.current!)

    const loop = () => {

      velocity.current.x *= INERTIA
      velocity.current.y *= INERTIA

      if (
        Math.abs(velocity.current.x) < 0.1 &&
        Math.abs(velocity.current.y) < 0.1
      ) return

      setImagePos(p => ({
        x: p.x + velocity.current.x,
        y: p.y + velocity.current.y
      }))

      inertiaRef.current = requestAnimationFrame(loop)

    }

    loop()

  }

  /* POINTER DOWN */

  const pointerDown = (e: React.PointerEvent, type: any) => {

    e.preventDefault()

    drag.current.active = true
    drag.current.type = type
    drag.current.pointerId = e.pointerId

    containerRef.current?.setPointerCapture(e.pointerId)

    drag.current.startX = e.clientX
    drag.current.startY = e.clientY

    drag.current.lastX = e.clientX
    drag.current.lastY = e.clientY

    drag.current.initialPos = imagePosRef.current
    drag.current.initialCrop = cropRef.current

    velocity.current = { x: 0, y: 0 }

  }

  /* POINTER MOVE */

  const pointerMove = (e: React.PointerEvent) => {

    if (!drag.current.active) return

    if (e.pointerId !== drag.current.pointerId) return

    cancelAnimationFrame(rafRef.current!)

    rafRef.current = requestAnimationFrame(() => {

      const dx = e.clientX - drag.current.startX
      const dy = e.clientY - drag.current.startY

      velocity.current = {
        x: e.clientX - drag.current.lastX,
        y: e.clientY - drag.current.lastY
      }

      drag.current.lastX = e.clientX
      drag.current.lastY = e.clientY

      if (drag.current.type === "move-img") {

        setImagePos({
          x: drag.current.initialPos.x + dx,
          y: drag.current.initialPos.y + dy
        })

        return
      }

      let c = { ...drag.current.initialCrop }

      if (aspectRatio) {
        if (drag.current.type === "se" || drag.current.type === "ne" || drag.current.type === "e") {
          c.width = Math.min(Math.max(MIN_CROP, drag.current.initialCrop.width + dx), cropperWidth - c.x)
          c.height = c.width / aspectRatio
          
          if (c.y + c.height > cropperHeight) {
            c.height = cropperHeight - c.y
            c.width = c.height * aspectRatio
          }

          if (drag.current.type === "ne") {
            const desiredY = drag.current.initialCrop.y + (drag.current.initialCrop.height - c.height)
            if (desiredY < 0) {
              c.height = drag.current.initialCrop.y + drag.current.initialCrop.height
              c.width = c.height * aspectRatio
              c.y = 0
            } else {
              c.y = desiredY
            }
          }
        } else if (drag.current.type === "sw" || drag.current.type === "nw" || drag.current.type === "w") {
          const maxWidthAllowedByX = drag.current.initialCrop.x + drag.current.initialCrop.width
          const desiredW = Math.max(MIN_CROP, drag.current.initialCrop.width - dx)
          c.width = Math.min(desiredW, maxWidthAllowedByX)
          c.height = c.width / aspectRatio
          
          if (c.y + c.height > cropperHeight) {
            c.height = cropperHeight - c.y
            c.width = c.height * aspectRatio
          }

          c.x = maxWidthAllowedByX - c.width

          if (drag.current.type === "nw") {
            const desiredY = drag.current.initialCrop.y + (drag.current.initialCrop.height - c.height)
            if (desiredY < 0) {
              c.height = drag.current.initialCrop.y + drag.current.initialCrop.height
              c.width = c.height * aspectRatio
              c.y = 0
              c.x = maxWidthAllowedByX - c.width
            } else {
              c.y = desiredY
            }
          }
        } else if (drag.current.type === "s") {
          c.height = Math.min(Math.max(MIN_CROP, drag.current.initialCrop.height + dy), cropperHeight - c.y)
          c.width = c.height * aspectRatio
          if (c.x + c.width > cropperWidth) {
            c.width = cropperWidth - c.x
            c.height = c.width / aspectRatio
          }
        } else if (drag.current.type === "n") {
          const maxHeightAllowedByY = drag.current.initialCrop.y + drag.current.initialCrop.height
          const desiredH = Math.max(MIN_CROP, drag.current.initialCrop.height - dy)
          c.height = Math.min(desiredH, maxHeightAllowedByY)
          c.width = c.height * aspectRatio
          
          if (c.x + c.width > cropperWidth) {
            c.width = cropperWidth - c.x
            c.height = c.width / aspectRatio
          }

          c.y = maxHeightAllowedByY - c.height
        }
      } else {
        if (drag.current.type.includes("e"))
          c.width = Math.min(Math.max(MIN_CROP, drag.current.initialCrop.width + dx), cropperWidth - c.x)

        if (drag.current.type.includes("s"))
          c.height = Math.min(Math.max(MIN_CROP, drag.current.initialCrop.height + dy), cropperHeight - c.y)

        if (drag.current.type.includes("w")) {
          const maxWidthAllowedByX = drag.current.initialCrop.x + drag.current.initialCrop.width
          const desiredW = Math.max(MIN_CROP, drag.current.initialCrop.width - dx)
          c.width = Math.min(desiredW, maxWidthAllowedByX)
          c.x = maxWidthAllowedByX - c.width
        }

        if (drag.current.type.includes("n")) {
          const maxHeightAllowedByY = drag.current.initialCrop.y + drag.current.initialCrop.height
          const desiredH = Math.max(MIN_CROP, drag.current.initialCrop.height - dy)
          c.height = Math.min(desiredH, maxHeightAllowedByY)
          c.y = maxHeightAllowedByY - c.height
        }
      }

      setCrop(c)

    })

  }

  /* POINTER UP */

  const pointerUp = (e: React.PointerEvent) => {

    if (e.pointerId !== drag.current.pointerId) return

    drag.current.active = false

    containerRef.current?.releasePointerCapture(e.pointerId)

    runInertia()

  }

  /* WHEEL ZOOM */

  const wheelZoom = (e: React.WheelEvent) => {

    e.preventDefault()

    const delta = -e.deltaY * 0.001

    setZoom(z =>
      Math.min(MAX_ZOOM,
        Math.max(minZoom, z + delta))
    )

  }

  /* EXPORT (MESMA LOGICA SUA) */

  const exportImage = () => {

    const img = imgRef.current!
    const container = containerRef.current!

    const imgRect = img.getBoundingClientRect()
    const contRect = container.getBoundingClientRect()

    const temp = document.createElement("canvas")
    const ctx = temp.getContext("2d")!

    const rot = rotation % 360

    const sideways =
      rot === 90 || rot === 270 || rot === -90

    const dw = sideways ? img.naturalHeight : img.naturalWidth
    const dh = sideways ? img.naturalWidth : img.naturalHeight

    temp.width = dw
    temp.height = dh

    ctx.translate(dw / 2, dh / 2)
    ctx.rotate(rot * Math.PI / 180)

    ctx.drawImage(
      img,
      -img.naturalWidth / 2,
      -img.naturalHeight / 2
    )

    const scaleX = dw / imgRect.width
    const scaleY = dh / imgRect.height

    const cropX = (contRect.left + crop.x - imgRect.left) * scaleX
    const cropY = (contRect.top + crop.y - imgRect.top) * scaleY

    const out = document.createElement("canvas")

    out.width = crop.width * scaleX
    out.height = crop.height * scaleY

    out.getContext("2d")!.drawImage(
      temp,
      cropX,
      cropY,
      out.width,
      out.height,
      0,
      0,
      out.width,
      out.height
    )

    const result = out.toDataURL("image/png", 1)

    onConfirm?.(result)
    onCropComplete?.(result)

    onClose()

  }

  return (

    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Recortar imagem"
      maxWidth={isWideCrop ? "3xl" : "2xl"}
      icon={<UploadIcon className="w-5 h-5" />}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={reset}>
            Resetar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={exportImage}>
            Aplicar
          </Button>
        </div>
      }
    >

      <div className="flex flex-col items-center gap-4">

        {/* TOOLBAR */}

        <div className="flex gap-2">

          <Button onClick={() => setZoom(z => z + 0.2)}>
            <ZoomInIcon />
          </Button>

          <Button onClick={() => setZoom(z => Math.max(minZoom, z - 0.2))}>
            <ZoomOutIcon />
          </Button>

          <Button onClick={() => setRotation(r => r + 90)}>
            <RotateIcon />
          </Button>

        </div>

        {/* CONTAINER */}

        <div
          ref={containerRef}
          style={{
            width: cropperWidth,
            height: cropperHeight,
            touchAction: "none"
          }}
          className="relative overflow-hidden border rounded-lg bg-gray-100"
          onPointerDown={(e) => {
            const target = e.target as HTMLElement

            // Se clicou em um handle, não move a imagem
            if (target.closest("[data-handle]")) return

            pointerDown(e, "move-img")
          }}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerLeave={pointerUp}
          onWheel={wheelZoom}
        >

          {/* IMAGE */}

          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={onImageLoad}
            draggable={false}
            crossOrigin={imageSrc.startsWith("http") ? "anonymous" : undefined}
            className="absolute top-1/2 left-1/2 transition-transform duration-200 ease-out will-change-transform select-none"
            style={{
              width: imageBaseSize?.width,
              height: imageBaseSize?.height,
              transform:
                `translate(-50%,-50%)
                 translate(${imagePos.x}px,${imagePos.y}px)
                 rotate(${rotation}deg)
                 scale(${zoom})`
            }}
          />

          {/* CROP BOX */}

          <div
            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.5)]"
            style={{
              left: crop.x,
              top: crop.y,
              width: crop.width,
              height: crop.height
            }}
          >

            {/* GRID */}

            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40 pointer-events-none">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="border-white border" />
              ))}
            </div>

            {/* HANDLES */}

            {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map(pos => (

              <div
                key={pos}
                data-handle
                onPointerDown={e => pointerDown(e, pos as any)}
                className={`
                absolute w-4 h-4 bg-white border rounded-full z-10
                ${pos === "nw" && "-top-2 -left-2 cursor-nw-resize"}
                ${pos === "ne" && "-top-2 -right-2 cursor-ne-resize"}
                ${pos === "sw" && "-bottom-2 -left-2 cursor-sw-resize"}
                ${pos === "se" && "-bottom-2 -right-2 cursor-se-resize"}
                ${pos === "n" && "-top-2 left-1/2 -translate-x-1/2 cursor-n-resize"}
                ${pos === "s" && "-bottom-2 left-1/2 -translate-x-1/2 cursor-s-resize"}
                ${pos === "e" && "top-1/2 -right-2 -translate-y-1/2 cursor-e-resize"}
                ${pos === "w" && "top-1/2 -left-2 -translate-y-1/2 cursor-w-resize"}
                `}
              />

            ))}

          </div>

        </div>

      </div>

    </DefaultModal>

  )

})

export default ImageCropperModal
export { ImageCropperModal }

"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Space_Grotesk } from "next/font/google"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Download, ImageIcon, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
})

type TemplateId = "speaking" | "attending"

type Template = {
  id: TemplateId
  title: string
  src: string
  // Anchor and size defined on a 980×980 baseline, then scaled to native size.
  innerAnchorPx: { x: number; y: number }
  innerSizePx: { w: number; h: number }
}

// You provided the exact frame metrics on the graphic:
// - Graphic baseline: 980 × 980
// - Photo frame: 490 × 612.5
// - Offsets: 450 (left), 330 (top), 40 (right), 37.5 (bottom)
// These are self-consistent: 450 + 490 + 40 = 980 and 330 + 612.5 + 37.5 = 980
const BASE = 980
const EXACT_FRAME = {
  x: 450,
  y: 330,
  w: 490,
  h: 612.5,
}

const TEMPLATES: Template[] = [
  {
    id: "speaking",
    title: "I am Speaking at",
    src: "/images/speaker-session-container-1.png",
    innerAnchorPx: { x: EXACT_FRAME.x, y: EXACT_FRAME.y },
    innerSizePx: { w: EXACT_FRAME.w, h: EXACT_FRAME.h },
  },
  {
    id: "attending",
    title: "Thrilled to be attending",
    src: "/images/speaker-session-container.png",
    innerAnchorPx: { x: EXACT_FRAME.x, y: EXACT_FRAME.y },
    innerSizePx: { w: EXACT_FRAME.w, h: EXACT_FRAME.h },
  },
]

// cross‑origin safe loader for canvas export
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function useTemplateImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let mounted = true
    loadImage(src)
      .then((i) => mounted && setImg(i))
      .catch(() => mounted && setImg(null))
    return () => {
      mounted = false
    }
  }, [src])
  return img
}

export default function Page() {
  const [templateId, setTemplateId] = useState<TemplateId>("attending")
  const template = useMemo(() => TEMPLATES.find((t) => t.id === templateId)!, [templateId])
  const templateImg = useTemplateImage(template.src)

  // Upload
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [userImg, setUserImg] = useState<HTMLImageElement | null>(null)
  const triggerUpload = () => fileInputRef.current?.click()
  const onFileSelected = (file: File | null) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      URL.revokeObjectURL(url)
      setUserImg(img)
      // Reset placement to cover-fit
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    img.src = url
  }

  // User adjustments (on top of cover-fit)
  const [zoom, setZoom] = useState(1) // 1 = cover fit
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Drag-to-pan state
  const [panning, setPanning] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Reset interactions on template change (prevents “hang”)
  useEffect(() => {
    setPanning(false)
    lastPoint.current = null
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [templateId])

  // Canvas drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!templateImg) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Use native template size for crisp export
    const W = templateImg.naturalWidth || templateImg.width
    const H = templateImg.naturalHeight || templateImg.height
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    ctx.clearRect(0, 0, W, H)

    // Draw template first
    ctx.drawImage(templateImg, 0, 0, W, H)

    // Compute inner window from 980 baseline -> native scale
    const scaleX = W / BASE
    const scaleY = H / BASE
    const inner = {
      x: Math.round(template.innerAnchorPx.x * scaleX),
      y: Math.round(template.innerAnchorPx.y * scaleY),
      w: Math.round(template.innerSizePx.w * scaleX),
      h: Math.round(template.innerSizePx.h * scaleY),
    }

    // Draw user photo inside the precise window
    if (userImg) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(inner.x, inner.y, inner.w, inner.h)
      ctx.clip()

      const iw = userImg.naturalWidth || userImg.width
      const ih = userImg.naturalHeight || userImg.height

      // Cover-fit base, then apply user zoom
      const base = Math.max(inner.w / iw, inner.h / ih)
      const scale = base * zoom
      const drawW = iw * scale
      const drawH = ih * scale

      const centerX = inner.x + inner.w / 2 + offset.x
      const centerY = inner.y + inner.h / 2 + offset.y
      const drawX = centerX - drawW / 2
      const drawY = centerY - drawH / 2

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(userImg, drawX, drawY, drawW, drawH)
      ctx.restore()
    }
  }, [template, templateImg, userImg, zoom, offset])

  // Pointer handlers for pan
  const onPointerDown = (e: React.PointerEvent) => {
    setPanning(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    lastPoint.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!panning || !lastPoint.current) return
    const dx = e.clientX - lastPoint.current.x
    const dy = e.clientY - lastPoint.current.y
    lastPoint.current = { x: e.clientX, y: e.clientY }
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }
  const endPan = (e: React.PointerEvent) => {
    setPanning(false)
    lastPoint.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }

  // Wheel zoom (clamped so 1.0 never reveals gaps)
  const onWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setZoom((z) => clamp(Number.parseFloat((z + delta).toFixed(2)), 1, 3))
  }

  // Download
  const downloadImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = url
    a.download = `${template.id}-badge.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <main
      className={cn("min-h-dvh bg-[#10041f] text-white antialiased", spaceGrotesk.variable)}
      style={{ fontFamily: "var(--font-space-grotesk)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <header className="mb-6 md:mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#C9F1E5]">
              AWS Community Day — Badge Maker
            </h1>
            <p className="text-sm md:text-base text-[#B89AF7] mt-2">
              Upload your photo, then adjust size and position to fit the frame perfectly.
            </p>
          </div>
          <img
            src="/images/acd-logo.png"
            alt="AWS Community Day Vadodara 2025 logo"
            className="h-10 w-auto md:h-12 shrink-0"
            crossOrigin="anonymous"
          />
        </header>

        {/* Step 1: Template */}
        <Card className="bg-[#170233] border-[#754FEE]/30 mb-6">
          <CardHeader>
            <CardTitle className="text-white">1. Choose a template</CardTitle>
            <CardDescription className="text-[#C9F1E5]">Switch any time. Your photo stays loaded.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={templateId} onValueChange={(v) => setTemplateId(v as TemplateId)}>
              <TabsList className="bg-[#2a0a5b]">
                <TabsTrigger
                  value="speaking"
                  className="data-[state=active]:bg-[#8E5BFF] data-[state=active]:text-white"
                >
                  Speaking
                </TabsTrigger>
                <TabsTrigger
                  value="attending"
                  className="data-[state=active]:bg-[#8E5BFF] data-[state=active]:text-white"
                >
                  Attending
                </TabsTrigger>
              </TabsList>
              <TabsContent value="speaking" className="mt-4">
                <div className="rounded-md border border-[#8E5BFF]/20 p-4 bg-[#2a0a5b]/30 text-[#C9F1E5]">
                  <p className="text-base md:text-lg">
                    We are excited to have you on board for AWS Community Day Vadodara!
                  </p>
                  <p className="text-sm md:text-base text-[#C9F1E5]/80 mt-1">This will generate a Speaking post.</p>
                </div>
              </TabsContent>
              <TabsContent value="attending" className="mt-4">
                <div className="rounded-md border border-[#8E5BFF]/20 p-4 bg-[#2a0a5b]/30 text-[#C9F1E5]">
                  <p className="text-base md:text-lg">
                    We are excited to have you on board for AWS Community Day Vadodara!
                  </p>
                  <p className="text-sm md:text-base text-[#C9F1E5]/80 mt-1">This will generate an Attending post.</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Step 2: Upload & Adjust */}
        <Card className="bg-[#170233] border-[#754FEE]/30">
          <CardHeader>
            <CardTitle className="text-white">2. Upload and adjust</CardTitle>
            <CardDescription className="text-[#CAE9EE]">
              Drag inside preview to move. Use the slider or trackpad to resize.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-col md:flex-row items-center gap-3 rounded-lg border border-dashed border-[#8E5BFF] p-4 md:p-6 bg-[#2a0a5b]/30">
              <div className="rounded-md bg-[#8E5BFF]/20 p-2">
                <ImageIcon className="h-5 w-5 text-[#CAE9EE]" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="text-sm text-[#CAE9EE]">Upload a clear headshot or portrait photo</p>
                <p className="text-xs text-[#CAE9EE]/70">PNG or JPG recommended. Larger images look crisper.</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    onFileSelected(file)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                />
                <Button className="bg-[#8E5BFF] hover:bg-[#7b4be0] text-white" onClick={triggerUpload} type="button">
                  Upload photo
                </Button>
              </div>
            </div>

            <div
              className="relative mx-auto w-full max-w-[620px] aspect-square rounded-lg overflow-hidden bg-[#2a0a5b]/30 border border-[#8E5BFF]/30 cursor-grab active:cursor-grabbing touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onPointerLeave={(e) => {
                if (panning) endPan(e as unknown as React.PointerEvent)
              }}
              onWheel={onWheelZoom}
              role="img"
              aria-label="Badge preview"
              aria-busy={!templateImg}
            >
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="zoom" className="inline-flex items-center gap-2 text-[#CAE9EE]">
                  <ZoomIn className="h-4 w-4" /> Zoom
                </Label>
                <div className="text-xs text-[#CAE9EE]">{Math.round(zoom * 100)}%</div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#CAE9EE]/50 text-[#CAE9EE] hover:bg-[#CAE9EE]/10 bg-transparent"
                  onClick={() => setZoom((z) => clamp(Number.parseFloat((z - 0.05).toFixed(2)), 1, 3))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>

                {/* Native range input with CAE9EE accent color */}
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(clamp(Number.parseFloat(e.target.value), 1, 3))}
                  className="w-full h-2 rounded-full bg-[#CAE9EE]/20"
                  style={{ accentColor: "#CAE9EE" }}
                  aria-label="Zoom"
                />

                <Button
                  type="button"
                  variant="outline"
                  className="border-[#CAE9EE]/50 text-[#CAE9EE] hover:bg-[#CAE9EE]/10 bg-transparent"
                  onClick={() => setZoom((z) => clamp(Number.parseFloat((z + 0.05).toFixed(2)), 1, 3))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[#CAE9EE]"
                  onClick={() => {
                    setZoom(1)
                    setOffset({ x: 0, y: 0 })
                  }}
                  title="Reset to fit"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Fit to frame
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-end gap-3">
            <Button
              type="button"
              onClick={downloadImage}
              className="bg-[#8E5BFF] hover:bg-[#7b4be0] text-white"
              disabled={!templateImg}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PNG
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

// utils
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

"use client"

import type React from "react"

import { useState, useCallback } from "react"

export function useProductImages(initialImages: string[] = []) {
  const [images, setImages] = useState<string[]>(initialImages)
  const [showImageCropper, setShowImageCropper] = useState(false)
  const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      files.forEach((file) => {
        if (file instanceof Blob) {
          setSelectedImageForCrop(file)
          setShowImageCropper(true)
        }
      })
    }
  }, [])

  const handleImageCropComplete = useCallback((croppedImage: string) => {
    setImages((prev) => [...prev, croppedImage])
    setShowImageCropper(false)
    setSelectedImageForCrop(null)
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return {
    images,
    setImages,
    showImageCropper,
    setShowImageCropper,
    selectedImageForCrop,
    handleImageUpload,
    handleImageCropComplete,
    removeImage,
  }
}

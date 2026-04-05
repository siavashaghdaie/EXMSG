import React, { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface AvatarCropModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onSave: (croppedBlob: Blob) => void;
}

export default function AvatarCropModal({ file, isOpen, onClose, onSave }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageX, setImageX] = useState(0);
  const [imageY, setImageY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  const CROP_SIZE = 256; // Size of the circular crop area
  const CIRCLE_RADIUS = CROP_SIZE / 2;

  // Load image when file changes
  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Center image initially
        const containerWidth = containerRef.current?.clientWidth || 400;
        const containerHeight = containerRef.current?.clientHeight || 400;
        const centerX = (containerWidth - img.width * zoom) / 2;
        const centerY = (containerHeight - img.height * zoom) / 2;
        setImageX(centerX);
        setImageY(centerY);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [file]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !containerRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.save();
    ctx.drawImage(
      image,
      imageX,
      imageY,
      image.width * zoom,
      image.height * zoom
    );
    ctx.restore();

    // Circle mask - clear the middle to show image
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }, [image, imageX, imageY, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - imageX, y: e.clientY - imageY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    setImageX(newX);
    setImageY(newY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(3, zoom * delta));
    setZoom(newZoom);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - imageX, y: touch.clientY - imageY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      setImageX(touch.clientX - dragStart.x);
      setImageY(touch.clientY - dragStart.y);
    } else if (e.touches.length === 2) {
      // Pinch to zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if ((window as any).__lastPinchDistance) {
        const delta = distance / (window as any).__lastPinchDistance;
        const newZoom = Math.max(0.5, Math.min(3, zoom * delta));
        setZoom(newZoom);
      }
      (window as any).__lastPinchDistance = distance;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    delete (window as any).__lastPinchDistance;
  };

  const handleSave = async () => {
    if (!image || !containerRef.current) return;

    setIsSaving(true);

    try {
      // Create a temporary canvas for cropping
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = CROP_SIZE;
      cropCanvas.height = CROP_SIZE;
      const cropCtx = cropCanvas.getContext('2d');

      if (!cropCtx) {
        throw new Error('Could not get canvas context');
      }

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const centerX = containerWidth / 2;
      const centerY = containerHeight / 2;

      // Calculate the source region from the canvas
      const sourceX = centerX - CIRCLE_RADIUS - imageX;
      const sourceY = centerY - CIRCLE_RADIUS - imageY;

      // Draw the cropped image
      cropCtx.drawImage(
        image,
        sourceX / zoom,
        sourceY / zoom,
        CROP_SIZE / zoom,
        CROP_SIZE / zoom,
        0,
        0,
        CROP_SIZE,
        CROP_SIZE
      );

      // Create circular mask
      cropCtx.globalCompositeOperation = 'destination-in';
      cropCtx.beginPath();
      cropCtx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, Math.PI * 2);
      cropCtx.fill();

      // Convert canvas to blob
      cropCanvas.toBlob(
        (blob) => {
          if (blob) {
            onSave(blob);
            onClose();
          }
        },
        'image/jpeg',
        0.95
      );
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Crop Avatar</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Canvas Container */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center bg-black relative overflow-hidden cursor-move"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ minHeight: '300px', touchAction: 'none' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0" />

          {/* Instructions */}
          <div className="absolute top-4 left-0 right-0 text-center text-white text-sm opacity-75 pointer-events-none">
            <p>Drag to move • Pinch or scroll to zoom</p>
          </div>
        </div>

        {/* Zoom slider */}
        <div className="px-4 py-2 flex items-center gap-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-500">−</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-slate-500">+</span>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

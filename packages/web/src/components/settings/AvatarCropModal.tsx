import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

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
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const OUTPUT_SIZE = 512; // Output resolution for the saved avatar

  // The crop circle fills ~85% of the smaller container dimension
  const cropSize = Math.min(containerSize.width, containerSize.height) * 0.85 || 400;
  const circleRadius = cropSize / 2;

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  // Load image when file changes
  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Scale image to fit the crop circle initially
        const cW = containerRef.current?.clientWidth || 600;
        const cH = containerRef.current?.clientHeight || 600;
        const cs = Math.min(cW, cH) * 0.85;
        const fitZoom = Math.max(cs / img.width, cs / img.height);
        setZoom(fitZoom);
        const centerX = (cW - img.width * fitZoom) / 2;
        const centerY = (cH - img.height * fitZoom) / 2;
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

    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;

    canvas.width = cW;
    canvas.height = cH;

    // Draw image first
    ctx.clearRect(0, 0, cW, cH);
    ctx.drawImage(image, imageX, imageY, image.width * zoom, image.height * zoom);

    // Darken everything outside the circle
    const centerX = cW / 2;
    const centerY = cH / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, cW, cH);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Redraw image inside the circle (so it's not darkened)
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, imageX, imageY, image.width * zoom, image.height * zoom);
    ctx.restore();

    // Circle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.stroke();
  }, [image, imageX, imageY, zoom, containerSize, circleRadius]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - imageX, y: e.clientY - imageY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setImageX(e.clientX - dragStart.x);
    setImageY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.93 : 1.07;
    setZoom(prev => Math.max(0.1, Math.min(10, prev * delta)));
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
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if ((window as any).__lastPinchDistance) {
        const delta = distance / (window as any).__lastPinchDistance;
        setZoom(prev => Math.max(0.1, Math.min(10, prev * delta)));
      }
      (window as any).__lastPinchDistance = distance;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    delete (window as any).__lastPinchDistance;
  };

  const handleSave = useCallback(async () => {
    if (!image || !containerRef.current) return;

    setIsSaving(true);

    try {
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = OUTPUT_SIZE;
      cropCanvas.height = OUTPUT_SIZE;
      const cropCtx = cropCanvas.getContext('2d');

      if (!cropCtx) {
        throw new Error('Could not get canvas context');
      }

      const cW = containerRef.current.clientWidth;
      const cH = containerRef.current.clientHeight;
      const centerX = cW / 2;
      const centerY = cH / 2;

      // Calculate source region
      const sourceX = (centerX - circleRadius - imageX) / zoom;
      const sourceY = (centerY - circleRadius - imageY) / zoom;
      const sourceSize = cropSize / zoom;

      // Draw cropped image at output resolution
      cropCtx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Create circular mask
      const r = OUTPUT_SIZE / 2;
      cropCtx.globalCompositeOperation = 'destination-in';
      cropCtx.beginPath();
      cropCtx.arc(r, r, r, 0, Math.PI * 2);
      cropCtx.fill();

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
  }, [image, imageX, imageY, zoom, circleRadius, cropSize, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden">
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

        {/* Canvas Container — fills all available space */}
        <div
          ref={containerRef}
          className="flex-1 bg-black relative overflow-hidden cursor-move select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* Instructions overlay */}
          <div className="absolute top-3 left-0 right-0 text-center text-white text-sm opacity-60 pointer-events-none">
            Drag to move &middot; Scroll or pinch to zoom
          </div>
        </div>

        {/* Zoom controls */}
        <div className="px-4 py-3 flex items-center gap-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ZoomOut size={18} className="text-slate-500" />
          </button>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
          />
          <button
            onClick={() => setZoom(prev => Math.min(10, prev * 1.25))}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ZoomIn size={18} className="text-slate-500" />
          </button>
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

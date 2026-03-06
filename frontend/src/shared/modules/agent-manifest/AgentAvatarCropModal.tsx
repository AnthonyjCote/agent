/**
 * Purpose: Provide avatar image crop workflow with drag positioning and zoom controls.
 * Responsibilities:
 * - Render preview frame for image placement before avatar save.
 * - Return cropped avatar image data for manifest persistence.
 */
// @tags: shared-modules,agents,avatar,crop
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent
} from 'react';
import { ModalShell, TextButton } from '../../ui';
import './AgentAvatarCropModal.css';

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

type AgentAvatarCropModalProps = {
  open: boolean;
  sourceDataUrl: string | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
  onReplaceImage?: () => void;
};

const VIEWPORT_SIZE = 320;
const OUTPUT_SIZE = 512;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateFrame(image: LoadedImage | null, zoom: number) {
  if (!image) {
    return {
      drawWidth: VIEWPORT_SIZE,
      drawHeight: VIEWPORT_SIZE,
      maxOffsetX: 0,
      maxOffsetY: 0
    };
  }

  const baseScale = Math.max(VIEWPORT_SIZE / image.width, VIEWPORT_SIZE / image.height);
  const scaled = baseScale * zoom;
  const drawWidth = image.width * scaled;
  const drawHeight = image.height * scaled;

  return {
    drawWidth,
    drawHeight,
    maxOffsetX: Math.max(0, (drawWidth - VIEWPORT_SIZE) / 2),
    maxOffsetY: Math.max(0, (drawHeight - VIEWPORT_SIZE) / 2)
  };
}

function buildCroppedAvatar(
  image: LoadedImage,
  zoom: number,
  offsetX: number,
  offsetY: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  const frame = calculateFrame(image, zoom);
  const scale = OUTPUT_SIZE / VIEWPORT_SIZE;
  const drawX = ((VIEWPORT_SIZE - frame.drawWidth) / 2 + offsetX) * scale;
  const drawY = ((VIEWPORT_SIZE - frame.drawHeight) / 2 + offsetY) * scale;

  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image.element,
    drawX,
    drawY,
    frame.drawWidth * scale,
    frame.drawHeight * scale
  );

  return canvas.toDataURL('image/png');
}

export function AgentAvatarCropModal({
  open,
  sourceDataUrl,
  onCancel,
  onConfirm,
  onReplaceImage
}: AgentAvatarCropModalProps) {
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !sourceDataUrl) {
      setLoadedImage(null);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      return;
    }

    const image = new Image();
    image.onload = () => {
      setLoadedImage({ element: image, width: image.naturalWidth, height: image.naturalHeight });
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
    };
    image.src = sourceDataUrl;
  }, [open, sourceDataUrl]);

  const frame = useMemo(() => calculateFrame(loadedImage, zoom), [loadedImage, zoom]);

  useEffect(() => {
    setOffsetX((current) => clamp(current, -frame.maxOffsetX, frame.maxOffsetX));
    setOffsetY((current) => clamp(current, -frame.maxOffsetY, frame.maxOffsetY));
  }, [frame.maxOffsetX, frame.maxOffsetY]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!loadedImage) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    setOffsetX(clamp(drag.startOffsetX + deltaX, -frame.maxOffsetX, frame.maxOffsetX));
    setOffsetY(clamp(drag.startOffsetY + deltaY, -frame.maxOffsetY, frame.maxOffsetY));
  };

  const finishDrag = (event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) => {
    const pointerId = 'pointerId' in event ? event.pointerId : null;

    if (pointerId !== null && previewRef.current?.hasPointerCapture(pointerId)) {
      previewRef.current.releasePointerCapture(pointerId);
    }

    dragRef.current = null;
  };

  const handleConfirm = () => {
    if (!loadedImage) {
      return;
    }

    const cropped = buildCroppedAvatar(loadedImage, zoom, offsetX, offsetY);
    if (!cropped) {
      return;
    }

    onConfirm(cropped);
  };

  const imageStyle = {
    width: `${frame.drawWidth}px`,
    height: `${frame.drawHeight}px`,
    left: `${(VIEWPORT_SIZE - frame.drawWidth) / 2 + offsetX}px`,
    top: `${(VIEWPORT_SIZE - frame.drawHeight) / 2 + offsetY}px`
  } as const;

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      size="medium"
      title="Adjust Profile Image"
      footer={
        <>
          {onReplaceImage ? (
            <TextButton label="Replace Image" variant="ghost" onClick={onReplaceImage} />
          ) : null}
          <TextButton label="Cancel" variant="ghost" onClick={onCancel} />
          <TextButton label="Use Image" variant="primary" onClick={handleConfirm} />
        </>
      }
    >
      <div className="avatar-crop-modal-body">
        <div
          ref={previewRef}
          className="avatar-crop-preview"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onMouseLeave={finishDrag}
        >
          {loadedImage ? <img src={loadedImage.element.src} alt="Avatar crop preview" style={imageStyle} /> : null}
          <div className="avatar-crop-ring" aria-hidden="true" />
        </div>

        <label className="avatar-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
    </ModalShell>
  );
}

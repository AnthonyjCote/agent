import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import type { PendingMediaTarget } from '../types';

type UseOrgChartMediaEditorInput = {
  onSave: (target: Exclude<PendingMediaTarget, null>, sourceDataUrl: string, croppedDataUrl: string) => void;
};

type MediaState = {
  cropOpen: boolean;
  pendingMediaSource: string | null;
  mediaInputRef: RefObject<HTMLInputElement | null>;
  openMediaEditor: (target: Exclude<PendingMediaTarget, null>, sourceDataUrl: string, croppedDataUrl: string) => void;
  handleMediaFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleMediaCropConfirm: (croppedDataUrl: string) => void;
  handleMediaCropCancel: () => void;
  handleMediaReplaceImage: () => void;
};

export function useOrgChartMediaEditor(input: UseOrgChartMediaEditorInput): MediaState {
  const { onSave } = input;
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingMediaTarget, setPendingMediaTarget] = useState<PendingMediaTarget>(null);
  const [pendingMediaSource, setPendingMediaSource] = useState<string | null>(null);

  const openMediaEditor = (
    target: Exclude<PendingMediaTarget, null>,
    sourceDataUrl: string,
    croppedDataUrl: string
  ) => {
    setPendingMediaTarget(target);
    const existingSource = sourceDataUrl || croppedDataUrl;
    if (existingSource) {
      setPendingMediaSource(existingSource);
      setCropOpen(true);
      return;
    }
    setPendingMediaSource(null);
    mediaInputRef.current?.click();
  };

  const handleMediaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingMediaTarget) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === 'string' ? reader.result : '';
      if (!nextValue) {
        return;
      }
      setPendingMediaSource(nextValue);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleMediaCropConfirm = (croppedDataUrl: string) => {
    if (!pendingMediaTarget) {
      setCropOpen(false);
      setPendingMediaSource(null);
      return;
    }

    const sourceDataUrl = pendingMediaSource || croppedDataUrl;
    onSave(pendingMediaTarget, sourceDataUrl, croppedDataUrl);
    setCropOpen(false);
    setPendingMediaSource(null);
    setPendingMediaTarget(null);
  };

  const handleMediaCropCancel = () => {
    setCropOpen(false);
    setPendingMediaSource(null);
    setPendingMediaTarget(null);
  };

  const handleMediaReplaceImage = () => {
    setCropOpen(false);
    setPendingMediaSource(null);
    window.setTimeout(() => {
      mediaInputRef.current?.click();
    }, 0);
  };

  return {
    cropOpen,
    pendingMediaSource,
    mediaInputRef,
    openMediaEditor,
    handleMediaFileChange,
    handleMediaCropConfirm,
    handleMediaCropCancel,
    handleMediaReplaceImage
  };
}

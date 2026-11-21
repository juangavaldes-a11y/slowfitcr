"use client";

import { Alert, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { BARCODE_FORMATS, shouldAcceptScan } from "./lib/pos-cart";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const detectorCtor = (): BarcodeDetectorCtor | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

export function cameraScanSupported() {
  return Boolean(detectorCtor()) && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

type Props = { open: boolean; locale: "es" | "en"; onClose: () => void; onDetect: (code: string) => void };

// Camera barcode reading through the browser's BarcodeDetector. USB/Bluetooth scanners need nothing: they type into the search box.
export default function BarcodeScanner({ open, locale, onClose, onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const es = locale === "es";

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let last: { code: string; at: number } | null = null;

    const start = async () => {
      setError(null);
      const Detector = detectorCtor();
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setError(es ? "Este navegador no puede leer códigos con la cámara. Usa un lector USB o escribe el código." : "This browser cannot read barcodes with the camera. Use a USB scanner or type the code.");
        return;
      }
      try {
        const supported = (await Detector.getSupportedFormats?.()) ?? [...BARCODE_FORMATS];
        const detector = new Detector({ formats: BARCODE_FORMATS.filter((format) => supported.includes(format)) });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue?.trim();
            if (value && shouldAcceptScan(last, value, Date.now())) {
              last = { code: value, at: Date.now() };
              onDetect(value);
            }
          } catch {
            // A frame that cannot be decoded is normal; keep scanning.
          }
          frame = window.setTimeout(tick, 200);
        };
        void tick();
      } catch {
        setError(es ? "No pudimos abrir la cámara. Revisa el permiso del navegador." : "We could not open the camera. Check the browser permission.");
      }
    };
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, es, onDetect]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={es ? "Escanear con la cámara" : "Scan with the camera"} destroyOnHidden>
      {error ? <Alert type="warning" showIcon title={error} /> : (
        <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8, background: "#000" }} />
      )}
    </Modal>
  );
}

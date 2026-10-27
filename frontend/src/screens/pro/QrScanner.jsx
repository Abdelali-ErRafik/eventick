import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, SwitchCamera } from "lucide-react";
import jsQR from "jsqr";
import { Btn } from "./ui";
import { useI18n } from "../../i18n";
import { text } from "./copy";

/**
 * Camera QR scanner for the gate.
 *
 * Decodes in a requestAnimationFrame loop on a canvas, because a <video>
 * frame is the only thing jsQR can read. Scans are debounced per payload so
 * one ticket held in front of the lens doesn't fire dozens of check-ins while
 * the door staff reads the result.
 *
 * getUserMedia needs a secure context: it works on localhost and over HTTPS,
 * and silently fails on a plain-HTTP LAN address — which is exactly how a
 * phone at a real gate would connect. The error state says so rather than
 * leaving a blank rectangle.
 */
export default function QrScanner({ onScan, paused }) {
  const { locale } = useI18n();
  const t = text[locale];
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef({ value: "", at: 0 });

  const [state, setState] = useState("idle"); // idle | starting | live | error
  const [error, setError] = useState("");
  const [facing, setFacing] = useState("environment");

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState("starting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext ? t.camUnsupported : t.camInsecure);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setState("live");
    } catch (err) {
      stop();
      setState("error");
      setError(
        err?.name === "NotAllowedError"
          ? t.camDenied
          : err?.name === "NotFoundError"
            ? t.camMissing
            : err?.message || t.camFail,
      );
    }
  }, [facing, stop, t]);

  // Restart the stream when the camera is flipped, and always release it on unmount.
  useEffect(() => {
    if (state === "live" || state === "starting") {
      stop();
      start();
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (state !== "live") return undefined;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !paused) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, w, h);
          const image = ctx.getImageData(0, 0, w, h);
          const found = jsQR(image.data, w, h, { inversionAttempts: "dontInvert" });
          if (found?.data) {
            const now = Date.now();
            const same = found.data === lastRef.current.value;
            // 3s debounce for the same code, so a ticket left in frame
            // doesn't spam the gate; a different code scans immediately.
            if (!same || now - lastRef.current.at > 3000) {
              lastRef.current = { value: found.data, at: now };
              onScan(found.data);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, paused, onScan]);

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-encre">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {state === "live" ? (
          <>
            {/* Reticle: shows the staff where to hold the ticket. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-48 rounded-2xl border-4 border-accent/80 shadow-[0_0_0_9999px_rgba(20,23,47,0.45)]" />
            </div>
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label={t.flipCam}
              title={t.flipCam}
              className="absolute end-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-encre/70 text-foam backdrop-blur"
            >
              <SwitchCamera className="size-5" />
            </button>
          </>
        ) : null}

        {state === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-mist">
            <Loader2 className="size-5 animate-spin" />
            {t.camStarting}
          </div>
        ) : null}

        {state === "idle" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-mist">{t.camIdle}</p>
            <Btn onClick={start}>{t.camStart}</Btn>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff className="size-8 text-danger" />
            <p className="max-w-sm text-sm text-mist">{error}</p>
            <Btn variant="secondary" onClick={start}>
              {t.camRetry}
            </Btn>
          </div>
        ) : null}
      </div>

      {state === "live" ? <p className="mt-2 text-center text-xs text-muted">{t.camHint}</p> : null}
    </div>
  );
}

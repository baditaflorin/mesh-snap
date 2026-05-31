import { useEffect, useMemo, useRef, useState } from "react";
import { createClockSync, type MeshConfig, type YRoom } from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Trigger = {
  /** Mesh-time ms at which every phone should fire its shutter. */
  fireAtMs: number;
  id: string;
};

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="snap-screen">
        <h1>mesh snap</h1>
        <p className="snap-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room }: { room: YRoom; config: MeshConfig }) {
  const [armed, setArmed] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [, rerender] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFiredRef = useRef("");
  const fireTimerRef = useRef<number | null>(null);

  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);

  useEffect(() => {
    const m = room.doc.getMap<Trigger>("trigger");
    const onChange = () => rerender((n) => n + 1);
    m.observe(onChange);
    return () => m.unobserve(onChange);
  }, [room]);

  // Set up camera once armed
  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStreamReady(true);
      } catch (err) {
        console.warn("[snap] camera denied", err);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStreamReady(false);
    };
  }, [armed]);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setPhotos((p) => [dataUrl, ...p].slice(0, 12));
  }

  // Schedule the snap when a trigger arrives
  useEffect(() => {
    if (!armed) return;
    const trig = room.doc.getMap<Trigger>("trigger").get("current");
    if (!trig || trig.id === lastFiredRef.current) return;
    const delay = trig.fireAtMs - clock.meshNow();
    if (fireTimerRef.current !== null) window.clearTimeout(fireTimerRef.current);
    if (delay <= 0) {
      capture();
    } else {
      fireTimerRef.current = window.setTimeout(() => capture(), Math.max(0, delay));
    }
    lastFiredRef.current = trig.id;
    return () => {
      if (fireTimerRef.current !== null) window.clearTimeout(fireTimerRef.current);
    };
  });

  const trig = room.doc.getMap<Trigger>("trigger").get("current");
  const remaining = trig ? Math.max(0, trig.fireAtMs - clock.meshNow()) : 0;
  const countingDown = !!trig && remaining > 0 && remaining < 30_000;

  // Re-render during countdown
  useEffect(() => {
    if (!countingDown) return;
    const t = setInterval(() => rerender((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [countingDown]);

  const fireIn = (sec: number) => {
    room.doc.getMap<Trigger>("trigger").set("current", {
      fireAtMs: clock.meshNow() + sec * 1000,
      id: crypto.randomUUID(),
    });
  };

  return (
    <div className="snap-screen">
      <header className="snap-header">
        <h1>mesh snap</h1>
        <p className="snap-status">
          {room.peerCount + 1} camera{room.peerCount === 0 ? "" : "s"} on the mesh
        </p>
      </header>

      {!armed && (
        <div className="snap-arm">
          <p>
            Each phone arms its camera once (browser permission). Then any phone can trigger a
            countdown — every armed camera fires its shutter at the same mesh-time millisecond.
          </p>
          <button type="button" onClick={() => setArmed(true)}>
            arm camera
          </button>
        </div>
      )}

      {armed && (
        <>
          <video ref={videoRef} className="snap-preview" playsInline muted />
          {streamReady && (
            <p className="snap-help">
              camera ready · {photos.length} shot{photos.length === 1 ? "" : "s"} captured
            </p>
          )}

          {countingDown ? (
            <div className="snap-countdown" data-fire-at={trig ? String(trig.fireAtMs) : undefined}>
              {Math.ceil(remaining / 1000)}
            </div>
          ) : (
            <div className="snap-actions">
              <button type="button" onClick={() => fireIn(3)}>
                3-2-1 snap
              </button>
              <button type="button" onClick={() => fireIn(10)}>
                10s timer
              </button>
            </div>
          )}

          {photos.length > 0 && (
            <div className="snap-gallery">
              {photos.map((p, i) => (
                <a key={`${i}-${p.slice(-12)}`} href={p} download={`snap-${i}.jpg`}>
                  <img src={p} alt={`shot ${i + 1}`} />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

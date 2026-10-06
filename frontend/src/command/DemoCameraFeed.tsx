import { useEffect, useRef } from "react";
/** Explicit visualization of simulated detections; never presented as inference. */
export function DemoCameraFeed({
  name,
  construction = false,
}: {
  name: string;
  construction?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const start = performance.now();
    function draw(timestamp: number) {
      if (!context) return;
      const t = (timestamp - start) / 1000;
      const w = 640,
        h = 340;
      context.fillStyle = "#0a1520";
      context.fillRect(0, 0, w, h);
      context.fillStyle = "#1d2a32";
      context.beginPath();
      context.moveTo(230, 50);
      context.lineTo(440, 50);
      context.lineTo(600, h);
      context.lineTo(45, h);
      context.fill();
      context.strokeStyle = "#65808b";
      context.setLineDash([12, 14]);
      context.lineWidth = 2;
      for (let n = 1; n < 3; n++) {
        context.beginPath();
        context.moveTo(230 + n * 70, 50);
        context.lineTo(45 + n * 185, h);
        context.stroke();
      }
      context.setLineDash([]);
      for (let n = 0; n < 7; n++) {
        const progress = (t * 0.07 + n / 7) % 1,
          y = 70 + progress * 220,
          size = 10 + progress * 35,
          lane = n % 3,
          x = 240 + lane * 65 + (lane - 1) * progress * 125;
        context.fillStyle = n % 2 ? "#406276" : "#8e9b9d";
        context.fillRect(x, y, size * 0.75, size);
        context.strokeStyle = "#45d4ee";
        context.strokeRect(x - 4, y - 4, size * 0.75 + 8, size + 8);
        context.fillStyle = "#53def5";
        context.font = "9px monospace";
        context.fillText("SIM-VEH-" + n, x - 4, y - 7);
      }
      if (construction) {
        context.strokeStyle = "#ebba6a";
        context.strokeRect(430, 225, 95, 85);
        context.fillStyle = "#ebba6a";
        context.font = "10px monospace";
        context.fillText("DEMO CONSTRUCTION", 404, 216);
        for (let n = 0; n < 4; n++) {
          context.beginPath();
          context.moveTo(447 + n * 17, 245);
          context.lineTo(440 + n * 17, 266);
          context.lineTo(454 + n * 17, 266);
          context.fill();
        }
      }
      context.fillStyle = "#050b12bb";
      context.fillRect(0, 0, w, 37);
      context.fillStyle = "#a2b5c5";
      context.font = "11px monospace";
      context.fillText(name + " · SIMULATED SENSOR VIEW", 14, 24);
      context.fillStyle = "#63dcae";
      context.fillText("DEMO · NOT LIVE FOOTAGE", 14, 326);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [name, construction]);
  return (
    <canvas
      width={640}
      height={340}
      ref={canvas}
      className="demo-camera-canvas"
      aria-label={`${name} simulated camera visualization`}
    />
  );
}

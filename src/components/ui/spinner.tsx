import { cn } from "@/lib/utils";

/**
 * Unigreen loading indicator — a spinning wind turbine.
 * The three blades use the brand colours (mint / cyan / purple),
 * echoing the three-leaf logo mark.
 */
export function TurbineSpinner({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // A leaf-shaped blade pointing up from the hub (50,50).
  const blade = "M50 47 C 43 38 43 18 50 9 C 57 18 57 38 50 47 Z";

  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Tower (static, behind the rotor) */}
      <span
        className="absolute left-1/2 top-1/2 rounded-b-full bg-slate-300"
        style={{
          width: Math.max(2, size * 0.06),
          height: size * 0.46,
          transform: "translateX(-50%)",
        }}
      />

      {/* Rotor (spins around the hub at the centre) */}
      <svg
        viewBox="0 0 100 100"
        className="relative animate-spin"
        style={{ width: size, height: size, animationDuration: "1.2s" }}
      >
        <g transform="rotate(0 50 50)">
          <path d={blade} fill="var(--brand-mint)" />
        </g>
        <g transform="rotate(120 50 50)">
          <path d={blade} fill="var(--brand-cyan)" />
        </g>
        <g transform="rotate(240 50 50)">
          <path d={blade} fill="var(--brand-purple)" />
        </g>
        <circle cx="50" cy="50" r="7.5" fill="var(--sidebar)" />
        <circle cx="50" cy="50" r="3" fill="#ffffff" />
      </svg>
    </span>
  );
}

/** Centred loading screen with the turbine spinner and a label. */
export function LoadingScreen({
  label = "กำลังโหลด…",
  fullScreen = false,
}: {
  label?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        fullScreen ? "min-h-screen" : "min-h-[60vh]"
      )}
    >
      <TurbineSpinner size={64} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

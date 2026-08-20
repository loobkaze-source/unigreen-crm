import { cn } from "@/lib/utils";
import { RandomLoadingArt } from "@/components/ui/loading-art";

/**
 * Centred loading screen — shows one of the random energy-themed animations
 * (cloud / fuel nozzle / wind turbine / solar PV) with a label.
 */
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
        "flex flex-col items-center justify-center gap-3",
        fullScreen ? "min-h-screen" : "min-h-[60vh]"
      )}
    >
      <RandomLoadingArt />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

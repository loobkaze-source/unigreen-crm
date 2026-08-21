import { cn } from "@/lib/utils";
import { RandomLoadingArt } from "@/components/ui/loading-art";

/**
 * Centred loading screen — the sweeping ring with one of the company's four
 * faces at its centre, picked at random, and a label under it.
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

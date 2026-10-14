import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <img
            src="/brand/sera-khabar-mark.webp"
            alt="Sera Khabar Suite"
            className={cn("shrink-0 object-contain", className)}
        />
    );
}

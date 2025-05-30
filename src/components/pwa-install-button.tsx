import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Icons } from "@/components/icons";

export function PWAInstallButton() {
  const { isInstallable, install } = usePWAInstall();

  if (!isInstallable) {
    return null;
  }

  return (
    <Button
      onClick={install}
      variant="outline"
      className="w-full flex items-center gap-2"
    >
      <Icons.share2 className="h-4 w-4" />
      Install App
    </Button>
  );
} 
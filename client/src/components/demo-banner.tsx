import { AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface DemoBannerProps {
  message?: string;
}

export default function DemoBanner({ message }: DemoBannerProps) {
  const handleSetupClick = () => {
    window.open("https://console.developers.google.com/apis", "_blank");
  };

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <strong>Demo Mode:</strong> {message || "Using sample videos. Enable YouTube Data API v3 for real content."}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSetupClick}
            className="ml-3 border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            Setup Guide
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
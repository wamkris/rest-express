import { useState, useEffect } from "react";
import { Bell, BellOff, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NotificationPermissionOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionResult: (granted: boolean) => void;
}

export default function NotificationPermissionOverlay({
  isOpen,
  onClose,
  onPermissionResult
}: NotificationPermissionOverlayProps) {
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const handleAllowNotifications = async () => {
    setIsRequestingPermission(true);
    
    try {
      if (!('Notification' in window)) {
        onPermissionResult(false);
        onClose();
        return;
      }

      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      
      onPermissionResult(granted);
      onClose();
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      onPermissionResult(false);
      onClose();
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleBlockNotifications = () => {
    onPermissionResult(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-center">
            <Bell className="w-5 h-5 text-blue-600" />
            Enable Notifications
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Notification Preview */}
          <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-sm">
                  Your 30 minute learning session is ready!
                </div>
                <div className="text-gray-600 text-xs mt-1">
                  Tonight: React Hooks (Video 1 of 8)
                </div>
                <div className="flex gap-2 mt-2">
                  <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    Start Learning
                  </div>
                  <div className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                    Remind me in 15min
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center space-y-3">
            <div className="text-sm text-gray-600">
              Get personalized learning reminders to help you stay on track with your educational goals.
            </div>
            
            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleAllowNotifications}
                disabled={isRequestingPermission}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isRequestingPermission ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Requesting Permission...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Allow Notifications
                  </>
                )}
              </Button>
              
              <Button 
                onClick={handleBlockNotifications}
                variant="outline"
                disabled={isRequestingPermission}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                Not Now
              </Button>
            </div>

            <div className="text-xs text-gray-500">
              You can change this setting anytime in your browser settings
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
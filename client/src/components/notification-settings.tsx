import { useState, useEffect } from "react";
import { Bell, BellOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { requestNotificationPermission, scheduleLearningReminder } from "../lib/notifications";
import { useToast } from "@/hooks/use-toast";
import NotificationPermissionOverlay from "./notification-permission-overlay";

const NOTIFICATION_OPTIONS = [
  { value: "morning", label: "Morning (8:00 AM)" },
  { value: "lunch", label: "Lunch (12:00 PM)" },
  { value: "evening", label: "Evening (7:00 PM)" },
  { value: "custom", label: "Custom time..." },
];

export default function NotificationSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [showPermissionOverlay, setShowPermissionOverlay] = useState(false);
  const [notificationTime, setNotificationTime] = useState<string>("");
  const [customTime, setCustomTime] = useState<string>("19:00");
  const [hasPermission, setHasPermission] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check current notification permission
    setHasPermission(Notification.permission === 'granted');
    
    // Load saved settings
    const saved = localStorage.getItem('notificationPreferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      if (prefs.notificationTime) {
        setNotificationTime(prefs.notificationTime);
      }
      if (prefs.customTime) {
        setCustomTime(prefs.customTime);
      }
    }
  }, []);

  const handleEnableNotifications = async () => {
    if (Notification.permission === 'default') {
      setShowPermissionOverlay(true);
    } else {
      const permission = await requestNotificationPermission();
      setHasPermission(permission);
      
      if (!permission) {
        toast({
          title: "Notifications blocked",
          description: "Please enable notifications in your browser settings",
          variant: "destructive",
        });
      }
    }
  };

  const handlePermissionResult = (granted: boolean) => {
    setHasPermission(granted);
    if (granted) {
      toast({
        title: "Notifications enabled!",
        description: "You can now set learning reminders",
      });
    } else {
      toast({
        title: "Notifications not enabled",
        description: "You can enable them later in browser settings",
        variant: "destructive",
      });
    }
  };

  const handleSaveSettings = () => {
    if (!hasPermission) {
      toast({
        title: "Enable notifications first",
        description: "Please allow notifications to set reminders",
        variant: "destructive",
      });
      return;
    }

    if (!notificationTime) {
      toast({
        title: "Please select a time",
        description: "Choose when you'd like to be reminded",
        variant: "destructive",
      });
      return;
    }

    // Save preferences
    const preferences = {
      notificationTime,
      customTime: notificationTime === 'custom' ? customTime : null,
      topic: "your learning session", // Generic topic for header settings
      timeLimit: 30 // Default time limit
    };

    localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
    
    // Schedule the reminder
    scheduleLearningReminder("generic", preferences.topic, preferences.timeLimit, preferences.notificationTime, preferences.customTime || undefined);
    
    const timeLabel = getTimeLabel(notificationTime, customTime);
    toast({
      title: "Reminder set!",
      description: `You'll be reminded to learn at ${timeLabel}`,
    });
    
    setIsOpen(false);
  };

  const handleDisableReminders = () => {
    // Clear any existing scheduled notifications
    if ('serviceWorker' in navigator && 'Notification' in window) {
      // Clear the notification preferences to stop future scheduling
      localStorage.removeItem('notificationPreferences');
    }
    
    setNotificationTime("");
    
    toast({
      title: "Reminders disabled",
      description: "Learning reminders have been turned off",
    });
    
    setIsOpen(false);
  };

  const getTimeLabel = (timeSlot: string, customTimeValue: string) => {
    switch (timeSlot) {
      case "morning":
        return "8:00 AM daily";
      case "lunch":
        return "12:00 PM daily";
      case "evening":
        return "7:00 PM daily";
      case "custom":
        const [hours, minutes] = customTimeValue.split(':');
        const hour12 = parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
        const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
        return `${hour12 === 0 ? 12 : hour12}:${minutes} ${ampm} daily`;
      default:
        return "7:00 PM daily";
    }
  };

  const isReminderActive = notificationTime && hasPermission;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm"
            className="relative p-2"
          >
            {isReminderActive ? (
              <Bell className="w-5 h-5 text-blue-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            {isReminderActive && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full"></div>
            )}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Learning Reminders
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!hasPermission ? (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                  <div className="text-center space-y-3">
                    <BellOff className="w-8 h-8 text-blue-600 mx-auto" />
                    <div className="text-sm font-medium text-blue-900">
                      Enable notifications to get learning reminders
                    </div>
                    <Button 
                      onClick={handleEnableNotifications}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      Enable Notifications
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="notification-time" className="text-sm font-medium">
                    Reminder Time
                  </Label>
                  <Select value={notificationTime} onValueChange={setNotificationTime}>
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue placeholder="Choose when to remind you..." />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {notificationTime === 'custom' && (
                  <div>
                    <Label htmlFor="custom-time" className="text-sm font-medium">
                      Custom Time
                    </Label>
                    <input
                      id="custom-time"
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveSettings}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={!notificationTime}
                  >
                    Save Reminder
                  </Button>
                  
                  {isReminderActive && (
                    <Button 
                      onClick={handleDisableReminders}
                      variant="outline"
                      className="px-3"
                    >
                      <BellOff className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {isReminderActive && (
                  <div className="text-xs text-green-600 text-center">
                    ✓ Reminder set for {getTimeLabel(notificationTime, customTime)}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <NotificationPermissionOverlay
        isOpen={showPermissionOverlay}
        onClose={() => setShowPermissionOverlay(false)}
        onPermissionResult={handlePermissionResult}
      />
    </>
  );
}
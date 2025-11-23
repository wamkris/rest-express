import { useState, useEffect } from "react";
import { Bell, BellOff, Settings, Plus } from "lucide-react";
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

interface ResultsNotificationSettingsProps {
  topic: string;
  learningGoal: string;
  preferenceId: string;
}

export default function ResultsNotificationSettings({ 
  topic, 
  learningGoal, 
  preferenceId 
}: ResultsNotificationSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPermissionOverlay, setShowPermissionOverlay] = useState(false);
  const [notificationTime, setNotificationTime] = useState<string>("");
  const [customTime, setCustomTime] = useState<string>("19:00");
  const [hasPermission, setHasPermission] = useState(false);
  const [existingNotifications, setExistingNotifications] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Check current notification permission
    setHasPermission(Notification.permission === 'granted');
    
    // Load existing notifications for this topic
    loadExistingNotifications();
  }, [preferenceId]);

  const loadExistingNotifications = () => {
    try {
      const saved = localStorage.getItem('activeNotifications');
      if (saved) {
        const notifications = JSON.parse(saved);
        const topicNotifications = notifications.filter((n: any) => n.preferenceId === preferenceId);
        setExistingNotifications(topicNotifications);
      }
    } catch (error) {
      console.error('Failed to load existing notifications:', error);
    }
  };

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
        description: "You can now set learning reminders for this topic",
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
      handleEnableNotifications();
      return;
    }

    if (!notificationTime) {
      toast({
        title: "Please select a time",
        description: "Choose when you'd like to be reminded about this topic",
        variant: "destructive",
      });
      return;
    }

    // Create notification object
    const notification = {
      id: `${preferenceId}-${Date.now()}`,
      preferenceId,
      topic,
      learningGoal,
      notificationTime,
      customTime: notificationTime === 'custom' ? customTime : null,
      createdAt: new Date().toISOString()
    };

    // Save to active notifications
    try {
      const saved = localStorage.getItem('activeNotifications');
      const notifications = saved ? JSON.parse(saved) : [];
      
      // Check if notification for this time already exists
      const existingIndex = notifications.findIndex((n: any) => 
        n.preferenceId === preferenceId && 
        n.notificationTime === notificationTime &&
        (notificationTime !== 'custom' || n.customTime === customTime)
      );

      if (existingIndex >= 0) {
        toast({
          title: "Reminder already set",
          description: "You already have a reminder for this time",
          variant: "destructive",
        });
        return;
      }

      notifications.push(notification);
      localStorage.setItem('activeNotifications', JSON.stringify(notifications));
      
      // Schedule the reminder
      scheduleLearningReminder(preferenceId, topic, learningGoal, notificationTime, notification.customTime || undefined);
      
      const timeLabel = getTimeLabel(notificationTime, customTime);
      toast({
        title: "Reminder set!",
        description: `You'll be reminded about "${topic}" at ${timeLabel}`,
      });
      
      // Reset form and refresh list
      setNotificationTime("");
      setCustomTime("19:00");
      loadExistingNotifications();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to save notification:', error);
      toast({
        title: "Failed to save reminder",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRemoveNotification = (notificationId: string) => {
    try {
      const saved = localStorage.getItem('activeNotifications');
      if (saved) {
        const notifications = JSON.parse(saved);
        const updated = notifications.filter((n: any) => n.id !== notificationId);
        localStorage.setItem('activeNotifications', JSON.stringify(updated));
        loadExistingNotifications();
        
        toast({
          title: "Reminder removed",
          description: "Learning reminder has been cancelled",
        });
      }
    } catch (error) {
      console.error('Failed to remove notification:', error);
    }
  };

  const getTimeLabel = (timeSlot: string, customTimeValue: string) => {
    switch (timeSlot) {
      case "morning":
        return "8:00 AM";
      case "lunch":
        return "12:00 PM";
      case "evening":
        return "7:00 PM";
      case "custom":
        const [hours, minutes] = customTimeValue.split(':');
        const hour12 = parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
        const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
        return `${hour12 === 0 ? 12 : hour12}:${minutes} ${ampm}`;
      default:
        return "7:00 PM";
    }
  };

  const hasActiveNotifications = existingNotifications.length > 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm"
            className="relative p-2"
          >
            {hasActiveNotifications ? (
              <Bell className="w-5 h-5 text-blue-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            {hasActiveNotifications && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{existingNotifications.length}</span>
              </div>
            )}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications for "{topic}"
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing Notifications */}
            {hasActiveNotifications && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Active Reminders</Label>
                {existingNotifications.map((notification) => (
                  <div key={notification.id} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-900">
                        {getTimeLabel(notification.notificationTime, notification.customTime || "19:00")} daily
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRemoveNotification(notification.id)}
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto text-green-600 hover:text-red-600"
                    >
                      <BellOff className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Notification */}
            <div className="space-y-3 border-t pt-3">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Add New Reminder
              </Label>
              
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
                <div className="space-y-3">
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

                  <Button 
                    onClick={handleSaveSettings}
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={!notificationTime}
                  >
                    Add Reminder
                  </Button>
                </div>
              )}
            </div>
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
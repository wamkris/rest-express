import { useState, useEffect } from "react";
import { Bell, BellOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface NotificationData {
  id: string;
  preferenceId: string;
  topic: string;
  timeLimit: number;
  notificationTime: string;
  customTime?: string;
  createdAt: string;
}

export default function NotificationsViewer() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadNotifications();
  }, [isOpen]); // Reload when dialog opens

  const loadNotifications = () => {
    try {
      const saved = localStorage.getItem('activeNotifications');
      if (saved) {
        const allNotifications = JSON.parse(saved);
        setNotifications(allNotifications);
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setNotifications([]);
    }
  };

  const handleRemoveNotification = (notificationId: string) => {
    try {
      const saved = localStorage.getItem('activeNotifications');
      if (saved) {
        const allNotifications = JSON.parse(saved);
        const updated = allNotifications.filter((n: NotificationData) => n.id !== notificationId);
        localStorage.setItem('activeNotifications', JSON.stringify(updated));
        setNotifications(updated);
        
        toast({
          title: "Reminder removed",
          description: "Learning reminder has been cancelled",
        });
      }
    } catch (error) {
      console.error('Failed to remove notification:', error);
      toast({
        title: "Error",
        description: "Failed to remove reminder",
        variant: "destructive",
      });
    }
  };

  const getTimeLabel = (timeSlot: string, customTimeValue?: string) => {
    switch (timeSlot) {
      case "morning":
        return "8:00 AM";
      case "lunch":
        return "12:00 PM";
      case "evening":
        return "7:00 PM";
      case "custom":
        if (customTimeValue) {
          const [hours, minutes] = customTimeValue.split(':');
          const hour12 = parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
          const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
          return `${hour12 === 0 ? 12 : hour12}:${minutes} ${ampm}`;
        }
        return "7:00 PM";
      default:
        return "7:00 PM";
    }
  };

  const hasNotifications = notifications.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="relative p-2"
        >
          {hasNotifications ? (
            <Bell className="w-5 h-5 text-blue-600" />
          ) : (
            <BellOff className="w-5 h-5 text-gray-400" />
          )}
          {hasNotifications && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{notifications.length}</span>
            </div>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Your Learning Reminders
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!hasNotifications ? (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="pt-4">
                <div className="text-center space-y-3">
                  <BellOff className="w-8 h-8 text-gray-400 mx-auto" />
                  <div className="text-sm font-medium text-gray-600">
                    No notifications enabled yet
                  </div>
                  <div className="text-xs text-gray-500">
                    Set reminders from the results page after searching for topics
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-700">
                Active Reminders ({notifications.length})
              </div>
              
              {notifications.map((notification) => (
                <div key={notification.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-green-900 truncate">
                      {notification.topic}
                    </div>
                    <div className="text-xs text-green-700">
                      {getTimeLabel(notification.notificationTime, notification.customTime)} daily
                    </div>
                    <div className="text-xs text-green-600">
                      {notification.timeLimit} minutes available
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRemoveNotification(notification.id)}
                    variant="ghost"
                    size="sm"
                    className="p-1 h-auto text-green-600 hover:text-red-600 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
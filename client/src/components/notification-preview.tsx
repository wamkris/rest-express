import { Bell, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NotificationPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  notificationTime: string;
  topic: string;
  learningGoal: string;
  customTime?: string;
}

export default function NotificationPreview({
  isOpen,
  onClose,
  notificationTime,
  topic,
  learningGoal,
  customTime
}: NotificationPreviewProps) {
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

  const timeLabel = getTimeLabel(notificationTime, customTime);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Notifications Enabled!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Notification Preview */}
          <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-sm">
                  Your {learningGoal.toLowerCase()} session for {topic} is ready!
                </div>
                <div className="text-gray-600 text-xs mt-1">
                  Tonight: {topic} (Video 1 of 8)
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

          {/* Schedule Info */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-sm font-medium text-blue-900">
                  Daily Reminder Schedule
                </div>
                <div className="text-lg font-bold text-blue-700 mt-1">
                  {timeLabel} every day
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  You'll get notifications like the preview above
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Button */}
          <Button 
            onClick={onClose}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            Perfect! Continue to Videos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
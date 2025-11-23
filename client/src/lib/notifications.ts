import { getTopicProgress, getAllProgress, type TopicProgress } from "./progress";

// Notification settings data structure
export interface NotificationSettings {
  enabled: boolean;
  time: string; // "morning", "lunch", "evening", or custom time like "14:30"
  customTime?: string; // HH:MM format for custom time
  snoozeMinutes: number;
  lastNotified?: Date;
}

// Default settings
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  time: "evening",
  snoozeMinutes: 15,
};

const NOTIFICATION_STORAGE_KEY = 'youtube_curator_notifications';
const SCHEDULED_NOTIFICATIONS_KEY = 'youtube_curator_scheduled';

// Get notification settings from localStorage
export function getNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    
    const settings = JSON.parse(stored);
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      lastNotified: settings.lastNotified ? new Date(settings.lastNotified) : undefined,
    };
  } catch (error) {
    console.error('Failed to load notification settings:', error);
    return DEFAULT_SETTINGS;
  }
}

// Save notification settings
export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save notification settings:', error);
  }
}

// Convert notification time to actual time
export function getNotificationTime(timeSlot: string, customTime?: string): { hours: number; minutes: number } {
  switch (timeSlot) {
    case "morning":
      return { hours: 8, minutes: 0 };
    case "lunch":
      return { hours: 12, minutes: 0 };
    case "evening":
      return { hours: 19, minutes: 0 }; // 7 PM
    case "custom":
      if (customTime) {
        const [hours, minutes] = customTime.split(':').map(Number);
        return { hours, minutes };
      }
      return { hours: 19, minutes: 0 }; // Default to evening
    default:
      return { hours: 19, minutes: 0 };
  }
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

// Show immediate notification
export function showNotification(
  title: string,
  options: {
    body: string;
    icon?: string;
    badge?: string;
    data?: any;
    actions?: { action: string; title: string; icon?: string }[];
  }
): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/manifest-icon-192.png',
      badge: '/manifest-icon-192.png',
      requireInteraction: true,
      ...options,
    });

    // Handle notification click
    notification.onclick = () => {
      window.focus();
      if (options.data?.url) {
        window.location.href = options.data.url;
      }
      notification.close();
    };

    return notification;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return null;
  }
}

// Schedule learning reminder for a topic
export function scheduleLearningReminder(
  preferenceId: string,
  topic: string,
  learningGoal: string,
  notificationTime: string,
  customTime?: string
): void {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  const { hours, minutes } = getNotificationTime(notificationTime, customTime);
  
  // Calculate next notification time
  const now = new Date();
  const nextNotification = new Date();
  nextNotification.setHours(hours, minutes, 0, 0);
  
  // If the time has passed for today, schedule for tomorrow
  if (nextNotification <= now) {
    nextNotification.setDate(nextNotification.getDate() + 1);
  }

  const timeUntilNotification = nextNotification.getTime() - now.getTime();

  // Store scheduled reminder
  const scheduledReminders = getScheduledReminders();
  const reminderId = `${preferenceId}_${Date.now()}`;
  
  scheduledReminders[reminderId] = {
    preferenceId,
    topic,
    learningGoal,
    scheduledTime: nextNotification.toISOString(),
    notificationTime,
    customTime,
  };
  
  saveScheduledReminders(scheduledReminders);

  // Schedule the notification
  const timeoutId = setTimeout(() => {
    triggerLearningReminder(preferenceId, topic, learningGoal);
    
    // Remove from scheduled reminders
    const updatedReminders = getScheduledReminders();
    delete updatedReminders[reminderId];
    saveScheduledReminders(updatedReminders);
  }, timeUntilNotification);

  // Store timeout ID for potential cancellation
  const timeoutIds = getActiveTimeouts();
  timeoutIds[reminderId] = timeoutId as any;
  saveActiveTimeouts(timeoutIds);
}

// Trigger the actual learning reminder notification
export function triggerLearningReminder(preferenceId: string, topic: string, learningGoal: string): void {
  const progress = getTopicProgress(preferenceId);
  if (!progress) return;

  const { completedVideos, totalVideos } = progress;
  const nextVideoNumber = completedVideos + 1;

  // Find next unwatched video for more specific messaging
  const nextVideo = progress.videos.find(v => !v.isWatched);
  const videoRange = nextVideo 
    ? `Video ${nextVideoNumber} of ${totalVideos}`
    : `${totalVideos} videos ready`;

  const title = `Your ${learningGoal.toLowerCase()} session for ${topic} is ready!`;
  const body = `Tonight: ${topic} (${videoRange})`;

  showNotification(title, {
    body,
    data: {
      url: `/?resume=${preferenceId}`,
      preferenceId,
      topic,
    },
    actions: [
      { action: 'start', title: 'Start Learning' },
      { action: 'snooze', title: 'Remind me in 15min' },
    ],
  });

  // Update last notified time
  const settings = getNotificationSettings();
  settings.lastNotified = new Date();
  saveNotificationSettings(settings);
}

// Snooze notification
export function snoozeNotification(preferenceId: string, topic: string, learningGoal: string): void {
  const settings = getNotificationSettings();
  const snoozeTime = settings.snoozeMinutes * 60 * 1000; // Convert to milliseconds

  setTimeout(() => {
    triggerLearningReminder(preferenceId, topic, learningGoal);
  }, snoozeTime);

  // Show confirmation
  showNotification('Reminder snoozed', {
    body: `We'll remind you about ${topic} in ${settings.snoozeMinutes} minutes`,
  });
}

// Check for incomplete topics and schedule reminders
export function scheduleRemindersForIncompleteTopics(): void {
  const allProgress = getAllProgress();
  const settings = getNotificationSettings();
  
  if (!settings.enabled) return;

  allProgress.forEach(progress => {
    if (progress.completedVideos < progress.totalVideos) {
      // Schedule reminder if not already scheduled
      scheduleLearningReminder(
        progress.preferenceId,
        progress.topic,
        progress.learningGoal || "Learn the essentials",
        settings.time,
        settings.customTime
      );
    }
  });
}

// Helper functions for managing scheduled reminders
interface ScheduledReminder {
  preferenceId: string;
  topic: string;
  learningGoal: string;
  scheduledTime: string;
  notificationTime: string;
  customTime?: string;
}

function getScheduledReminders(): Record<string, ScheduledReminder> {
  try {
    const stored = localStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load scheduled reminders:', error);
    return {};
  }
}

function saveScheduledReminders(reminders: Record<string, ScheduledReminder>): void {
  try {
    localStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(reminders));
  } catch (error) {
    console.error('Failed to save scheduled reminders:', error);
  }
}

// Helper functions for managing active timeouts
const ACTIVE_TIMEOUTS_KEY = 'youtube_curator_timeouts';

function getActiveTimeouts(): Record<string, number> {
  try {
    const stored = localStorage.getItem(ACTIVE_TIMEOUTS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    return {};
  }
}

function saveActiveTimeouts(timeouts: Record<string, number>): void {
  try {
    localStorage.setItem(ACTIVE_TIMEOUTS_KEY, JSON.stringify(timeouts));
  } catch (error) {
    console.error('Failed to save active timeouts:', error);
  }
}

// Cancel all scheduled reminders for a topic
export function cancelReminders(preferenceId: string): void {
  const scheduledReminders = getScheduledReminders();
  const activeTimeouts = getActiveTimeouts();
  
  Object.entries(scheduledReminders).forEach(([reminderId, reminder]) => {
    if (reminder.preferenceId === preferenceId) {
      // Clear timeout
      if (activeTimeouts[reminderId]) {
        clearTimeout(activeTimeouts[reminderId]);
        delete activeTimeouts[reminderId];
      }
      delete scheduledReminders[reminderId];
    }
  });
  
  saveScheduledReminders(scheduledReminders);
  saveActiveTimeouts(activeTimeouts);
}

// Initialize notification system
export function initializeNotificationSystem(): void {
  // Check if we need to restore any scheduled reminders on app load
  const scheduledReminders = getScheduledReminders();
  const now = new Date();
  
  Object.entries(scheduledReminders).forEach(([reminderId, reminder]) => {
    const scheduledTime = new Date(reminder.scheduledTime);
    
    if (scheduledTime > now) {
      // Reschedule reminder
      const timeUntilNotification = scheduledTime.getTime() - now.getTime();
      
      const timeoutId = setTimeout(() => {
        triggerLearningReminder(reminder.preferenceId, reminder.topic, reminder.learningGoal);
        
        // Remove from scheduled reminders
        const updatedReminders = getScheduledReminders();
        delete updatedReminders[reminderId];
        saveScheduledReminders(updatedReminders);
      }, timeUntilNotification);
      
      // Store timeout ID
      const timeoutIds = getActiveTimeouts();
      timeoutIds[reminderId] = timeoutId as any;
      saveActiveTimeouts(timeoutIds);
    } else {
      // Remove expired reminders
      const updatedReminders = getScheduledReminders();
      delete updatedReminders[reminderId];
      saveScheduledReminders(updatedReminders);
    }
  });

  // Handle service worker messages for notification actions
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_ACTION') {
        const { action, data } = event.data;
        
        if (action === 'snooze' && data?.preferenceId) {
          const progress = getTopicProgress(data.preferenceId);
          if (progress) {
            snoozeNotification(data.preferenceId, progress.topic, progress.learningGoal || "Learn the essentials");
          }
        }
      }
    });
  }
}
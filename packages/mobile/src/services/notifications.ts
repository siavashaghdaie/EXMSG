import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';

// Configure notification behavior — MUST be at module level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private initialized = false;
  private hasPermission = false;

  /**
   * Initialize notification permissions and channels
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission not granted');
        this.initialized = true;
        return;
      }

      this.hasPermission = true;

      // Set up Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#7C3AED',
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('buzz', {
          name: 'Buzz Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500],
          lightColor: '#EF4444',
          sound: 'default',
        });
      }

      this.initialized = true;
      console.log('[Notifications] Initialized with permission granted');
    } catch (err) {
      console.error('[Notifications] Failed to initialize:', err);
      this.initialized = true; // Don't retry on error
    }
  }

  /**
   * Show a local notification for a new message
   */
  async showMessageNotification(params: {
    conversationId: string;
    senderName: string;
    content: string;
    isGroup?: boolean;
    groupName?: string;
  }): Promise<void> {
    if (!this.hasPermission) {
      console.log('[Notifications] No permission, skipping notification');
      return;
    }

    const title = params.isGroup && params.groupName
      ? `${params.senderName} in ${params.groupName}`
      : params.senderName;

    const body = params.content.length > 100
      ? params.content.substring(0, 100) + '...'
      : params.content;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            type: 'message',
            conversationId: params.conversationId,
          },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'messages' } : {}),
        },
        trigger: null,
      });
      console.log('[Notifications] Message notification sent:', title);
    } catch (err) {
      console.error('[Notifications] Failed to show message notification:', err);
    }
  }

  /**
   * Show a local notification for a buzz
   */
  async showBuzzNotification(params: {
    conversationId: string;
    senderName: string;
  }): Promise<void> {
    if (!this.hasPermission) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Buzz!',
          body: `${params.senderName} is buzzing you!`,
          data: {
            type: 'buzz',
            conversationId: params.conversationId,
          },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'buzz' } : {}),
        },
        trigger: null,
      });
    } catch (err) {
      console.error('[Notifications] Failed to show buzz notification:', err);
    }
  }

  /**
   * Clear all notifications
   */
  async clearAll(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (err) {
      // Ignore
    }
  }

  /**
   * Set app badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (err) {
      // Badge count not supported on all platforms
    }
  }
}

export const notificationService = new NotificationService();

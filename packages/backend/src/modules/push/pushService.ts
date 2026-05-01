import webpush from 'web-push';
import { prisma } from '../../config/database';
import { env } from '../../config/env';

// Initialize web-push with VAPID keys
let pushEnabled = false;

export function initializePush() {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    pushEnabled = true;
    console.log('[Push] Web Push initialized with VAPID keys');
  } else {
    console.warn('[Push] VAPID keys not configured — push notifications disabled');
  }
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;        // Collapse key — same tag replaces previous notification
  data?: Record<string, any>;
}

/**
 * Send a push notification to all subscriptions of a specific user.
 * Silently ignores errors (expired subscriptions are auto-cleaned).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushEnabled) return;

  try {
    const subscriptions = await (prisma as any).pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const jsonPayload = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map((sub: any) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload,
          { TTL: 60 } // 60 second TTL for time-sensitive call notifications
        )
      )
    );

    // Clean up expired/invalid subscriptions (410 Gone or 404)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const statusCode = (result.reason as any)?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          console.log(`[Push] Removing expired subscription for user ${userId}: ${subscriptions[i].endpoint.slice(0, 50)}...`);
          await (prisma as any).pushSubscription.delete({
            where: { id: subscriptions[i].id },
          }).catch(() => {});
        } else {
          console.warn(`[Push] Failed to send to user ${userId}:`, result.reason);
        }
      }
    }
  } catch (error) {
    console.error('[Push] Error sending push to user:', error);
  }
}

/**
 * Send an incoming call push notification
 */
export async function sendCallPushNotification(
  targetUserId: string,
  callerName: string,
  callType: 'audio' | 'video',
  callId: string,
  conversationId?: string,
): Promise<void> {
  const emoji = callType === 'video' ? '📹' : '📞';
  await sendPushToUser(targetUserId, {
    title: `${emoji} Incoming ${callType} call`,
    body: `${callerName} is calling you`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `call-${callId}`,
    data: {
      type: 'incoming_call',
      callId,
      conversationId,
      callType,
      callerName,
      url: '/', // Will open the app to the main page where the call modal will show
    },
  });
}

/**
 * Send a new message push notification
 */
export async function sendMessagePushNotification(
  targetUserId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
): Promise<void> {
  await sendPushToUser(targetUserId, {
    title: senderName,
    body: messagePreview.length > 100 ? messagePreview.slice(0, 100) + '...' : messagePreview,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `msg-${conversationId}`, // Collapse messages from same conversation
    data: {
      type: 'new_message',
      conversationId,
      url: `/chat/${conversationId}`,
    },
  });
}

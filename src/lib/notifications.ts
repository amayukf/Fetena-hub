import { PrismaClient } from "@prisma/client";

/**
 * ExamVault Notification Hook System
 * -------------------------------------------------------------
 * Provides in-app notification dispatch and extensible hooks
 * for future SMS (Ethio Telecom) and Telegram bot notification delivery.
 */

export type NotificationType =
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "ACCESS_REVOKED"
  | "PAPER_CONTRIBUTION_UPDATE";

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  phone?: string | null;
  link?: string | null;
  metadata?: Record<string, any>;
}

export type NotificationHook = (payload: NotificationPayload) => Promise<void> | void;

// Registry of external delivery hooks (SMS, Telegram, Webhook)
const registeredHooks: NotificationHook[] = [];

/**
 * Register an external notification hook (e.g. SMS or Telegram bot integration)
 */
export function registerNotificationHook(hook: NotificationHook): () => void {
  registeredHooks.push(hook);
  return () => {
    const idx = registeredHooks.indexOf(hook);
    if (idx !== -1) registeredHooks.splice(idx, 1);
  };
}

export function clearNotificationHooks(): void {
  registeredHooks.length = 0;
}

export function getRegisteredHooksCount(): number {
  return registeredHooks.length;
}

// Default stub hooks for SMS and Telegram logging
export const smsNotificationLogger: NotificationHook = async (payload) => {
  if (payload.phone) {
    console.log(`[SMS GATEWAY HOOK] -> To: ${payload.phone} | ${payload.title}: ${payload.message}`);
  }
};

export const telegramNotificationLogger: NotificationHook = async (payload) => {
  console.log(`[TELEGRAM BOT HOOK] -> User: ${payload.userId} | ${payload.title}: ${payload.message}`);
};

/**
 * Dispatches notification: writes to in-app database table and triggers all external hooks.
 */
export async function dispatchNotification(
  payload: NotificationPayload,
  prismaClient?: any
): Promise<any> {
  let createdNotification = null;

  if (prismaClient) {
    try {
      createdNotification = await prismaClient.notification.create({
        data: {
          userId: payload.userId,
          title: payload.title,
          message: payload.message,
          type:
            payload.type === "PAYMENT_APPROVED"
              ? "SUCCESS"
              : payload.type === "PAYMENT_REJECTED" || payload.type === "ACCESS_REVOKED"
              ? "ERROR"
              : "INFO",
          link: payload.link || null,
        },
      });
    } catch (err) {
      console.error("[NOTIFICATION DB ERROR]:", err);
    }
  }

  // Trigger external delivery hooks (SMS / Telegram / Webhook)
  for (const hook of registeredHooks) {
    try {
      await hook(payload);
    } catch (hookErr) {
      console.error("[NOTIFICATION HOOK ERROR]:", hookErr);
    }
  }

  return createdNotification;
}

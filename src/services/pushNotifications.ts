/**
 * Stub push notification service.
 * In production this would integrate with APNs / FCM via AWS SNS or Expo.
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string
): Promise<void> {
  console.log(
    `[PUSH] token=${pushToken} title="${title}" body="${body}"`
  );
}

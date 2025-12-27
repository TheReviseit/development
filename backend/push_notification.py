import os
import firebase_admin
from firebase_admin import messaging
from supabase_client import get_user_push_tokens, delete_push_token


def send_push_to_user(user_id, title, body, data=None):
    """
    Send push notification to all devices registered for a user
    """
    if not user_id:
        print("⚠️ Cannot send push: No user_id provided")
        return False

    # Get FCM tokens from Supabase
    tokens = get_user_push_tokens(user_id)
    if not tokens:
        print(f"ℹ️ No push tokens found for user {user_id}")
        return False

    print(f"🔔 Sending push to {len(tokens)} tokens for user {user_id}")

    # Prepare message data
    # FCM requires all values in 'data' to be strings
    payload_data = data or {}
    fcm_data = {str(k): str(v) for k, v in payload_data.items()}

    # Create message for each token
    messages = []
    for token in tokens:
        # Determine the URL to open when notification is clicked
        # FCM requires full HTTPS URL for webpush link
        frontend_url = os.getenv('FRONTEND_URL', 'https://reviseit.app')
        notification_url = f'{frontend_url}/dashboard'
        if fcm_data.get('conversationId'):
            notification_url = f'{frontend_url}/dashboard?conversation={fcm_data["conversationId"]}'
        
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=fcm_data,
            token=token,
            # Web-specific settings (CRITICAL for browser notifications)
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title,
                    body=body,
                    icon='/icon-192.png',
                    badge='/icon-192.png',
                    tag=fcm_data.get('conversationId', 'message'),
                    # requireInteraction=False,  # Auto-dismiss after a few seconds
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link=notification_url  # Where to navigate on click
                ),
            ),
            # Android-specific settings
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    tag=fcm_data.get('conversationId', 'message'),
                    icon='stock_ticker_update',
                    color='#22c15a'
                ),
            ),
            # iOS-specific settings
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        badge=1,
                        sound='default',
                        thread_id=fcm_data.get('conversationId')
                    ),
                ),
            ),
        )
        messages.append(message)

    try:
        # Send batch
        response = messaging.send_each(messages)
        
        # Handle failures (token cleanup)
        for idx, resp in enumerate(response.responses):
            if not resp.success:
                error = resp.exception
                token = tokens[idx]
                print(f"❌ Failed to send to token {token[:10]}... Error: {error}")
                # If token is invalid/expired, remove it
                # Firebase Admin SDK uses exception types, not string codes like JS SDK
                error_msg = str(error).lower()
                is_invalid_token = (
                    'not a valid fcm' in error_msg or
                    'not registered' in error_msg or
                    'invalid' in error_msg or
                    'unregistered' in error_msg or
                    hasattr(error, '__class__') and 'Unregistered' in error.__class__.__name__
                )
                if is_invalid_token:
                    print(f"♻️ Removing expired token: {token[:10]}...")
                    delete_push_token(token)
                    
        print(f"✅ Batch push send complete: {response.success_count} success, {response.failure_count} failure")
        return response.success_count > 0
    except Exception as e:
        print(f"❌ Critical error sending push notifications: {e}")
        return False

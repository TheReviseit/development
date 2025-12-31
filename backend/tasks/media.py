"""
Media Processing Tasks for Celery.
Handles image processing, file uploads, etc.
"""

import logging
from typing import Dict, Any, Optional
from celery import shared_task

logger = logging.getLogger('reviseit.tasks.media')


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_image(
    self,
    media_id: str,
    phone_number_id: str,
    access_token: str,
    processing_type: str = "download"
) -> Dict[str, Any]:
    """
    Process an image received via WhatsApp.
    
    Args:
        media_id: WhatsApp media ID
        phone_number_id: Phone number ID for API access
        access_token: Access token
        processing_type: Type of processing (download, resize, analyze)
    
    Returns:
        Processing result with URL or analysis
    """
    try:
        import requests
        
        # Get media URL from WhatsApp
        media_url = f"https://graph.facebook.com/v18.0/{media_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        response = requests.get(media_url, headers=headers, timeout=30)
        response.raise_for_status()
        
        media_data = response.json()
        download_url = media_data.get("url")
        
        if not download_url:
            return {"error": "No download URL available"}
        
        # Download the media
        media_response = requests.get(
            download_url, 
            headers=headers, 
            timeout=60
        )
        media_response.raise_for_status()
        
        # Process based on type
        result = {
            "media_id": media_id,
            "processing_type": processing_type,
            "mime_type": media_data.get("mime_type"),
            "file_size": len(media_response.content),
        }
        
        if processing_type == "download":
            # Just return the raw data info
            result["status"] = "downloaded"
        elif processing_type == "analyze":
            # Could integrate with vision AI here
            result["status"] = "analyzed"
            result["analysis"] = {"type": "image", "description": "Image received"}
        
        logger.info(f"Processed media {media_id}: {result.get('status')}")
        return result
        
    except Exception as e:
        logger.error(f"Error processing media {media_id}: {e}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3)
def upload_media(
    self,
    phone_number_id: str,
    access_token: str,
    file_path: str,
    media_type: str = "image"
) -> Dict[str, Any]:
    """
    Upload media to WhatsApp for sending.
    
    Args:
        phone_number_id: Phone number ID
        access_token: Access token
        file_path: Path to file to upload
        media_type: Type of media (image, document, video, audio)
    
    Returns:
        Upload result with media ID
    """
    try:
        import requests
        
        upload_url = f"https://graph.facebook.com/v18.0/{phone_number_id}/media"
        
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {
                "messaging_product": "whatsapp",
                "type": media_type,
            }
            headers = {"Authorization": f"Bearer {access_token}"}
            
            response = requests.post(
                upload_url,
                headers=headers,
                data=data,
                files=files,
                timeout=120
            )
            response.raise_for_status()
        
        result = response.json()
        logger.info(f"Uploaded media: {result.get('id')}")
        
        return {
            "success": True,
            "media_id": result.get("id"),
        }
        
    except Exception as e:
        logger.error(f"Error uploading media: {e}")
        raise self.retry(exc=e)


@shared_task
def cleanup_old_media(days: int = 30) -> Dict[str, Any]:
    """
    Clean up old media files from storage.
    
    Args:
        days: Delete media older than this many days
    
    Returns:
        Cleanup summary
    """
    logger.info(f"Cleaning up media older than {days} days")
    
    # Placeholder for actual cleanup logic
    return {
        "status": "completed",
        "files_deleted": 0,
        "space_freed_mb": 0,
    }


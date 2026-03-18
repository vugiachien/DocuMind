from minio import Minio
import os
from fastapi import UploadFile
import io
import logging

logger = logging.getLogger(__name__)

class StorageService:
    """
    MinIO storage service for file uploads and downloads.
    Uses centralized config for credentials.
    """
    
    def __init__(self):
        # Import config here to avoid circular imports
        from app.core.config import get_settings
        settings = get_settings()
        
        self.endpoint = settings.MINIO_ENDPOINT
        self.access_key = settings.MINIO_ACCESS_KEY
        self.secret_key = settings.MINIO_SECRET_KEY
        self.bucket = settings.MINIO_BUCKET
        self.library_bucket = settings.MINIO_LIBRARY_BUCKET
        self.secure = settings.MINIO_SECURE
        
        logger.info(f"📦 Connecting to MinIO at {self.endpoint}...")
        
        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure
        )
        
        # Ensure buckets exist
        for bucket_name in [self.bucket, self.library_bucket]:
            if not self.client.bucket_exists(bucket_name):
                self.client.make_bucket(bucket_name)
                logger.info(f"📦 Created bucket: {bucket_name}")

        # External client for signing URLs accessible by other Docker containers
        self.external_endpoint = os.getenv("MINIO_EXTERNAL_ENDPOINT")
        self.external_client = None
        if self.external_endpoint and self.external_endpoint != self.endpoint:
            self.external_client = Minio(
                self.external_endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure,
                region="us-east-1"  # Explicit region prevents connection attempt for region discovery
            )
            logger.info(f"📦 External MinIO client configured: {self.external_endpoint}")

    def upload_file(self, file_data, length: int, object_name: str, content_type: str = "application/octet-stream", bucket: str = None) -> str:
        """
        Upload file stream to MinIO and return the object name.
        file_data: Binary IO stream (e.g. BytesIO or SpooledTemporaryFile)
        length: Size of the file in bytes
        """
        target_bucket = bucket or self.bucket
        try:
            self.client.put_object(
                target_bucket,
                object_name,
                file_data,
                length,
                content_type=content_type
            )
            return object_name
        except Exception as e:
            print(f"Error uploading file: {e}")
            raise e

    def get_file_url(self, object_name: str, bucket: str = None, expires_in_seconds: int = 3600 * 24 * 7) -> str:
        """Get presigned URL for file (default 7 days expiry)"""
        target_bucket = bucket or self.bucket
        from datetime import timedelta
        return self.client.presigned_get_object(
            target_bucket,
            object_name,
            expires=timedelta(seconds=expires_in_seconds)
        )
    
    def get_file_url_for_external_api(self, object_name: str, bucket: str = None) -> str:
        """
        Generate a presigned URL that external services can access.
        Optionally replace the host with MINIO_EXTERNAL_ENDPOINT if provided.
        """
        target_bucket = bucket or self.bucket
        
        # Use external client if available to ensure correct signature for the external host
        client_to_use = self.external_client if self.external_client else self.client
        
        presigned_url = client_to_use.get_presigned_url(
            "GET",
            target_bucket,
            object_name,
        )
        return presigned_url

    def download_file(self, object_name: str, bucket: str = None) -> bytes:
        """Download file content"""
        target_bucket = bucket or self.bucket
        response = None
        try:
            response = self.client.get_object(target_bucket, object_name)
            return response.read()
        finally:
            if response:
                response.close()
                response.release_conn()

    def get_file_stream(self, object_name: str, bucket: str = None):
        """Get file stream from MinIO"""
        target_bucket = bucket or self.bucket
        try:
            response = self.client.get_object(target_bucket, object_name)
            return response
        except Exception as e:
            print(f"Error getting file stream: {e}")
            raise e
            
    def delete_file(self, object_name: str, bucket: str = None):
        """Delete file from MinIO"""
        target_bucket = bucket or self.bucket
        try:
             self.client.remove_object(target_bucket, object_name)
        except Exception as e:
            print(f"Error deleting file: {e}")
            raise e
# Singleton instance
try:
    storage_service = StorageService()
except Exception as e:
    print(f"Warning: Could not initialize StorageService (MinIO might be down): {e}")
    storage_service = None

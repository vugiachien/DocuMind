import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class FileStreamWrapper:
    def __init__(self, filepath):
        self.filepath = filepath
        self.file = None

    def stream(self, chunk_size):
        self.file = open(self.filepath, 'rb')
        try:
            while True:
                chunk = self.file.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            self.file.close()

class StorageService:
    """
    Local storage service for file uploads and downloads.
    Replaces MinIO to simplify deployment.
    """
    
    def __init__(self):
        # Base upload directory, defaults to 'uploads' in the current working dir
        self.base_dir = os.environ.get("UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
        self.bucket = "agreements"
        self.library_bucket = "library"
        
        # Ensure base directories exist
        os.makedirs(os.path.join(self.base_dir, self.bucket), exist_ok=True)
        os.makedirs(os.path.join(self.base_dir, self.library_bucket), exist_ok=True)
        # Also ensure 'audit_policies' directory exists since that's used occasionally in object names
        os.makedirs(os.path.join(self.base_dir, "audit_policies"), exist_ok=True)
        logger.info(f"📦 LocalStorageService initialized at {self.base_dir}")

    def _get_file_path(self, object_name: str, bucket: str = None) -> str:
        # In Minio, object_name often already includes folders like 'audit_policies/xyz.pdf'.
        # If bucket is not provided, we just append to base_dir
        if bucket:
            return os.path.join(self.base_dir, bucket, object_name)
        return os.path.join(self.base_dir, object_name)

    def upload_file(self, file_data, length: int, object_name: str, content_type: str = "application/octet-stream", bucket: str = None) -> str:
        """
        Upload file stream to local storage and return the object name.
        """
        file_path = self._get_file_path(object_name, bucket)

        # Ensure parent directories exist (e.g. if object_name is 'audit_policies/123.pdf')
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        try:
            with open(file_path, "wb") as f:
                if hasattr(file_data, "read"):
                    shutil.copyfileobj(file_data, f)
                else:
                    f.write(file_data)
            return object_name
        except Exception as e:
            logger.error(f"Error uploading file to local storage: {e}")
            raise e

    def get_file_url(self, object_name: str, bucket: str = None, expires_in_seconds: int = 3600 * 24 * 7) -> str:
        """Get 'presigned' URL for file - Just proxying to the local stream endpoints in our API"""
        # Since this is local, we rely on the API serving the stream
        # E.g. /api/v1/agreements/{id}/stream
        # We return a placeholder URL or the object_name so clients know it exists.
        return f"/api/downloads/{object_name}"
    
    def get_file_url_for_external_api(self, object_name: str, bucket: str = None) -> str:
        """
        Return the local URL representation for external services
        """
        return self.get_file_url(object_name, bucket)

    def download_file(self, object_name: str, bucket: str = None) -> bytes:
        """Download file content from local disk"""
        file_path = self._get_file_path(object_name, bucket)
        try:
            with open(file_path, "rb") as f:
                return f.read()
        except FileNotFoundError as e:
            logger.error(f"File not found: {file_path}")
            raise e

    def get_file_stream(self, object_name: str, bucket: str = None):
        """Get file stream from local disk"""
        file_path = self._get_file_path(object_name, bucket)
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        return FileStreamWrapper(file_path)

    def delete_file(self, object_name: str, bucket: str = None):
        """Delete file from local disk"""
        file_path = self._get_file_path(object_name, bucket)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            raise e

storage_service = StorageService()

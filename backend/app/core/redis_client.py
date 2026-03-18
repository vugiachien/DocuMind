import os
import redis.asyncio as redis
import logging

logger = logging.getLogger(__name__)

class RedisClient:
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6390/0")
        self.client = None

    async def connect(self):
        """Initialize Redis connection"""
        if not self.client:
            try:
                self.client = redis.from_url(self.redis_url, encoding="utf-8", decode_responses=True)
                await self.client.ping()
                logger.info(f"✅ Connected to Redis at {self.redis_url}")
            except Exception as e:
                logger.error(f"❌ Failed to connect to Redis: {e}")
                self.client = None

    async def close(self):
        """Close Redis connection"""
        if self.client:
            await self.client.close()
            self.client = None
            logger.info("Redis connection closed")

    async def publish(self, channel: str, message: str):
        """Publish message to a channel"""
        if not self.client:
            await self.connect()
        
        if self.client:
            try:
                await self.client.publish(channel, message)
            except Exception as e:
                logger.error(f"Failed to publish to {channel}: {e}")

    async def subscribe(self, channel: str):
        """Subscribe to a channel and yield messages"""
        if not self.client:
            await self.connect()
            
        if not self.client:
            return

        pubsub = self.client.pubsub()
        await pubsub.subscribe(channel)
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield message["data"]
        except Exception as e:
            logger.error(f"Redis subscription error: {e}")
        finally:
            await pubsub.unsubscribe(channel)


redis_client = RedisClient()

"""Settings loaded from .env. Fails fast with a clear message if something is missing."""
import os

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is missing in ai-service/.env")
    return value


MONGO_URI = _required("MONGO_URI")
INTERNAL_API_KEY = _required("INTERNAL_API_KEY")
if len(INTERNAL_API_KEY) < 32:
    raise RuntimeError("INTERNAL_API_KEY must be at least 32 characters")

PORT = int(os.getenv("PORT", "8000"))
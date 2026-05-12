import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from config.settings import settings


async def main() -> None:
    client = AsyncIOMotorClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)

    info = await client.server_info()
    print(f"Connected to MongoDB {info['version']}")

    for db_name in (settings.mongo_db_raw, settings.mongo_db_pii):
        db = client[db_name]
        cols = await db.list_collection_names()
        print(f"  {db_name}: {cols if cols else '(empty - will populate on first write)'}")

    print("\nWriting + reading a probe document to confirm read/write works...")
    probe = client[settings.mongo_db_raw]["_connection_probe"]
    await probe.insert_one({"_id": "probe", "ok": True})
    doc = await probe.find_one({"_id": "probe"})
    await probe.delete_one({"_id": "probe"})
    assert doc and doc.get("ok") is True
    print("OK - read/write verified, probe cleaned up.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())

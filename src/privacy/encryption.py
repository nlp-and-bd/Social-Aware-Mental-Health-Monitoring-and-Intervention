from cryptography.fernet import Fernet, InvalidToken

from config.settings import settings


class UsernameVault:
    def __init__(self, key: str | None = None) -> None:
        key = key or settings.fernet_key
        if not key:
            raise RuntimeError(
                "FERNET_KEY is not set. Generate one with: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, username: str) -> str:
        return self._fernet.encrypt(username.encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        try:
            return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken as e:
            raise RuntimeError("Username decryption failed - wrong FERNET_KEY?") from e

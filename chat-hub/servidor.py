"""Atalho para iniciar o servidor: python -m app ou python servidor.py"""

from app.main import main
import asyncio

if __name__ == "__main__":
    asyncio.run(main())

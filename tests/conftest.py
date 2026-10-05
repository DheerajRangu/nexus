"""Tests never use the application's real video database."""
import atexit
import os
import tempfile
from pathlib import Path
_directory=tempfile.TemporaryDirectory(prefix='aegis-pytest-')
os.environ['DATABASE_URL']='sqlite:///'+str(Path(_directory.name)/'tests.db')
atexit.register(_directory.cleanup)

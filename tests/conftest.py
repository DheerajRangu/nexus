"""Tests never use the application's real video database."""
import atexit
import os
import tempfile
from pathlib import Path
_directory=tempfile.TemporaryDirectory(prefix='aegis-pytest-')
test_url=os.environ.get('AEGIS_TEST_DATABASE_URL')
if test_url:
    from sqlalchemy.engine import make_url
    if not (make_url(test_url).database or '').startswith('aegis_test'):
        raise RuntimeError('External test database must be named aegis_test*; tests clear shared emergency tables')
os.environ['DATABASE_URL']=test_url or 'sqlite:///'+str(Path(_directory.name)/'tests.db')
atexit.register(_directory.cleanup)

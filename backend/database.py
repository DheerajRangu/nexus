import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, String, JSON, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

class Base(DeclarativeBase): pass
class Video(Base):
    __tablename__ = "videos"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    info: Mapped[dict] = mapped_column(JSON)
    state: Mapped[dict] = mapped_column(JSON)
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///./aegis.db"))
Session = sessionmaker(engine)

def initialize(): Base.metadata.create_all(engine)
def get_video(video_id):
    with Session() as db:
        row = db.get(Video, video_id)
        return None if row is None else dict(id=row.id, info=row.info, state=row.state, configuration=row.configuration)
def set_state(video_id, state):
    with Session.begin() as db:
        row = db.get(Video, video_id)
        if row: row.state = state

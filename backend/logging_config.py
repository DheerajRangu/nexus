"""Machine-readable logs without request payloads or credentials."""
import json
import logging
from datetime import datetime, timezone

class JsonFormatter(logging.Formatter):
    def format(self, record):
        data={"timestamp":datetime.now(timezone.utc).isoformat(),"level":record.levelname,"logger":record.name,"message":record.getMessage()}
        for key in ["video_id","video_filename","device","frame"]:
            if hasattr(record,key): data[key]=getattr(record,key)
        if record.exc_info: data["exception"]=self.formatException(record.exc_info)
        return json.dumps(data)

def setup_logging():
    handler=logging.StreamHandler();handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO,handlers=[handler],force=True)

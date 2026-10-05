"""AEGIS vision algorithms and training tools."""
import os
from pathlib import Path
_runtime=Path(__file__).resolve().parents[1]/'.runtime'
os.environ.setdefault('YOLO_CONFIG_DIR',str(_runtime/'ultralytics'))
os.environ.setdefault('MPLCONFIGDIR',str(_runtime/'matplotlib'))

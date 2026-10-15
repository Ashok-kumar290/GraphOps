from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")  # Local preparation credentials; never tracked.
DATA = ROOT / ".runtime"
DATA.mkdir(exist_ok=True)
LAB_PORT = int(os.getenv("GRAPHOPS_LAB_PORT", "8865"))
SCOPE = os.getenv("GRAPHOPS_WORKSPACE", "team-demo")

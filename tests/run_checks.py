"""Save the current real integration suite result without provider inference."""
import json
from pathlib import Path
import time
import unittest
from datetime import datetime, timezone
from graphops import settings

if __name__ == '__main__':
    start=time.perf_counter()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(settings.ROOT/'tests'),pattern='test_*.py'))
    report={'tests':result.testsRun,'passed':result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),
            'failures':[{'test':str(t),'error':e} for t,e in result.failures+result.errors],
            'duration_seconds':round(time.perf_counter()-start,3),'actual_falkordb_go_http_mcp':True,
            'model_inference':False,'scope':'Local event implementation; protocol simulation is not model inference'}
    path=settings.DATA/'reports';path.mkdir(exist_ok=True)
    (path/'checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (path/('checks-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    raise SystemExit(0 if result.wasSuccessful() else 1)

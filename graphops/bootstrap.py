"""Small startup probes without shell-embedded Python code or credential output."""
import importlib.util
import json
import os
import sys


def main():
    command=sys.argv[1] if len(sys.argv)>1 else ''
    if command=='dependencies':
        raise SystemExit(0 if all(importlib.util.find_spec(name) for name in ('falkordb','mcp','httpx','jsonschema','dotenv')) else 1)
    from graphops import settings
    if command=='configuration':
        from graphops.models import configuration
        print(json.dumps({**configuration(),'db_host':os.getenv('FALKORDB_HOST','localhost'),'db_port':int(os.getenv('FALKORDB_PORT','6379'))}))
    elif command=='database':
        from falkordb import FalkorDB
        try:FalkorDB(host=os.getenv('FALKORDB_HOST','localhost'),port=int(os.getenv('FALKORDB_PORT','6379')),socket_connect_timeout=2,socket_timeout=3).list_graphs()
        except Exception:raise SystemExit(1)
    else:raise SystemExit('Choose dependencies, configuration or database')


if __name__=='__main__':main()

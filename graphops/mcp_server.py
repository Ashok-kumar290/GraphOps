"""A fresh stdio MCP process binds tools to one incident, session and role."""
import argparse
import logging
from mcp.server.fastmcp import FastMCP
from graphops.store import Store
from graphops.tools import Tools, ROLES


def main():
    logging.getLogger("mcp").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    for flag in ("scope", "task", "session", "role", "port"): parser.add_argument("--"+flag, required=True)
    args = parser.parse_args()
    tools = Tools(Store(args.scope), args.task, args.session, args.role, int(args.port))
    server = FastMCP("GraphOps event evidence tools")
    for name in ROLES[args.role]: server.add_tool(getattr(tools, name), name=name)
    server.run(transport="stdio")


if __name__ == "__main__": main()

"""Stable worker command; implementation lives in its module."""
import runpy

if __name__ == "__main__": runpy.run_module("graphops.runtime.worker", run_name="__main__")

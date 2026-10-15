"""Read metrics for known owned process IDs, without reading command arguments."""
import os
from pathlib import Path
import time


def sample_process(pid, name, running=True):
    sample = {'name': name, 'pid': pid, 'running': bool(running), 'rss_bytes': None,
              'cpu_seconds': None, 'uptime_seconds': None}
    if not running or not pid:
        return sample
    try:
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes

            class MemoryCounters(ctypes.Structure):
                _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
                    (field, ctypes.c_size_t) for field in ('peak_rss', 'rss', 'peak_paged', 'paged',
                    'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile')]

            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            psapi = ctypes.WinDLL('psapi', use_last_error=True)
            kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
            psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
            handle = kernel.OpenProcess(0x0410, False, pid)
            if not handle:
                return sample
            try:
                memory = MemoryCounters(); memory.cb = ctypes.sizeof(memory)
                if psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), memory.cb):
                    sample['rss_bytes'] = memory.rss
                created, ended, system, user = (wintypes.FILETIME() for _ in range(4))
                if kernel.GetProcessTimes(handle, *[ctypes.byref(value) for value in (created, ended, system, user)]):
                    ticks = lambda value: (value.dwHighDateTime << 32) | value.dwLowDateTime
                    sample['cpu_seconds'] = round((ticks(system) + ticks(user)) / 10_000_000, 3)
                    sample['uptime_seconds'] = round(max(0, time.time() - (ticks(created) / 10_000_000 - 11_644_473_600)), 1)
            finally:
                kernel.CloseHandle(handle)
        elif Path('/proc').is_dir():
            directory = Path('/proc') / str(pid)
            stat = (directory / 'stat').read_text(encoding='utf-8')
            fields = stat[stat.rfind(')') + 2:].split()
            ticks = os.sysconf('SC_CLK_TCK')
            sample['running'] = fields[0] not in {'Z', 'X'}
            sample['cpu_seconds'] = round((int(fields[11]) + int(fields[12])) / ticks, 3)
            uptime = float(Path('/proc/uptime').read_text(encoding='ascii').split()[0])
            sample['uptime_seconds'] = round(max(0, uptime - int(fields[19]) / ticks), 1)
            for line in (directory / 'status').read_text(encoding='utf-8').splitlines():
                if line.startswith('VmRSS:'):
                    sample['rss_bytes'] = int(line.split()[1]) * 1024
                    break
    except (OSError, ValueError, IndexError):
        sample['metrics_available'] = False
    sample['metrics_available'] = sample['rss_bytes'] is not None
    return sample

"""Authenticated HTTP client for the same server used by the web workspace."""
import getpass
import os
import sys
from urllib.parse import urlsplit
import httpx


class TerminalError(RuntimeError):
    pass


class ProductClient:
    def __init__(self, url, token=None, transport=None):
        parsed=urlsplit(url)
        if parsed.scheme not in {'http','https'} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'','/'}:
            raise TerminalError('Use an HTTP(S) server origin without credentials, path, query or fragment.')
        if parsed.scheme=='http' and parsed.hostname not in {'localhost','127.0.0.1','::1'}:
            raise TerminalError('Remote connections require HTTPS. Local HTTP is supported on loopback.')
        self.url=url.rstrip('/')
        self.token=token if token is not None else os.getenv('GRAPHOPS_ACCESS_TOKEN','')
        self.http=httpx.Client(base_url=self.url,timeout=httpx.Timeout(35,connect=5),
            headers={'X-GraphOps':'1'},follow_redirects=False,transport=transport)

    def __enter__(self):return self
    def __exit__(self,*args):self.http.close()

    def request(self, method, path, body=None, params=None, authenticate=True):
        try:
            response=self.http.request(method,path,json=body if method=='POST' else None,params=params)
            if response.status_code==401 and authenticate:
                if not self.token and sys.stdin.isatty():
                    self.token=getpass.getpass('Workspace access token (hidden): ')
                if not self.token:
                    raise TerminalError('Access required. Set GRAPHOPS_ACCESS_TOKEN locally or use an interactive terminal for the hidden prompt.')
                self.request('POST','/api/access',{'token':self.token},authenticate=False)
                response=self.http.request(method,path,json=body if method=='POST' else None,params=params)
        except httpx.HTTPError:
            message='Cannot reach the app at '+self.url+'. Run start.ps1 or check the server connection.'
            if method=='POST':message+=' A submitted command may have been accepted; check status/history before resubmitting.'
            raise TerminalError(message) from None
        if not 200<=response.status_code<300:
            try:message=response.json().get('error','Request failed')
            except (ValueError,AttributeError):message='Server returned a non-JSON error'
            # Neither request payloads, cookies nor credential values are echoed.
            if self.token:message=str(message).replace(self.token,'[redacted]')
            raise TerminalError(f'HTTP {response.status_code}: {message}')
        try:return response.json()
        except ValueError:raise TerminalError('Server returned an invalid JSON response.') from None

    def get(self,path,**params):return self.request('GET',path,params={k:v for k,v in params.items() if v is not None})
    def post(self,path,body):return self.request('POST',path,body)

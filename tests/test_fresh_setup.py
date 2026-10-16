"""Fresh-source rehearsal guards; no Docker, network or inference needed."""
import tempfile
from pathlib import Path
import unittest
import zipfile
from tests.check_fresh_setup import clean_environment, inspect_archive


class FreshSetupGuards(unittest.TestCase):
    def test_configuration_and_credentials_are_not_inherited(self):
        original = {'PATH':'system', 'GRAPHOPS_ACCESS_TOKEN':'private', 'graphops_workspace':'old',
                    'FALKORDB_HOST':'live', 'OPENROUTER_API_KEY':'private', 'GOOGLE_API_KEY':'private',
                    'PYTHONPATH':'outside', 'COMPOSE_FILE':'outside', 'COMPOSE_ENV_FILES':'private'}
        env = clean_environment(original,'qwen3:8b',32)
        self.assertEqual(env['PATH'],'system')
        self.assertEqual(env['GRAPHOPS_EVENT_PROVIDER'],'ollama')
        self.assertEqual(env['GRAPHOPS_OLLAMA_BATCH_SIZE'],'32')
        self.assertEqual(env['COMPOSE_DISABLE_ENV_FILE'],'1')
        self.assertFalse(set(original)-{'PATH'} & set(env))
        self.assertEqual(original['GRAPHOPS_ACCESS_TOKEN'],'private')

    def inspect(self, extra):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'source.zip'
            with zipfile.ZipFile(path,'w') as archive:
                for name in ['README.md','QUERIES.md','Dockerfile','compose.yaml','requirements.lock',
                             'web/package-lock.json','tests/check_product.py',*extra]:
                    archive.writestr(name,'synthetic')
            return inspect_archive(path)

    def test_source_templates_are_allowed(self):
        self.assertEqual(self.inspect(['.env.example','deploy/cloud.env.example']),9)

    def test_local_or_generated_files_are_rejected(self):
        for name in ['.env','deploy/cloud.env','.env.local','.venv/file','.runtime/state',
                     'web/node_modules/file','web/dist/index.html','../outside','C:/outside']:
            with self.subTest(name=name),self.assertRaises(RuntimeError): self.inspect([name])

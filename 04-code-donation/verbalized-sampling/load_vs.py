"""Load the real verbalized_sampling prompt machinery without the LLM client stack.

verbalized_sampling/__init__.py pulls in llms/ -> openai, litellm, torch. The
prompt factory itself only needs pydantic, so we register a stub package and
load methods/prompt.py and methods/factory.py straight from the installed wheel.
"""
import importlib.util, sys, types, pathlib

ROOT = pathlib.Path("/tmp/osspk/vs312/verbalized_sampling")

pkg = types.ModuleType("vsx"); pkg.__path__ = [str(ROOT / "methods")]
sys.modules["vsx"] = pkg

def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

prompt  = _load("vsx.prompt",  ROOT / "methods" / "prompt.py")
factory = _load("vsx.factory", ROOT / "methods" / "factory.py")

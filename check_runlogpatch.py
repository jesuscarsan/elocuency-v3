from langchain_core.tracers.log_stream import RunLogPatch
import inspect

print(inspect.signature(RunLogPatch.__init__))
try:
    print(RunLogPatch(ops=[]))
except Exception as e:
    print(e)

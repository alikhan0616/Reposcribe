#!/bin/sh
# Lints the given file(s) with the baked recommended config.
# Exits non-zero when lint problems are found (that's expected output for the agent).
cd /workspace || exit 2
/sandbox/node_modules/.bin/eslint --config /sandbox/eslint.config.mjs "$@"

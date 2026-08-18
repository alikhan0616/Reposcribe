# Minimal, offline sandbox image for running linters/tests on untrusted repo code.
# Linters are installed locally in /sandbox so the ESM flat config resolves them
# (ESM ignores NODE_PATH), letting containers run with NO network access.
FROM node:20-alpine

WORKDIR /sandbox
COPY package.json eslint.config.mjs lint.sh ./
RUN npm install --omit=dev && chmod +x lint.sh

# Run as an unprivileged user; workspace is bind-mounted read-only at runtime.
USER node
WORKDIR /workspace

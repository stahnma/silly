SHELL:=/bin/bash

# Node and the other tools come from the Flox environment. Inside
# `flox activate` (FLOX_ENV is set) run commands directly; otherwise wrap them.
ifdef FLOX_ENV
RUN:=
else
RUN:=flox activate --
endif

# Default target - runs lint and test
all: lint test

node_modules:
	test -d node_modules || $(RUN) npm ci

# Run the tests
test: node_modules
	$(RUN) npm test

# Check formatting, and for undeclared variables
lint: node_modules
	$(RUN) npx prettier --check "src/**/*.js" "test/**/*.js" "scripts/**/*.js" "*.js"
	$(RUN) npx eslint src test scripts eslint.config.js

# Format the code (modifies files)
pretty: node_modules
	$(RUN) npx prettier --write "src/**/*.js" "test/**/*.js" "scripts/**/*.js" "*.js"

# Run locally with in-memory storage and a throwaway key
dev: node_modules
	SILLY_API_KEYS=dev $(RUN) node --watch src/server.js

# Deploy to fly.io
deploy:
	$(RUN) fly deploy

.PHONY: all test lint pretty dev deploy

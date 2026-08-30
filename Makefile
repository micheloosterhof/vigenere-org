# ABOUTME: Single entry point for building, testing, and linting the site.
# SPDX-FileCopyrightText: 2026 Michel Oosterhof
# SPDX-License-Identifier: CC0-1.0

.PHONY: build test e2e lint fmt check dev preview clean

build:
	npm run build

test:
	npm test

e2e:
	npm run e2e

lint:
	npm run lint

fmt:
	npm run fmt

check: fmt lint test

dev:
	npm run dev

preview:
	npm run preview

clean:
	rm -rf dist .astro

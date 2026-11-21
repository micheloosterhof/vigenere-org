# ABOUTME: Single entry point for building, testing, and linting the site.
# SPDX-FileCopyrightText: 2026 Michel Oosterhof
# SPDX-License-Identifier: CC0-1.0

.PHONY: build test e2e lint fmt check dev preview clean bench

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

# Runs one solver benchmark over SHARDS processes and merges their rows into
# bench/results/$(BENCH).tsv, for example `make bench BENCH=quagmire-dictionary`.
SHARDS ?= 8
bench:
	for i in $$(seq 0 $$(($(SHARDS) - 1))); do \
		BENCH_SHARD=$$i/$(SHARDS) npx vitest run --config vitest.bench.config.ts \
			bench/$(BENCH).bench.ts > bench/results/$(BENCH).$$i.log 2>&1 & \
	done; wait
	head -n 1 bench/results/$(BENCH).0.part.tsv > bench/results/$(BENCH).tsv
	for i in $$(seq 0 $$(($(SHARDS) - 1))); do \
		tail -n +2 bench/results/$(BENCH).$$i.part.tsv; \
	done | sort >> bench/results/$(BENCH).tsv

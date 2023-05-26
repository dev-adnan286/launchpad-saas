.PHONY: help install dev dev-api dev-web build lint typecheck test test-e2e prisma-generate prisma-migrate prisma-seed \
	docker-up docker-down docker-logs docker-reset clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	npm install

dev: ## Run API and web in watch mode
	npm run dev

dev-api: ## Run only the API in watch mode
	npm run dev --workspace=@launchpad/api

dev-web: ## Run only the web app in dev mode
	npm run dev --workspace=@launchpad/web

build: ## Build both apps
	npm run build

lint: ## Lint both apps
	npm run lint

typecheck: ## Type-check both apps
	npm run typecheck

test: ## Run unit tests for both apps
	npm test

test-e2e: ## Run API end-to-end tests (requires Postgres + Redis)
	npm run test:e2e --workspace=@launchpad/api

prisma-generate: ## Generate the Prisma client
	npm run prisma:generate --workspace=@launchpad/api

prisma-migrate: ## Apply pending migrations
	npm run prisma:migrate --workspace=@launchpad/api

prisma-seed: ## Seed plans and demo data
	npm run prisma:seed --workspace=@launchpad/api

docker-up: ## Start the full stack with Docker Compose
	docker compose up -d --build

docker-down: ## Stop the stack
	docker compose down

docker-logs: ## Tail stack logs
	docker compose logs -f

docker-reset: ## Stop the stack and delete volumes
	docker compose down -v

clean: ## Remove build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules apps/api/dist apps/web/.next coverage apps/*/coverage

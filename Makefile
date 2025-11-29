# Development shortcuts for ReviseIt

.PHONY: help install dev build test clean docker-up docker-down migrate

help:  ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install:  ## Install all dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev-backend:  ## Run backend in development mode
	cd backend && uvicorn app.main:app --reload

dev-frontend:  ## Run frontend in development mode
	cd frontend && npm run dev

dev-celery:  ## Run Celery worker
	cd backend && celery -A app.celery_app worker --loglevel=info

dev-beat:  ## Run Celery beat scheduler
	cd backend && celery -A app.celery_app beat --loglevel=info

migrate:  ## Run database migrations
	cd backend && alembic upgrade head

migrate-create:  ## Create a new migration
	cd backend && alembic revision --autogenerate -m "$(name)"

docker-up:  ## Start all services with Docker
	docker-compose up -d

docker-build:  ## Build Docker images
	docker-compose build

docker-down:  ## Stop all Docker services
	docker-compose down

docker-logs:  ## View Docker logs
	docker-compose logs -f

docker-restart:  ## Restart all Docker services
	docker-compose restart

clean:  ## Clean up generated files
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	cd frontend && rm -rf .next node_modules
	cd backend && rm -rf __pycache__

test-backend:  ## Run backend tests
	cd backend && pytest

db-reset:  ## Reset database (WARNING: Deletes all data)
	docker-compose down -v
	docker-compose up -d postgres
	sleep 5
	cd backend && alembic upgrade head

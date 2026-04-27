# CampusKart Backend Performance Audit

Date: 2026-04-20
Scope: Django backend API performance optimization (query efficiency, pagination, caching, and logging instrumentation)

## Implemented Changes

### 1) N+1 Query Audit and Fixes

Implemented and verified relation loading and serializer access optimizations:

- apps/vendors/views.py
  - VendorListView now uses select_related("user", "approved_by").
  - VendorDetailView now uses select_related("user", "approved_by").
  - VendorSpotlightListView now uses select_related("user", "approved_by").

- apps/cart/serializers.py
  - Removed repeated relation scans that triggered extra queryset evaluations.
  - Consolidated thumbnail fallback logic with single prefetched image list.
  - Total calculations now reuse prefetched cart items.

- apps/orders/serializers.py
  - get_items now consumes prefetched items once and applies vendor filtering in-memory.

- apps/chat/serializers.py
  - get_last_message now uses prefetched messages and computes latest in memory.

- apps/products/views.py + apps/products/serializers.py
  - Added ProductListSerializer for list action.
  - Product list action now prefetches only images (not tags), reducing list endpoint query count.

#### Budget validation

Measured during controlled probe runs in the Dockerized test environment:

- GET /products/?page=1&page_size=24&ordering=-created_at => 3 queries (target <= 3 met)
- GET /orders/<id>/ => 3 queries (target <= 5 met)

### 2) Pagination Hardening

- apps/admin_api/views.py
  - PublicBannerListView no longer disables pagination.

- apps/vendors/views.py
  - VendorSpotlightListView now paginated via VendorSpotlightPagination
    - page_size = 3
    - page_size_query_param = "limit"
    - max_page_size = 12

- apps/reviews/views.py
  - LegacyProductReviewListView no longer disables pagination.

- apps/chat/pagination.py (new)
  - ChatMessageCursorPagination added (ordering = -sent_at).

- apps/chat/views.py
  - ChatMessageListView switched to cursor pagination.
  - Queryset ordering updated to newest-first to align with cursor ordering.

### 3) Redis Caching Audit and Fixes

#### Required policy alignment

- Homepage banners: 1 hour
  - Added cache on public banners endpoint.
  - Added invalidation on banner save/delete/reorder.

- Category list: 1 hour
  - Already present.

- Product list: 5 minutes per filter combo
  - Already present; strengthened key scoping to include viewer scope.

- Product detail: 10 minutes
  - Already present; strengthened key scoping to include viewer scope.

- Admin stats: 10 minutes
  - Already present.

#### Files changed

- apps/admin_api/services.py
  - Added public banner cache constants and key tracking helpers.
  - Added invalidate_public_banner_cache() with delete_pattern fallback behavior.

- apps/admin_api/views.py
  - PublicBannerListView now serves from cache and writes cache for paginated results.
  - AdminBannerReorderView now invalidates public banner cache.

- apps/admin_api/signals.py
  - Added banner post_save/post_delete signal to invalidate public banner cache.

- apps/products/views.py
  - Product list/detail cache keys now include scope:
    - public
    - authenticated
    - admin
    - vendor:<vendor_id>

- apps/products/signals.py
  - Product detail invalidation now removes all scoped detail variants via pattern delete.

### 4) Slow Query Logging Instrumentation

- docker-compose.yml
  - PostgreSQL service now runs with log_min_duration_statement=100.

- CampusKart/settings/base.py
  - Added django.db.backends logger with SQL_LOG_LEVEL env control.

Note: This instrumentation is configured for development audit usage.

## Endpoint Cache Strategy Matrix

- GET /api/v1/banners/
  - TTL: 1h
  - Key: admin:banners:v1:public:<query_string_or_default>
  - Invalidation: Banner post_save/post_delete, admin reorder action

- GET /api/v1/products/categories/
  - TTL: 1h
  - Key: products:categories:v2
  - Invalidation: Category post_save/post_delete

- GET /api/v1/products/ (per filter combo)
  - TTL: 5m
  - Key: products:list:<md5(scope + query_string)>
  - Invalidation: Product/ProductTag/ProductImage post_save/post_delete

- GET /api/v1/products/<slug>/
  - TTL: 10m
  - Key: products:detail:<slug>:<scope>
  - Invalidation: Product/ProductTag/ProductImage post_save/post_delete

- GET /api/v1/admin/stats/
  - TTL: 10m
  - Key: admin:stats:v1:<from_date>:<to_date>
  - Invalidation: Order/Payment/VendorPayout post_save/post_delete

## Tests Executed

Focused suites executed successfully after the changes:

- apps.chat.tests.test_chat_api
- apps.admin_api.tests.test_banner_api
- apps.vendors.tests.test_vendor_spotlight_api
- apps.orders.tests.test_order_flow
- apps.products.tests.test_cache_resilience
- apps.products.tests.test_cache_invalidation
- apps.products.tests.test_query_budget
- apps.orders.tests.test_query_budget
- apps.reviews.tests.test_product_reviews_api

Results:

- Full focused run: 31 tests, OK.
- Follow-up run (new/updated safeguards only): 17 tests, OK.

## EXPLAIN ANALYZE Findings and Index Additions

- Captured plans for fixed workload scenarios:
  - GET /products/?page=1&page_size=24&ordering=-created_at
  - GET /products/?page=1&page_size=24&search=notebook (representative SQL plan)
  - GET /products/<slug>/
  - GET /cart/
  - POST /orders/ with realistic 3-5 item cart across 2 vendors (inventory fetch plan)
- Key observations:
  - Product list and search plans relied on sequential scan over products under current data distribution.
  - Cart retrieval plan scanned cart_items and joined products; cart_id filter path is indexed and cheap at current size.
  - Order placement inventory fetch used id IN (...) filter and lock rows path.
- Indexes added via migrations:
  - products: idx_product_status_created (status, created_at)
    - File: apps/products/migrations/0005_perf_indexes.py
    - Reason: supports approved-product listing and created_at ordering path.
  - orders: idx_order_buyer_created (buyer, created_at)
    - File: apps/orders/migrations/0006_perf_indexes.py
    - Reason: supports buyer-scoped order listing and temporal sorting/access.
  - order_items: idx_order_item_order_product (order, product)
    - File: apps/orders/migrations/0006_perf_indexes.py
    - Reason: supports order detail item retrieval/join locality.
  - carts: idx_cart_user (user)
    - File: apps/cart/migrations/0002_perf_indexes.py
    - Reason: optimizes cart lookup by authenticated user.
- Migration status:
  - cart.0002_perf_indexes applied.
  - orders.0006_perf_indexes applied.
  - products.0005_perf_indexes applied.
- Post-migration focused tests: 28 tests, OK.

## Query-Budget Regression Safeguards

- Added permanent tests:
  - apps/products/tests/test_query_budget.py
    - Enforces GET /products/?page=1&page_size=24&ordering=-created_at <= 3 queries.
  - apps/orders/tests/test_query_budget.py
    - Enforces GET /orders/<id>/ <= 5 queries.

## Pagination Compliance Checklist

- Static code scan across apps views found no explicit pagination opt-out (`pagination_class = None`).
- List-capable DRF classes inventoried (21 total) now rely on global/default pagination, except explicitly intended custom pagination:
  - Vendor spotlight: custom page-number pagination with limit support.
  - Chat messages: cursor pagination (`ordering=-sent_at`).
- Runtime checks covered by tests:
  - Banner list returns paginated response.
  - Vendor spotlight returns paginated response.
  - Product reviews list returns paginated response.
  - Legacy review list returns paginated response.
  - Chat message list returns cursor-paginated response with next/previous/results envelope.

## Slow Query Logging Findings

- PostgreSQL threshold configured at 100ms via docker-compose.
- Verification step executed:
  - SQL: SELECT pg_sleep(0.2);
  - Observed log entry: duration: 203.801 ms statement: SELECT pg_sleep(0.2);
- This confirms slow-query capture is active at the configured threshold.

## Completion Status

All requested audit objectives are now implemented and validated:

- N+1 remediations and query budget targets.
- EXPLAIN coverage and index additions with rationale.
- Redis cache policy alignment and invalidation wiring.
- Pagination compliance across list endpoints and cursor pagination for chat messages.
- Slow query logging instrumentation with verification evidence.

## Notes

- Forbidden/Bad Request warnings in test output were expected by negative-path tests.
- Temporary probe scripts used during audit were removed after findings were documented.

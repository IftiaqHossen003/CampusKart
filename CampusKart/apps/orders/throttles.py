from rest_framework.throttling import UserRateThrottle


class DomainEventAdminListThrottle(UserRateThrottle):
    scope = "domain_event_admin_list"


class DomainEventAdminRetryThrottle(UserRateThrottle):
    scope = "domain_event_admin_retry"

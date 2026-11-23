from django.contrib.admin import AdminSite
from django.contrib.admin.apps import AdminConfig
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect

from accounts.throttling import AuthRateLimitUnavailable, AuthRateThrottle


class GetaCarAdminSite(AdminSite):
    auth_rate_scope = "admin_login"

    @method_decorator(never_cache)
    @method_decorator(csrf_protect)
    def login(self, request, extra_context=None):
        throttle = AuthRateThrottle()
        try:
            allowed = throttle.allow_request(request, self)
        except AuthRateLimitUnavailable:
            return HttpResponse("Authentification temporairement indisponible.", status=503)
        if not allowed:
            return HttpResponse(
                "Trop de tentatives. Réessayez plus tard.",
                status=429,
                headers={"Retry-After": str(throttle.wait())},
            )
        return super().login(request, extra_context)


class GetaCarAdminConfig(AdminConfig):
    default_site = "accounts.admin_site.GetaCarAdminSite"

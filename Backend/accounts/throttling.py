from functools import lru_cache
from ipaddress import IPv6Address, ip_address, ip_network
from time import time

from django.conf import settings
from django.core.cache import caches
from django.utils.crypto import salted_hmac
from redis import Redis
from redis.exceptions import RedisError
from rest_framework.exceptions import APIException
from rest_framework.throttling import BaseThrottle


class AuthRateLimitUnavailable(APIException):
    status_code = 503
    default_detail = "Authentification temporairement indisponible."


@lru_cache(maxsize=8)
def _redis_client(url):
    return Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)


@lru_cache(maxsize=8)
def _trusted_networks(cidrs):
    return tuple(ip_network(cidr) for cidr in cidrs)


def _parse_ip(value):
    if not value or "%" in value:
        return None
    try:
        address = ip_address(value)
    except ValueError:
        return None
    if isinstance(address, IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped
    return address


def _client_ip(request):
    peer = _parse_ip(request.META.get("REMOTE_ADDR"))
    if peer is None:
        return "unknown"
    trusted = _trusted_networks(settings.AUTH_RATE_LIMIT_TRUSTED_PROXIES)
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded and any(peer in network for network in trusted):
        for hop in reversed(forwarded.split(",")):
            address = _parse_ip(hop.strip())
            if address is None:
                break
            if not any(address in network for network in trusted):
                return str(address)
    return str(peer)


_INCREMENT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


def _increment(key, ttl):
    url = settings.AUTH_RATE_LIMIT_REDIS_URL
    if url:
        try:
            return _redis_client(url).eval(_INCREMENT, 1, key, ttl)
        except (RedisError, ValueError) as exc:
            raise AuthRateLimitUnavailable() from exc
    if settings.AUTH_RATE_LIMIT_REQUIRE_SHARED:
        raise AuthRateLimitUnavailable()

    cache = caches["auth_rate_limit"]
    for _ in range(2):
        if cache.add(key, 1, timeout=ttl):
            return 1
        try:
            return cache.incr(key)
        except ValueError:
            # The local entry can be evicted between add() and incr().
            continue
    raise AuthRateLimitUnavailable()


class AuthRateThrottle(BaseThrottle):
    def allow_request(self, request, view):
        if request.method != "POST":
            return True
        scope = view.auth_rate_scope
        ip_limit, ip_seconds, account_limit, account_seconds = settings.AUTH_RATE_LIMITS[scope]
        now = int(time())
        self.retry_after = self._check(scope, "ip", _client_ip(request), ip_limit, ip_seconds, now)
        if self.retry_after:
            return False

        if account_limit:
            # DRF uses email; the Django admin login posts the identifier as username.
            if scope == "account_erasure":
                identifier = str(request.user.pk)
            elif scope == "admin_login":
                identifier = request.POST.get("username")
            else:
                payload = request.data
                identifier = payload.get("email") if hasattr(payload, "get") else None
            if isinstance(identifier, str) and 0 < len(identifier.strip()) <= 254:
                self.retry_after = self._check(
                    scope, "account", identifier.strip().lower(), account_limit, account_seconds, now
                )
        return self.retry_after is None

    def wait(self):
        return self.retry_after

    @staticmethod
    def _check(scope, kind, identity, limit, seconds, now):
        bucket, elapsed = divmod(now, seconds)
        # The shared store receives no raw IP addresses or email addresses.
        subject = salted_hmac("getacar.auth-rate-limit", identity, algorithm="sha256").hexdigest()
        key = f"getacar:auth-rate:v1:{scope}:{kind}:{bucket}:{subject}"
        remaining = seconds - elapsed
        if _increment(key, remaining + 5) > limit:
            return remaining
        return None


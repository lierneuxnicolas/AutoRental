import json
import logging

from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)
MAX_REPORT_BYTES = 8192
DIRECTIVES = frozenset({
    "base-uri", "connect-src", "default-src", "font-src", "form-action",
    "frame-ancestors", "frame-src", "img-src", "object-src",
    "script-src", "script-src-attr", "script-src-elem",
    "style-src", "style-src-attr", "style-src-elem",
})


@csrf_exempt
@require_POST
def receive_csp_report(request):
    # CSP reports can contain query strings and credentials. Log only known directive names.
    if request.content_type != "application/csp-report":
        return HttpResponse(status=415)
    payload = request.read(MAX_REPORT_BYTES + 1)
    if len(payload) > MAX_REPORT_BYTES:
        return HttpResponse(status=413)
    try:
        envelope = json.loads(payload)
        report = envelope.get("csp-report") if isinstance(envelope, dict) else None
    except (ValueError, RecursionError):
        return HttpResponse(status=400)

    directive = report.get("effective-directive") if isinstance(report, dict) else None
    if isinstance(directive, str) and directive in DIRECTIVES:
        if cache.add(f"csp-report:{directive}", True, timeout=60):
            logger.warning("CSP report-only violation: %s", directive)
    return HttpResponse(status=204)

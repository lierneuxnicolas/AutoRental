from django.db.models import Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ClientDocument, User
from accounts.permissions import IsManagerOrAdministrator
from interventions.models import Intervention
from payments.models import Payment
from reservations.models import Reservation
from vehicles.services.availability import get_currently_available_vehicles


class ManagerDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdministrator]

    def get(self, request):
        now = timezone.now()
        local_now = timezone.localtime(now)
        month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        revenue = Payment.objects.filter(
            status=Payment.Status.REUSSI,
            currency="EUR",
            succeeded_at__gte=month_start,
            succeeded_at__lte=now,
        ).aggregate(total=Sum("amount", default=0))["total"]
        return Response({
            "pending_documents": ClientDocument.objects.filter(
                status=ClientDocument.Status.EN_ATTENTE, is_active=True,
            ).count(),
            "available_vehicles": get_currently_available_vehicles(at=now).count(),
            "reservations_to_check": Reservation.objects.filter(status=Reservation.Status.A_CONTROLER).count(),
            "active_users": User.objects.filter(is_active=True).count(),
            "open_interventions": Intervention.objects.exclude(
                status__in=(Intervention.Status.TERMINEE, Intervention.Status.ANNULEE),
            ).count(),
            "revenue": {
                "amount": f"{revenue:.2f}",
                "currency": "EUR",
                "period_start": month_start.date().isoformat(),
                "period_end": local_now.date().isoformat(),
            },
        }, headers={"Cache-Control": "private, no-store"})

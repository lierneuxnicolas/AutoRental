import logging

from django.db import DatabaseError
from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AccountErasureRequest
from accounts.permissions import IsClient
from accounts.services.account_erasure import request_account_erasure
from accounts.services.erasure_processing import process_closed_account_erasure
from accounts.throttling import AuthRateThrottle


logger = logging.getLogger(__name__)


class ErasurePasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class ErasureRequestSerializer(serializers.ModelSerializer):
    reason_detail = serializers.CharField(source="get_reason_display", read_only=True)
    closed_at = serializers.DateTimeField(source="user.account_closed_at", read_only=True)
    detail = serializers.SerializerMethodField()

    def get_detail(self, erasure):
        if erasure.status == AccountErasureRequest.Status.PENDING:
            return erasure.get_reason_display()
        if erasure.processing_status == AccountErasureRequest.ProcessingStatus.COMPLETED:
            return "Votre compte a été clôturé et l’effacement des données prévu a été effectué."
        if erasure.processing_status == AccountErasureRequest.ProcessingStatus.HELD:
            return "Votre compte est clôturé. L’effacement est différé pour respecter une obligation de conservation."
        return "Votre compte est clôturé. L’effacement reste incomplet et doit être repris par GetaCar."

    class Meta:
        model = AccountErasureRequest
        fields = (
            "requested_at", "status", "reason", "reason_detail", "closed_at",
            "processing_status", "processed_at", "processing_error", "detail",
        )


@method_decorator(sensitive_post_parameters(), name="dispatch")
class AccountErasureRequestView(APIView):
    permission_classes = (IsAuthenticated, IsClient)
    throttle_classes = (AuthRateThrottle,)
    auth_rate_scope = "account_erasure"

    @extend_schema(
        request=ErasurePasswordSerializer,
        responses={200: ErasureRequestSerializer, 202: ErasureRequestSerializer},
    )
    def post(self, request):
        serializer = ErasurePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            erasure = request_account_erasure(
                user_id=request.user.pk, password=serializer.validated_data["password"]
            )
        except DatabaseError as exc:
            logger.error("Account erasure closure database failure (%s)", type(exc).__name__)
            return Response({
                "code": "ERASURE_DATABASE_ERROR",
                "detail": "La clôture du compte n’a pas pu être enregistrée. Contactez GetaCar si le problème persiste.",
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        response_status = status.HTTP_202_ACCEPTED
        if erasure.status == AccountErasureRequest.Status.CLOSED:
            try:
                erasure = process_closed_account_erasure(erasure.pk)
            except DatabaseError as exc:
                logger.error("Account erasure processing database failure (%s)", type(exc).__name__)
            if erasure.processing_status == AccountErasureRequest.ProcessingStatus.COMPLETED:
                response_status = status.HTTP_200_OK
            elif erasure.processing_status == AccountErasureRequest.ProcessingStatus.FAILED:
                logger.warning("Account erasure processing incomplete (%s)", erasure.processing_error)
        return Response(ErasureRequestSerializer(erasure).data, status=response_status)

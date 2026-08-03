import json

import stripe
from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.services import StripeWebhookProcessingError, process_stripe_event


WebhookMessageResponseSerializer = inline_serializer(
	name="StripeWebhookMessageResponse",
	fields={"message": drf_serializers.CharField()},
)

WebhookErrorResponseSerializer = inline_serializer(
	name="StripeWebhookErrorResponse",
	fields={"detail": drf_serializers.CharField()},
)


class StripeWebhookView(APIView):
	authentication_classes = []
	permission_classes = [AllowAny]

	@extend_schema(
		tags=["Payments"],
		auth=[],
		request=None,
		responses={
			200: WebhookMessageResponseSerializer,
			400: OpenApiResponse(response=WebhookErrorResponseSerializer),
			500: OpenApiResponse(response=WebhookErrorResponseSerializer),
		},
		description=(
			"Recoit les webhooks Stripe signes pour synchroniser l'etat local des paiements. "
			"La signature Stripe est obligatoire et les evenements sont traites de maniere idempotente."
		),
	)
	def post(self, request):
		payload = request.body
		if not payload:
			return Response({"detail": "Payload invalide."}, status=status.HTTP_400_BAD_REQUEST)

		signature = request.headers.get("Stripe-Signature")
		if not signature:
			return Response({"detail": "Signature Stripe absente."}, status=status.HTTP_400_BAD_REQUEST)

		webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
		if not webhook_secret:
			return Response({"detail": "Webhook Stripe indisponible."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		try:
			event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
		except ValueError:
			return Response({"detail": "Payload invalide."}, status=status.HTTP_400_BAD_REQUEST)
		except stripe.error.SignatureVerificationError:
			return Response({"detail": "Signature Stripe invalide."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			process_stripe_event(event)
		except StripeWebhookProcessingError:
			return Response(
				{"detail": "Le traitement du webhook a echoue."},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR,
			)
		except Exception:
			return Response(
				{"detail": "Le traitement du webhook a echoue."},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR,
			)

		return Response({"message": "Webhook recu."}, status=status.HTTP_200_OK)

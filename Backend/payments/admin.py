from django.contrib import admin

from .models import Deposit, Payment, Refund, StripeEvent


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"reservation",
		"provider",
		"amount",
		"currency",
		"status",
		"stripe_payment_intent_id",
		"created_at",
	)
	list_filter = ("provider", "status", "currency", "created_at")
	search_fields = ("stripe_payment_intent_id", "reservation__id")
	readonly_fields = ("stripe_payment_intent_id", "created_at", "updated_at")
	ordering = ("-created_at",)


@admin.register(Deposit)
class DepositAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"reservation",
		"mode",
		"amount",
		"currency",
		"status",
		"stripe_payment_intent_id",
		"created_at",
	)
	list_filter = ("mode", "status", "currency", "created_at")
	search_fields = ("stripe_payment_intent_id", "reservation__id")
	readonly_fields = ("stripe_payment_intent_id", "created_at", "updated_at")
	ordering = ("-created_at",)


@admin.register(StripeEvent)
class StripeEventAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"stripe_event_id",
		"event_type",
		"processed",
		"processed_at",
		"created_at",
	)
	list_filter = ("processed", "event_type", "created_at")
	search_fields = ("stripe_event_id", "event_type")
	readonly_fields = ("stripe_event_id", "payload", "created_at")
	ordering = ("-created_at",)


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"payment",
		"reservation",
		"amount",
		"currency",
		"status",
		"stripe_refund_id",
		"requested_by",
		"created_at",
	)
	list_filter = ("status", "currency", "created_at")
	search_fields = ("stripe_refund_id", "payment__id", "reservation__id")
	readonly_fields = ("stripe_refund_id", "created_at", "updated_at")
	ordering = ("-created_at",)

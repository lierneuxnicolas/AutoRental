from accounts.models import ClientDocument, ClientProfile
from accounts.services.profile_status import (
    get_effective_profile_status,
    get_required_documents_state,
    is_personal_information_complete,
)


def calculate_profile_progress(client_profile):
    account_created = True
    email_verified = bool(client_profile.user.email_verified)
    personal_information_complete = is_personal_information_complete(client_profile)

    required_state = get_required_documents_state(client_profile)
    document_issues = required_state["document_issues"]
    identity_issue = document_issues[ClientDocument.DocumentType.CARTE_IDENTITE]
    license_issue = document_issues[ClientDocument.DocumentType.PERMIS_CONDUIRE]
    identity_card_valid = identity_issue is None
    driving_license_valid = license_issue is None

    criteria = [
        account_created,
        email_verified,
        personal_information_complete,
        identity_card_valid,
        driving_license_valid,
    ]
    percentage = round(sum(1 for criterion in criteria if criterion) / len(criteria) * 100)

    def document_issue_label(document_type, issue):
        if issue is None:
            return None
        if document_type == ClientDocument.DocumentType.CARTE_IDENTITE:
            title = "Carte d'identité"
            issue_labels = {
                "MISSING": "manquante",
                "EXPIRED": "expirée",
                "REFUSED": "refusée",
                "PENDING": "en attente de validation",
                "INVALID": "à régulariser",
                "VERIFICATION_PENDING": "en attente de vérification par un gestionnaire",
            }
        else:
            title = "Permis de conduire"
            issue_labels = {
                "MISSING": "manquant",
                "EXPIRED": "expiré",
                "REFUSED": "refusé",
                "PENDING": "en attente de validation",
                "INVALID": "à régulariser",
                "VERIFICATION_PENDING": "en attente de vérification par un gestionnaire",
            }
        return f"{title} {issue_labels[issue]}"

    needs_client_action = (
        not personal_information_complete
        or required_state["has_client_document_action"]
    )
    profile_status = get_effective_profile_status(
        client_profile,
        required_state=required_state,
    )
    if needs_client_action:
        profile_status = ClientProfile.ProfileStatus.INCOMPLET

    return {
        "percentage": percentage,
        "account_created": account_created,
        "email_verified": email_verified,
        "personal_information_complete": personal_information_complete,
        "identity_card_valid": identity_card_valid,
        "driving_license_valid": driving_license_valid,
        "identity_card_issue": document_issue_label(
            ClientDocument.DocumentType.CARTE_IDENTITE,
            identity_issue,
        ),
        "driving_license_issue": document_issue_label(
            ClientDocument.DocumentType.PERMIS_CONDUIRE,
            license_issue,
        ),
        "profile_status": profile_status,
        "needs_client_action": needs_client_action,
        "documents_need_action": required_state["has_client_document_action"],
    }
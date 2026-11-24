const messageKeys: Record<string, string> = {
  "Lien de reinitialisation invalide ou expire.": "public.le_lien_de_reinitialisation_est_invalide_ou_a_expire",
  "Ce lien de confirmation a deja ete utilise.": "public.ce_lien_de_confirmation_a_deja_ete_utilise",
  "Les mots de passe ne correspondent pas.": "validation.passwordMismatch",
  "Le mot de passe doit contenir entre 15 et 128 caractères.": "validation.passwordLength",
  "Le mot de passe contient un caractère non autorisé.": "validation.passwordCharacter",
  "Vous devez accepter les conditions générales d’utilisation.": "validation.terms",
  "Le lien de confirmation a expire.": "public.le_lien_de_confirmation_a_expire",
  "Le jeton de confirmation est invalide.": "public.le_jeton_de_confirmation_est_invalide",
  "Cette adresse e-mail est deja verifiee.": "public.cette_adresse_e_mail_est_deja_verifiee",
  "Un compte avec cet e-mail existe deja.": "public.un_compte_avec_cet_e_mail_existe_deja",
  "Le mot de passe est trop courant.": "public.le_mot_de_passe_est_trop_courant",
  "Le mot de passe ne peut pas contenir uniquement des chiffres.": "public.le_mot_de_passe_ne_peut_pas_contenir_uniquement_des_chiffres",
  "Le mot de passe ressemble trop à vos informations personnelles.": "public.le_mot_de_passe_ressemble_trop_a_vos_informations_personnelles",
  "Les conditions ont changé. Actualisez la page et relisez-les avant de les accepter.": "public.les_conditions_ont_change_actualisez_la_page_et_relisez_les_avant"
}

export function authMessageKey(message: string) {
  return Object.hasOwn(messageKeys, message) ? messageKeys[message] : message
}

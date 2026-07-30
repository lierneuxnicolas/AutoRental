# AutoRental - Règles du projet

## Ordre d'autorité des documents

En cas de contradiction, appliquer l'ordre suivant :

1. Cahier des charges fonctionnel
2. Dictionnaire de données
3. Documentation API
4. Diagrammes UML
5. Maquettes
6. Base SQL existante

La stratégie de sécurité est un document transversal. Elle s'applique pour toutes les décisions liées à la sécurité (authentification, autorisation, protection des données, etc.) mais ne remplace jamais les règles métier.

## Règles de développement

- Ne jamais modifier les documents dans `Documents_Reference`.
- Toute modification fonctionnelle doit être faite dans `Working_Documents`.
- Toute nouvelle table ou colonne doit être validée par le dictionnaire de données.
- Le code doit toujours respecter les documents de référence.
- En cas de contradiction, le document ayant la priorité la plus élevée prévaut.
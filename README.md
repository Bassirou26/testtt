# SmartSummary - Signup + Recording Demo

Mini projet démonstration pour la page d'inscription et l'enregistrement audio.

Fonctionnalités incluses:

- Page d'inscription (nom, email, rôle, cours/entreprise, consentement)
- **Validation email** - Confirmation par mail, tokens de vérification (24h)
- **Validation mot de passe** - Vérification force en temps réel, feedback utilisateur
- **Hashing bcrypt** - Tous les mots de passe hashés avec bcryptjs (10 rounds)
- UI d'enregistrement audio (enregistrer / stopper / téléverser)
- Backend Express minimal pour recevoir l'inscription et l'audio
- Pages de résumés et cartes mentales

Sécurité:

- Mots de passe hashés avec bcryptjs (score 10)
- Tokens de vérification email générés aléatoirement
- Validation de force mot de passe côté client ET serveur (min. 3/5)
- Utilisateurs non vérifiés ne peuvent pas se connecter

Prérequis:

- Node.js (>=16)

Installation & lancement:

```bash
cd /Users/elhadjibassirousy/Desktop/PrePFATest
npm install
npm start
# puis ouvrir http://localhost:3000 dans le navigateur
```

Notes:

- Le serveur stocke les utilisateurs en mémoire (démonstration). Remplacez par une base réelle pour production.
- Le téléversement audio est enregistré dans `uploads/`.
- Les tokens de vérification email expirent après 24 heures.

## Envoyer le résumé par email

Le endpoint `/api/summary` retourne un JSON de démonstration. Pour que le serveur envoie le résumé par email, ajoutez le paramètre `sendEmail=true` à la requête et configurez les variables d'environnement SMTP avant de démarrer le serveur.

Variables d'environnement attendues (exemples):

```bash
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=your-smtp-username
export SMTP_PASS=your-smtp-password
export FROM_EMAIL="no-reply@smartsummary.example"
```

Exemple de requête pour obtenir et envoyer le résumé par email (remplacez l'email):

```bash
curl "http://localhost:3000/api/summary?email=utilisateur@example.com&sendEmail=true"
```

Notes:

- Pour un envoi fiable en production, utilisez un service de livraison d'emails (SendGrid, Mailgun, SES, etc.) et stockez les credentials de façon sécurisée.
- L'API de résumé est pour l'instant un placeholder. Pour générer de vrais résumés ou cartes mentales, branchez un service NLP (OpenAI, Hugging Face, etc.) et appelez-le lors de la génération de `summaryText`.

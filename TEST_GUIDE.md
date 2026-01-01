# Guide de Test - SmartSummary

## Prérequis

1. **Node.js** installé (version 16+)
2. **Variables d'environnement** (optionnel mais recommandé)

## Configuration

### 1. Variables d'environnement (Optionnel)

Créez un fichier `.env` à la racine du projet (ou définissez les variables d'environnement) :

```bash
# JWT Secret (obligatoire en production)
JWT_SECRET=votre_secret_jwt_securise

# OpenAI API Key (pour transcription et résumés intelligents)
OPENAI_API_KEY=sk-votre-cle-api-openai

# SMTP pour emails de vérification (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-app
FROM_EMAIL=noreply@smartsummary.com
APP_URL=http://localhost:3000
```

### 2. Installer les dépendances (si pas déjà fait)

```bash
npm install
```

## Démarrer le serveur

```bash
npm start
```

Le serveur démarre sur `http://localhost:3000`

## Guide de Test Complet

### Étape 1 : Inscription (US1)

1. Ouvrir `http://localhost:3000`
2. Remplir le formulaire d'inscription :
   - Nom complet
   - Email valide
   - Mot de passe (minimum 8 caractères, avec majuscules, minuscules, chiffres)
   - Rôle : Étudiant, Enseignant ou Professionnel
   - Organisation/Cours
   - Cocher le consentement
3. Cliquer sur "S'inscrire"
4. ✅ **Résultat attendu** : Message de succès, email de vérification (si SMTP configuré)

### Étape 2 : Vérification Email (US1)

1. Si SMTP configuré, vérifier votre boîte email
2. Cliquer sur le lien de vérification
3. ✅ **Résultat attendu** : Email vérifié, redirection vers la page de connexion

**Alternative sans SMTP** : Utiliser directement l'endpoint API :
```bash
curl -X POST http://localhost:3000/api/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"votre-email@example.com","token":"token-de-la-base"}'
```

### Étape 3 : Connexion (US2)

1. Sur la page d'accueil, remplir le formulaire de connexion :
   - Email
   - Mot de passe
2. Cliquer sur "Se connecter"
3. ✅ **Résultat attendu** : Redirection vers `/dashboard.html`

### Étape 4 : Enregistrement Audio en Temps Réel (US3, US4)

1. Cliquer sur "🎙️ Enregistrer" dans le dashboard
2. Entrer un titre de session (ex: "Cours de Mathématiques")
3. (Optionnel) Cocher "Mode Réunion" pour un compte-rendu professionnel
4. Cliquer sur "🎙️ Démarrer l'enregistrement"
5. Autoriser l'accès au microphone
6. Parler pendant quelques secondes
7. Cliquer sur "⏹️ Arrêter"
8. ✅ **Résultat attendu** :
   - Transcription en temps réel (si OpenAI configuré)
   - Session créée
   - Redirection vers la page de session après finalisation

**Note** : Sans OpenAI, vous verrez une transcription simulée.

### Étape 5 : Consulter l'Historique (US7)

1. Cliquer sur "📚 Historique" dans le menu
2. ✅ **Résultat attendu** : Liste de toutes vos sessions avec dates
3. Cliquer sur "Voir" pour une session
4. ✅ **Résultat attendu** : Page de détail de la session

### Étape 6 : Générer un Résumé (US5, US14)

1. Sur la page de détail d'une session
2. Choisir le type de résumé :
   - "Générer Résumé Court" - résumé concis
   - "Générer Résumé Détaillé" - résumé complet structuré
   - "Générer Mots-clés" - liste de mots-clés
3. Cliquer sur le bouton correspondant
4. Attendre la génération (quelques secondes si OpenAI configuré)
5. ✅ **Résultat attendu** : Résumé affiché sur la page

**Mode Réunion** : Si la session était en mode réunion, le résumé inclura :
- Décisions prises
- Tâches assignées
- Participants
- Points d'action

### Étape 7 : Télécharger PDF (US6)

1. Sur la page de détail d'une session avec résumé généré
2. Cliquer sur le bouton "📥 PDF" à côté d'un résumé
3. ✅ **Résultat attendu** : Téléchargement d'un fichier PDF avec le résumé

### Étape 8 : Générer un Quiz (US15)

1. Sur la page de détail d'une session
2. Cliquer sur "Générer Quiz"
3. Attendre la génération
4. ✅ **Résultat attendu** : Quiz avec 5 questions QCM affiché
5. Sélectionner des réponses
6. Cliquer sur "Vérifier les réponses"
7. ✅ **Résultat attendu** : Score affiché avec corrections

### Étape 9 : Supprimer une Session (US8)

1. Aller dans "📚 Historique"
2. Cliquer sur "Supprimer" pour une session
3. Confirmer la suppression
4. ✅ **Résultat attendu** : Session supprimée de la liste

### Étape 10 : Panel Admin (US11, US12)

**Prérequis** : Créer un utilisateur avec le rôle "admin" dans la base de données

```sql
UPDATE users SET role = 'admin' WHERE email = 'votre-email@example.com';
```

1. Se connecter avec un compte admin
2. Cliquer sur "⚙️ Admin" dans le menu
3. ✅ **Résultat attendu** :
   - Statistiques affichées (nombre d'utilisateurs, sessions, résumés, etc.)
   - Liste des utilisateurs avec nombre de sessions
4. Tester la suppression d'un utilisateur (attention : action irréversible)

### Étape 11 : Mode Réunion Professionnel (US9)

1. Créer une nouvelle session avec "Mode Réunion" coché
2. Enregistrer (ou utiliser une session existante en mode réunion)
3. Générer un résumé détaillé
4. ✅ **Résultat attendu** : Résumé structuré avec décisions, tâches, participants, etc.

## Tests API Directs (avec curl)

### Test d'inscription
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test1234!@#",
    "role": "student",
    "organization": "Test University",
    "consent": true
  }'
```

### Test de connexion
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234!@#"
  }'
```

### Test de liste des sessions (nécessite token)
```bash
# Remplacez YOUR_TOKEN par le token reçu lors de la connexion
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test des statistiques
```bash
curl http://localhost:3000/api/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Tests de Sécurité

1. **Test d'accès non autorisé** :
   - Essayer d'accéder à `/api/sessions` sans token
   - ✅ Doit retourner 401

2. **Test de permissions** :
   - Utilisateur normal ne peut pas accéder à `/api/admin/users`
   - ✅ Doit retourner 403

3. **Test de session expirée** :
   - Attendre expiration du token (15 min par défaut)
   - Essayer une requête API
   - ✅ Doit utiliser refresh token automatiquement

## Dépannage

### Problème : Transcription ne fonctionne pas
- **Cause** : OpenAI API key non configurée
- **Solution** : Ajouter `OPENAI_API_KEY` dans `.env`
- **Alternative** : L'application utilise une transcription simulée

### Problème : Erreur "Email not verified"
- **Cause** : Email non vérifié
- **Solution** : Vérifier l'email via le lien reçu, ou vérifier manuellement en base de données

### Problème : WebSocket ne se connecte pas
- **Cause** : Token invalide ou expiré
- **Solution** : Se reconnecter pour obtenir un nouveau token

### Problème : PDF ne se télécharge pas
- **Cause** : Session ou résumé non trouvé
- **Solution** : Vérifier que la session existe et qu'un résumé a été généré

## Checklist de Test Complète

- [ ] Inscription réussie
- [ ] Validation email fonctionne
- [ ] Connexion réussie
- [ ] Enregistrement audio fonctionne
- [ ] Transcription en temps réel s'affiche (si OpenAI configuré)
- [ ] Session créée et sauvegardée
- [ ] Historique affiche les sessions
- [ ] Génération de résumé court fonctionne
- [ ] Génération de résumé détaillé fonctionne
- [ ] Génération de mots-clés fonctionne
- [ ] Téléchargement PDF fonctionne
- [ ] Génération de quiz fonctionne
- [ ] Quiz affiche les résultats correctement
- [ ] Suppression de session fonctionne
- [ ] Panel admin accessible (pour admin)
- [ ] Statistiques s'affichent
- [ ] Suppression d'utilisateur fonctionne (admin)
- [ ] Mode réunion génère le bon type de résumé
- [ ] JWT token refresh fonctionne
- [ ] Permissions respectées (user ne peut pas accéder admin)

## Notes Importantes

1. **OpenAI API** : Pour les fonctionnalités IA (transcription, résumés, quiz), une clé API OpenAI est requise. Sans elle, l'application fonctionne mais avec des données simulées.

2. **Base de données** : SQLite est utilisée par défaut. Le fichier `data.sqlite` est créé automatiquement.

3. **Fichiers audio** : Les fichiers audio sont stockés dans le dossier `uploads/`. Assurez-vous d'avoir les permissions d'écriture.

4. **Production** : Pour la production, changez `JWT_SECRET` et utilisez un serveur SMTP fiable pour les emails.


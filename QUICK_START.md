# 🚀 Démarrage Rapide - SmartSummary

## Installation et Démarrage (2 minutes)

### 1. Installer les dépendances
```bash
npm install
```

### 2. (Optionnel) Configurer OpenAI pour les fonctionnalités IA

Créez un fichier `.env` :
```bash
OPENAI_API_KEY=sk-votre-cle-ici
JWT_SECRET=votre-secret-jwt-securise
```

### 3. Démarrer le serveur
```bash
npm start
```

### 4. Ouvrir dans le navigateur
```
http://localhost:3000
```

## Test Rapide en 5 étapes

### 1️⃣ Inscription
- Remplir le formulaire sur la page d'accueil
- Email + mot de passe (min 8 caractères avec majuscules, chiffres)
- ✅ Message de succès

### 2️⃣ Vérification Email (si SMTP configuré)
- Vérifier votre boîte email
- Cliquer sur le lien de vérification
- Sinon, ignorer cette étape (vous pouvez vous connecter si email déjà vérifié en base)

### 3️⃣ Connexion
- Utiliser l'email et mot de passe
- ✅ Redirection vers le dashboard

### 4️⃣ Créer un Enregistrement
- Cliquer sur "🎙️ Enregistrer"
- Entrer un titre
- Cliquer "Démarrer l'enregistrement"
- Autoriser le micro
- Parler quelques secondes
- Cliquer "Arrêter"
- ✅ Session créée automatiquement

### 5️⃣ Générer un Résumé
- Sur la page de la session
- Cliquer "Générer Résumé Détaillé"
- ✅ Résumé affiché (ou message si pas d'OpenAI)

## Test avec Script Automatique

```bash
./test-quick.sh
```

## Fonctionnalités Disponibles

✅ **Avec OpenAI API Key** :
- Transcription audio en temps réel
- Résumés intelligents (court, détaillé, mots-clés)
- Génération de quiz automatiques
- Mode réunion pour comptes-rendus professionnels

✅ **Sans OpenAI API Key** :
- Inscription/Connexion
- Enregistrement audio (stocké localement)
- Transcription simulée
- Toutes les fonctionnalités UI
- Résumés factices pour tests

## Prochaines Étapes

1. Lire `TEST_GUIDE.md` pour un guide de test complet
2. Configurer SMTP pour les emails de vérification
3. Créer un utilisateur admin pour tester le panel admin

## Dépannage Rapide

**Serveur ne démarre pas** → Vérifier que le port 3000 n'est pas utilisé

**Transcription ne fonctionne pas** → Ajouter `OPENAI_API_KEY` dans `.env`

**Email non vérifié** → Vérifier manuellement ou ignorer si en développement

**Erreur 401** → Se reconnecter pour obtenir un nouveau token JWT

## Structure des Pages

- `/` - Page d'accueil (inscription/connexion)
- `/dashboard.html` - Tableau de bord principal
- `/record.html` - Enregistrement audio temps réel
- `/history.html` - Historique des sessions
- `/session.html?id=X` - Détail d'une session
- `/admin.html` - Panel admin (admin uniquement)

## Commandes Utiles

```bash
# Démarrer le serveur
npm start

# Tests rapides
./test-quick.sh

# Vérifier la syntaxe du serveur
node -c server.js

# Voir les logs en temps réel (si disponible)
npm start | tee server.log
```


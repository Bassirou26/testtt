#!/bin/bash

# Script de test rapide pour SmartSummary

echo "🧪 Tests rapides SmartSummary"
echo "=============================="
echo ""

BASE_URL="http://localhost:3000"

# Test 1: Vérifier que le serveur répond
echo "1️⃣  Test: Serveur accessible..."
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" | grep -q "200\|301\|302"; then
    echo "   ✅ Serveur accessible"
else
    echo "   ❌ Serveur inaccessible - Assurez-vous que 'npm start' est lancé"
    exit 1
fi

# Test 2: Test d'inscription
echo ""
echo "2️⃣  Test: Inscription..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User Quick",
    "email": "test-quick-'$(date +%s)'@example.com",
    "password": "Test1234!@#",
    "role": "student",
    "organization": "Test University",
    "consent": true
  }')

if echo "$REGISTER_RESPONSE" | grep -q "ok\|réussie"; then
    echo "   ✅ Inscription réussie"
else
    echo "   ⚠️  Inscription: $REGISTER_RESPONSE"
fi

# Test 3: Test de force de mot de passe
echo ""
echo "3️⃣  Test: Validation mot de passe..."
PASSWORD_TEST=$(curl -s -X POST "$BASE_URL/api/check-password-strength" \
  -H "Content-Type: application/json" \
  -d '{"password":"Weak"}')

if echo "$PASSWORD_TEST" | grep -q "weak\|medium\|strong"; then
    echo "   ✅ Validation mot de passe fonctionne"
else
    echo "   ❌ Validation mot de passe échouée"
fi

# Test 4: Test endpoint sessions (nécessite auth, devrait échouer)
echo ""
echo "4️⃣  Test: Protection des routes..."
SESSIONS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/sessions")
HTTP_CODE=$(echo "$SESSIONS_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    echo "   ✅ Routes protégées (401 attendu sans auth)"
else
    echo "   ⚠️  Code HTTP: $HTTP_CODE"
fi

echo ""
echo "✅ Tests rapides terminés!"
echo ""
echo "Pour des tests complets, suivez le guide TEST_GUIDE.md"
echo "Ou testez manuellement via l'interface: $BASE_URL"


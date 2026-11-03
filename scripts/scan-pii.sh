#!/usr/bin/env bash
# L0-05 : échoue si un fichier suivi par Git contient ou ressemble à une donnée personnelle.
# Règle de CLAUDE.md : aucune donnée de salarié dans les fichiers suivis.
set -u
cd "$(git rev-parse --show-toplevel)"
fail=0

# 1. Types de fichiers qui portent des données réelles (classeurs, dumps, secrets)
bad=$(git ls-files | grep -Ei '\.(xlsx|xlsm|xls|dump)$|(^|/)\.env$|(^|/)db/seed/|(^|/)backups/' || true)
if [ -n "$bad" ]; then echo "FAIL fichiers sensibles suivis :"; echo "$bad"; fail=1; fi

# 2. IBAN sénégalais (SN + 2 chiffres + 24 caractères), espaces tolérés
iban=$(git grep -nIE 'SN[0-9]{2}( ?[A-Z0-9]{4}){5,6}' -- . ':!scripts/scan-pii.sh' || true)
if [ -n "$iban" ]; then echo "FAIL motif IBAN :"; echo "$iban" | cut -c1-120; fail=1; fi

# 3. Clés privées et jetons évidents
sec=$(git grep -nIE 'BEGIN (RSA |EC )?PRIVATE KEY|sk_live_[0-9A-Za-z]+|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}' -- . ':!scripts/scan-pii.sh' || true)
if [ -n "$sec" ]; then echo "FAIL secret apparent :"; echo "$sec" | cut -c1-120; fail=1; fi

[ "$fail" -eq 0 ] && echo "PASS scan données personnelles"
exit "$fail"

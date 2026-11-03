# SOMA-RH — installation locale

## Prérequis

- Windows PowerShell ;
- Docker Desktop démarré ;
- Node.js et npm ;
- au moins 4 Go disponibles pour les conteneurs et la base.

## Installation initiale

```powershell
Copy-Item .env.docker.example .env
docker compose up -d postgres postgrest api pgadmin
Set-Location web
npm install
npm run build
Set-Location ..
Copy-Item web/.env.example web/.env.local
```

Le fichier `.env` contient des valeurs locales et ne doit pas être commité. En environnement partagé, remplacer `JWT_SECRET` par une valeur aléatoire longue.

## Services

| Service | Adresse |
|---|---|
| Application | http://localhost:5173 |
| API locale | http://localhost:8000 |
| PostgREST | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| pgAdmin | http://localhost:5051 |

Dans pgAdmin lancé dans Docker, utiliser `postgres` comme hôte, `soma_rh` comme base, `soma` comme utilisateur et la valeur de `POSTGRES_PASSWORD`.

## Contrôle de santé

```powershell
.\scripts\local-health.ps1
```

## Sauvegarde et restauration

Les sauvegardes peuvent contenir des données personnelles et sont exclues de Git.

```powershell
.\scripts\local-backup.ps1
.\scripts\local-restore.ps1 -BackupFile .\backups\soma-rh-AAAAMMJJ-HHmmss.dump
```

La restauration remplace les données de `soma_rh` et demande une confirmation explicite.

## Arrêt et remise à zéro

```powershell
# Arrêt sans supprimer les données
.\scripts\local-reset.ps1

# Suppression complète des volumes après confirmation
.\scripts\local-reset.ps1 -Volumes
```

Le reset complet recrée les services et réapplique les migrations présentes dans l'image PostgreSQL. Il ne recharge pas de données personnelles distantes.

---
type: guide
title: "Guide d'usage et comparaison : Modaka vs Modaka-Hub"
description: "Clarification des rôles, cas d'usage, flux de données et critères de décision pour choisir entre Modaka (Client local-first) et Modaka-Hub (Serveur d'autorité central)."
tags:
  - modaka
  - modaka-hub
  - documentation
  - architecture
  - okf
  - workflow
timestamp: 2026-09-21T21:42:00.000Z
---

# Guide d'usage : Quand et Comment utiliser Modaka vs Modaka-Hub ?

> **L'analogie clé** :  
> - **Modaka-Hub** est la **Bibliothèque Universelle & le Laboratoire de Curation** (centralisé, collaboratif, normatif).  
> - **Modaka** est votre **Carnet de Terrain & Copilote Embarqué** (local, personnel, latence 0ms, hors-ligne).

---

## 🧭 1. Résumé Exécutif & Positionnement

Dans l'écosystème Quatrain et la gestion des connaissances au format **OKF v0.1 (Open Knowledge Format)** :

* **Modaka (Client Edge / Sovereign Brain)** est conçu pour l'utilisateur individuel, l'exploitant de terrain ou le chercheur à son bureau. C'est un outil **local-first** à latence zéro, optimisé pour la lecture, la prise de notes rapide et l'interrogation conversationnelle avec un LLM local ou distant.
* **Modaka-Hub (Central Authority / SOA)** est la plateforme serveur collaborative destinée aux collectifs d'experts, ingénieurs agronomes ou équipes de veille. C'est la **Source d'Autorité (SOA)** qui ingère en masse, qualifie sur plusieurs axes taxonomiques, valide formellement les fiches et produit des extractions ciblées.

---

## 🌿 2. Quand utiliser Modaka (Local / Client) ?

Utilisez **Modaka** lorsque vous êtes dans une posture de **consommation quotidienne, d'exploration personnelle ou de travail de terrain**.

### 🎯 Cas d'usage types :
1. **Copilote IA au quotidien** : Vous souhaitez dialoguer avec votre base de connaissances personnelle via le chat conversationnel (`/api/chat`) sans latence ni dépendance réseau.
2. **Prise de notes & capture instantanée** : Noter une observation de terrain, transcrire un mémo audio, capturer un article de veille ou un extrait web.
3. **Mode hors-ligne / Mobilité** : Vous êtes en déplacement, sur une exploitation ou dans une zone sans connectivité fiable. Vos fiches sont sur votre disque local (`.modaka-data`).
4. **Recherche hybride rapide** : Recherche plein texte (BM25) couplée à des embeddings vectoriels sur votre corpus personnel.

### 💻 Comment l'utiliser :
1. Démarrez l'application localement (PWA desktop ou navigateur sur `http://localhost:4321`).
2. Ouvrez ou synchronisez votre dossier de connaissances OKF local.
3. Interrogez le copilote ou enrichissez votre base sans craindre d'impacter le référentiel global de l'équipe.

---

## 🌐 3. Quand utiliser Modaka-Hub (Serveur / Autorité) ?

Utilisez **Modaka-Hub** lorsque vous êtes dans une posture de **curation scientifique, de validation collaborative ou de gouvernance des connaissances**.

### 🎯 Cas d'usage types :
1. **Ingestion massive de corpus** : Déposer des dizaines de manuels techniques, thèses, fiches de synthèse ou rapports PDF dans la Dropzone collective.
2. **Curation & Revue par les pairs** : Relire, amender, comparer des diffs Git et valider formellement des fiches de référence avec un audit trail immuable.
3. **Qualification multi-axiale stricte** : Classifier les connaissances selon des matrices orthogonales complexes (ex: *type de sol $\times$ zone agro-climatique $\times$ itinéraire technique $\times$ altitude*).
4. **Génération de dépôts ciblés (`/api/extract`)** : Créer un sous-ensemble sur mesure de la base d'autorité pour l'injecter dans l'instance Modaka d'un client, d'une filière ou d'un profil d'exploitation donné.
5. **Gouvernance & Sécurité (RBAC)** : Gérer les droits éditoriaux (`admin` vs `curator`) et verrouiller les champs critiques de traçabilité (`soa`, `revision`).

### 💻 Comment l'utiliser :
1. Connectez-vous sur l'instance web partagée (ex: `https://hub.brad.team/`).
2. Déposez vos documents bruts dans le sas d'ingestion.
3. Utilisez le **Curation Workbench** pour qualifier les taxonomies, corriger les résumés générés par l'IA et valider le commit Git dans la branche d'autorité.
4. Lancez une extraction ciblée via le menu *Extraction Contextuelle* pour exporter un sous-arbre prêt à l'emploi.

---

## 🔄 4. Le Workflow Combiné : Hub & Spoke

Le modèle d'architecture articule les deux applications de manière complémentaire :

```text
    ┌─────────────────────────────────────────────────────────┐
    │                       MODAKA-HUB                        │
    │  (Centralisation, OCR PDF, Curation, Taxonomies n-axes) │
    └────────────────────────────┬────────────────────────────┘
                                 │
                 /api/extract    │  Sous-arbres Git qualifiés
             (Export ciblé)      │  (ex: Profil Sud-Ouest / Viticulture)
                                 ▼
         ┌────────────────────────────────────────────────┐
         │                  MODAKA LOCAL                  │
         │  (Consultation 0ms, Copilote IA, Prise de note)│
         └───────────────────────┬────────────────────────┘
                                 │
                 /api/telemetry  │  Requêtes infructueuses &
             (Feedback anonyme)  │  gaps documentaires
                                 ▼
    ┌─────────────────────────────────────────────────────────┐
    │  Le Hub identifie les manques et affine la curation     │
    └─────────────────────────────────────────────────────────┘
```

1. **Centraliser dans le Hub** : L'équipe enrichit la source d'autorité scientifique sur Modaka-Hub.
2. **Diffuser vers Modaka** : Chaque utilisateur ou exploitation extrait le sous-ensemble pertinent pour ses besoins dans son Modaka local via Git.
3. **Boucle de rétroaction** : Les recherches sans réponse sur Modaka remontent sous forme de télémétrie anonyme dans le Hub pour indiquer aux curateurs les fiches prioritaires à rédiger.

---

## 📊 5. Tableau Comparatif Synthétique

| Dimension | Modaka (Client Edge) | Modaka-Hub (Serveur d'Autorité) |
| :--- | :--- | :--- |
| **Rôle principal** | Copilote personnel & base locale souveraine | Source of Authority (SOA) & Plateforme collaborative |
| **Topologie** | Local-First / Edge (Desktop, laptop, PWA locale, offline) | Cloud / Kubernetes (Multi-tenant, SSR Node.js) |
| **Stockage** | Système de fichiers local (`.modaka-data`) | Dépôt Git d'autorité central (`world-agronomy`) monté sur PVC |
| **Droits & Accès** | Mono-utilisateur ou OAuth simple | Supabase Auth + RBAC strict (`admin` vs `curator`) |
| **Traitement IA** | Chat contextuel conversationnel (`/api/chat`) | Ingestion et synthèse par lots (OCR, Gemini, Wikipedia autolink) |
| **Taxonomie** | Dossiers hiérarchiques et tags libres | Matrice multi-axiale orthogonale (Sols, Climats, Itinéraires, etc.) |
| **Extraction** | Consommateur des sous-arbres extraits | Moteur producteur d'extractions ciblées (`/api/extract`) |
| **Télémétrie** | Émetteur de retours d'usage anonymes | Collecteur, analyse des manques (*gap analysis*) et scoring |

---

## ⚡ 6. Guide de Décision Rapide

| Si mon besoin immédiat est de... | J'ouvre plutôt... |
| :--- | :---: |
| Poser une question rapide à mon copilote IA sur mes notes | **Modaka** |
| Déposer un PDF de 80 pages pour l'indexer et le qualifier scientifiquement | **Modaka-Hub** |
| Travailler dans le train ou sur le terrain sans connexion internet | **Modaka** |
| Valider officiellement la nouvelle fiche de référence sur les couverts végétaux | **Modaka-Hub** |
| Préparer un kit de connaissances pré-rempli pour une exploitation agricole | **Modaka-Hub** |
| Rédiger mes observations personnelles de la journée | **Modaka** |

# Eventick — Plan de mise en œuvre du cahier des charges

> « La billetterie qui se valide d'un seul geste. »

Ce document traduit la spécification produit en un plan de développement par
phases. Il part d'un audit du code existant : ce qui est déjà fait n'est pas
refait, ce qui manque est décrit précisément.

**Décisions prises :** Stripe (pattern repris de `multiseller`), Resend pour
l'e-mail (idem), livraison par phases avec revue entre chaque, EN limité à
l'interface (le contenu des événements reste FR/AR).

---

## 0. État des lieux

| # | Exigence | État | Détail |
|---|---|---|---|
| 1 | Catalogue (catégorie, ville, recherche) | ✅ | Filtrage client ; suffisant à cette échelle |
| 2 | Panier réservé 15 min | ⚠️ | Durée = 8 min, et le « hold » n'existe que dans localStorage |
| 3 | Paiement CMI/Stripe 3DS | ❌ | Entièrement simulé, code 3DS en dur, **PAN en clair dans l'API** |
| 4 | PDF + QR signé | ⚠️ | QR affiché mais **payload non signé** ; aucun PDF |
| 5 | Validation < 2 s | ⚠️ | Rapide côté serveur, mais saisie manuelle et non transactionnelle |
| 6 | Création événement + affiche | ⚠️ | Création OK ; **aucun upload d'image** (12 chemins en dur) |
| 7 | Suivi des ventes temps réel | ⚠️ | Dashboard présent mais chargé une seule fois |
| 8 | Liste acheteurs + remboursements | ⚠️ | CSV OK ; **remboursement inexistant** |
| 9 | E-mail aux acheteurs | ❌ | **Aucune capacité d'envoi** — bloque 4 et 14 |
| 10 | Mode hors-ligne contrôleur | ❌ | Aucun service worker, aucun cache |
| 11 | Scan caméra vert/rouge | ⚠️ | UI vert/rouge excellente ; **pas de caméra** |
| 12 | Compteur d'entrées temps réel | ❌ | Donnée captée mais jamais rafraîchie |
| 14 | Billet envoyé < 30 s | ⚠️ | Généré instantanément, **jamais envoyé** |
| 16 | 500 scans simultanés | ⚠️ | Index `ref` OK ; race au check-in, index manquants |
| 17 | FR / EN / AR | ⚠️ | FR + AR corrects (RTL inclus) ; **EN absent** |
| 18 | Prix en MAD | ✅ | Entiers en centimes, correct |
| 19 | 99 % de disponibilité | ⚠️ | `/health` statique, aucune supervision |

**Deux failles de sécurité à traiter en priorité** (hors périmètre fonctionnel) :

1. Le **numéro de carte complet** transite en clair vers l'API (`orders.ts`
   accepte `pan: z.string()`). Résolu par la phase 2.
2. La **référence de billet est devinable** : `Math.random()` sur 6 chiffres,
   non signée, sur un endpoint sans limitation de débit. Résolu par la phase 3.

---

## Phase 1 — E-mail (débloque les phases 3 et 4)

Rien ne peut être « envoyé » aujourd'hui. C'est le verrou principal.

**Backend**
- `npm i resend` ; variables `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- `src/lib/email.ts` — wrapper repris de multiseller : client paresseux, **ne
  lève jamais d'exception**, journalise en mode dégradé quand la clé est absente.
  Sans clé, l'application tourne et journalise au lieu d'envoyer : le flux
  complet reste testable en local.
- `src/lib/templates/` — gabarits HTML FR/AR aux couleurs de la charte :
  confirmation de commande, remboursement, message organisateur.
- `POST /api/organiser/broadcast` — envoi aux acheteurs d'un événement
  (`requireRole ORGANISER|ADMIN`, limité en débit, plafonné).

**Frontend**
- Pro → Réservations : bouton « Contacter les acheteurs » ouvrant une modale
  (objet + message + aperçu du nombre de destinataires).

**Critère de recette :** une commande déclenche un e-mail ; sans clé API, la
ligne de journal le prouve et rien ne casse.

---

## Phase 2 — Paiement Stripe réel + réservation serveur (15 min)

**Réservation (corrige l'exigence 2)**
- `HOLD_MINUTES` : 8 → **15** (`src/domain/inventory.ts`), et suppression du
  doublon en dur côté client (`EventDetail.jsx`).
- `POST /api/orders/hold` — crée une commande **PENDING** avec `holdUntil`,
  dans une transaction qui revérifie le stock. Le compte à rebours devient
  **autoritatif côté serveur** au lieu d'être du théâtre localStorage.
- `DELETE /api/orders/hold/:id` — libération explicite.
- Balayage des réservations expirées (au check de stock, pas de cron requis).

**Paiement (corrige l'exigence 3 + la faille PAN)**
- `npm i stripe` ; variables `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`.
- `src/lib/payment-service.ts` — point unique où « l'argent a bougé » devient un
  changement d'état, avec **mode mock** conservé quand la clé est absente
  (pattern multiseller : les deux chemins convergent, donc ils ne divergent pas).
- `POST /api/orders/:id/pay` — crée un PaymentIntent, retourne le `clientSecret`.
  **Le PAN ne touche plus jamais notre API** : Stripe Elements le collecte, 3DS
  est géré par Stripe.
- `POST /api/webhooks/stripe` — signature vérifiée, **idempotent** (Stripe
  retente et peut désordonner). C'est le webhook qui fait PENDING → PAID, pas la
  requête HTTP du client.

**Frontend**
- `@stripe/stripe-js` + `@stripe/react-stripe-js` dans le Checkout ; suppression
  des champs carte maison et du code 3DS affiché à l'écran.

**Critère de recette :** carte test `4242…` → payé ; carte 3DS
`4000 0027 6000 3184` → défi affiché ; carte refusée → commande reste PENDING et
le stock est relibéré.

---

## Phase 3 — QR signé + billet PDF

**Sécurité du billet (corrige la faille n°2)**
- `src/domain/ticketRef.ts` — `crypto.randomBytes` au lieu de `Math.random`,
  **avec reprise sur collision** (aujourd'hui une collision = erreur 500).
- `src/lib/ticket-signature.ts` — `HMAC-SHA256(TICKET_SECRET, ref|eventId|tierId)`.
  Payload QR : `EVENTICK|<ref>|<slug>|<sig>`. Vérification **avant** la lecture
  en base au check-in : un QR forgé est rejeté sans toucher la base.

**PDF**
- `npm i pdfkit` (même choix que multiseller).
- `src/lib/ticket-pdf.ts` — rendu serveur : affiche, titre, lieu, date, place,
  QR, prix en MAD, mentions. Polices et couleurs de la charte.
- `GET /api/tickets/:id/pdf` — téléchargement (propriétaire ou organisateur).
- Pièce jointe à l'e-mail de confirmation → **exigence 14 satisfaite**.

**Critère de recette :** paiement → e-mail avec PDF en moins de 30 s ; un QR
re-signé avec une autre clé est refusé à la porte.

---

## Phase 4 — Scanner caméra + check-in fiable

**Correction de concurrence (bloquant pour l'exigence 16)**
- `gate.ts` : le `findUnique` puis `update` actuel laisse **deux scans simultanés
  passer tous les deux**. Remplacé par un `updateMany` gardé
  (`where: { id, status: "VALID" }`), `count === 0` ⇒ déjà scanné.
- Index ajoutés : `tickets(status)`, `tickets(tierId)`.

**Caméra (corrige l'exigence 11)**
- `npm i jsqr` (déjà utilisé par multiseller).
- `Gate.jsx` : `getUserMedia` + boucle `<video>`/canvas, anti-rebond, bascule
  torche, repli sur la saisie manuelle existante (utile si la caméra est
  refusée). L'UI vert/rouge actuelle est conservée — elle est déjà bonne.

**Critère de recette :** scan caméra < 2 s ; deuxième scan du même billet =
rouge « déjà scanné » ; deux appareils simultanés ⇒ un seul succès.

---

## Phase 5 — Temps réel (ventes + compteur d'entrées)

- `npm i socket.io` / `socket.io-client` (pattern multiseller, attaché au serveur
  existant, rien à configurer en local).
- Émission d'un événement à chaque check-in et à chaque commande payée, dans une
  « room » par organisateur.
- `GET /api/organiser/events/:slug/stats` — agrégats calculés **en SQL**
  (`COUNT`), pas en hydratant toutes les lignes comme aujourd'hui.
- Dashboard : compteur d'entrées et ventes qui bougent sans rechargement, plus
  un horodatage « mis à jour à HH:MM ».

**Critère de recette :** un scan sur téléphone incrémente le compteur du
dashboard ouvert sur un autre écran, sans rechargement.

---

## Phase 6 — Remboursements + upload d'affiche

**Remboursements (corrige l'exigence 8)**
- Schéma : `REFUNDED` dans `OrderStatus`/`TicketStatus`, colonnes
  `refundedCents`, `refundedAt`, `refundRef`.
- `POST /api/organiser/orders/:id/refund` — total ou partiel, appelle Stripe,
  relibère le stock, e-mail à l'acheteur. L'actuel `cancel` ne déplace aucun
  argent ; il reste, mais le remboursement devient distinct et tracé.

**Upload d'affiche (corrige l'exigence 6)**
- `npm i multer` ; validation MIME + taille, stockage disque avec `express.static`
  (volume monté en production), redimensionnement.
- `image` ajouté au schéma de mise à jour (aujourd'hui **l'affiche n'est pas
  modifiable après création**).
- Zone de dépôt dans le formulaire organisateur, les 12 presets devenant un
  simple repli.

---

## Phase 7 — EN (interface), hors-ligne, exploitation

**Anglais — interface uniquement (décision validée)**
- `i18n.jsx` : le ternaire binaire `locale === "ar" ? ar : fr` devient une table
  `{ fr, en, ar }` — sans ça une troisième langue est impossible.
- Dictionnaire `en` (~430 clés) + `en` dans `screens/pro/copy.js`.
- Formats de date/nombre `en-GB` ; sélecteur à trois langues.
- **Le contenu des événements reste FR/AR** : pas de migration de colonnes
  `*En`, donc un titre d'événement s'affichera en français en mode EN. C'est la
  limite assumée de ce choix.

**Mode hors-ligne (exigence 10)**
- `GET /api/gate/events/:slug/manifest` — hachés signés des billets de
  l'événement.
- Service worker + IndexedDB ; file d'attente des scans hors-ligne, rejouée de
  façon **idempotente** à la reconnexion ; indicateur en ligne/hors-ligne.

**Exploitation (exigences 16 et 19)**
- `/api/health` fait un vrai `SELECT 1` — aujourd'hui il renvoie `{ok:true}` en
  dur **même si Postgres est à terre**.
- `createMany` pour les billets (aujourd'hui N allers-retours dans la
  transaction).
- Filtrage/pagination serveur sur `/api/events`.
- Dockerfile + compose, test de charge 500 scans simultanés.

---

## Ordre et dépendances

```
Phase 1  E-mail ─────────────┐
                             ├──► Phase 3  QR signé + PDF ──► Phase 4  Scanner
Phase 2  Stripe + hold 15min ┘                                     │
                                                                   ▼
                                              Phase 5  Temps réel ──► Phase 7  Hors-ligne
Phase 6  Remboursements (dépend de la phase 2)
Phase 7  EN + exploitation (indépendant)
```

Les phases 1 et 2 sont prioritaires : elles débloquent le reste et corrigent les
deux failles de sécurité.

## Ce qu'il me faut de votre part

| Quand | Quoi |
|---|---|
| Phase 1 | Clé `RESEND_API_KEY` + adresse d'expédition vérifiée |
| Phase 2 | Clés Stripe de test (`sk_test_…`, `pk_test_…`) + secret de webhook |
| Phase 4 | Test sur un vrai téléphone (la caméra exige HTTPS ou localhost) |

Chaque phase tourne en mode dégradé sans ses clés : je peux développer et vous
faites la recette dès que vous les fournissez.

// Quick-login accounts for the dev-only buttons under the login form.
// Must stay in sync with backend/prisma/seed.ts — these rows only exist
// after `npx prisma db seed` has run.
export const DEMO_ACCOUNTS = [
  {
    id: "client",
    email: "client@eventick.ma",
    password: "eventick-client-2026",
    labelFr: "Client",
    labelAr: "زبون",
    roleFr: "Achat de billets",
    roleAr: "شراء التذاكر",
  },
  {
    id: "organiser",
    email: "organisateur@eventick.ma",
    password: "eventick-orga-2026",
    labelFr: "Organisateur",
    labelAr: "منظم",
    roleFr: "Espace Pro",
    roleAr: "مساحة المنظم",
  },
  {
    id: "admin",
    email: "admin@eventick.ma",
    password: "eventick-admin-2026",
    labelFr: "Admin",
    labelAr: "مدير",
    roleFr: "Administration",
    roleAr: "الإدارة",
  },
];

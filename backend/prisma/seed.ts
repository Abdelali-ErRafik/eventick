// Seeds the real database from the original frontend's hardcoded catalog,
// frozen to JSON (see prisma/catalog-frozen.json) from the old TanStack app's
// src/lib/catalog.ts before that directory was removed — so the ported
// backend serves the exact same 16 demo events instead of hand-retyped data.
import { PrismaClient, type PromoKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import catalogFrozen from "./catalog-frozen.json" with { type: "json" };

const EVENTS = catalogFrozen;

const prisma = new PrismaClient();

const madToCents = (mad: number) => Math.round(mad * 100);

const SEED_ADMIN_EMAIL = "admin@eventick.ma";
const SEED_ADMIN_PASSWORD = "eventick-admin-2026";

/** Demo accounts surfaced by the login screen's dev-only quick-login buttons.
 * Kept in sync with frontend/src/demoAccounts.js. */
const DEMO_ACCOUNTS = [
  { email: "organisateur@eventick.ma", password: "eventick-orga-2026", name: "Yasmine Organisatrice", role: "ORGANISER" as const },
  { email: "client@eventick.ma", password: "eventick-client-2026", name: "Karim Client", role: "CUSTOMER" as const },
];

/** Events handed to the demo organiser so its Pro dashboard isn't empty and
 * the per-organiser scoping is visible (admin sees all, organiser sees these). */
const ORGANISER_EVENT_SLUGS = ["oasis-2026", "dakhla-lagoon"];

async function main() {
  // The only user the app has no other way to create: every ORGANISER/ADMIN
  // account after this one is granted via PATCH /api/auth/users/:id/role by
  // an existing admin (see routes/auth.ts). Without this seed row, that
  // endpoint is unreachable and /organiser + /pro stay locked forever.
  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      name: "Admin Eventick",
      passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });

  for (const event of EVENTS as any[]) {
    await prisma.event.upsert({
      where: { slug: event.slug },
      update: {},
      create: {
        slug: event.slug,
        organiserId: admin.id,
        status: "PUBLISHED",
        titleFr: event.titleFr,
        titleAr: event.titleAr,
        category: event.category,
        city: event.city,
        venueFr: event.venueFr,
        venueAr: event.venueAr,
        address: event.address,
        startAt: new Date(`${event.start}T${event.time ?? "00:00"}:00`),
        endAt: new Date(`${event.end}T23:59:59`),
        doorsAt: new Date(`${event.start}T${event.doors ?? event.time ?? "00:00"}:00`),
        image: event.image,
        badge: event.badge ?? null,
        blurbFr: event.blurbFr,
        blurbAr: event.blurbAr,
        aboutFr: event.aboutFr,
        aboutAr: event.aboutAr,
        ageFr: event.ageFr,
        ageAr: event.ageAr,
        popularity: event.popularity,
        instant: event.instant,
        tiers: {
          create: (event.tiers ?? []).map((tier: any) => ({
            nameFr: tier.nameFr,
            nameAr: tier.nameAr,
            blurbFr: tier.blurbFr,
            blurbAr: tier.blurbAr,
            priceCents: madToCents(tier.price),
            capacity: tier.capacity,
            numbered: Boolean(tier.numbered),
            recommended: Boolean(tier.recommended),
            saveCents: tier.save ? madToCents(tier.save) : null,
            perks: tier.perks ?? [],
            zoneFr: tier.zoneFr,
            zoneAr: tier.zoneAr,
            gateFr: tier.gateFr,
            gateAr: tier.gateAr,
          })),
        },
        lineup: {
          create: (event.lineup ?? []).map((item: any) => ({
            day: new Date(`${item.day}T${item.time}:00`),
            time: item.time,
            name: item.name,
            genreFr: item.genreFr,
            genreAr: item.genreAr,
            image: item.image,
          })),
        },
      },
    });
  }

  const demoUsers = [];
  for (const account of DEMO_ACCOUNTS) {
    demoUsers.push(
      await prisma.user.upsert({
        where: { email: account.email },
        update: {},
        create: {
          email: account.email,
          name: account.name,
          passwordHash: await bcrypt.hash(account.password, 10),
          role: account.role,
        },
      }),
    );
  }

  const demoOrganiser = demoUsers.find((user) => user.role === "ORGANISER");
  if (demoOrganiser) {
    await prisma.event.updateMany({
      where: { slug: { in: ORGANISER_EVENT_SLUGS }, organiserId: admin.id },
      data: { organiserId: demoOrganiser.id },
    });
  }

  const promos: { code: string; kind: PromoKind; value: number; eventSlug: string | null; maxUses: number }[] = [
    { code: "SAFRAN15", kind: "PERCENT", value: 15, eventSlug: null, maxUses: 200 },
    { code: "CASA50", kind: "AMOUNT", value: madToCents(50), eventSlug: "oasis-2026", maxUses: 40 },
  ];

  for (const promo of promos) {
    const event = promo.eventSlug ? await prisma.event.findUnique({ where: { slug: promo.eventSlug } }) : null;
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: {},
      create: { code: promo.code, kind: promo.kind, value: promo.value, eventId: event?.id ?? null, maxUses: promo.maxUses },
    });
  }

  console.log(`Seeded ${(EVENTS as any[]).length} events and ${promos.length} promo codes.`);
  console.log(`Admin login: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD} — change this password before deploying.`);
  for (const account of DEMO_ACCOUNTS) {
    console.log(`${account.role} login: ${account.email} / ${account.password}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { db } from '../src/db';
import { Prisma } from '@prisma/client';

// Run explicitly; never import legacy accounts automatically on server startup.
const path = process.argv[2];
if (!path) throw new Error('Usage: bun run db:import <path/to/db.json>');
const legacy = await Bun.file(path).json();
let imported = 0;
let skipped = 0;
try {
  for (const user of legacy.users) {
    const email = user.email.trim().toLowerCase();
    if (await db.user.findFirst({ where: { OR: [{ id: user.id }, { email }] } })) {
      console.log(`Skipping legacy ID ${user.id}: ID or email already exists`);
      skipped++;
      continue;
    }
    const profile = legacy.usersProfile.find((p: { id: string }) => p.id === user.id);
    await db.user.create({ data: {
      id: user.id, email, userName: profile?.userName ?? user.userName,
      passwordHash: await Bun.password.hash(user.password, { algorithm: 'argon2id' }),
      profile: { create: {
        userName: profile?.userName ?? user.userName,
        rankingHighScore: profile?.rankingHighScore ?? 0,
        completeAchievement: (profile?.completeAchievement ?? []) as Prisma.InputJsonValue,
        ...(profile?.profileConfig ? { profileConfig: profile.profileConfig } : {}),
        ...(profile?.totalScore ? { totalScore: profile.totalScore } : {}),
        ...(profile?.totalTimePlay ? { totalTimePlay: profile.totalTimePlay } : {}),
        customLevel: profile?.customLevel ?? [], customMode: profile?.customMode ?? [],
        descrition: profile?.descrition ?? '',
      } },
    } });
    imported++;
  }
  console.log(`Imported ${imported}; skipped ${skipped}. Existing records were not overwritten.`);
} finally { await db.$disconnect(); }

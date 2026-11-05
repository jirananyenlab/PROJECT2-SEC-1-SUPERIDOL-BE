-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rankingHighScore" INTEGER NOT NULL DEFAULT 0,
    "completeAchievement" JSONB NOT NULL DEFAULT '[]',
    "profileConfig" JSONB NOT NULL DEFAULT '{"effectVolume":2,"musicVolume":2,"showAchievementBadge":[null,null,null]}',
    "totalScore" INTEGER[] DEFAULT ARRAY[0, 0, 0, 0, 0, 0, 0, 0]::INTEGER[],
    "totalTimePlay" INTEGER[] DEFAULT ARRAY[0, 0, 0, 0, 0, 0, 0, 0]::INTEGER[],
    "customLevel" JSONB NOT NULL DEFAULT '[]',
    "customMode" JSONB NOT NULL DEFAULT '[]',
    "descrition" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Profile_rankingHighScore_idx" ON "Profile"("rankingHighScore");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

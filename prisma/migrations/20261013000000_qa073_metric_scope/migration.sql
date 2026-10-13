-- CreateEnum
CREATE TYPE "MetricMessageScope" AS ENUM ('IN_SCOPE', 'OUT_OF_SCOPE', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "MetricUsageKind" ADD VALUE 'SCOPE_CHECK';

-- AlterTable
ALTER TABLE "metric_messages" ADD COLUMN     "scope" "MetricMessageScope" NOT NULL DEFAULT 'UNKNOWN';


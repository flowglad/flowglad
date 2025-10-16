import { trpc } from '@/utils/trpc';
import { getMembership } from "@/server/mutations/toggleTestMode";

export default function TestModeBanner() {
  const { data: membership } = trpc.getMembership.useQuery();

  if (!membership) return null;

  return membership.livemode ? null : (
    <div className="bg-yellow-500 text-black text-center p-2 font-bold">
      TEST MODE ENABLED
    </div>
  );
}
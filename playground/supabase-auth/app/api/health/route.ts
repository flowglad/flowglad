import { FlowgladServer } from '@flowglad/nextjs/server';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const GET = async (req: Request) => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const flowgladServer = new FlowgladServer({
    customerExternalId: user?.id,
    baseURL: 'http://localhost:3000'
  });
  const billing = await flowgladServer.getBilling();
  return NextResponse.json({
    billing
  });
};

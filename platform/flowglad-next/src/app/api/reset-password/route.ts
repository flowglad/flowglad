import db from "@/db/client";
import { user } from "@/db/schema/betterAuthSchema";
import { authClient } from "@/utils/authClient";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ msg: "provide the email" }, { status: 400 });
    }
    const userExists = await db.select().from(user).where(eq(user.email, email));
    if (userExists.length === 0) {  
      return NextResponse.json({ msg: "user with this email do not exist!" }, { status: 404 });
    }

     await authClient.requestPasswordReset({
     email: email ?? '',
     redirectTo: '/sign-in/reset-password',
        })
    return NextResponse.json({ msg: "Password reset email sent" , success:true}, {status:200});
  } catch (e) {
    console.error(e); 
    return NextResponse.json({ msg: `error found: ${e}` }, { status: 500 });
  }
}

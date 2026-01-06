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
    if (userExists.length > 0) {  
       await authClient.requestPasswordReset({
     email: email ?? '',
     redirectTo: '/sign-in/reset-password',
        })
    }

    
   return NextResponse.json({ message: "If an account exists with this email, a password reset link has been sent" , success: true}, {status: 200});

  } catch (e) {
    console.error(e); 
     return NextResponse.json({ message: "An error occurred while processing your request" }, { status: 500 });
   
  }
}

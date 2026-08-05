"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function completeRegistration(formData: {
  name: string;
  phone: string;
  department: string;
}) {
  try {
    const session = await auth();
    
    if (!session || !session.user || !session.user.id) {
      throw new Error("Unauthorized");
    }

    const userId = session.user.id;
    const updateData: any = {
      name: formData.name,
      phone: formData.phone,
      department: formData.department,
    };

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return { success: true, message: "Pendaftaran berhasil diselesaikan!" };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

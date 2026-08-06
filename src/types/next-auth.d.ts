import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      phone?: string | null;
      nim?: string | null;
      department?: string | null;
      status?: string | null;
      role?: "user" | "admin" | "super_admin";
    };
  }

  interface User {
    phone?: string | null;
    nim?: string | null;
    department?: string | null;
    status?: string | null;
    role?: "user" | "admin" | "super_admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    phone?: string | null;
    nim?: string | null;
    department?: string | null;
    status?: string | null;
    role?: "user" | "admin" | "super_admin";
  }
}

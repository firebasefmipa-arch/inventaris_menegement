import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readdir, stat } from "fs/promises";
import path from "path";

export interface DocumentFile {
  name: string;
  folder: "signed_forms" | "handovers";
  url: string;
  size: number; // bytes
  createdAt: number; // timestamp ms
}

async function getFilesFromFolder(
  folderName: "signed_forms" | "handovers"
): Promise<DocumentFile[]> {
  const folderPath = path.join(
    process.cwd(),
    "public",
    "uploads",
    folderName
  );

  try {
    const files = await readdir(folderPath);
    const result: DocumentFile[] = [];

    for (const file of files) {
      if (file.startsWith(".")) continue; // skip hidden files
      const filePath = path.join(folderPath, file);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;

      result.push({
        name: file,
        folder: folderName,
        url: `/uploads/${folderName}/${file}`,
        size: fileStat.size,
        createdAt: fileStat.birthtimeMs || fileStat.ctimeMs,
      });
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return []; // folder tidak ada atau kosong
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [signedForms, handovers] = await Promise.all([
      getFilesFromFolder("signed_forms"),
      getFilesFromFolder("handovers"),
    ]);

    const allFiles = [...signedForms, ...handovers];
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);

    return NextResponse.json({
      signedForms,
      handovers,
      totalFiles: allFiles.length,
      totalSize,
    });
  } catch (error) {
    console.error("GET /api/admin/documents error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}

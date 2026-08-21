import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readdir, stat } from "fs/promises";
import path from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

async function getFilesInFolder(folderName: string): Promise<string[]> {
  const folderPath = path.join(process.cwd(), "public", "uploads", folderName);
  try {
    const files = await readdir(folderPath);
    const result: string[] = [];
    for (const file of files) {
      if (file.startsWith(".")) continue;
      const filePath = path.join(folderPath, file);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) result.push(filePath);
    }
    return result;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || role !== "super_admin") {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder"); // "signed_forms" | "handovers" | null (semua)

    // Kumpulkan file yang akan di-zip
    const foldersToExport =
      folder === "signed_forms"
        ? ["signed_forms"]
        : folder === "handovers"
        ? ["handovers"]
        : ["signed_forms", "handovers"];

    const allFiles: { filePath: string; archiveName: string }[] = [];
    for (const folderName of foldersToExport) {
      const files = await getFilesInFolder(folderName);
      for (const filePath of files) {
        allFiles.push({
          filePath,
          archiveName: `${folderName}/${path.basename(filePath)}`,
        });
      }
    }

    if (allFiles.length === 0) {
      return new NextResponse("Tidak ada file untuk di-export", { status: 404 });
    }

    // Buat ZIP menggunakan archiver + PassThrough stream
    const passThrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      console.error("Archiver error:", err);
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    for (const { filePath, archiveName } of allFiles) {
      archive.file(filePath, { name: archiveName });
    }

    archive.finalize();

    // Kumpulkan stream ke Buffer untuk dikirim sebagai response
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      passThrough.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      passThrough.on("end", resolve);
      passThrough.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const folderLabel = folder || "semua";
    const filename = `dokumen_peminjaman_${folderLabel}_${dateStr}.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("Export documents error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

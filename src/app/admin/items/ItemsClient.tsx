"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, Package, Plus, SlidersHorizontal, ChevronDown, Monitor, Speaker, Camera, Tent, Activity, Car, PenTool, Upload, LayoutGrid, List, Trash2, CheckSquare, MoreVertical, Edit2 } from "lucide-react";
import clsx from "clsx";
import { DeleteItemButton } from "./DeleteItemButton"; // kept for potential single-item use
import { ItemModal } from "./ItemModal";
import { AVAILABLE_ICONS_MAP } from "@/lib/iconMap";
import { useToast } from "@/components/Toaster";

type Item = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  sn: string | null;
  inventoryNumber: string | null;
  assetNumber: string | null;
  lastCheckDate: string | null;
  condition: string | null;
  imageUrl: string | null;
  quantity: number;
  availableQuantity: number;
  status: "available" | "borrowed";
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CATEGORY_MAP: Record<string, { icon: any, color: string, bg: string }> = {
  "Elektronik": { icon: Monitor, color: "text-blue-500", bg: "bg-blue-500" },
  "Audio": { icon: Speaker, color: "text-purple-500", bg: "bg-purple-500" },
  "Fotografi": { icon: Camera, color: "text-orange-500", bg: "bg-orange-500" },
  "Peralatan Acara": { icon: Tent, color: "text-emerald-500", bg: "bg-emerald-500" },
  "Olahraga": { icon: Activity, color: "text-red-500", bg: "bg-red-500" },
  "Kendaraan": { icon: Car, color: "text-yellow-500", bg: "bg-yellow-500" },
  "Alat Tulis": { icon: PenTool, color: "text-indigo-500", bg: "bg-indigo-500" },
};

interface Props {
  items: Item[];
  categories: string[];
}

export function ItemsClient({ items, categories }: Props) {
  const router = useRouter();
  const [showItemModal, setShowItemModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  // Close filter and dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      
      if (filterRef.current && !filterRef.current.contains(target)) {
        setShowFilterDropdown(false);
      }
      
      if (!target.closest('.item-dropdown-container')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleImportFile(files: FileList | null) {
    if (!files?.length) return;

    const file = files[0];
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/items/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal mengimpor file");
      }

      toast(`Berhasil mengimpor ${data.importedCount} barang.`, "success");
      router.refresh();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Gagal mengimpor file",
        "error"
      );
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status filter (which we might use for category or status)
      // Since it's a dropdown, let's use it for Status for now, or Category. 
      // User asked to match transactions, so let's stick to status filter for the dropdown.
      if (statusFilter && item.status !== statusFilter) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.category?.toLowerCase().includes(q) ?? false) ||
          (item.description?.toLowerCase().includes(q) ?? false) ||
          (item.location?.toLowerCase().includes(q) ?? false) ||
          (item.inventoryNumber?.toLowerCase().includes(q) ?? false) ||
          (item.assetNumber?.toLowerCase().includes(q) ?? false) ||
          (item.sn?.toLowerCase().includes(q) ?? false) ||
          (item.condition?.toLowerCase().includes(q) ?? false)
        );
      }

      return true;
    });
  }, [items, searchQuery, statusFilter]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Yakin ingin menghapus ${selectedIds.size} barang?`)) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/items/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (!response.ok) throw new Error("Gagal menghapus barang");
      toast(`Berhasil menghapus ${selectedIds.size} barang`, "success");
      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      toast("Terjadi kesalahan saat menghapus", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const filterOptions = [
    { key: "", label: "Semua Status" },
    { key: "available", label: "Tersedia" },
    { key: "borrowed", label: "Dipinjam" },
  ];

  const statusBadge = (status: string) => {
    const config = {
      available: "bg-emerald-100 text-emerald-700 border-emerald-200",
      borrowed: "bg-amber-100 text-amber-700 border-amber-200",
    };
    const labels = {
      available: "Tersedia",
      borrowed: "Dipinjam",
    };
    return (
      <span
        className={clsx(
          "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
          config[status as keyof typeof config]
        )}
      >
        {labels[status as keyof typeof labels]}
      </span>
    );
  };



  return (
    <>
      <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-20' : ''}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Daftar Barang</h2>
            <p className="text-gray-500 text-sm mt-1">
              Kelola semua barang yang tersedia untuk dipinjam
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={clsx(
                  "px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1",
                  viewMode === 'grid' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={clsx(
                  "px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1",
                  viewMode === 'list' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm text-xs font-medium"
            >
              <Upload className="w-3.5 h-3.5" />
              {importLoading ? "Memproses..." : "Impor"}
            </button>
            <button
              onClick={() => setShowItemModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/25 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Barang
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleImportFile(e.target.files)}
        />

        {/* Search Bar + Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 pl-3">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari barang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900"
            />
          </div>
          <div className="relative shrink-0" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${
                statusFilter
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filter</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setStatusFilter(opt.key); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      statusFilter === opt.key ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { const next = !selectMode; setSelectMode(next); if (!next) setSelectedIds(new Set()); }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors border shrink-0 ${
              selectMode ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Select</span>
          </button>
        </div>

        {/* Select All bar */}
        {selectMode && (
          <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
            >
              {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? 'Batal Pilih Semua' : 'Pilih Semua'}
            </button>
            <span className="text-xs text-indigo-500">{selectedIds.size} dari {filteredItems.length} dipilih</span>
          </div>
        )}

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            Tidak ada barang
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
            Belum ada barang yang ditambahkan atau tidak ada barang yang sesuai
            dengan filter pencarian Anda.
          </p>
          <button
            onClick={() => setShowItemModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Tambah Barang
          </button>
        </div>
      ) : (
        <div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item, idx) => {
                const IconComponent = item.imageUrl && AVAILABLE_ICONS_MAP[item.imageUrl]
                  ? AVAILABLE_ICONS_MAP[item.imageUrl]
                  : Package;
                const percentage = Math.min(100, Math.max(0, (item.availableQuantity / item.quantity) * 100));

                return (
                  <div
                    key={item.id}
                    className={`group rounded-2xl shadow-sm border overflow-hidden hover:shadow-lg transition-all flex flex-col relative h-full ${selectedIds.has(item.id) ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
                  >
                    {/* Checkbox Overlay */}
                    {selectMode && (
                      <div className="absolute top-3 left-3 z-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 text-indigo-600 bg-white border-gray-300 rounded focus:ring-indigo-500 cursor-pointer shadow-sm"
                        />
                      </div>
                    )}
                    {/* Card Header */}
                    <div className={`p-4 pb-3 border-b border-gray-50 bg-gradient-to-br from-gray-50/50 to-white dark:from-[#0d1e3d] dark:to-[#0a1628] dark:border-[#1e3054] ${selectMode ? 'pl-9' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm leading-tight mb-1 pr-6 truncate" title={item.name}>
                            {item.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {item.category && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${CATEGORY_MAP[item.category] ? `${CATEGORY_MAP[item.category].bg}/10 ${CATEGORY_MAP[item.category].color}` : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                {(() => { const CatIcon = CATEGORY_MAP[item.category]?.icon; return CatIcon ? <CatIcon className="w-3 h-3" /> : null; })()}
                                {item.category}
                              </span>
                            )}
                            {item.condition && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-slate-700/60 dark:text-slate-300">
                                {item.condition}
                              </span>
                            )}
                            {item.lastCheckDate && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                                Cek: {item.lastCheckDate}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 z-20">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100/50">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="item-dropdown-container relative">
                            <button
                              onClick={() => setActiveDropdownId(activeDropdownId === item.id ? null : item.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-transparent shadow-sm"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            {activeDropdownId === item.id && (
                              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1 z-30">
                                <Link
                                  href={`/admin/items/${item.id}/edit`}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 pt-3 flex-1 flex flex-col gap-3">
                      {/* Identifiers Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100/50">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">No. Inv</div>
                          <div className="text-xs font-medium text-gray-700 font-mono truncate" title={item.inventoryNumber || '-'}>{item.inventoryNumber || '-'}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100/50">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">No. Asset</div>
                          <div className="text-xs font-medium text-gray-700 font-mono truncate" title={item.assetNumber || '-'}>{item.assetNumber || '-'}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100/50 col-span-2">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Serial Number</div>
                          <div className="text-xs font-medium text-gray-700 font-mono truncate" title={item.sn || '-'}>{item.sn || '-'}</div>
                        </div>
                        {item.location && (
                          <div className="bg-gray-50 rounded-lg p-2 border border-gray-100/50 col-span-2">
                            <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Lokasi</div>
                            <div className="text-xs font-medium text-gray-700 truncate" title={item.location}>{item.location}</div>
                          </div>
                        )}
                      </div>

                      {/* Spesifikasi */}
                      <div className="flex-1 mt-1">
                        <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Spesifikasi</div>
                        <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-2" title={item.description || 'Tidak ada spesifikasi khusus.'}>
                          {item.description || 'Tidak ada spesifikasi khusus.'}
                        </p>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="p-4 pt-0 mt-auto">
                      <div className="pt-3 border-t border-gray-50">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500">Stok Tersedia</span>
                          <span className="text-xs font-bold text-gray-900">{item.availableQuantity} <span className="text-gray-400 font-normal">/ {item.quantity}</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item, idx) => {
                const IconComponent = item.imageUrl && AVAILABLE_ICONS_MAP[item.imageUrl]
                  ? AVAILABLE_ICONS_MAP[item.imageUrl]
                  : Package;
                const percentage = Math.min(100, Math.max(0, (item.availableQuantity / item.quantity) * 100));

                return (
                  <div key={item.id} className={`group rounded-2xl border hover:shadow-md transition-all relative ${selectedIds.has(item.id) ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-gray-100 hover:border-indigo-100'}`}>
                    {/* ── Mobile: baris ringkas horizontal ── */}
                    <div className="flex md:hidden items-center gap-3 p-3">
                      {selectMode && (
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 text-indigo-600 bg-white border-gray-300 rounded focus:ring-indigo-500 cursor-pointer shrink-0" />
                      )}
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 text-indigo-600 border border-indigo-100/50">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.category} · {item.availableQuantity}/{item.quantity} unit</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {statusBadge(item.status)}
                        <div className="item-dropdown-container relative">
                          <button onClick={() => setActiveDropdownId(activeDropdownId === item.id ? null : item.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {activeDropdownId === item.id && (
                            <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1 z-30">
                              <Link href={`/admin/items/${item.id}/edit`}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <Edit2 className="w-4 h-4" /> Edit
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Desktop: layout list penuh ── */}
                    <div className="hidden md:flex items-center justify-between gap-4 p-4">
                      {selectMode && (
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 text-indigo-600 bg-white border-gray-300 rounded focus:ring-indigo-500 cursor-pointer shrink-0" />
                      )}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-indigo-600 border border-indigo-100/50">
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-4">
                            <h3 className="font-semibold text-gray-900 truncate" title={item.name}>{item.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.category && (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${CATEGORY_MAP[item.category] ? `${CATEGORY_MAP[item.category].bg}/10 ${CATEGORY_MAP[item.category].color}` : 'bg-gray-100 text-gray-600'}`}>
                                  {(() => { const CatIcon = CATEGORY_MAP[item.category]?.icon; return CatIcon ? <CatIcon className="w-3 h-3" /> : null; })()}
                                  {item.category}
                                </span>
                              )}
                              <p className="text-xs text-gray-500 truncate">{item.description || 'Tidak ada spesifikasi'}</p>
                            </div>
                          </div>
                          <div className="col-span-4 flex flex-col gap-1 text-xs text-gray-600 font-mono">
                            <div className="flex gap-2"><span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Inv:</span><span className="truncate">{item.inventoryNumber || '-'}</span></div>
                            <div className="flex gap-2"><span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Ast:</span><span className="truncate">{item.assetNumber || '-'}</span></div>
                          </div>
                          <div className="col-span-4 flex flex-col gap-1 text-xs text-gray-600">
                            <div className="flex gap-2 font-mono"><span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">SN:</span><span className="truncate">{item.sn || '-'}</span></div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">{item.condition || 'Tidak diketahui'}</span>
                              <span className="text-[10px] text-gray-400">{item.lastCheckDate || 'Belum dicek'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 w-32 flex flex-col items-stretch">
                        <div className="flex justify-between items-center mb-1.5 text-xs">
                          <span className="text-gray-500">Stok</span>
                          <span className="font-bold text-gray-900">{item.availableQuantity} <span className="text-gray-400 font-normal">/ {item.quantity}</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                        </div>
                        <div className="mt-2 flex justify-end item-dropdown-container relative">
                          <button onClick={() => setActiveDropdownId(activeDropdownId === item.id ? null : item.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {activeDropdownId === item.id && (
                            <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1 z-30">
                              <Link href={`/admin/items/${item.id}/edit`}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <Edit2 className="w-4 h-4" /> Edit
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-5 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500 text-xs font-bold">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium">terpilih</span>
          </div>
          <div className="w-px h-5 bg-white/30" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="px-4 py-1.5 text-sm font-semibold text-red-100 bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </div>
      )}

      <ItemModal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        existingCategories={categories}
      />
    </div>
    </>
  );
}

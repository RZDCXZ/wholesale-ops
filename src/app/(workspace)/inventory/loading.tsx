export default function InventoryLoading() {
  return (
    <div aria-label="正在加载库存" className="animate-pulse">
      <div className="flex items-start justify-between gap-4 max-md:grid">
        <div><div className="h-9 w-28 rounded bg-slate-200" /><div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-100" /></div>
        <div className="h-11 w-32 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="grid gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-11 rounded-lg bg-slate-100" />)}
        </div>
        <div className="grid divide-y divide-[#eef0f3] px-4">
          {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-14 py-3"><div className="h-full rounded bg-slate-50" /></div>)}
        </div>
      </div>
    </div>
  );
}

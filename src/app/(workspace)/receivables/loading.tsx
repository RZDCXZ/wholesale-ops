export default function ReceivablesLoading() {
  return (
    <div aria-label="正在加载应收列表" className="animate-pulse">
      <div className="h-9 w-28 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-100" />
      <div className="mt-5 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="grid gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-11 rounded bg-slate-100" />)}
        </div>
        <div className="h-80 bg-white" />
      </div>
    </div>
  );
}

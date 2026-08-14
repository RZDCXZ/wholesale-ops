export default function ReceivableDetailLoading() {
  return (
    <div aria-label="正在加载应收详情" className="animate-pulse">
      <div className="h-9 w-64 rounded bg-slate-200" />
      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 bg-white" />)}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="h-72 rounded-lg border border-[#e4e7ec] bg-white" />
        <div className="h-72 rounded-lg border border-[#e4e7ec] bg-white" />
      </div>
    </div>
  );
}

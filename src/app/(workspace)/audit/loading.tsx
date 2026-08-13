export default function AuditLoading() {
  return (
    <div aria-label="正在加载业务审计" className="animate-pulse">
      <div className="h-9 w-36 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-slate-100" />
      <div className="mt-6 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="grid grid-cols-3 gap-3 border-b border-[#e4e7ec] p-4 max-md:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-11 rounded bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-px bg-slate-100">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-14 bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}

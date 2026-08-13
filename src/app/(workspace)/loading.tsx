export default function WorkspaceLoading() {
  return (
    <div aria-label="正在加载工作区" className="animate-pulse">
      <div className="h-9 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-100" />
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 rounded-lg border border-[#e4e7ec] bg-white"
          />
        ))}
      </div>
      <div className="mt-4 h-80 rounded-lg border border-[#e4e7ec] bg-white" />
    </div>
  );
}

export default function OverviewLoading() {
  return (
    <div aria-label="正在加载经营总览" aria-busy="true" className="animate-pulse">
      <div className="h-9 w-32 rounded bg-[#e4e7ec]" />
      <div className="mt-2 h-4 w-64 max-w-full rounded bg-[#eef0f3]" />
      <div className="mt-[18px] grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[130px] rounded-lg border border-[#e4e7ec] bg-white"
          />
        ))}
      </div>
      <div className="mt-[18px] grid gap-[18px] xl:grid-cols-[1.3fr_1fr]">
        <div className="h-[382px] rounded-lg border border-[#e4e7ec] bg-white" />
        <div className="h-[382px] rounded-lg border border-[#e4e7ec] bg-white" />
      </div>
    </div>
  );
}
